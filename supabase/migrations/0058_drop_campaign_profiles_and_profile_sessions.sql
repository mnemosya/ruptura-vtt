-- =====================================================================
-- Ruptura VTT — remoção definitiva de campaign_profiles/profile_sessions
-- Migration: 0058_drop_campaign_profiles_and_profile_sessions
--
-- Passo 5/6 da ordem interna segura (§13.7 do relatório de auditoria,
-- revisão 4). Executado só depois de confirmar (migrations 0051-0057 +
-- adaptação completa de backend/frontend + busca textual exaustiva +
-- 22 testes comportamentais contra Supabase real, todos passando) que
-- nenhum código de aplicação depende mais destas tabelas/funções.
--
-- Inspeção de dependências via pg_depend (rodada antes desta migration)
-- confirmou que a ÚNICA dependência externa real é
-- characters.profile_id (constraint characters_profile_id_fkey) — todo
-- o resto (índices, triggers, policies, defaults, PKs) é intrínseco às
-- próprias tabelas campaign_profiles/profile_sessions. Nenhum objeto
-- fora desta lista foi encontrado.
--
-- Cada objeto é removido NOMEADAMENTE, sem CASCADE em nenhum DROP TABLE
-- — se algo inesperado ainda depender de um destes objetos, o DROP
-- correspondente falha com erro do Postgres (para auditoria manual),
-- em vez de remover silenciosamente algo fora da lista aprovada.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Policies (nomeadas individualmente)
-- ---------------------------------------------------------------------
drop policy if exists campaign_profiles_authenticated_select on campaign_profiles;
drop policy if exists campaign_profiles_authenticated_insert on campaign_profiles;
drop policy if exists campaign_profiles_authenticated_update on campaign_profiles;
drop policy if exists campaign_profiles_authenticated_delete on campaign_profiles;
drop policy if exists profile_sessions_owner_all on profile_sessions;

-- ---------------------------------------------------------------------
-- 2. Trigger
-- ---------------------------------------------------------------------
drop trigger if exists campaign_profiles_set_updated_at on campaign_profiles;

-- ---------------------------------------------------------------------
-- 3. Funções — as 13 RPCs + 2 helpers do modelo de perfil (§13.2)
-- ---------------------------------------------------------------------
drop function if exists get_character_for_profile_session(uuid, uuid, uuid, text);
drop function if exists save_character_for_profile_session(uuid, uuid, uuid, text, uuid, text, jsonb);
drop function if exists enter_campaign_profile(uuid, text, uuid);
drop function if exists heartbeat_profile_session(uuid, uuid, text);
drop function if exists leave_campaign_profile(uuid, uuid, text);
drop function if exists validate_profile_session_token(uuid, uuid, uuid, text);
drop function if exists expire_stale_profile_sessions(uuid, integer);
drop function if exists force_release_campaign_profile(uuid);
drop function if exists set_campaign_profile_active_character(uuid, uuid);
drop function if exists claim_own_active_character(uuid, uuid);
drop function if exists claim_campaign_profile(uuid);
drop function if exists create_and_claim_campaign_profile(uuid, text);
drop function if exists list_claimable_campaign_profiles(uuid);
drop function if exists can_access_campaign_profile(uuid, uuid);
drop function if exists can_manage_campaign_profile(uuid, uuid);

-- ---------------------------------------------------------------------
-- 4. Índices próprios (não-PK) de cada tabela — removidos explicitamente
-- antes do DROP TABLE, não deixados para remoção implícita.
-- ---------------------------------------------------------------------
drop index if exists campaign_profiles_campaign_id_idx;
drop index if exists campaign_profiles_campaign_created_at_idx;
drop index if exists campaign_profiles_campaign_user_unique;
drop index if exists profile_sessions_campaign_id_idx;
drop index if exists profile_sessions_profile_id_idx;
drop index if exists profile_sessions_profile_token_idx;
drop index if exists profile_sessions_status_idx;

-- ---------------------------------------------------------------------
-- 5. Dependência externa real: characters.profile_id
-- ---------------------------------------------------------------------
alter table characters drop constraint if exists characters_profile_id_fkey;
alter table characters drop column if exists profile_id;
drop index if exists characters_one_active_per_profile_campaign_uidx;

-- ---------------------------------------------------------------------
-- 6. Tabelas — profile_sessions primeiro (tem FK para campaign_profiles;
-- removê-la antes evita que essa FK bloqueie o drop de campaign_profiles
-- logo em seguida). SEM CASCADE: se sobrar qualquer dependência não
-- prevista nos passos acima, o comando falha aqui, em vez de apagar
-- silenciosamente algo fora da lista aprovada.
-- ---------------------------------------------------------------------
drop table profile_sessions;
drop table campaign_profiles;

commit;
