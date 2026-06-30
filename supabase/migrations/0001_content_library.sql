-- =====================================================================
-- Ruptura VTT — Biblioteca do Sistema (Content Library)
-- Migration: 0001_content_library
-- Arquitetura: JSONB-first
--
-- Princípio: o conteúdo canônico do pacote ruptura-core vive em
-- content_documents.payload (JSONB). NÃO normalizamos as mecânicas em
-- tabelas separadas. As colunas escalares (slug, nome, categoria,
-- subtipo, status, version, ...) são apenas projeções extraídas do
-- payload para permitir indexação, filtro e upsert. A fonte de verdade
-- continua sendo o payload.
-- =====================================================================

-- =====================================================================
-- POLÍTICA DE VERSÃO (decisão explícita para este MVP)
--
-- Opção escolhida: A — "última versão vence".
--
--   • content_documents é uma tabela de ESTADO ATUAL, não um histórico.
--   • A chave natural do documento é (content_type, slug). Existe NO
--     MÁXIMO um registro vivo por (content_type, slug) a qualquer
--     momento, independente de quantas versões do pacote já passaram
--     por aqui.
--   • Reimportar uma nova versão do pacote (source_pack_version maior)
--     SOBRESCREVE o documento existente via upsert por id
--     ('<content_type>:<slug>'). O conteúdo antigo não fica acessível
--     por query — só por meio do histórico em content_changelog
--     (que guarda o payload anterior e o novo a cada mudança real).
--   • Isso é adequado para uma biblioteca de sistema (regras/conteúdo
--     base do jogo), onde só faz sentido jogar com a versão vigente do
--     pacote — análogo a atualizar uma dependência: a versão antiga
--     não convive em produção com a nova.
--
-- Por que não Opção B (múltiplas versões coexistindo)?
--   B exigiria unique(content_type, slug, source_pack_version), um id
--   que incorporasse a versão (ex. '<content_type>:<slug>@<version>')
--   e o validador filtrando por source_pack_version mais recente antes
--   de contar. Isso é mais correto para campanhas em andamento que
--   precisam congelar numa versão antiga do conteúdo, mas é overhead
--   real (toda query de leitura passa a precisar resolver "qual versão
--   vale aqui") sem necessidade comprovada neste estágio do projeto.
--
-- MIGRANDO PARA B NO FUTURO, SE NECESSÁRIO:
--   1. drop constraint content_documents_type_slug_unique;
--      add constraint ... unique (content_type, slug, source_pack_version);
--   2. Trocar a PK/id para incluir a versão, ex.:
--      '<content_type>:<slug>@<source_pack_version>', OU adotar uma PK
--      surrogate (uuid) com unique(content_type, slug, source_pack_version)
--      separado, e passar a referenciar documentos por esse uuid.
--   3. Ajustar scripts/seed-content.ts: o id deixa de ser puramente
--      content_type:slug e passa a incluir a versão.
--   4. Ajustar scripts/validate-content-import.ts: contagens mínimas
--      passam a ser "por source_pack_version", não globais — senão
--      duas versões do mesmo conteúdo inflam a contagem.
--   5. Decidir como o motor/app resolve "versão ativa" (ex.: coluna
--      is_active em content_packs, ou campanha referenciando uma
--      versão de pack específica).
-- =====================================================================

begin;

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Enum de tipos de conteúdo suportados pela biblioteca.
-- Espelha exatamente os content_types definidos no pacote ruptura-core.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'content_type') then
    create type content_type as enum (
      'master_table',
      'character_rule',
      'combat_field',
      'combat_flow',
      'combat_action',
      'condition',
      'property',
      'item',
      'rune',
      'escalpo',
      'talent',
      'spell'
    );
  end if;
end$$;

