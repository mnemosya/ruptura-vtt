-- =====================================================================
-- Ruptura VTT — Perfis dev de mesa
-- Migration: 0004_campaign_profiles
--
-- PRD (seção 1.2/1.3): "Perfis" dentro de uma mesa, associados a um
-- apelido definido pelo narrador, bloqueáveis para evitar acesso
-- duplicado. Esta migration cria SÓ a tabela e o bloqueio manual
-- (is_locked) — sem link de convite, sem heartbeat de presença, sem
-- autenticação. `campaign_profiles` aqui é um registro de
-- desenvolvimento, não o fluxo real de convite/login do PRD.
--
-- Fora de escopo aqui (próximas etapas):
--   • autenticação (sem auth.uid(), sem tabela de usuários);
--   • link de convite (cada mesa ainda não gera link nem token);
--   • heartbeat de presença (bloqueio é só um boolean manual, sem
--     liberação automática por timeout de presença);
--   • a ficha (/dev/character-sheet) não foi alterada.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- campaign_profiles
--
-- Um "assento" dev dentro de uma mesa: apelido + cor opcional +
-- bloqueio manual + personagem ativo opcional. Não é login nem conta —
-- é só o registro de "alguém com esse apelido está jogando nesta mesa".
--
-- active_character_id é opcional e nullable: um perfil pode existir
-- antes de ter um personagem associado; on delete set null preserva o
-- perfil mesmo se o personagem for apagado depois (mesmo padrão de
-- table_logs.character_id na migration 0003).
-- ---------------------------------------------------------------------
create table if not exists campaign_profiles (
  id                   uuid primary key default gen_random_uuid(),
  campaign_id          uuid not null references campaigns(id) on delete cascade,
  nickname             text not null,
  color_label          text,
  is_locked            boolean not null default false,
  active_character_id  uuid references characters(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists campaign_profiles_campaign_id_idx
  on campaign_profiles (campaign_id);

create index if not exists campaign_profiles_campaign_created_at_idx
  on campaign_profiles (campaign_id, created_at desc);

-- reusa a função set_updated_at criada em 0001_content_library.sql
-- (já existe no banco quando esta migration roda).
drop trigger if exists campaign_profiles_set_updated_at on campaign_profiles;
create trigger campaign_profiles_set_updated_at
  before update on campaign_profiles
  for each row execute function set_updated_at();

-- =====================================================================
-- RLS (Row Level Security) — POLÍTICA TEMPORÁRIA DE DESENVOLVIMENTO
--
-- ATENÇÃO: mesmo aviso das migrations 0002/0003 — ainda NÃO existe
-- autenticação no projeto (sem login, sem auth.uid()). Esta policy
-- libera CRUD completo para `anon`/`authenticated`, usando a MESMA anon
-- key pública do resto do app — igual ao padrão já usado em
-- `campaigns` (migration 0003), pelo mesmo motivo: nesta fase de dev,
-- qualquer cliente com a anon key precisa poder criar/listar/bloquear
-- perfis para testar o fluxo via /dev/table.
--
-- RISCOS desta política:
--   • Qualquer pessoa com a anon key pode ler/criar/editar/apagar
--     QUALQUER perfil de QUALQUER mesa — sem isolamento por usuário,
--     sem checagem de que quem está bloqueando/desbloqueando é
--     realmente o narrador daquela mesa.
--   • `is_locked` é só um boolean de dados: não há enforcement real de
--     "perfil bloqueado não pode ser usado" em nenhuma camada — isso
--     dependeria de autenticação + lógica de aplicação que ainda não
--     existe. Bloquear aqui é só um indicador visual em /dev/table.
--   • Sem link de convite: não há token/segredo associado a um perfil —
--     qualquer cliente com a anon key pode listar todos os perfis de
--     qualquer mesa diretamente.
--   • Sem heartbeat: um perfil bloqueado manualmente fica bloqueado
--     até alguém desbloquear manualmente (sem timeout, sem liberação
--     automática por inatividade/fechar aba).
--   • Sem rate limit: nada impede criação ilimitada de perfis.
--
-- TODO (bloqueante para produção): quando houver autenticação,
--   1. adicionar coluna de "dono"/narrador em campaign_profiles ou
--      reusar o dono de campaigns (FK para tabela de usuários do
--      Supabase Auth);
--   2. restringir insert/update (incl. is_locked) ao narrador da mesa;
--   3. implementar heartbeat de presença real (tabela ou coluna de
--      "last_seen_at" + liberação automática por timeout);
--   4. implementar link de convite com token próprio por mesa,
--      revogável, em vez de listagem aberta de perfis.
-- =====================================================================

alter table campaign_profiles enable row level security;

drop policy if exists campaign_profiles_dev_anon_select on campaign_profiles;
create policy campaign_profiles_dev_anon_select
  on campaign_profiles
  for select
  to anon, authenticated
  using (true);

drop policy if exists campaign_profiles_dev_anon_insert on campaign_profiles;
create policy campaign_profiles_dev_anon_insert
  on campaign_profiles
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists campaign_profiles_dev_anon_update on campaign_profiles;
create policy campaign_profiles_dev_anon_update
  on campaign_profiles
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists campaign_profiles_dev_anon_delete on campaign_profiles;
create policy campaign_profiles_dev_anon_delete
  on campaign_profiles
  for delete
  to anon, authenticated
  using (true);

commit;
