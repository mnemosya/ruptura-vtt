-- =====================================================================
-- Ruptura VTT — Publicação, versões e changelog (Etapa 5)
-- Migration: 0022_content_publishing
--
-- Fecha o ciclo editorial administrativo: valida rascunho → publica →
-- cria/atualiza content_documents → incrementa versão → registra
-- histórico → arquiva. Detalhes em
-- docs/CHECKPOINT_ETAPA5_PUBLICACAO_VERSIONAMENTO.md.
--
-- PRINCÍPIOS DE SEGURANÇA (auditoria Etapa 0/§9):
--   • NENHUMA policy de escrita genérica é aberta em content_documents —
--     continua sem INSERT/UPDATE/DELETE para anon/authenticated. Toda
--     mutação passa por FUNÇÕES SECURITY DEFINER que checam
--     is_content_admin() no servidor, dentro de UMA transação (a função
--     é o limite transacional). O client nunca decide versão, status,
--     hash ou autor — a função computa tudo.
--   • A leitura pública (anon) continua exatamente como antes: só
--     status='published'. Arquivar (status='archived') some do jogo por
--     construção — todas as queries de consumo já filtram 'published'.
--   • content_changelog ganha uma policy de LEITURA só para admin (nunca
--     para anon) — o histórico administrativo não é público.
--
-- Esta migration NÃO altera RLS de personagens, campanhas ou mesa, não
-- cria content types novos e não decompõe singletons.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. pgcrypto — necessário para digest()/sha256 do payload_hash.
--    (Idempotente; provavelmente já presente pelo pipeline de seed.)
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Pacote de origem para conteúdo autorado no editor administrativo.
--    content_documents.source_pack_id é NOT NULL + FK — conteúdo novo
--    criado pela pessoa administradora precisa de um pacote de lineage
--    próprio, distinto do 'ruptura-core' importado.
-- ---------------------------------------------------------------------
insert into content_packs (id, name, version, status, manifest)
values ('admin-editor', 'Editor Universal (autoria administrativa)', '1.0.0', 'active', '{}'::jsonb)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. Colunas de publicação/arquivamento em content_documents.
--    version (semver text) já existe. Adicionamos autoria/datas/vínculo.
-- ---------------------------------------------------------------------
alter table content_documents
  add column if not exists published_at    timestamptz,
  add column if not exists published_by     uuid references auth.users(id) on delete set null,
  add column if not exists source_draft_id  uuid,
  add column if not exists archived_at      timestamptz,
  add column if not exists archived_by      uuid references auth.users(id) on delete set null,
  add column if not exists archive_reason   text;

-- Filtro rápido por status no admin (published/archived).
create index if not exists content_documents_status_idx on content_documents (status);

-- ---------------------------------------------------------------------
-- 3. content_changelog — estender para histórico versionado real.
--    Já tem: document_id, content_type, change_type(created/updated/
--    deleted), payload_before, payload_after, created_at. Falta:
--    versões, autor, resumo, caminhos alterados, impacto, rascunho de
--    origem e hashes. Reutilizamos a tabela (não criamos outra) — ela
--    passa a suportar listar/abrir/comparar versões.
-- ---------------------------------------------------------------------
alter table content_changelog
  add column if not exists version_before      text,
  add column if not exists version_after       text,
  add column if not exists summary             text,
  add column if not exists author_user_id      uuid references auth.users(id) on delete set null,
  add column if not exists author_email        text,
  add column if not exists changed_paths       jsonb,
  add column if not exists impact              jsonb,
  add column if not exists source_draft_id     uuid,
  add column if not exists payload_hash_before text,
  add column if not exists payload_hash_after  text;

-- 'archived' passa a ser um change_type válido (além de created/updated/deleted).
alter table content_changelog drop constraint if exists content_changelog_change_type_check;
alter table content_changelog
  add constraint content_changelog_change_type_check
  check (change_type = any (array['created','updated','deleted','archived']));

create index if not exists content_changelog_document_created_idx
  on content_changelog (document_id, created_at desc);

-- ---------------------------------------------------------------------
-- 4. Policies de LEITURA administrativa.
--    (a) content_documents: admin lê QUALQUER status (inclusive
--        'archived'), mantendo a policy pública 'published' para anon.
--    (b) content_changelog: admin lê o histórico; ninguém mais.
--    Escrita segue sem policy — só via SECURITY DEFINER abaixo.
-- ---------------------------------------------------------------------
drop policy if exists content_documents_admin_read on content_documents;
create policy content_documents_admin_read
  on content_documents
  for select
  to authenticated
  using (is_content_admin());

drop policy if exists content_changelog_admin_read on content_changelog;
create policy content_changelog_admin_read
  on content_changelog
  for select
  to authenticated
  using (is_content_admin());

