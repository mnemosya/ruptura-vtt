-- =====================================================================
-- Ruptura VTT — RPCs de mutação da trilha de turnos
-- Migration: 0037_turn_track_rpc
--
-- `campaigns` só é atualizável diretamente pelo dono autenticado
-- (policy `campaigns_owner_update`, migration 0013) — igual a todo
-- outro avanço de estado de mesa (current_round/current_scene). Isso
-- cobre as ações do NARRADOR (iniciar rodada, avançar janela, avançar
-- turno, override) via `narrator_set_turn_track`, que recebe o próximo
-- estado JÁ COMPUTADO pelo motor puro (src/lib/table/turnTrack.ts) e só
-- adiciona concorrência otimista (expected_version) — mesmo padrão de
-- confiança de `endCampaignRound` (o narrador já é autoridade confiável
-- em todo o app, ver canAdvanceCampaign).
--
-- "Encerrar turno" feito pelo PRÓPRIO JOGADOR é diferente: ele NÃO tem
-- permissão de UPDATE em `campaigns`, então não pode chamar a RLS
-- direta nem passar um blob arbitrário (isso deixaria um jogador
-- avançar/roubar o turno de qualquer personagem). `end_own_turn` é uma
-- função SECURITY DEFINER que revalida, ela mesma, dentro da
-- transação: (1) o chamador controla o personagem
-- (`can_manage_character`, migration 0028 — cobre também o narrador
-- agindo por um PNJ/PJ), (2) o personagem pertence a esta mesa, (3) a
-- versão bate (sem corrida), (4) É REALMENTE a vez deste personagem no
-- `turn_track` atual (lido dentro da própria função, nunca confiado do
-- cliente). Só então marca "agiu" e recalcula o próximo índice — a
-- MESMA regra "primeiro que ainda não agiu" de
-- `src/lib/table/turnTrack.ts`, duplicada aqui de propósito: uma cópia
-- roda dentro da fronteira de confiança do banco (a única que pode
-- mutar sem ser o narrador), a outra no motor puro serve só para
-- preview/otimismo de UI e para os fluxos do narrador.
-- =====================================================================

begin;

create or replace function narrator_set_turn_track(
  p_campaign_id uuid,
  p_expected_version integer,
  p_next_turn_track jsonb
)
returns campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row campaigns;
begin
  if not is_campaign_owner(p_campaign_id) then
    raise exception 'not_campaign_owner' using errcode = '42501';
  end if;

  select * into v_row from campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'campaign_not_found' using errcode = 'P0002';
  end if;
  if v_row.turn_track_version <> p_expected_version then
    raise exception 'version_conflict' using errcode = '40001';
  end if;

  update campaigns
    set turn_track = p_next_turn_track,
        turn_track_version = turn_track_version + 1
    where id = p_campaign_id
    returning * into v_row;

  insert into table_logs (campaign_id, type, visibility, payload)
    values (p_campaign_id, 'turn_track_narrator_update', 'public',
      jsonb_build_object('nextTurnTrack', p_next_turn_track, 'source', 'narrator_set_turn_track'));

  return v_row;
end;
$$;

revoke all on function narrator_set_turn_track(uuid, integer, jsonb) from public, anon;
grant execute on function narrator_set_turn_track(uuid, integer, jsonb) to authenticated;

create or replace function end_own_turn(
  p_campaign_id uuid,
  p_character_id uuid,
  p_expected_version integer
)
returns campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row campaigns;
  v_character_campaign_id uuid;
  v_window text;
  v_order jsonb;
  v_participants jsonb;
  v_current_index integer;
  v_current_character text;
  v_flag_key text;
  v_next_index integer := -1;
  v_i integer;
  v_participant jsonb;
begin
  if not can_manage_character(p_character_id) then
    raise exception 'not_authorized_for_character' using errcode = '42501';
  end if;

  select campaign_id into v_character_campaign_id from characters where id = p_character_id;
  if v_character_campaign_id is null or v_character_campaign_id <> p_campaign_id then
    raise exception 'character_not_in_campaign' using errcode = '42501';
  end if;

  select * into v_row from campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'campaign_not_found' using errcode = 'P0002';
  end if;
  if v_row.turn_track_version <> p_expected_version then
    raise exception 'version_conflict' using errcode = '40001';
  end if;

  v_window := v_row.turn_track->>'window';
  v_order := coalesce(v_row.turn_track->'order', '[]'::jsonb);
  v_current_index := coalesce((v_row.turn_track->>'currentIndex')::integer, -1);

  if v_window is null or v_current_index < 0 or v_current_index >= jsonb_array_length(v_order) then
    raise exception 'no_active_turn' using errcode = '55000';
  end if;

  v_current_character := v_order->>v_current_index;
  if v_current_character is distinct from p_character_id::text then
    raise exception 'not_your_turn' using errcode = '55000';
  end if;

  v_flag_key := case when v_window = 'rapida' then 'actedRapida' else 'actedLenta' end;

  -- Marca o participante atual como "agiu" nesta janela.
  select jsonb_agg(
    case when elem->>'characterId' = p_character_id::text
      then jsonb_set(elem, array[v_flag_key], 'true'::jsonb)
      else elem
    end
  ) into v_participants
  from jsonb_array_elements(coalesce(v_row.turn_track->'participants', '[]'::jsonb)) as elem;

  -- Recalcula o próximo índice não-agido em `order`, na mesma regra do
  -- motor puro (primeiro da ordem cujo participante ainda não agiu).
  for v_i in 0 .. jsonb_array_length(v_order) - 1 loop
    select p into v_participant
      from jsonb_array_elements(v_participants) p
      where p->>'characterId' = v_order->>v_i
      limit 1;
    if v_participant is not null and coalesce((v_participant->>v_flag_key)::boolean, false) = false then
      v_next_index := v_i;
      exit;
    end if;
  end loop;

  update campaigns
    set turn_track = jsonb_set(
          jsonb_set(v_row.turn_track, '{participants}', v_participants),
          '{currentIndex}', to_jsonb(v_next_index)
        ),
        turn_track_version = turn_track_version + 1
    where id = p_campaign_id
    returning * into v_row;

  insert into table_logs (campaign_id, character_id, type, visibility, payload)
    values (p_campaign_id, p_character_id, 'turn_ended', 'public',
      jsonb_build_object('characterId', p_character_id, 'window', v_window, 'source', 'end_own_turn'));

  return v_row;
end;
$$;

revoke all on function end_own_turn(uuid, uuid, integer) from public, anon;
grant execute on function end_own_turn(uuid, uuid, integer) to authenticated;

commit;
