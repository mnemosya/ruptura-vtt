-- =====================================================================
-- Ruptura VTT — revoga EXECUTE de anon nas RPCs authenticated-only da
-- Etapa 12 (validação integrada pós-correção 7)
-- Migration: 0033_revoke_anon_execute_on_authenticated_rpcs
--
-- ACHADO (validação integrada contra Supabase real, não reproduzível
-- por leitura estática do SQL): toda migration da Etapa 12 (0025-0032)
-- seguiu o padrão `revoke all on function X from public; grant execute
-- on function X to authenticated;` — mas este projeto tem, desde antes
-- da Etapa 12, uma default privilege de schema aplicada pelo dono das
-- migrations (`postgres`):
--
--   select defaclacl from pg_default_acl where defaclobjtype = 'f';
--   -- {postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, ...}
--
-- Ou seja: toda função NOVA criada em `public` já nasce com EXECUTE
-- concedido a `anon`/`authenticated`/`service_role` automaticamente,
-- via uma entrada de ACL PRÓPRIA para cada papel — `revoke all ... from
-- public` só revoga o privilégio implícito do pseudo-papel PUBLIC, não
-- essas entradas específicas já materializadas para `anon`. Confirmado
-- via `has_function_privilege('anon', <oid>, 'EXECUTE')` = true em
-- TODAS as RPCs da Etapa 12, incluindo as que o código/documentação
-- sempre descreveram como "só authenticated" (`is_campaign_owner`,
-- `claim_campaign_profile`, `set_campaign_profile_active_character`,
-- `force_release_campaign_profile`, `publish_campaign_content_draft`,
-- etc.) — nenhuma delas jamais teve seu `revoke ... from public`
-- suficiente para bloquear `anon`.
--
-- IMPACTO REAL (avaliado função a função, não presumido): a maioria
-- destas funções já falha com segurança para um chamador `anon` porque
-- valida `auth.uid() is null` (ou compara contra `check_user_id
-- default auth.uid()`, que resolve para null) internamente — ou seja,
-- NÃO houve bypass de autorização ativo comprovado por este achado. A
-- exceção real: os helpers `can_read_character`/`can_manage_character`/
-- `can_access_campaign_profile`/`can_manage_campaign_profile`/
-- `can_read_campaign`/`can_manage_campaign`/`can_read_campaign_content`/
-- `can_manage_campaign_content`/`is_campaign_owner`/`is_campaign_member`
-- aceitam `check_user_id` como PARÂMETRO explícito (não só via default)
-- — um chamador `anon` podia invocar a RPC passando um `check_user_id`
-- arbitrário e obter um boolean revelando "este usuário X pode ler/
-- administrar este personagem/perfil/campanha Y", um oráculo de
-- pertencimento (baixo risco, mas informação real vazada sem
-- autenticação). Corrigido aqui por completo: nenhuma destas funções
-- deve ser invocável por `anon`.
--
-- ESCOPO: só as RPCs/helpers criados pela Etapa 12 (migrations
-- 0025-0032). RPCs de etapas anteriores com o mesmo padrão
-- (`publish_content_draft`, `import_content_drafts`,
-- `archive_content_document`, `is_content_admin`) apresentam o MESMO
-- sintoma, mas NÃO são tocadas aqui — fora do escopo desta validação
-- (não reabrir o editor de conteúdo oficial); registradas como achado
-- correlato no checkpoint.
--
-- NÃO revogado de `anon`: `enter_campaign_profile`,
-- `heartbeat_profile_session`, `leave_campaign_profile`,
-- `validate_profile_session_token`, `expire_stale_profile_sessions`,
-- `get_character_for_profile_session`, `save_character_for_profile_session`
-- — estas SÃO, por design (Opção B, perfil não reivindicado), chamáveis
-- por `anon`; cada uma já se autoprotege por token/sessão real.
-- =====================================================================

begin;

revoke execute on function is_campaign_owner(uuid, uuid) from anon;
revoke execute on function is_campaign_member(uuid, uuid) from anon;
revoke execute on function can_manage_campaign_content(uuid, uuid) from anon;
revoke execute on function can_read_campaign_content(uuid, uuid) from anon;
revoke execute on function can_access_campaign_profile(uuid, uuid) from anon;
revoke execute on function can_manage_campaign_profile(uuid, uuid) from anon;
revoke execute on function can_read_character(uuid, uuid) from anon;
revoke execute on function can_manage_character(uuid, uuid) from anon;
revoke execute on function can_read_campaign(uuid, uuid) from anon;
revoke execute on function can_manage_campaign(uuid, uuid) from anon;
revoke execute on function claim_campaign_profile(uuid) from anon;
revoke execute on function create_and_claim_campaign_profile(uuid, text) from anon;
revoke execute on function list_claimable_campaign_profiles(uuid) from anon;
revoke execute on function accept_campaign_invite(text) from anon;
revoke execute on function force_release_campaign_profile(uuid) from anon;
revoke execute on function set_campaign_profile_active_character(uuid, uuid) from anon;
revoke execute on function publish_campaign_content_draft(uuid, integer, jsonb, jsonb, jsonb, text, jsonb, jsonb) from anon;
revoke execute on function remove_campaign_content_override(text, integer, text) from anon;
revoke execute on function archive_campaign_homebrew(text, integer, text) from anon;

commit;
