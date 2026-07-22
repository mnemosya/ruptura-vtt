-- =====================================================================
-- Ruptura VTT — Importação/exportação de pacotes + vínculos editoriais
-- com a Biblioteca do Livro (Etapa 11)
-- Migration: 0024_import_export_book_links
--
-- Auditoria (docs/CHECKPOINT_ETAPA11_IMPORTACAO_EXPORTACAO_BIBLIOTECA_LIVRO.md):
--   • `content_packs` já existe, mas é um registro de LINHAGEM (qual
--     pipeline produziu um content_document), não um contrato de
--     pacote de importação/exportação — não reaproveitado como tal,
--     só respeitado como FK (`admin-editor`, mesmo pacote usado pela
--     publicação comum).
--   • Não existe NENHUM sistema de capítulo/livro em código — só
--     markdown de origem em docs/fontes/ (explicitamente "não deve ser
--     consumido em runtime"). Por isso `content_book_links` guarda
--     capítulo/seção/âncora como TEXTO LIVRE (citação estruturada),
--     nunca uma referência a uma tabela de capítulos que não existe.
--
-- PRINCÍPIOS DE SEGURANÇA (mesmo padrão da 0022/0023):
--   • Nenhuma policy de escrita genérica — toda mutação passa por
--     função SECURITY DEFINER que checa is_content_admin() no servidor.
--   • Importação NUNCA publica — só insere em content_drafts (que já
--     tem RLS admin-only desde a 0021).
--   • content_book_links tem leitura pública (é só uma citação
--     estrutural, não expõe metadata editorial) mas escrita admin-only.
--   • Esta migration não altera RLS de personagens, campanhas ou mesa,
--     não cria content_type novo, não cria tabela de homebrew/override.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Histórico de importação — uma linha por pacote importado
--    (confirmado ou não). Nunca guarda o arquivo inteiro; só o
--    suficiente para auditoria (resumo dos documentos, decisões,
--    conflitos, avisos, ids dos rascunhos criados).
-- ---------------------------------------------------------------------
create table if not exists content_import_sessions (
  id                 uuid primary key default gen_random_uuid(),
  nome_arquivo       text not null,
  hash_pacote        text not null,
  versao_formato     integer not null,
  status             text not null default 'previa' check (status in ('previa', 'confirmada', 'cancelada')),
  resumo_documentos  jsonb not null default '[]'::jsonb,
  decisoes           jsonb not null default '{}'::jsonb,
  conflitos          jsonb not null default '[]'::jsonb,
  avisos             jsonb not null default '[]'::jsonb,
  rascunhos_criados  jsonb not null default '[]'::jsonb,
  manifest           jsonb not null,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  confirmada_em      timestamptz
);

create index if not exists content_import_sessions_hash_idx on content_import_sessions (hash_pacote);
create index if not exists content_import_sessions_status_idx on content_import_sessions (status);

alter table content_import_sessions enable row level security;

drop policy if exists content_import_sessions_admin_all on content_import_sessions;
create policy content_import_sessions_admin_all
  on content_import_sessions
  for all
  to authenticated
  using (is_content_admin(auth.uid()))
  with check (is_content_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 2. Vínculos editoriais — entidade da Biblioteca ↔ trecho do livro.
--    `capitulo`/`secao`/`ancora` são TEXTO LIVRE (citação estruturada,
--    não FK) — não existe tabela de capítulos real para referenciar.
-- ---------------------------------------------------------------------
create table if not exists content_book_links (
  id             uuid primary key default gen_random_uuid(),
  document_id    text not null references content_documents(id) on delete cascade,
  capitulo       text not null,
  secao          text,
  ancora         text,
  rotulo         text,
  tipo_vinculo   text not null default 'origem_editorial'
                   check (tipo_vinculo in ('origem_editorial', 'regra_principal', 'referencia', 'exemplo', 'conteudo_relacionado')),
  principal      boolean not null default false,
  url_externa    text,
  ordem          integer not null default 0,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists content_book_links_document_idx on content_book_links (document_id);

-- No máximo 1 vínculo PRINCIPAL por documento (índice único parcial).
create unique index if not exists content_book_links_one_principal_per_doc
  on content_book_links (document_id)
  where principal;

alter table content_book_links enable row level security;

-- Leitura pública: é só uma citação estrutural (capítulo/seção/âncora),
-- nunca metadata editorial administrativa — mesmo critério de
-- content_documents publicado.
drop policy if exists content_book_links_public_read on content_book_links;
create policy content_book_links_public_read
  on content_book_links
  for select
  to anon, authenticated
  using (true);

drop policy if exists content_book_links_admin_write on content_book_links;
create policy content_book_links_admin_write
  on content_book_links
  for all
  to authenticated
  using (is_content_admin(auth.uid()))
  with check (is_content_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 3. Função transacional: cria N rascunhos de importação + 1 sessão de
--    importação confirmada, tudo em UMA transação (a função é o limite
--    — qualquer erro no meio desfaz TUDO, nenhum rascunho fica órfão).
--    Nunca publica, nunca toca content_documents.
-- ---------------------------------------------------------------------
create or replace function import_content_drafts(
  p_documentos       jsonb,  -- array de {content_type, slug, payload (DraftEnvelope)}
  p_nome_arquivo     text,
  p_hash_pacote      text,
  p_versao_formato   integer,
  p_resumo_documentos jsonb,
  p_decisoes         jsonb,
  p_conflitos        jsonb,
  p_avisos           jsonb,
  p_manifest         jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid          uuid := auth.uid();
  v_doc          jsonb;
  v_draft_id     uuid;
  v_draft_ids    jsonb := '[]'::jsonb;
  v_session_id   uuid;
  v_content_type content_type;
  v_slug         text;
begin
  if not is_content_admin(v_uid) then
    raise exception 'Sem acesso administrativo à Biblioteca.' using errcode = 'insufficient_privilege';
  end if;

  -- Cada documento vira NO MÁXIMO 1 rascunho — nunca sobrescreve um
  -- rascunho existente silenciosamente (unique constraint em
  -- content_drafts(content_type, slug) já garante isso; capturamos o
  -- erro com uma mensagem específica em vez de deixar o Postgres
  -- abortar com um erro genérico de constraint).
  for v_doc in select * from jsonb_array_elements(p_documentos)
  loop
    v_content_type := (v_doc->>'content_type')::content_type;
    v_slug := v_doc->>'slug';

    if exists (select 1 from content_drafts where content_type = v_content_type and slug = v_slug) then
      raise exception 'Já existe um rascunho para %:% — resolva o conflito antes de confirmar a importação.', v_content_type, v_slug
        using errcode = 'unique_violation';
    end if;

    insert into content_drafts (content_type, slug, base_document_id, base_payload_hash, duplicated_from, payload, created_by, updated_by)
    values (
      v_content_type,
      v_slug,
      nullif(v_doc->>'base_document_id', ''),
      nullif(v_doc->>'base_payload_hash', ''),
      nullif(v_doc->>'duplicated_from', ''),
      v_doc->'payload',
      v_uid,
      v_uid
    )
    returning id into v_draft_id;

    v_draft_ids := v_draft_ids || to_jsonb(v_draft_id::text);
  end loop;

  insert into content_import_sessions (
    nome_arquivo, hash_pacote, versao_formato, status,
    resumo_documentos, decisoes, conflitos, avisos, rascunhos_criados,
    manifest, created_by, confirmada_em
  ) values (
    p_nome_arquivo, p_hash_pacote, p_versao_formato, 'confirmada',
    p_resumo_documentos, p_decisoes, p_conflitos, p_avisos, v_draft_ids,
    p_manifest, v_uid, now()
  )
  returning id into v_session_id;

  return jsonb_build_object('sessionId', v_session_id, 'draftIds', v_draft_ids);
end;
$$;

revoke all on function import_content_drafts(jsonb, text, text, integer, jsonb, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function import_content_drafts(jsonb, text, text, integer, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;

commit;
