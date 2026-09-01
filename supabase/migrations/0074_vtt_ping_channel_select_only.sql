-- =====================================================================
-- 0074 — Fecha a autorização do canal de ping.
--
-- Achado de auditoria sobre a 0073: `campaign_members_use_ping_channel`
-- usava `for all`, ou seja, além de RECEBER, qualquer membro
-- autenticado também podia INSERIR no canal — na prática, chamar
-- `channel.send()` direto e publicar um ping com `autorId` forjado,
-- contrariando a garantia central do recurso ("autorId sempre vem do
-- servidor, nunca do cliente"). Essa garantia só é real se a única
-- forma de publicar for a RPC `vtt_ping` (`security definer`,
-- `realtime.send()`).
--
-- Correção: a policy vira `for select` — só recebe. Sem NENHUMA policy
-- de `insert` pra `authenticated`, e com RLS habilitada em
-- `realtime.messages` (já estava, herdado de migrations anteriores),
-- o INSERT fica negado por padrão. `realtime.send()`, chamado de
-- DENTRO da função `security definer`, roda com privilégio de dono da
-- função — não passa pela RLS do papel `authenticated` que uma
-- chamada de `channel.send()` do cliente usaria.
--
-- Aproveitando a reautorização, o tópico passa a ser isolado por CENA
-- (`campaign:<id>:scene:<id>:vtt:ping`), não só por campanha — pedido
-- explícito de revisão. A policy confirma que a cena referenciada no
-- tópico de fato pertence à campanha referenciada nele (nunca confia
-- que o cliente escreveu um tópico coerente) E que quem pede é membro
-- da campanha.
-- =====================================================================

begin;

drop policy if exists "campaign_members_use_ping_channel" on "realtime"."messages";

create or replace function vtt_ping_channel_autorizado(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from vtt_scenes s
    where s.id = (regexp_match(p_topic, '^campaign:([0-9a-fA-F-]{36}):scene:([0-9a-fA-F-]{36}):vtt:ping$'))[2]::uuid
      and s.campaign_id = (regexp_match(p_topic, '^campaign:([0-9a-fA-F-]{36}):scene:([0-9a-fA-F-]{36}):vtt:ping$'))[1]::uuid
      and is_campaign_member(s.campaign_id)
  );
$$;

revoke all on function vtt_ping_channel_autorizado(text) from public;
grant execute on function vtt_ping_channel_autorizado(text) to authenticated;

-- Só SELECT (recebimento) — nenhuma policy de INSERT é criada aqui de
-- propósito; sem ela, `channel.send()` direto do cliente é recusado
-- pela ausência de policy permissiva (RLS nega por padrão).
create policy "campaign_members_receive_ping_channel"
on "realtime"."messages"
for select
to authenticated
using (
  vtt_ping_channel_autorizado(realtime.topic())
);

-- ---------------------------------------------------------------------
-- `vtt_ping` republicada: tópico por cena (em vez de por campanha) e
-- payload ganha `largura`/`altura` da cena — o subscriber usa isto pra
-- validar a coordenada recebida contra os limites reais da cena sem
-- precisar de uma segunda leitura.
-- ---------------------------------------------------------------------

create or replace function vtt_ping(
  p_campaign_id uuid,
  p_scene_id uuid,
  p_q integer,
  p_r integer
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

revoke all on function vtt_ping(uuid, uuid, integer, integer) from public;
grant execute on function vtt_ping(uuid, uuid, integer, integer) to authenticated;

commit;
