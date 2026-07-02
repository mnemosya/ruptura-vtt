-- =====================================================================
-- Ruptura VTT — Auditoria das RPCs security definer de characters
-- Migration: 0015_harden_character_session_rpcs
--
-- Checkpoint v0.29.1. Audita e endurece
-- get_character_for_profile_session/save_character_for_profile_session
-- (criadas na migration 0014, checkpoint v0.29) ANTES de avançar para
-- um token de sessão real. NÃO altera RLS de `characters` (as 4
-- policies dev_transition e as 4 owner_* continuam exatamente como
-- ficaram no v0.29) e NÃO mexe em /dev/character-sheet.
--
-- ACHADOS da auditoria (checklist do checkpoint) e o que foi corrigido:
--
--   1. search_path — presente (`set search_path = public`), mas não
--      no formato mais seguro recomendado (Postgres/Supabase Security
--      Advisor): `search_path` deveria ser a string VAZIA, com todos
--      os identificadores qualificados por schema, para eliminar
--      qualquer ambiguidade de resolução de schema. CORRIGIDO: as
--      funções são recriadas com `set search_path = ''` e
--      `public.characters`/`public.campaign_profiles`/
--      `public.profile_sessions`/`extensions.digest` totalmente
--      qualificados.
--
--   2. Validação de session_token_hash — AUSENTE. As funções só
--      comparavam `campaign_profiles.lock_session_id = p_session_id`
--      (texto puro) — nunca cruzavam com `profile_sessions.
--      session_token_hash` (o hash SHA-256 que a camada de rastreio de
--      sessão usa desde a migration 0009/checkpoint v0.19, e que
--      `expireStaleProfileSessions` já usa para não derrubar uma
--      sessão mais nova, ver TypeScript). CORRIGIDO: adicionado um
--      cruzamento com `profile_sessions` pelo hash SHA-256 do
--      `p_session_id` — mas como "soft check" (só REJEITA se existir
--      uma linha com esse hash e status DIFERENTE de 'active'; não
--      EXIGE que a linha exista, porque profile_sessions é
--      best-effort/melhor-esforço por design — ver aviso em
--      table/storage.ts). Isso pega o caso de uma sessão já marcada
--      'expired'/'exited'/'released' pela camada de rastreio mas cujo
--      campaign_profiles ainda não foi limpo (corrida), sem criar uma
--      nova dependência dura que quebraria sessões legítimas se a
--      gravação em profile_sessions tiver falhado silenciosamente.
--
--   3. Validação de status da profile_session — AUSENTE (mesma causa
--      do item 2). CORRIGIDO junto com o item 2 (o cruzamento de hash
--      já inclui a checagem de status).
--
--   4. Validação de campaign_id — presente na consulta a
--      campaign_profiles, mas NÃO reaplicada na consulta/atualização
--      da própria linha de `characters`. Isso permite um cenário real
--      hoje: `desvincularPersonagemDaMesa` (MesaDetailClient, v0.23)
--      limpa `characters.campaign_id` de um personagem SEM limpar
--      `campaign_profiles.active_character_id` do perfil que o tinha
--      como ativo — deixando uma referência "fantasma". CORRIGIDO:
--      adicionado `and campaign_id = p_campaign_id` na consulta/
--      atualização de `characters` — um personagem desvinculado da
--      mesa deixa de ser servível/salvável por uma sessão daquela
--      mesa, mesmo que `active_character_id` ainda aponte para ele.
--
--   5. Validação de profile_id (na própria linha de characters) —
--      AVALIADA E DELIBERADAMENTE NÃO ADICIONADA. O dropdown de
--      "personagem ativo" de um perfil (MesaDetailClient) oferece
--      QUALQUER personagem vinculado à mesa, não só os já vinculados
--      àquele profile_id específico — ou seja, é normal e válido hoje
--      um personagem ter `active_character_id` de um perfil sem que
--      `characters.profile_id` aponte de volta para o mesmo perfil.
--      Exigir esse cruzamento quebraria esse fluxo legítimo. A
--      autoridade real de "qual personagem esta sessão pode tocar" é
--      `campaign_profiles.active_character_id`, não
--      `characters.profile_id` — mantido como estava.
--
--   6. active_character_id (perfil tem personagem ativo; character_id
--      recebido é de fato o ativo) — já estava correto nas duas
--      funções. Mantido.
--
--   7. Bloqueio contra salvar personagem de outro perfil — já coberto
--      pelo item 6 (comparação exata de active_character_id), reforçado
--      pelo item 4 (campaign_id). Nenhuma mudança adicional necessária.
--
--   8. Atualização apenas dos campos permitidos — já estava correto:
--      o UPDATE em save_character_for_profile_session só toca `name`
--      e `payload`; `owner_id`/`campaign_id`/`profile_id`/`status`/
--      `archived_at` nunca aparecem no SET, então não há como esta RPC
--      alterá-los, mesmo antes desta migration. Confirmado, sem
--      mudança necessária.
--
-- grant execute continua só para anon/authenticated (revoke all from
-- public mantido) — sem mudança nessa parte.
-- =====================================================================