-- ---------------------------------------------------------------------
-- 5. content_next_patch_version — regra de versão previsível do MVP.
--    'a.b.c' → 'a.b.(c+1)'. Versão ausente/ inválida é ERRO bloqueante,
--    nunca adivinhação silenciosa. Conteúdo novo começa em '1.0.0'
--    (decidido por quem chama, não aqui).
-- ---------------------------------------------------------------------
create or replace function content_next_patch_version(current_version text)
returns text
language plpgsql
immutable
as $$
declare
  parts text[];
  major int;
  minor int;
  patch int;
begin
  if current_version is null or current_version !~ '^[0-9]+\.[0-9]+\.[0-9]+$' then
    raise exception 'Versão publicada inválida ou ausente: %. Esperado semver a.b.c.', current_version
      using errcode = 'check_violation';
  end if;
  parts := string_to_array(current_version, '.');
  major := parts[1]::int;
  minor := parts[2]::int;
  patch := parts[3]::int;
  return major || '.' || minor || '.' || (patch + 1);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. publish_content_draft — publicação transacional.
--
-- Recebe o CORPO legado já serializado pelo servidor (TS não confiável
-- para versão/status/hash — a função sobrescreve esses três). Faz TUDO
-- numa transação; qualquer raise reverte por completo:
--   1. valida admin;
--   2. trava e carrega o rascunho (FOR UPDATE) — versão otimista;
--   3. resolve novo/edição pela existência do documento publicado;
--   4. edição: confere hash da base contra o publicado atual (conflito
--      = base desatualizada → bloqueia, sem merge);
--   5. novo: garante que não há (type,slug) publicado colidindo;
--   6. computa a versão (SQL é a única fonte de verdade da versão);
--   7. injeta id/slug/status/versao/timestamps no payload;
--   8. calcula payload_hash (sha256 determinístico);
--   9. upsert em content_documents;
--  10. registra content_changelog (antes/depois, autor, resumo, etc.);
--  11. consome o rascunho (delete — só há um ativo por type/slug);
--  12. retorna metadados só depois de tudo aplicado.
-- ---------------------------------------------------------------------
create or replace function publish_content_draft(
  p_draft_id             uuid,
  p_expected_draft_version integer,
  p_body                 jsonb,     -- corpo legado serializado (sem status/versao/hash confiáveis)
  p_summary              text,
  p_changed_paths        jsonb,
  p_impact               jsonb,
  p_author_email         text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid           uuid := auth.uid();
  v_draft         content_drafts%rowtype;
  v_doc_id        text;
  v_existing      content_documents%rowtype;
  v_is_new        boolean;
  v_new_version   text;
  v_prev_version  text;
  v_prev_hash     text;
  v_prev_payload  jsonb;
  v_final_payload jsonb;
  v_new_hash      text;
  v_now           timestamptz := now();
begin
  -- 1. admin ---------------------------------------------------------
  if not is_content_admin(v_uid) then
    raise exception 'Sem acesso administrativo à Biblioteca.' using errcode = 'insufficient_privilege';
  end if;

  -- 2. rascunho travado + versão otimista ----------------------------
  select * into v_draft from content_drafts where id = p_draft_id for update;
  if not found then
    raise exception 'Rascunho não encontrado ou já publicado/consumido.' using errcode = 'no_data_found';
  end if;
  if v_draft.version <> p_expected_draft_version then
    raise exception 'Rascunho alterado desde que foi carregado (versão % ≠ %). Recarregue antes de publicar.',
      v_draft.version, p_expected_draft_version using errcode = 'serialization_failure';
  end if;

  v_doc_id := v_draft.content_type || ':' || v_draft.slug;

  -- 3/4/5. novo vs edição + conflito de base -------------------------
  select * into v_existing from content_documents where id = v_doc_id;
  v_is_new := not found;

  if v_is_new then
    -- Segurança extra: outro caminho pode ter criado (type,slug) publicado.
    if exists (select 1 from content_documents where content_type = v_draft.content_type and slug = v_draft.slug) then
      raise exception 'Já existe conteúdo publicado com esse tipo e slug.' using errcode = 'unique_violation';
    end if;
    v_new_version  := '1.0.0';
    v_prev_version := null;
    v_prev_hash    := null;
    v_prev_payload := null;
  else
    -- Edição: a base do rascunho precisa bater com o publicado atual.
    if v_draft.base_payload_hash is null or v_draft.base_payload_hash <> v_existing.payload_hash then
      raise exception 'O conteúdo publicado mudou desde que este rascunho foi criado. Crie um novo rascunho de edição para publicar sobre a versão atual.'
        using errcode = 'serialization_failure';
    end if;
    v_new_version  := content_next_patch_version(v_existing.version);
    v_prev_version := v_existing.version;
    v_prev_hash    := v_existing.payload_hash;
    v_prev_payload := v_existing.payload;
  end if;

  -- 6/7. autoridade de versão/status/identidade no próprio payload ----
  v_final_payload := p_body
    || jsonb_build_object(
         'id', v_draft.slug,
         'slug', v_draft.slug,
         'status', 'published',
         'versao', v_new_version,
         'updated_at', to_char(v_now, 'YYYY-MM-DD')
       );
  if v_is_new then
    v_final_payload := v_final_payload || jsonb_build_object('created_at', to_char(v_now, 'YYYY-MM-DD'));
  elsif v_prev_payload ? 'created_at' then
    v_final_payload := v_final_payload || jsonb_build_object('created_at', v_prev_payload->>'created_at');
  end if;

  -- 8. hash determinístico -------------------------------------------
  --    digest() vive no schema `extensions` (pgcrypto no Supabase) — o
  --    search_path restrito da função não o inclui, então qualificamos.
  v_new_hash := encode(extensions.digest(v_final_payload::text, 'sha256'), 'hex');

  -- 9. upsert em content_documents -----------------------------------
  if v_is_new then
    insert into content_documents (
      id, content_type, slug, nome, categoria, subtipo, status, version,
      source_pack_id, source_pack_version, payload, payload_hash,
      published_at, published_by, source_draft_id, created_at, updated_at
    ) values (
      v_doc_id, v_draft.content_type, v_draft.slug,
      v_final_payload->>'nome', v_final_payload->>'categoria', v_final_payload->>'subtipo',
      'published', v_new_version,
      'admin-editor', null, v_final_payload, v_new_hash,
      v_now, v_uid, v_draft.id, v_now, v_now
    );
  else
    update content_documents set
      nome            = v_final_payload->>'nome',
      categoria       = v_final_payload->>'categoria',
      subtipo         = v_final_payload->>'subtipo',
      status          = 'published',
      version         = v_new_version,
      payload         = v_final_payload,
      payload_hash    = v_new_hash,
      published_at    = v_now,
      published_by    = v_uid,
      source_draft_id = v_draft.id,
      archived_at     = null,
      archived_by     = null,
      archive_reason  = null,
      updated_at      = v_now
    where id = v_doc_id;
  end if;

  -- 10. changelog ----------------------------------------------------
  insert into content_changelog (
    document_id, content_type, change_type, pack_id,
    payload_before, payload_after, version_before, version_after,
    summary, author_user_id, author_email, changed_paths, impact,
    source_draft_id, payload_hash_before, payload_hash_after
  ) values (
    v_doc_id, v_draft.content_type, case when v_is_new then 'created' else 'updated' end, 'admin-editor',
    v_prev_payload, v_final_payload, v_prev_version, v_new_version,
    p_summary, v_uid, p_author_email, p_changed_paths, p_impact,
    v_draft.id, v_prev_hash, v_new_hash
  );

  -- 11. consome o rascunho (só há um ativo por type/slug) ------------
  delete from content_drafts where id = v_draft.id;

  -- 12. resultado ----------------------------------------------------
  return jsonb_build_object(
    'ok', true,
    'documentId', v_doc_id,
    'isNew', v_is_new,
    'versionBefore', v_prev_version,
    'versionAfter', v_new_version,
    'payloadHashAfter', v_new_hash
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 7. archive_content_document — arquivamento transacional.
--    Muda status para 'archived' (some do jogo por construção), registra
--    no changelog e preserva tudo (não apaga instâncias, rascunhos nem
--    versões). Motivo obrigatório. Só admin.
-- ---------------------------------------------------------------------
create or replace function archive_content_document(
  p_document_id text,
  p_reason      text,
  p_author_email text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid      uuid := auth.uid();
  v_doc      content_documents%rowtype;
  v_now      timestamptz := now();
  v_payload  jsonb;
begin
  if not is_content_admin(v_uid) then
    raise exception 'Sem acesso administrativo à Biblioteca.' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Motivo do arquivamento é obrigatório.' using errcode = 'check_violation';
  end if;

  select * into v_doc from content_documents where id = p_document_id for update;
  if not found then
    raise exception 'Documento não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_doc.status = 'archived' then
    raise exception 'Este conteúdo já está arquivado.' using errcode = 'check_violation';
  end if;

  v_payload := v_doc.payload || jsonb_build_object('status', 'archived');

  update content_documents set
    status         = 'archived',
    payload        = v_payload,
    archived_at    = v_now,
    archived_by    = v_uid,
    archive_reason = p_reason,
    updated_at     = v_now
  where id = p_document_id;

  insert into content_changelog (
    document_id, content_type, change_type, pack_id,
    payload_before, payload_after, version_before, version_after,
    summary, author_user_id, author_email, source_draft_id
  ) values (
    p_document_id, v_doc.content_type, 'archived', v_doc.source_pack_id,
    v_doc.payload, v_payload, v_doc.version, v_doc.version,
    p_reason, v_uid, p_author_email, null
  );

  return jsonb_build_object('ok', true, 'documentId', p_document_id, 'status', 'archived');
end;
$$;

commit;
