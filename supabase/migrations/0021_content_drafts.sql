-- =====================================================================
-- Ruptura VTT — Rascunhos do Editor Universal (Etapa 3)
-- Migration: 0021_content_drafts
--
-- DECISÃO DE ARQUITETURA (documentada em detalhe em
-- docs/CHECKPOINT_ETAPA3_EDITOR_CAMPOS_BASICOS.md): rascunhos vivem em
-- uma TABELA SEPARADA (`content_drafts`), não em `content_documents`.
--
-- Por quê não estender content_documents com status='draft'?
--   • content_documents tem unique(content_type, slug) — um rascunho de
--     EDIÇÃO de conteúdo publicado precisa necessariamente do MESMO
--     slug do publicado (é o que o vincula), o que colidiria com essa
--     constraint se vivesse na mesma tabela.
--   • Toda query pública hoje já filtra status='published' — mas
--     misturar rascunho e publicado na mesma tabela aumenta o risco de
--     um bug futuro (um índice esquecido, uma migration futura) expor
--     rascunho incompleto a jogadores. Isolar fisicamente em outra
--     tabela é uma garantia estrutural mais forte que uma cláusula WHERE.
--   • content_documents é hoje "estado atual" de um pacote importado
--     (ver nota de política de versão em 0001_content_library.sql) — não
--     foi desenhado para edição incremental por humanos, e misturar os
--     dois conceitos complicaria o pipeline de seed existente.
--
-- Esta migration NÃO altera content_documents/content_packs/
-- content_changelog nem suas policies. Nenhuma linha publicada é
-- tocada por rascunhos — o vínculo é só uma referência (`base_document_id`).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- content_drafts
-- Um registro por rascunho em edição. `payload` guarda o ENVELOPE DE
-- RASCUNHO (ver src/lib/contentSchema/draftTypes.ts::DraftEnvelope) —
-- não o formato legado de content_documents.payload. O envelope separa
-- os campos editáveis (o que o formulário edita) do payload original
-- preservado (efeitos, estatisticas, campos bespoke, tudo que ainda não
-- é editável nesta etapa) — nunca perde dado ao salvar.
-- ---------------------------------------------------------------------
create table if not exists content_drafts (
  id                  uuid primary key default gen_random_uuid(),
  content_type        content_type not null,
  slug                text not null,

  -- Vínculo com o conteúdo publicado de origem, quando o rascunho nasceu
  -- de "Criar rascunho de edição" (null para conteúdo novo ou duplicado).
  base_document_id    text references content_documents(id) on delete set null,
  -- payload_hash do content_documents no momento em que o rascunho foi
  -- criado/rebaseado — usado só para AVISAR se o publicado mudou desde
  -- então (nunca bloqueia, nunca faz merge automático).
  base_payload_hash   text,
  -- Metadado informativo de "duplicado de", quando aplicável (não usado
  -- para nenhuma validação — é só lineage para exibição).
  duplicated_from     text,

  payload             jsonb not null,

  created_by          uuid references auth.users(id) on delete set null,
  updated_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Controle de edição concorrente (optimistic locking): o client envia
  -- a `version` que carregou; o UPDATE só aplica se ainda bater.
  version             integer not null default 1,

  -- Chave natural igual à de content_documents (content_type, slug) —
  -- mas em TABELA SEPARADA, então não colide com a linha publicada.
  -- Garante também que só existe UM rascunho ativo por (tipo, slug) —
  -- "criar rascunho de edição" reabre o existente em vez de duplicar.
  constraint content_drafts_type_slug_unique unique (content_type, slug)
);

create index if not exists content_drafts_content_type_idx on content_drafts (content_type);
create index if not exists content_drafts_base_document_idx on content_drafts (base_document_id);

-- updated_at automático (reusa a função já criada em 0001_content_library.sql).
drop trigger if exists content_drafts_set_updated_at on content_drafts;
create trigger content_drafts_set_updated_at
  before update on content_drafts
  for each row execute function set_updated_at();

-- version incrementada a cada UPDATE — base do controle de concorrência.
create or replace function content_drafts_bump_version()
returns trigger
language plpgsql
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

drop trigger if exists content_drafts_bump_version_trigger on content_drafts;
create trigger content_drafts_bump_version_trigger
  before update on content_drafts
  for each row execute function content_drafts_bump_version();

-- ---------------------------------------------------------------------
-- RLS — só administradores (is_content_admin(), criada em
-- 0020_content_admin_roles.sql) podem ler OU escrever rascunhos.
-- Nenhuma policy para `anon` em nenhuma operação. `authenticated` sem
-- is_content_admin() também não passa — a policy usa `is_content_admin()`
-- tanto em USING (leitura/update/delete) quanto em WITH CHECK (insert/update).
-- ---------------------------------------------------------------------
alter table content_drafts enable row level security;

drop policy if exists content_drafts_admin_all on content_drafts;
create policy content_drafts_admin_all
  on content_drafts
  for all
  to authenticated
  using (is_content_admin())
  with check (is_content_admin());

commit;
