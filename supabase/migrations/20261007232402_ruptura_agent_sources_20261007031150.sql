-- Corpus técnico read-only do RUPTURA Agent. Independente do Compêndio.
-- A migration apenas cria a tabela; não executa o crawler nem toca o Notion.
begin;

create table if not exists public.ruptura_agent_sources (
  id uuid primary key default gen_random_uuid(),
  notion_id text not null unique,
  source_type text not null check (source_type in ('page', 'database', 'data_source', 'database_row')),
  role text not null check (role in ('book', 'patch_notes', 'editorial_guide', 'design_guide', 'working_reference', 'reference', 'historical_version')),
  title text not null,
  path text[] not null,
  root_section text,
  parent_notion_id text,
  data_source_notion_id text,
  notion_last_edited_at timestamptz,
  content_hash text not null,
  structure_hash text not null,
  snapshot_hash text not null,
  plain_text text not null default '',
  properties jsonb not null default '{}'::jsonb,
  structure jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  constraint ruptura_agent_sources_hashes_ck check (
    content_hash ~ '^[0-9a-f]{64}$' and structure_hash ~ '^[0-9a-f]{64}$' and snapshot_hash ~ '^[0-9a-f]{64}$'
  )
);

create index if not exists ruptura_agent_sources_active_role_idx
  on public.ruptura_agent_sources (role, source_type) where active;
create index if not exists ruptura_agent_sources_parent_idx
  on public.ruptura_agent_sources (parent_notion_id);
create index if not exists ruptura_agent_sources_data_source_idx
  on public.ruptura_agent_sources (data_source_notion_id);

alter table public.ruptura_agent_sources enable row level security;
-- O corpus bruto é privado nesta fase. Apenas o worker com service_role o lê/escreve.
revoke all on table public.ruptura_agent_sources from public, anon, authenticated;
grant select, insert, update on table public.ruptura_agent_sources to service_role;

comment on table public.ruptura_agent_sources is
  'Snapshot normalizado do Notion para o RUPTURA Agent; independente de content_documents.';

commit;
