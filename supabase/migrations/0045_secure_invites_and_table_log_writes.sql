-- =====================================================================
-- Ruptura VTT — fecha o SELECT aberto de campaign_invites e o INSERT
-- aberto de table_logs
-- Migration: 0045_secure_invites_and_table_log_writes
--
-- Achados adjacentes já registrados na rodada anterior
-- (CHECKPOINT_SEGURANCA_ATOMICIDADE.md), confirmados agora e fechados:
--
-- 1. `campaign_invites_dev_transition_select` (`using (true)` para
--    `anon, authenticated`, migration 0003) permitia a QUALQUER
--    usuário ler `campaign_id`/`expires_at`/`revoked_at`/`created_by`
--    de TODO convite existente — enumeração cross-campanha real
--    (token_hash é SHA-256 unidirecional, não reversível, mas a LINHA
--    inteira era legível). `campaign_invites_owner_all` (migration
--    0008) já cobre integralmente o narrador administrar os PRÓPRIOS
--    convites — a policy aberta nunca foi necessária para isso. O
--    preview público de `/join/[token]` já passa pela RPC
--    `resolve_campaign_invite_public` (migration 0043) desde a rodada
--    anterior — não depende de SELECT na tabela. Removida sem
--    substituto: nenhum consumidor real restante.
--
-- 2. `table_logs_dev_transition_insert` (`using(true)`/`with_check(true)`
--    para `anon, authenticated`) permitia a QUALQUER usuário inserir um
--    log arbitrário em QUALQUER campanha, com QUALQUER `character_id`/
--    `profile_id`/`created_by_user_id`/`payload` — falsificação total
--    de autor e campanha. `table_logs_owner_insert` (authenticated,
--    dono da mesa) já cobre o narrador. O jogador (via `addLog`,
--    `src/lib/table/storage.ts` — ÚNICO caminho de escrita de log da
--    aplicação, 8 chamadores) nunca teve uma policy própria — dependia
--    inteiramente da policy aberta. Fechada com uma RPC SECURITY
--    DEFINER (`append_table_log`) que deriva o autor de `auth.uid()`
--    no servidor (nunca do payload do cliente), valida
--    `is_campaign_member(campaign_id)`, e — quando `character_id`/
--    `profile_id` são informados — valida que pertencem de fato ao
--    chamador (`can_manage_character`/`campaign_profiles.user_id`) ou
--    que o chamador é o narrador dono. `addLog` (storage.ts) migrada
--    para chamar a RPC em vez do INSERT direto — nenhum caminho antigo
--    de escrita ampla continua ativo em paralelo.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. campaign_invites — remove o SELECT aberto.
-- ---------------------------------------------------------------------

drop policy if exists campaign_invites_dev_transition_select on campaign_invites;

-- ---------------------------------------------------------------------
-- 2. table_logs — remove o INSERT aberto; RPC validada substitui o
--    caminho de escrita do jogador.
-- ---------------------------------------------------------------------

drop policy if exists table_logs_dev_transition_insert on table_logs;

create or replace function append_table_log(
  p_campaign_id uuid,
  p_type text,
  p_visibility text,
  p_payload jsonb,
  p_character_id uuid default null,
  p_profile_id uuid default null,
  p_profile_session_id uuid default null
)
returns table_logs
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_row table_logs;
begin
  if v_uid is null then
    raise exception 'É necessário estar autenticado para registrar um evento.' using errcode = 'insufficient_privilege';
  end if;

  if not is_campaign_member(p_campaign_id) then
    raise exception 'Você não é membro desta campanha.' using errcode = 'insufficient_privilege';
  end if;

  if p_visibility not in ('public', 'private', 'gm') then
    raise exception 'Visibilidade inválida.' using errcode = '22023';
  end if;

  if p_type is null or length(trim(both from p_type)) = 0 then
    raise exception 'Tipo de evento inválido.' using errcode = '22023';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Payload de log inválido — precisa ser um objeto.' using errcode = '22023';
  end if;

  -- Nunca confia em character_id do cliente sem confirmar posse real
  -- (mesmo padrão de `end_own_turn`, migration 0037): o personagem
  -- precisa pertencer a ESTA campanha E o chamador precisa poder
  -- gerenciá-lo (dono da mesa, ou perfil que reivindicou o personagem).
  if p_character_id is not null then
    if not can_manage_character(p_character_id) then
      raise exception 'Você não pode registrar eventos para este personagem.' using errcode = 'insufficient_privilege';
    end if;
    if not exists (select 1 from characters c where c.id = p_character_id and c.campaign_id = p_campaign_id) then
      raise exception 'Este personagem não pertence a esta campanha.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Idem para profile_id: só o PRÓPRIO perfil reivindicado, ou o
  -- narrador dono da mesa (mesmo contrato de `claim_own_active_character`).
  if p_profile_id is not null then
    if not exists (
      select 1 from campaign_profiles p
      where p.id = p_profile_id
        and p.campaign_id = p_campaign_id
        and (p.user_id = v_uid or is_campaign_owner(p_campaign_id))
    ) then
      raise exception 'Este perfil não pertence a você.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  insert into table_logs (campaign_id, character_id, type, visibility, payload, profile_id, created_by_user_id, profile_session_id)
  values (p_campaign_id, p_character_id, p_type, p_visibility, p_payload, p_profile_id, v_uid, p_profile_session_id)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function append_table_log(uuid, text, text, jsonb, uuid, uuid, uuid) from public, anon;
grant execute on function append_table_log(uuid, text, text, jsonb, uuid, uuid, uuid) to authenticated;

commit;
