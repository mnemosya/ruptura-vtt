-- =====================================================================
-- Ruptura VTT — exige membership ATIVA para sessão de perfil reivindicado
-- (Etapa 12, validação integrada pós-correção 7)
-- Migration: 0034_enforce_active_membership_for_claimed_sessions
--
-- ACHADO (reproduzido contra Supabase real, matriz "membro removed"):
-- `get_character_for_profile_session`/`save_character_for_profile_session`
-- (e, pelo mesmo motivo, `enter_campaign_profile`/
-- `heartbeat_profile_session`) só verificam
-- `campaign_profiles.user_id = auth.uid()` quando o perfil já foi
-- reivindicado — nunca verificam `campaign_members.status`. Reproduzido
-- explicitamente: um usuário com perfil reivindicado e uma sessão já
-- emitida (token real, válido) continua lendo/escrevendo o próprio
-- personagem NORMALMENTE mesmo depois de `campaign_members.status` virar
-- 'removed' — a remoção de um membro não revoga sessões de personagem já
-- emitidas. Isso viola o contrato pedido explicitamente para o cenário
-- "membro removed": perde acesso à campanha, heartbeat falha, token de
-- sessão reivindicada deixa de autorizar, não abre nem salva personagem.
--
-- CORREÇÃO: quando o perfil já foi reivindicado (`user_id is not null`),
-- as quatro RPCs abaixo passam a exigir TAMBÉM
-- `is_campaign_member(campaign_id, user_id)` (que já checa
-- `status = 'active'`, migration 0026) — mesmo padrão de dupla
-- verificação já usado para `auth.uid() = user_id` desde a migration
-- 0029. Perfis NÃO reivindicados (`user_id is null`) continuam
-- funcionando só por token — não são afetados (não têm membership de
-- usuário para checar).
--
-- Mesma assinatura das quatro funções — `create or replace`, sem DROP.
-- =====================================================================

begin;

create or replace function enter_campaign_profile(
  p_profile_id uuid,
  p_session_id text,
  p_invite_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_profile campaign_profiles%rowtype;
  v_now timestamptz := now();
  v_raw_token text;
  v_token_hash text;
  v_profile_session_id uuid;
begin
  select * into v_profile from campaign_profiles where id = p_profile_id for update;
  if not found then
    raise exception 'Perfil não encontrado.' using errcode = 'no_data_found';
  end if;

  if v_profile.user_id is not null and not is_campaign_member(v_profile.campaign_id, v_profile.user_id) then
    raise exception 'Este perfil pertence a um jogador que não é mais membro ativo desta campanha.' using errcode = 'insufficient_privilege';
  end if;

  perform expire_stale_profile_sessions(v_profile.campaign_id, 30);

  select * into v_profile from campaign_profiles where id = p_profile_id for update;

  if v_profile.is_locked
     and v_profile.lock_session_id is distinct from p_session_id
     and v_profile.last_seen_at is not null
     and (v_now - v_profile.last_seen_at) <= interval '30 seconds'
  then
    raise exception 'Perfil "%" está em uso por outra sessão (sem expirar ainda).', v_profile.nickname
      using errcode = 'insufficient_privilege';
  end if;

  update campaign_profiles
  set is_locked = true, lock_session_id = p_session_id, locked_at = v_now, last_seen_at = v_now
  where id = p_profile_id
  returning * into v_profile;

  update profile_sessions set status = 'released', released_at = v_now
  where profile_id = p_profile_id and status = 'active';

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(convert_to(v_raw_token, 'UTF8'), 'sha256'), 'hex');

  insert into profile_sessions (campaign_id, profile_id, invite_id, session_token_hash, status, last_seen_at)
  values (v_profile.campaign_id, p_profile_id, p_invite_id, v_token_hash, 'active', v_now)
  returning id into v_profile_session_id;

  return jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'profileSessionId', v_profile_session_id,
    'rawSessionToken', v_raw_token
  );
end;
$$;

