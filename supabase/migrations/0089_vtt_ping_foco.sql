-- =====================================================================
-- 0089 — "Ping de foco" (menu contextual do mapa, estilo Roll20)
--
-- Mesma RPC `vtt_ping` (migrations 0073/0074), só GANHA um parâmetro:
-- `p_foco boolean default false`. A LISTA de parâmetros muda (ganha um
-- a mais), e pra Postgres isso é uma ASSINATURA diferente — não dá pra
-- só `CREATE OR REPLACE` por cima, senão as duas versões (4 e 5
-- parâmetros) ficariam coexistindo como sobrecargas. `drop function`
-- explícito na assinatura antiga deixa só UMA `vtt_ping` de verdade.
--
-- A diferença entre um ping comum e um "de foco" é só esse UM booleano
-- no payload — o servidor não faz mais nada por causa dele (não sabe
-- nem precisa saber "recentralizar câmera": isso é decisão de quem
-- RECEBE o broadcast, ver `onPing` em `VttClient.tsx`). O throttle
-- (5 pings / 3s por usuário) vale igual pros dois tipos — de foco não é
-- exceção nem tem limite à parte, senão viraria um jeito de burlar o
-- rate limit chamando "de foco" toda vez.
-- =====================================================================

drop function if exists vtt_ping(uuid, uuid, integer, integer);

create or replace function vtt_ping(
  p_campaign_id uuid,
  p_scene_id uuid,
  p_q integer,
  p_r integer,
  p_foco boolean default false
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_scene vtt_scenes;
  v_uid uuid := auth.uid();
  v_q_min integer;
  v_count integer;
  v_payload jsonb;
begin
  if v_uid is null then
    raise exception 'Sessão expirada.' using errcode = 'insufficient_privilege';
  end if;
  if not is_campaign_member(p_campaign_id) then
    raise exception 'Você não é membro desta campanha.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_scene from vtt_scenes where id = p_scene_id and campaign_id = p_campaign_id;
  if v_scene is null then
    raise exception 'Cena não encontrada para esta campanha.' using errcode = 'no_data_found';
  end if;

  if p_r < 0 or p_r >= v_scene.altura then
    raise exception 'Ping fora dos limites da cena.' using errcode = 'invalid_parameter_value';
  end if;
  v_q_min := -(p_r / 2);
  if p_q < v_q_min or p_q >= v_q_min + v_scene.largura then
    raise exception 'Ping fora dos limites da cena.' using errcode = 'invalid_parameter_value';
  end if;

  insert into vtt_ping_throttle (user_id, campaign_id, window_start, count)
  values (v_uid, p_campaign_id, clock_timestamp(), 1)
  on conflict (user_id, campaign_id) do update
    set window_start = case when clock_timestamp() - vtt_ping_throttle.window_start > interval '3 seconds'
                        then clock_timestamp() else vtt_ping_throttle.window_start end,
        count = case when clock_timestamp() - vtt_ping_throttle.window_start > interval '3 seconds'
                 then 1 else vtt_ping_throttle.count + 1 end
  returning count into v_count;

  if v_count > 5 then
    return false;
  end if;

  v_payload := jsonb_build_object(
    'v', 1,
    'id', gen_random_uuid()::text,
    'campaignId', p_campaign_id::text,
    'sceneId', p_scene_id::text,
    'autorId', v_uid::text,
    'q', p_q,
    'r', p_r,
    'largura', v_scene.largura,
    'altura', v_scene.altura,
    'foco', coalesce(p_foco, false),
    'ts', (extract(epoch from clock_timestamp()) * 1000)::bigint
  );

  perform realtime.send(
    v_payload, 'ping',
    'campaign:' || p_campaign_id::text || ':scene:' || p_scene_id::text || ':vtt:ping',
    true
  );
  return true;
end;
$$;

revoke all on function vtt_ping(uuid, uuid, integer, integer, boolean) from public;
grant execute on function vtt_ping(uuid, uuid, integer, integer, boolean) to authenticated;
