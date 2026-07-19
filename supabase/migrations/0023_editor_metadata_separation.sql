-- =====================================================================
-- Ruptura VTT — Correção: separar metadados do editor do payload público
-- Migration: 0023_editor_metadata_separation
--
-- RISCO CORRIGIDO (auditoria pós-Etapa 5, ver
-- docs/CHECKPOINT_CORRECAO_METADATA_EDITOR_PUBLICACAO.md): a Etapa 5
-- embutia um blob `_editor` (o `EfeitoEditavel` completo) dentro de cada
-- efeito publicado em `content_documents.payload.payload_automacao.
-- efeitos[]`. Os schemas oficiais de magia e talento têm
-- `additionalProperties: false` nos objetos de efeito — `_editor`
-- tornava o conteúdo publicado por essa via INVÁLIDO contra o próprio
-- contrato oficial (equipamentos tem `additionalProperties: true` no
-- efeito, mas `_editor` continua sendo metadado administrativo que não
-- pertence à regra publicada, então também é removido de lá).
--
-- Esta migration cria uma tabela ADMINISTRATIVA separada para guardar o
-- `EfeitoEditavel[]` completo (ou, para talento, por nível) de cada
-- publicação — nunca no payload público, só legível por admin.
-- =====================================================================

begin;

create table if not exists content_editor_metadata (
  id                uuid primary key default gen_random_uuid(),
  document_id       text not null references content_documents(id) on delete cascade,
  version           text not null,
  changelog_id      uuid references content_changelog(id) on delete set null,
  source_draft_id   uuid,
  -- Estrutura: para spell/item, um array de EfeitoEditavel. Para
  -- talento, um array de { nivel, efeitos: EfeitoEditavel[] } — um por
  -- nível, preservando a árvore de 3 níveis num único documento.
  efeitos           jsonb not null,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),

  -- Uma linha por versão publicada de um documento — permite abrir
  -- histórico (join por document_id) e recuperar a metadata "atual"
  -- (a linha cuja version bate com content_documents.version).
  constraint content_editor_metadata_document_version_unique unique (document_id, version)
);

create index if not exists content_editor_metadata_document_idx on content_editor_metadata (document_id, created_at desc);

alter table content_editor_metadata enable row level security;

-- Só admin lê. Nenhuma policy de escrita — grava-se exclusivamente
-- dentro da transação do RPC `publish_content_draft` (SECURITY DEFINER,
-- que ignora RLS por ser dono da tabela), nunca por um client autenticado
-- comum. Não é necessária para o funcionamento normal do jogo.
drop policy if exists content_editor_metadata_admin_read on content_editor_metadata;
create policy content_editor_metadata_admin_read
  on content_editor_metadata
  for select
  to authenticated
  using (is_content_admin());

-- ---------------------------------------------------------------------
-- publish_content_draft — nova versão: recebe também `p_efeitos_editaveis`
-- (a metadata editorial completa, nunca embutida no payload público) e
-- grava em content_editor_metadata na MESMA transação, vinculada ao
-- changelog recém-criado. Para talento, também sincroniza status/versao/
-- updated_at em CADA nível (o schema exige esses campos por nível —
-- ficavam desatualizados quando só o topo do documento era atualizado).
-- ---------------------------------------------------------------------
create or replace function publish_content_draft(
  p_draft_id               uuid,
  p_expected_draft_version integer,
  p_body                   jsonb,
  p_summary                text,
  p_changed_paths          jsonb,
  p_impact                 jsonb,
  p_author_email           text,
  p_efeitos_editaveis      jsonb default '[]'::jsonb
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
  v_changelog_id  uuid;
  v_niveis        jsonb;
  v_nivel         jsonb;
  v_niveis_saida  jsonb;
  i               int;
begin
  if not is_content_admin(v_uid) then
    raise exception 'Sem acesso administrativo à Biblioteca.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_draft from content_drafts where id = p_draft_id for update;
  if not found then
    raise exception 'Rascunho não encontrado ou já publicado/consumido.' using errcode = 'no_data_found';
  end if;
  if v_draft.version <> p_expected_draft_version then
    raise exception 'Rascunho alterado desde que foi carregado (versão % <> %). Recarregue antes de publicar.',
      v_draft.version, p_expected_draft_version using errcode = 'serialization_failure';
  end if;

  v_doc_id := v_draft.content_type || ':' || v_draft.slug;

  select * into v_existing from content_documents where id = v_doc_id;
  v_is_new := not found;

  if v_is_new then
    if exists (select 1 from content_documents where content_type = v_draft.content_type and slug = v_draft.slug) then
      raise exception 'Já existe conteúdo publicado com esse tipo e slug.' using errcode = 'unique_violation';
    end if;
    v_new_version  := '1.0.0';
    v_prev_version := null;
    v_prev_hash    := null;
    v_prev_payload := null;
  else
    if v_draft.base_payload_hash is null or v_draft.base_payload_hash <> v_existing.payload_hash then
      raise exception 'O conteúdo publicado mudou desde que este rascunho foi criado. Crie um novo rascunho de edição para publicar sobre a versão atual.'
        using errcode = 'serialization_failure';
    end if;
    v_new_version  := content_next_patch_version(v_existing.version);
    v_prev_version := v_existing.version;
    v_prev_hash    := v_existing.payload_hash;
    v_prev_payload := v_existing.payload;
  end if;

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

  -- Talento: o schema exige status/versao/updated_at (e created_at)
  -- também DENTRO de cada nível — sincroniza com o topo do documento.
  if v_draft.content_type = 'talent' and v_final_payload ? 'niveis' then
    v_niveis := v_final_payload->'niveis';
    v_niveis_saida := '[]'::jsonb;
    for i in 0 .. jsonb_array_length(v_niveis) - 1 loop
      v_nivel := (v_niveis->i) || jsonb_build_object('status', 'published', 'versao', v_new_version, 'updated_at', to_char(v_now, 'YYYY-MM-DD'));
      if v_is_new or not (v_nivel ? 'created_at') then
        v_nivel := v_nivel || jsonb_build_object('created_at', to_char(v_now, 'YYYY-MM-DD'));
      end if;
      v_niveis_saida := v_niveis_saida || jsonb_build_array(v_nivel);
    end loop;
    v_final_payload := v_final_payload || jsonb_build_object('niveis', v_niveis_saida);
  end if;

  v_new_hash := encode(extensions.digest(v_final_payload::text, 'sha256'), 'hex');

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
  )
  returning id into v_changelog_id;

  -- Metadata editorial completa — NUNCA no payload público. Uma linha
  -- por (documento, versão); vínculo estável com changelog e rascunho.
  insert into content_editor_metadata (document_id, version, changelog_id, source_draft_id, efeitos, created_by)
  values (v_doc_id, v_new_version, v_changelog_id, v_draft.id, p_efeitos_editaveis, v_uid)
  on conflict (document_id, version) do update set
    changelog_id = excluded.changelog_id,
    source_draft_id = excluded.source_draft_id,
    efeitos = excluded.efeitos,
    created_by = excluded.created_by,
    created_at = now();

  delete from content_drafts where id = v_draft.id;

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

commit;
