-- =====================================================================
-- Ruptura VTT — Base mínima de Mesa e Log persistente
-- Migration: 0003_campaigns_table_logs
--
-- Fase 0 do PRD: estado compartilhado mínimo (campaigns) + log
-- persistente de mesa (table_logs), com rolagens públicas/privadas/GM
-- já modeladas via `visibility`. Esta migration NÃO toca em
-- content_packs/content_documents (Biblioteca do Sistema, migration
-- 0001) nem em characters (migration 0002) além de uma FK opcional.
--
-- Fora de escopo aqui (próximas etapas):
--   • autenticação (sem auth.uid(), sem tabela de usuários);
--   • realtime (Supabase Realtime não habilitado nesta migration);
--   • a ficha (/dev/character-sheet) ainda não escreve em table_logs —
--     isso é responsabilidade de uma etapa futura, não desta.
-- =====================================================================

begin;

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- campaigns
--
-- Estado compartilhado mínimo: uma "mesa". Por enquanto só nome +
-- timestamps — sem dono, sem membros, sem configuração de sistema.
-- ---------------------------------------------------------------------
create table if not exists campaigns (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaigns_updated_at_idx
  on campaigns (updated_at desc);

-- reusa a função set_updated_at criada em 0001_content_library.sql
-- (já existe no banco quando esta migration roda, pois 0001 roda antes).
drop trigger if exists campaigns_set_updated_at on campaigns;
create trigger campaigns_set_updated_at
  before update on campaigns
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- table_logs
--
-- Log persistente de mesa — append-only por design (ver RLS abaixo:
-- sem policy de update/delete para anon/authenticated). payload (JSONB)
-- guarda o conteúdo do evento; type é um identificador livre de
-- categoria (ex.: 'chat', 'rolagem', 'sistema') — sem enum porque o
-- conjunto de tipos ainda não está fechado nesta fase.
--
-- character_id é opcional e nullable: nem todo evento de log vem de um
-- personagem (ex.: mensagem de sistema). on delete set null preserva o
-- log mesmo se o personagem for apagado depois.
--
-- visibility modela rolagem pública/privada/GM (PRD) — aqui é só o
-- campo de dados; a FILTRAGEM por visibilidade (esconder 'private'/'gm'
-- de quem não deveria ver) NÃO está implementada nesta migration —
-- depende de autenticação, que ainda não existe (ver aviso de RLS).
-- ---------------------------------------------------------------------
create table if not exists table_logs (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  character_id uuid references characters(id) on delete set null,
  type         text not null,
  visibility   text not null check (visibility in ('public', 'private', 'gm')),
  payload      jsonb not null,
  created_at   timestamptz not null default now()
);

create index if not exists table_logs_campaign_id_idx
  on table_logs (campaign_id);

create index if not exists table_logs_campaign_created_at_idx
  on table_logs (campaign_id, created_at desc);

-- =====================================================================
-- RLS (Row Level Security) — POLÍTICA TEMPORÁRIA DE DESENVOLVIMENTO
--
-- ATENÇÃO: mesmo aviso da migration 0002_characters.sql — ainda NÃO
-- existe autenticação no projeto (sem login, sem auth.uid()). Estas
-- policies liberam acesso de leitura/escrita para `anon`/`authenticated`
-- usando a MESMA anon key pública do resto do app.
--
-- campaigns: CRUD completo liberado (select/insert/update/delete) —
-- mesmo padrão de characters, necessário para criar/listar/renomear
-- mesas nesta fase de dev.
--
-- table_logs: só SELECT e INSERT liberados (sem update/delete) — o log
-- é conceitualmente append-only; isso já é mais restritivo que
-- characters por design, não por causa de autenticação.
--
-- RISCOS desta política (iguais aos já documentados para characters,
-- + os específicos de mesa compartilhada):
--   • Qualquer pessoa com a anon key pode ler/criar/editar/apagar
--     QUALQUER mesa de QUALQUER "dono" — sem isolamento por usuário.
--   • Qualquer pessoa com a anon key pode ler e inserir em table_logs
--     de QUALQUER mesa, incluindo entradas marcadas visibility='private'
--     ou 'gm' — a coluna `visibility` é só um campo de DADOS nesta
--     etapa, NÃO há filtro de RLS por visibilidade (isso depende de
--     autenticação/saber "quem" está pedindo, que não existe ainda).
--     Ou seja: NADA aqui é realmente privado ainda, apesar do nome da
--     coluna — tratar como rascunho/dev, nunca como mesa real com
--     jogadores.
--   • Sem rate limit: nada impede flood de entradas de log.
--
-- TODO (bloqueante para produção): quando houver autenticação,
--   1. adicionar coluna de "dono"/membros em campaigns (FK para tabela
--      de usuários do Supabase Auth);
--   2. trocar a policy de SELECT de table_logs para filtrar por
--      visibility (ex.: 'public' sempre visível; 'private' só para
--      character_id == personagem do usuário; 'gm' só para o dono da
--      mesa) usando auth.uid();
--   3. restringir insert/update/delete de campaigns ao dono da mesa.
-- =====================================================================

alter table campaigns enable row level security;
alter table table_logs enable row level security;

drop policy if exists campaigns_dev_anon_select on campaigns;
create policy campaigns_dev_anon_select
  on campaigns
  for select
  to anon, authenticated
  using (true);

drop policy if exists campaigns_dev_anon_insert on campaigns;
create policy campaigns_dev_anon_insert
  on campaigns
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists campaigns_dev_anon_update on campaigns;
create policy campaigns_dev_anon_update
  on campaigns
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists campaigns_dev_anon_delete on campaigns;
create policy campaigns_dev_anon_delete
  on campaigns
  for delete
  to anon, authenticated
  using (true);

drop policy if exists table_logs_dev_anon_select on table_logs;
create policy table_logs_dev_anon_select
  on table_logs
  for select
  to anon, authenticated
  using (true);

drop policy if exists table_logs_dev_anon_insert on table_logs;
create policy table_logs_dev_anon_insert
  on table_logs
  for insert
  to anon, authenticated
  with check (true);

-- Nenhuma policy de update/delete para table_logs: append-only por
-- padrão (anon/authenticated não conseguem alterar nem apagar entradas
-- já gravadas, mesmo sem auth — service_role continua podendo, se
-- precisar de uma limpeza administrativa).

commit;
