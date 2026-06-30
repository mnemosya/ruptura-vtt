-- =====================================================================
-- Ruptura VTT — Personagens (ficha mínima)
-- Migration: 0002_characters
--
-- Tabela de PERSISTÊNCIA DE PERSONAGEM, separada da Biblioteca do
-- Sistema (content_packs/content_documents, migration 0001). Esta
-- migration NÃO toca em nenhuma tabela da Biblioteca do Sistema.
--
-- Escopo desta etapa: só a ficha mínima (nome, atributos, perícias,
-- recursos atuais se existirem, metadados simples). Inventário, magia
-- e combate ficam para depois — não há colunas nem policies para isso
-- aqui.
-- =====================================================================

begin;

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- characters
--
-- payload guarda o personagem inteiro como JSONB (mesmo princípio
-- JSONB-first da migration 0001): { nome, atributos, pericias,
-- recursos_atuais?, metadados? }. As colunas escalares (name,
-- owner_label, status) são apenas projeções para filtro/listagem —
-- a fonte de verdade do conteúdo do personagem é o payload.
--
-- status (texto livre, default 'draft') é um campo simples de ciclo de
-- vida do personagem (ex.: 'draft', 'active', 'archived'). Não há
-- enum porque o ciclo de vida de personagem ainda não está definido.
--
-- owner_label é texto livre opcional (ex.: nome do jogador) — NÃO é um
-- vínculo de autenticação. Não há FK para usuário porque ainda não
-- existe tabela de usuários/auth no projeto.
-- ---------------------------------------------------------------------
create table if not exists characters (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_label text,
  status      text not null default 'draft',
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists characters_status_idx
  on characters (status);

create index if not exists characters_updated_at_idx
  on characters (updated_at desc);

-- updated_at automático (reusa a função set_updated_at criada em
-- 0001_content_library.sql — já existe no banco quando esta migration
-- roda, pois 0001 roda antes).
drop trigger if exists characters_set_updated_at on characters;
create trigger characters_set_updated_at
  before update on characters
  for each row execute function set_updated_at();

-- =====================================================================
-- RLS (Row Level Security) — POLÍTICA TEMPORÁRIA DE DESENVOLVIMENTO
--
-- ATENÇÃO: ainda NÃO existe autenticação no projeto (sem login, sem
-- tabela de usuários, sem `auth.uid()` utilizável). Por isso, esta
-- policy libera CRUD completo (select/insert/update/delete) para a
-- role `anon` — a MESMA anon key usada pela leitura pública da
-- Biblioteca do Sistema (SUPABASE_ANON_KEY em .env.local) também
-- consegue escrever em `characters`.
--
-- Isso é INTENCIONAL apenas para destravar o desenvolvimento da ficha
-- mínima localmente (ambiente de dev, sem usuários reais, sem dados
-- sensíveis). NÃO é uma política adequada para produção:
--   • Qualquer pessoa com a anon key (que é pública, embutida no
--     bundle do frontend) pode ler, criar, editar e apagar QUALQUER
--     personagem de QUALQUER "dono".
--   • Não há isolamento por usuário/campanha.
--
-- TODO (bloqueante para produção): quando houver autenticação,
-- substituir as policies abaixo por regras que restrinjam
-- insert/update/delete (e idealmente select) a `auth.uid()` dono do
-- personagem, ex.:
--   using (owner_id = auth.uid())
-- o que exige adicionar uma coluna owner_id (uuid, FK para a tabela de
-- usuários do Supabase Auth) — não existe ainda, daí owner_label ser
-- só um texto livre por enquanto.
-- =====================================================================

alter table characters enable row level security;

drop policy if exists characters_dev_anon_select on characters;
create policy characters_dev_anon_select
  on characters
  for select
  to anon, authenticated
  using (true);

drop policy if exists characters_dev_anon_insert on characters;
create policy characters_dev_anon_insert
  on characters
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists characters_dev_anon_update on characters;
create policy characters_dev_anon_update
  on characters
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists characters_dev_anon_delete on characters;
create policy characters_dev_anon_delete
  on characters
  for delete
  to anon, authenticated
  using (true);

commit;