create or replace function heartbeat_profile_session(
  p_profile_id uuid,
  p_profile_session_id uuid,
  p_raw_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_session profile_sessions%rowtype;
  v_profile campaign_profiles%rowtype;
  v_token_hash text;
  v_now timestamptz := now();
begin
  v_token_hash := encode(extensions.digest(convert_to(p_raw_session_token, 'UTF8'), 'sha256'), 'hex');

  select * into v_session from profile_sessions
  where id = p_profile_session_id and profile_id = p_profile_id;
  if not found then
    raise exception 'Sessão de perfil "%" não encontrada.', p_profile_session_id using errcode = 'no_data_found';
  end if;
  if v_session.session_token_hash <> v_token_hash then
    raise exception 'Heartbeat rejeitado — token de sessão inválido.' using errcode = 'insufficient_privilege';
  end if;
  if v_session.status <> 'active' then
    raise exception 'Heartbeat rejeitado — sessão de perfil não está mais ativa (status: "%").', v_session.status
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_profile from campaign_profiles where id = p_profile_id;
  if v_profile.user_id is not null and not is_campaign_member(v_profile.campaign_id, v_profile.user_id) then
    raise exception 'Heartbeat rejeitado — este perfil pertence a um jogador que não é mais membro ativo desta campanha.'
      using errcode = 'insufficient_privilege';
  end if;

  update campaign_profiles
  set last_seen_at = v_now
  where id = p_profile_id and is_locked = true
  returning * into v_profile;
  if not found then
    raise exception 'Heartbeat rejeitado para o perfil "%" — perfil não está mais bloqueado.', p_profile_id
      using errcode = 'insufficient_privilege';
  end if;

  update profile_sessions set last_seen_at = v_now where id = p_profile_session_id;

  return to_jsonb(v_profile);
end;
$$;

create or replace function get_character_for_profile_session(
  p_campaign_id uuid,
  p_profile_id uuid,
  p_profile_session_id uuid,
  p_raw_session_token text
)
returns setof public.characters
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.profile_sessions%rowtype;
  v_profile public.campaign_profiles%rowtype;
  v_token_hash text;
begin
  v_token_hash := encode(extensions.digest(convert_to(p_raw_session_token, 'UTF8'), 'sha256'), 'hex');

  select * into v_session
  from public.profile_sessions
  where id = p_profile_session_id
    and profile_id = p_profile_id
    and campaign_id = p_campaign_id
    and session_token_hash = v_token_hash
    and status = 'active';

  if not found then
    return;
  end if;

  select * into v_profile
  from public.campaign_profiles
  where id = p_profile_id
    and campaign_id = p_campaign_id
    and is_locked = true;

  if not found then
    return;
  end if;

  if v_profile.user_id is not null and v_profile.user_id <> auth.uid() then
    return;
  end if;

  if v_profile.user_id is not null and not public.is_campaign_member(p_campaign_id, v_profile.user_id) then
    return;
  end if;

  if v_profile.active_character_id is null then
    return;
  end if;

  return query
    select * from public.characters
    where id = v_profile.active_character_id
      and campaign_id = p_campaign_id
      and profile_id = p_profile_id;
end;
$$;

create or replace function save_character_for_profile_session(
  p_campaign_id uuid,
  p_profile_id uuid,
  p_profile_session_id uuid,
  p_raw_session_token text,
  p_character_id uuid,
  p_name text,
  p_payload jsonb
)
returns setof public.characters
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.profile_sessions%rowtype;
  v_profile public.campaign_profiles%rowtype;
  v_token_hash text;
begin
  v_token_hash := encode(extensions.digest(convert_to(p_raw_session_token, 'UTF8'), 'sha256'), 'hex');

  select * into v_session
  from public.profile_sessions
  where id = p_profile_session_id
    and profile_id = p_profile_id
    and campaign_id = p_campaign_id
    and session_token_hash = v_token_hash
    and status = 'active';

  if not found then
    raise exception 'Sessão de perfil inválida, expirada ou token incorreto.';
  end if;

  select * into v_profile
  from public.campaign_profiles
  where id = p_profile_id
    and campaign_id = p_campaign_id
    and is_locked = true;

  if not found then
    raise exception 'Perfil não está mais bloqueado por nenhuma sessão — entre novamente pelo convite.';
  end if;

  if v_profile.user_id is not null and v_profile.user_id <> auth.uid() then
    raise exception 'Este perfil pertence a outro jogador — sessão rejeitada.' using errcode = 'insufficient_privilege';
  end if;

  if v_profile.user_id is not null and not public.is_campaign_member(p_campaign_id, v_profile.user_id) then
    raise exception 'Este perfil pertence a um jogador que não é mais membro ativo desta campanha.' using errcode = 'insufficient_privilege';
  end if;

  if v_profile.active_character_id is distinct from p_character_id then
    raise exception 'Personagem "%" não é mais o ativo desta sessão de perfil.', p_character_id;
  end if;

  return query
    update public.characters
    set name = p_name, payload = p_payload
    where id = p_character_id
      and campaign_id = p_campaign_id
      and profile_id = p_profile_id
    returning *;
end;
$$;

commit;