begin;

create or replace function get_character_for_profile_session(
  p_campaign_id uuid,
  p_profile_id uuid,
  p_session_id text
)
returns setof public.characters
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.campaign_profiles%rowtype;
  v_session_hash text;
begin
  select * into v_profile
  from public.campaign_profiles
  where id = p_profile_id
    and campaign_id = p_campaign_id
    and is_locked = true
    and lock_session_id = p_session_id;

  if not found then
    return; -- sessão inválida: conjunto vazio, sem lançar erro (mesmo padrão de validateProductSession)
  end if;

  -- v0.29.1: cruza com profile_sessions pelo hash do sessionId — só
  -- rejeita se existir uma linha para este hash com status != 'active'
  -- (sessão que a camada de rastreio já considera encerrada/expirada).
  -- Não exige que a linha exista (profile_sessions é best-effort).
  v_session_hash := encode(extensions.digest(convert_to(p_session_id, 'UTF8'), 'sha256'), 'hex');
  if exists (
    select 1 from public.profile_sessions
    where profile_id = p_profile_id
      and campaign_id = p_campaign_id
      and session_token_hash = v_session_hash
      and status <> 'active'
  ) then
    return;
  end if;

  if v_profile.active_character_id is null then
    return; -- sessão válida, mas perfil sem personagem ativo
  end if;

  -- v0.29.1: reconfirma campaign_id na própria linha de characters —
  -- um personagem desvinculado da mesa (assignCharacterToCampaign
  -- null) não deve mais ser servível por uma sessão daquela mesa,
  -- mesmo que active_character_id ainda aponte para ele.
  return query
    select * from public.characters
    where id = v_profile.active_character_id
      and campaign_id = p_campaign_id;
end;
$$;

revoke all on function get_character_for_profile_session(uuid, uuid, text) from public;
grant execute on function get_character_for_profile_session(uuid, uuid, text) to anon, authenticated;

create or replace function save_character_for_profile_session(
  p_campaign_id uuid,
  p_profile_id uuid,
  p_session_id text,
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
  v_profile public.campaign_profiles%rowtype;
  v_session_hash text;
begin
  select * into v_profile
  from public.campaign_profiles
  where id = p_profile_id
    and campaign_id = p_campaign_id
    and is_locked = true
    and lock_session_id = p_session_id;

  if not found then
    raise exception 'Sessão de perfil inválida — não é possível salvar o personagem.';
  end if;

  v_session_hash := encode(extensions.digest(convert_to(p_session_id, 'UTF8'), 'sha256'), 'hex');
  if exists (
    select 1 from public.profile_sessions
    where profile_id = p_profile_id
      and campaign_id = p_campaign_id
      and session_token_hash = v_session_hash
      and status <> 'active'
  ) then
    raise exception 'Sessão de perfil expirada ou encerrada — recarregue a ficha e entre novamente.';
  end if;

  if v_profile.active_character_id is distinct from p_character_id then
    raise exception 'Personagem "%" não é mais o ativo desta sessão de perfil.', p_character_id;
  end if;

  -- v0.29.1: campaign_id reconfirmado no próprio UPDATE — só atualiza
  -- name/payload (nunca owner_id/campaign_id/profile_id/status/
  -- archived_at), e só se o personagem ainda pertencer à mesma mesa.
  return query
    update public.characters
    set name = p_name, payload = p_payload
    where id = p_character_id
      and campaign_id = p_campaign_id
    returning *;
end;
$$;

revoke all on function save_character_for_profile_session(uuid, uuid, text, uuid, text, jsonb) from public;
grant execute on function save_character_for_profile_session(uuid, uuid, text, uuid, text, jsonb) to anon, authenticated;

commit;