-- ---------------------------------------------------------------------
-- content_packs
-- Um registro por pacote de conteúdo (ex.: ruptura-core). Guarda o
-- manifesto inteiro em manifest (JSONB) e os metadados de topo.
--
-- Sob a Opção A, esta tabela também é "estado atual": um upsert por id
-- de pacote atualiza version/manifest para refletir a última versão
-- importada. O histórico de versões do pacote, se um dia for preciso,
-- pode ser reconstruído a partir de content_changelog.pack_version.
-- ---------------------------------------------------------------------
create table if not exists content_packs (
  id           text primary key,            -- ex.: 'ruptura-core' (manifest.package.id)
  name         text not null,
  version      text not null,               -- manifest.package.version, ex.: '0.1.0'
  status       text not null default 'draft',
  content_hash text,                         -- manifest.package.content_hash_sha256
  manifest     jsonb not null,              -- manifesto completo
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- content_documents
-- Um registro por documento de conteúdo (cada ação, condição, item,
-- magia, etc., e cada singleton). payload guarda o registro completo.
--
-- id segue o formato "<content_type>:<slug>" (ex.: 'spell:cinetica_controle').
--
-- payload_hash é um sha256 do payload serializado, usado pelo seed para
-- decidir se uma mudança real ocorreu (ver política de changelog
-- abaixo) sem precisar comparar o JSONB inteiro a cada execução.
-- ---------------------------------------------------------------------
create table if not exists content_documents (
  id                  text primary key,            -- '<content_type>:<slug>'
  content_type        content_type not null,
  slug                text not null,
  nome                text,
  categoria           text,
  subtipo             text,
  status              text not null default 'published',
  version             text,
  source_pack_id      text not null references content_packs(id) on delete cascade,
  source_pack_version text,
  payload             jsonb not null,              -- registro canônico completo
  payload_hash        text not null,               -- sha256(payload) — detecta mudança real
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Opção A: chave natural é (content_type, slug); só existe um
  -- documento "vivo" por slug, sempre da versão de pacote mais recente
  -- importada. Ver nota de política de versão no topo do arquivo.
  constraint content_documents_type_slug_unique unique (content_type, slug)
);

-- Índices de leitura/filtro mais comuns na biblioteca.
create index if not exists content_documents_content_type_idx
  on content_documents (content_type);

create index if not exists content_documents_categoria_idx
  on content_documents (content_type, categoria);

create index if not exists content_documents_subtipo_idx
  on content_documents (content_type, subtipo);

create index if not exists content_documents_status_idx
  on content_documents (status);

create index if not exists content_documents_source_pack_idx
  on content_documents (source_pack_id);

-- Índice GIN no payload para consultas dentro do JSONB (tags, estatísticas, etc.).
create index if not exists content_documents_payload_gin_idx
  on content_documents using gin (payload jsonb_path_ops);

-- ---------------------------------------------------------------------
-- content_changelog
-- Trilha de auditoria de mudanças em content_documents.
--
-- Política de changelog (decisão explícita):
--   • 'created'  — o document_id não existia antes deste seed.
--   • 'updated'  — o document_id já existia E o payload mudou
--                  (payload_hash novo != payload_hash anterior).
--   • Nenhuma entrada é gravada quando o payload é idêntico ao já
--     armazenado (reimportar o mesmo pacote sem mudanças não gera
--     ruído no changelog).
--   • payload_before / payload_after guardam o estado anterior e novo
--     do payload apenas quando há uma mudança real, permitindo diff
--     posterior sem depender de uma tabela de versões completa.
-- ---------------------------------------------------------------------
create table if not exists content_changelog (
  id              uuid primary key default gen_random_uuid(),
  document_id     text not null,                       -- referencia content_documents.id
  content_type    content_type not null,
  change_type     text not null check (change_type in ('created', 'updated', 'deleted')),
  pack_id         text,
  pack_version    text,
  payload_before  jsonb,                                -- null quando change_type = 'created'
  payload_after   jsonb,                                -- null quando change_type = 'deleted'
  created_at      timestamptz not null default now()
);

create index if not exists content_changelog_document_idx
  on content_changelog (document_id);

create index if not exists content_changelog_created_at_idx
  on content_changelog (created_at desc);

-- ---------------------------------------------------------------------
-- updated_at automático.
-- ---------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists content_packs_set_updated_at on content_packs;
create trigger content_packs_set_updated_at
  before update on content_packs
  for each row execute function set_updated_at();

drop trigger if exists content_documents_set_updated_at on content_documents;
create trigger content_documents_set_updated_at
  before update on content_documents
  for each row execute function set_updated_at();

-- =====================================================================
-- RLS (Row Level Security)
--
-- Política pretendida para a Biblioteca do Sistema:
--   • Leitura pública: qualquer usuário (anon ou authenticated) pode
--     LER apenas documentos com status = 'published'. Documentos em
--     rascunho/depreciados não devem ser visíveis fora do service role.
--   • Escrita: somente service role (usado pelo seed/scripts de
--     importação) pode INSERT/UPDATE/DELETE. Nenhum usuário comum
--     escreve na biblioteca de sistema diretamente.
--
-- Deixamos habilitado e com policies já criadas (não apenas
-- comentado), pois isso é seguro por padrão: sem policy de escrita
-- para anon/authenticated, essas roles simplesmente não conseguem
-- escrever — e a policy de leitura abaixo é explícita e restrita a
-- status='published'.
--
-- Caso o projeto ainda não tenha as roles padrão do Supabase
-- (anon/authenticated) configuradas, estas linhas continuam válidas:
-- são as roles padrão de qualquer projeto Supabase.
-- =====================================================================

alter table content_packs enable row level security;
alter table content_documents enable row level security;
alter table content_changelog enable row level security;

-- --- content_packs: leitura pública liberada (metadados do pacote,
-- não é conteúdo sensível); escrita só por service role.
drop policy if exists content_packs_public_read on content_packs;
create policy content_packs_public_read
  on content_packs
  for select
  to anon, authenticated
  using (true);

-- Nenhuma policy de insert/update/delete é criada para anon/authenticated:
-- por padrão, com RLS habilitado e sem policy correspondente, essas
-- roles não conseguem escrever. service_role ignora RLS (Supabase).

-- --- content_documents: leitura pública só de documentos publicados.
drop policy if exists content_documents_public_read on content_documents;
create policy content_documents_public_read
  on content_documents
  for select
  to anon, authenticated
  using (status = 'published');

-- Nenhuma policy de escrita para anon/authenticated (mesma lógica acima).

-- --- content_changelog: trilha de auditoria; não é exposta publicamente.
-- Sem policy de select para anon/authenticated => não visível a eles.
-- Apenas service_role (que ignora RLS) lê/escreve o changelog.

commit;
