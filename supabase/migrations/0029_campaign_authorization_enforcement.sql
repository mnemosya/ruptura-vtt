-- =====================================================================
-- Ruptura VTT — Reforço de autorização real de personagem (Etapa 12, correção 4)
-- Migration: 0029_campaign_authorization_enforcement
--
-- AUDITORIA DESTA CORREÇÃO (matriz completa no checkpoint). Resumo do
-- achado central: os dois caminhos REAIS de leitura/escrita de
-- personagem pelo JOGADOR (`get_character_for_profile_session`/
-- `save_character_for_profile_session`, migration 0016) NÃO são acesso
-- anônimo aberto — são `SECURITY DEFINER` e já exigem, dentro da
-- própria função, um `profile_session_token` real (hash SHA-256,
-- `status='active'`, perfil `is_locked=true`) antes de devolver ou
-- alterar qualquer coisa. Ou seja: hoje, conhecer só o `character_id`
-- NUNCA bastou para essas duas funções — precisa do token de sessão
-- também. A auditoria completa de `character/storage.ts` (~15 funções)
-- confirmou que:
--   • Seção 1 (produto/narrador): já usa `getScopedTableClient()`
--     (JWT do narrador) — autenticada desde sempre.
--   • Seção 2 (jogador, as duas funções acima): protegida por token de
--     sessão real dentro do RPC, não por RLS de tabela.
--   • Seção 3 (dev/diagnóstico): client anon puro, usada SÓ por rotas
--     explicitamente marcadas dev (`/dev/character-sheet`, `/dev/table`,
--     `/dev/join/[campaignId]`) — nunca por uma rota de produto.
--
-- O QUE ESTA MIGRATION FAZ: fecha a lacuna real que restava — o token
-- de sessão, sozinho, não tinha nenhum vínculo com `auth.uid()`. Agora,
-- quando o PERFIL já foi reivindicado (`campaign_profiles.user_id` não
-- nulo, migration 0028), as duas funções acima passam a EXIGIR
-- `auth.uid() = campaign_profiles.user_id` também — defesa em
-- profundidade em cima do token, nunca substituindo-o. Perfis AINDA
-- NÃO reivindicados continuam funcionando só por token (compatibilidade
-- com campanhas/perfis que não passaram pelo fluxo de convite
-- autenticado) — nenhuma sessão legada é quebrada.
--
-- O QUE ESTA MIGRATION DELIBERADAMENTE NÃO FAZ (documentado, não
-- escondido): não altera a RLS de `campaign_profiles`/`characters`
-- (`*_dev_transition_*`, `anon+authenticated USING(true)`). Fazer isso
-- seria seguro SOMENTE depois de confirmar que TODA leitura/escrita
-- autenticada legítima (dashboard do narrador via `getScopedTableClient`,
-- que também é role `authenticated`) continua coberta por uma policy
-- equivalente — auditar e provar isso com segurança, sem um ambiente
-- Supabase real para testar a regressão, é um risco que esta correção
-- não assume. Documentado como a lacuna que impede o status de descer
-- de nível (ver checkpoint).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Aliases de nomenclatura pedidos (mesma semântica de
--    is_campaign_member/is_campaign_owner, já existentes — nenhuma
--    função redundante com comportamento CONFLITANTE, só nomes
--    adicionais para os dois papéis mais genéricos pedidos).
-- ---------------------------------------------------------------------
create or replace function can_read_campaign(p_campaign_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select is_campaign_member(p_campaign_id, check_user_id);
$$;

create or replace function can_manage_campaign(p_campaign_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select is_campaign_owner(p_campaign_id, check_user_id);
$$;

revoke all on function can_read_campaign(uuid, uuid) from public;
revoke all on function can_manage_campaign(uuid, uuid) from public;
grant execute on function can_read_campaign(uuid, uuid) to authenticated;
grant execute on function can_manage_campaign(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. get_character_for_profile_session — reforçada. Mesma assinatura
--    (não precisa DROP). Quando o perfil já foi reivindicado, exige
--    auth.uid() = user_id também (além do token já exigido).
-- ---------------------------------------------------------------------
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
    return; -- token/sessão inválidos: conjunto vazio, sem lançar erro (mesmo padrão de antes)
  end if;

  select * into v_profile
  from public.campaign_profiles
  where id = p_profile_id
    and campaign_id = p_campaign_id
    and is_locked = true;

  if not found then
    return; -- perfil foi liberado à força — sessão não conta mais
  end if;

  -- REFORÇO (correção 4): perfil reivindicado exige auth.uid() também.
  if v_profile.user_id is not null and v_profile.user_id <> auth.uid() then
    return;
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

-- ---------------------------------------------------------------------
-- 3. save_character_for_profile_session — mesmo reforço.
-- ---------------------------------------------------------------------
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

  -- REFORÇO (correção 4): perfil reivindicado exige auth.uid() também.
  if v_profile.user_id is not null and v_profile.user_id <> auth.uid() then
    raise exception 'Este perfil pertence a outro jogador — sessão rejeitada.' using errcode = 'insufficient_privilege';
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
