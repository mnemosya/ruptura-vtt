-- =====================================================================
-- Ruptura VTT — Token real por sessão de perfil
-- Migration: 0016_real_profile_session_tokens
--
-- Checkpoint v0.30. Substitui a validação "soft" das RPCs de
-- personagem (v0.29.1, que confiava em campaign_profiles.
-- lock_session_id — um id de navegador em localStorage, nunca
-- pensado como segredo) por um HARD CHECK contra um token real,
-- gerado server-side, cujo hash é a única coisa gravada no banco
-- (profile_sessions.session_token_hash, já existente desde a
-- migration 0009/checkpoint v0.19 — só não era usada como segredo
-- ainda). Nenhuma tabela nova; `profile_sessions` já tinha a coluna
-- certa, só faltava um token real por trás do hash.
--
-- BREAKING CHANGE aceito e documentado (regra do checkpoint): as
-- assinaturas das duas funções mudam de
-- `(campaign_id, profile_id, session_id text)` para
-- `(campaign_id, profile_id, profile_session_id uuid, raw_session_token text)`
-- — não dá para usar `create or replace` com uma lista de parâmetros
-- diferente, então as funções antigas são apagadas (`drop function`)
-- antes de recriar. Qualquer sessão de perfil ativa ANTES desta
-- migration (token = id de navegador antigo) para de validar contra
-- as RPCs no mesmo instante em que o código do app for atualizado
-- para chamar a nova assinatura — jogadores com uma ficha já aberta
-- precisarão recarregar e entrar de novo pelo convite. Isso é aceito
-- como breaking change de DEV/produto ainda em transição (o PRD nunca
-- prometeu sessões de jogador sobreviverem a uma migração de
-- segurança) — não é uma perda de dado (personagem/mesa/perfil
-- continuam intactos, só a sessão local precisa ser refeita).
--
-- O QUE MUDA:
--   1. get_character_for_profile_session / save_character_for_profile_session:
--      novo parâmetro `p_profile_session_id uuid` (id da linha de
--      profile_sessions, não secreto) + `p_raw_session_token text`
--      (o segredo). HARD CHECK: precisa existir uma linha em
--      `profile_sessions` com esse id, para esse profile_id/
--      campaign_id, com `session_token_hash` batendo o SHA-256 do
--      token bruto, E `status = 'active'` — sem exceção, sem
--      fallback para campaign_profiles.lock_session_id. Também
--      reconfirma `campaign_profiles.is_locked = true` (perfil não foi
--      liberado à força) e `characters.campaign_id` (personagem ainda
--      pertence à mesma mesa) — mesmas checagens de defesa em
--      profundidade do v0.29.1.
--   2. Grants inalterados: só anon/authenticated podem EXECUTAR (nunca
--      acesso direto à tabela por trás) — mesmo padrão desde v0.29.
--
-- Nenhuma policy de RLS foi alterada nesta migration (fora de escopo
-- do checkpoint v0.30, igual v0.29/v0.29.1).
-- =====================================================================

begin;

drop function if exists get_character_for_profile_session(uuid, uuid, text);
drop function if exists save_character_for_profile_session(uuid, uuid, text, uuid, text, jsonb);

create function get_character_for_profile_session(
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
    return; -- token/sessão inválidos: conjunto vazio, sem lançar erro (mesmo padrão de antes)
  end if;

  select * into v_profile
  from public.campaign_profiles
  where id = p_profile_id
    and campaign_id = p_campaign_id
    and is_locked = true;

  if not found then
    return; -- perfil foi liberado à força (forceReleaseCampaignProfile) — sessão não conta mais
  end if;

  if v_profile.active_character_id is null then
    return; -- sessão válida, mas perfil sem personagem ativo
  end if;

  return query
    select * from public.characters
    where id = v_profile.active_character_id
      and campaign_id = p_campaign_id;
end;
$$;

revoke all on function get_character_for_profile_session(uuid, uuid, uuid, text) from public;
grant execute on function get_character_for_profile_session(uuid, uuid, uuid, text) to anon, authenticated;

create function save_character_for_profile_session(
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

  if v_profile.active_character_id is distinct from p_character_id then
    raise exception 'Personagem "%" não é mais o ativo desta sessão de perfil.', p_character_id;
  end if;

  return query
    update public.characters
    set name = p_name, payload = p_payload
    where id = p_character_id
      and campaign_id = p_campaign_id
    returning *;
end;
$$;

revoke all on function save_character_for_profile_session(uuid, uuid, uuid, text, uuid, text, jsonb) from public;
grant execute on function save_character_for_profile_session(uuid, uuid, uuid, text, uuid, text, jsonb) to anon, authenticated;

commit;
