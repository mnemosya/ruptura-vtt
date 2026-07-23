-- =====================================================================
-- Ruptura VTT — Conteúdo de mesa e homebrew (Etapa 12)
-- Migration: 0025_campaign_content_homebrew
--
-- Auditoria (docs/CHECKPOINT_ETAPA12_CONTEUDO_MESA_HOMEBREW.md):
--   • Não existe NENHUM conceito de conteúdo de campanha/homebrew/
--     override/fork em código ou banco antes desta migration — grep
--     completo por campaign_content, homebrew, override, fork,
--     "biblioteca da mesa" não encontrou nada.
--   • `content_documents`/`content_drafts`/`content_editor_metadata`/
--     `content_changelog` (Etapas 1-11) continuam globais e admin-only
--     — NÃO reaproveitados para gravar conteúdo de campanha (evitaria
--     colidir com a constraint unique(content_type,slug) e misturaria
--     autoridade global com autoridade de mesa). Tabelas NOVAS e
--     ISOLADAS, mesmo princípio já usado na Etapa 11 para não reaproveitar
--     `content_packs` como contrato de pacote.
--   • `campaigns.owner_id` (migration 0006) + RLS owner-scoped
--     (migrations 0006/0013) é a ÚNICA autoridade real de "narrador"
--     hoje — não existe tabela de papéis/membros de campanha. Esta
--     migration reaproveita exatamente essa autoridade (nenhum papel
--     novo inventado) via a função `is_campaign_owner()` abaixo.
--   • IMPORTANTE — limitação herdada, não introduzida aqui: `characters`
--     continua com RLS `characters_dev_transition_*` (anon+authenticated,
--     USING(true)) desde sempre (ver nota F da migration 0013) porque
--     não existe autenticação real de jogador nem client autenticado em
--     character/storage.ts. Ou seja, NENHUM dado hoje ligado ao fluxo de
--     jogador (personagem, campaign_profiles, table_logs) tem isolamento
--     por identidade real de jogador — o "segredo" que protege uma mesa
--     de estranhos é sempre o conhecimento do `campaign_id` (mesmo
--     modelo do link de convite, migration 0008). A leitura de conteúdo
--     PUBLICADO de campanha abaixo segue exatamente esse MESMO modelo já
--     existente (anon/authenticated, sem checagem de membership real) —
--     não é uma regressão de segurança desta etapa, é o piso de segurança
--     já vigente para todo dado de jogador no projeto. Corrigir isso de
--     verdade exige autenticação real de jogador (fora de escopo desta
--     etapa — documentado no checkpoint).
--   • Escrita (rascunho/publicação/remoção/arquivamento) É restrita de
--     verdade: toda mutação exige `is_campaign_owner()` (auth.uid() =
--     campaigns.owner_id), reforçado por RLS + por checagem redundante
--     dentro de cada função SECURITY DEFINER — mesmo padrão de dupla
--     camada das Etapas 3/5/11.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. is_campaign_owner(campaign_id, uid) — autoridade de "narrador desta
--    campanha". Reaproveita campaigns.owner_id (0006) — nenhum papel novo.
-- ---------------------------------------------------------------------
create or replace function is_campaign_owner(p_campaign_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from campaigns where id = p_campaign_id and owner_id = check_user_id
  );
$$;

revoke all on function is_campaign_owner(uuid, uuid) from public;
grant execute on function is_campaign_owner(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 1. campaign_content_documents — conteúdo EFETIVO publicado da
--    campanha (homebrew independente OU override de um oficial).
--    Nunca é o mesmo registro do oficial (content_documents) — só
--    referencia por `official_document_id` quando aplicável.
-- ---------------------------------------------------------------------
create table if not exists campaign_content_documents (
  id                    text primary key, -- '<campaign_id>:<content_type>:<slug>'
  campaign_id           uuid not null references campaigns(id) on delete cascade,
  content_type          content_type not null,
  slug                  text not null,
  nome                  text,

  origin_type           text not null check (origin_type in ('homebrew', 'override')),

  -- Só preenchido quando origin_type = 'override' (ou quando a origem
  -- foi uma cópia homebrew a partir de um oficial — proveniência, nunca
  -- vínculo de substituição nesse segundo caso).
  official_document_id  text references content_documents(id) on delete set null,
  official_version_base text,
  official_hash_base    text,
  -- snapshot do payload oficial NO MOMENTO em que o override foi criado
  -- ou rebaseado — necessário para a comparação de três vias (base vs.
  -- oficial atual vs. campanha atual) mesmo se o oficial mudar depois.
  official_snapshot     jsonb,

  payload               jsonb not null,
  payload_hash          text not null,

  status                text not null default 'published' check (status in ('published', 'archived')),
  local_version         integer not null default 1,
  schema_version        text,

  created_by            uuid references auth.users(id) on delete set null,
  published_by          uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  published_at          timestamptz,
  archived_at           timestamptz,
  archive_reason        text,

  constraint campaign_content_documents_unique unique (campaign_id, content_type, slug),
  -- override precisa apontar para um oficial; homebrew não precisa.
  constraint campaign_content_documents_override_has_base
    check (origin_type <> 'override' or official_document_id is not null)
);

create index if not exists campaign_content_documents_campaign_idx on campaign_content_documents (campaign_id);
create index if not exists campaign_content_documents_type_slug_idx on campaign_content_documents (content_type, slug);
create index if not exists campaign_content_documents_official_idx on campaign_content_documents (official_document_id);
create index if not exists campaign_content_documents_status_idx on campaign_content_documents (campaign_id, status);

drop trigger if exists campaign_content_documents_set_updated_at on campaign_content_documents;
create trigger campaign_content_documents_set_updated_at
  before update on campaign_content_documents
  for each row execute function set_updated_at();

alter table campaign_content_documents enable row level security;

-- Leitura de conteúdo PUBLICADO: mesmo modelo de confiança já vigente
-- para characters/campaign_profiles/table_logs (anon/authenticated,
-- sem checagem de membership real — ver nota no cabeçalho). Conteúdo
-- ARQUIVADO só é legível pelo narrador dono (histórico/instâncias).
drop policy if exists campaign_content_documents_public_read on campaign_content_documents;
create policy campaign_content_documents_public_read
  on campaign_content_documents
  for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists campaign_content_documents_owner_read_all on campaign_content_documents;
create policy campaign_content_documents_owner_read_all
  on campaign_content_documents
  for select
  to authenticated
  using (is_campaign_owner(campaign_id));

-- Nenhuma policy de insert/update/delete para ninguém — toda escrita
-- passa pelas funções SECURITY DEFINER abaixo (mesmo princípio da
-- Etapa 11: "nenhuma policy de escrita genérica").

-- ---------------------------------------------------------------------
-- 2. campaign_content_drafts — rascunhos de conteúdo de campanha.
--    Espelha content_drafts (0021), mas com campaign_id e tipo de
--    operação explícito.
-- ---------------------------------------------------------------------
create table if not exists campaign_content_drafts (
  id                       uuid primary key default gen_random_uuid(),
  campaign_id              uuid not null references campaigns(id) on delete cascade,
  content_type             content_type not null,
  slug                     text not null,

  operation                text not null check (operation in (
    'novo_homebrew', 'copia_homebrew', 'novo_override',
    'edicao_homebrew', 'edicao_override', 'resolucao_atualizacao'
  )),

  base_campaign_document_id text references campaign_content_documents(id) on delete set null,
  base_official_document_id text references content_documents(id) on delete set null,
  base_payload_hash          text,
  base_official_version      text,

  payload                  jsonb not null,

  created_by               uuid references auth.users(id) on delete set null,
  updated_by               uuid references auth.users(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  version                  integer not null default 1,

  constraint campaign_content_drafts_unique unique (campaign_id, content_type, slug)
);

create index if not exists campaign_content_drafts_campaign_idx on campaign_content_drafts (campaign_id);

drop trigger if exists campaign_content_drafts_set_updated_at on campaign_content_drafts;
create trigger campaign_content_drafts_set_updated_at
  before update on campaign_content_drafts
  for each row execute function set_updated_at();

-- Reaproveita a MESMA função genérica de bump de versão da 0021 (não
-- referencia nenhuma tabela específica no corpo).
drop trigger if exists campaign_content_drafts_bump_version_trigger on campaign_content_drafts;
create trigger campaign_content_drafts_bump_version_trigger
  before update on campaign_content_drafts
  for each row execute function content_drafts_bump_version();

alter table campaign_content_drafts enable row level security;

-- Rascunho NUNCA visível a jogadores — só o narrador dono da campanha.
drop policy if exists campaign_content_drafts_owner_all on campaign_content_drafts;
create policy campaign_content_drafts_owner_all
  on campaign_content_drafts
  for all
  to authenticated
  using (is_campaign_owner(campaign_id))
  with check (is_campaign_owner(campaign_id));

-- ---------------------------------------------------------------------
-- 3. campaign_content_editor_metadata — metadata editorial COMPLETA da
--    campanha, separada do payload público (mesmo princípio da 0023:
--    nunca `_editor` no payload consumido pelo runtime).
-- ---------------------------------------------------------------------
create table if not exists campaign_content_editor_metadata (
  id                          uuid primary key default gen_random_uuid(),
  campaign_content_document_id text not null references campaign_content_documents(id) on delete cascade,
  local_version               integer not null,
  efeitos                     jsonb not null,
  created_at                  timestamptz not null default now(),

  constraint campaign_content_editor_metadata_unique unique (campaign_content_document_id, local_version)
);

create index if not exists campaign_content_editor_metadata_doc_idx on campaign_content_editor_metadata (campaign_content_document_id);

alter table campaign_content_editor_metadata enable row level security;

-- Só o narrador dono da campanha correspondente — nunca exposta a
-- jogadores nem a rota pública (mesmo critério de content_editor_metadata).
drop policy if exists campaign_content_editor_metadata_owner_read on campaign_content_editor_metadata;
create policy campaign_content_editor_metadata_owner_read
  on campaign_content_editor_metadata
  for select
  to authenticated
  using (
    exists (
      select 1 from campaign_content_documents ccd
      where ccd.id = campaign_content_document_id and is_campaign_owner(ccd.campaign_id)
    )
  );

-- ---------------------------------------------------------------------
-- 4. campaign_content_changelog — histórico de operações de conteúdo
--    da campanha. Separado de content_changelog (oficial) de propósito
--    — misturar permitiria vazamento de escopo entre mesa e catálogo
--    oficial, ou confundiria auditoria de qual autoridade fez o quê.
-- ---------------------------------------------------------------------
create table if not exists campaign_content_changelog (
  id                     uuid primary key default gen_random_uuid(),
  campaign_id            uuid not null references campaigns(id) on delete cascade,
  content_type           content_type not null,
  slug                   text not null,
  operation              text not null,
  local_version          integer,
  official_version_base  text,
  official_version_atual text,
  payload_before         jsonb,
  payload_after          jsonb,
  created_by             uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  summary                text,
  impact                 jsonb,
  decision               jsonb
);

create index if not exists campaign_content_changelog_campaign_idx on campaign_content_changelog (campaign_id, content_type, slug);

alter table campaign_content_changelog enable row level security;

drop policy if exists campaign_content_changelog_owner_read on campaign_content_changelog;
create policy campaign_content_changelog_owner_read
  on campaign_content_changelog
  for select
  to authenticated
  using (is_campaign_owner(campaign_id));

-- ---------------------------------------------------------------------
-- 5. publish_campaign_content_draft — publica um rascunho de campanha
--    (homebrew ou override) como campaign_content_documents. Transação
--    única: valida narrador, versão otimista, upsert do documento
--    efetivo, metadata editorial, changelog, consumo do rascunho — tudo
--    ou nada. NUNCA toca content_documents/content_drafts oficiais.
-- ---------------------------------------------------------------------
create or replace function publish_campaign_content_draft(
  p_draft_id              uuid,
  p_expected_draft_version integer,
  p_final_payload         jsonb,   -- payload público final (já serializado pela camada TS)
  p_metadata_efeitos      jsonb,   -- metadata editorial completa (nullable)
  p_official_snapshot     jsonb,   -- snapshot do oficial no momento da publicação (override), nullable
  p_summary               text,
  p_impact                jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid          uuid := auth.uid();
  v_draft        campaign_content_drafts%rowtype;
  v_doc_id       text;
  v_existing     campaign_content_documents%rowtype;
  v_is_new       boolean;
  v_local_version integer;
  v_hash         text;
  v_now          timestamptz := now();
  v_origin_type  text;
begin
  select * into v_draft from campaign_content_drafts where id = p_draft_id for update;
  if not found then
    raise exception 'Rascunho de campanha não encontrado ou já publicado.' using errcode = 'no_data_found';
  end if;

  if not is_campaign_owner(v_draft.campaign_id, v_uid) then
    raise exception 'Sem acesso de narrador a esta campanha.' using errcode = 'insufficient_privilege';
  end if;

  if v_draft.version <> p_expected_draft_version then
    raise exception 'Rascunho alterado desde que foi carregado (versão % ≠ %). Recarregue antes de publicar.',
      v_draft.version, p_expected_draft_version using errcode = 'serialization_failure';
  end if;

  v_doc_id := v_draft.campaign_id::text || ':' || v_draft.content_type || ':' || v_draft.slug;
  v_origin_type := case
    when v_draft.operation in ('novo_override', 'edicao_override', 'resolucao_atualizacao') then 'override'
    else 'homebrew'
  end;

  select * into v_existing from campaign_content_documents where id = v_doc_id for update;
  v_is_new := not found;

  if not v_is_new then
    -- edição: a base do rascunho precisa bater com o efetivo atual da campanha.
    if v_draft.base_payload_hash is null or v_draft.base_payload_hash <> v_existing.payload_hash then
      raise exception 'O conteúdo efetivo da campanha mudou desde que este rascunho foi criado. Recarregue antes de publicar.'
        using errcode = 'serialization_failure';
    end if;
  end if;

  v_local_version := case when v_is_new then 1 else v_existing.local_version + 1 end;
  v_hash := encode(extensions.digest(p_final_payload::text, 'sha256'), 'hex');

  insert into campaign_content_documents (
    id, campaign_id, content_type, slug, nome, origin_type,
    official_document_id, official_version_base, official_hash_base, official_snapshot,
    payload, payload_hash, status, local_version, schema_version,
    created_by, published_by, published_at
  ) values (
    v_doc_id, v_draft.campaign_id, v_draft.content_type, v_draft.slug, p_final_payload->>'nome', v_origin_type,
    v_draft.base_official_document_id, v_draft.base_official_version,
    case when v_is_new then null else v_existing.official_hash_base end,
    coalesce(p_official_snapshot, case when v_is_new then null else v_existing.official_snapshot end),
    p_final_payload, v_hash, 'published', v_local_version, p_final_payload->>'schema_version',
    v_uid, v_uid, v_now
  )
  on conflict (id) do update set
    nome = excluded.nome,
    payload = excluded.payload,
    payload_hash = excluded.payload_hash,
    status = 'published',
    local_version = excluded.local_version,
    official_document_id = coalesce(excluded.official_document_id, campaign_content_documents.official_document_id),
    official_version_base = coalesce(excluded.official_version_base, campaign_content_documents.official_version_base),
    official_snapshot = coalesce(excluded.official_snapshot, campaign_content_documents.official_snapshot),
    published_by = excluded.published_by,
    published_at = excluded.published_at,
    archived_at = null,
    archive_reason = null;

  if p_metadata_efeitos is not null then
    insert into campaign_content_editor_metadata (campaign_content_document_id, local_version, efeitos)
    values (v_doc_id, v_local_version, p_metadata_efeitos);
  end if;

  insert into campaign_content_changelog (
    campaign_id, content_type, slug, operation, local_version,
    official_version_base, official_version_atual, payload_before, payload_after,
    created_by, summary, impact
  ) values (
    v_draft.campaign_id, v_draft.content_type, v_draft.slug, v_draft.operation, v_local_version,
    v_draft.base_official_version, v_draft.base_official_version,
    case when v_is_new then null else v_existing.payload end, p_final_payload,
    v_uid, p_summary, p_impact
  );

  delete from campaign_content_drafts where id = p_draft_id;

  return jsonb_build_object('campaignContentDocumentId', v_doc_id, 'localVersion', v_local_version);
end;
$$;

revoke all on function publish_campaign_content_draft(uuid, integer, jsonb, jsonb, jsonb, text, jsonb) from public;
grant execute on function publish_campaign_content_draft(uuid, integer, jsonb, jsonb, jsonb, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 6. remove_campaign_content_override — remove um override e restaura
--    o fallback para o oficial (a resolução efetiva volta a ler
--    content_documents diretamente, já que a linha some/arquiva aqui).
--    Nunca apaga histórico; nunca toca instâncias.
-- ---------------------------------------------------------------------
create or replace function remove_campaign_content_override(
  p_campaign_content_document_id text,
  p_expected_local_version       integer,
  p_reason                       text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid  uuid := auth.uid();
  v_doc  campaign_content_documents%rowtype;
begin
  select * into v_doc from campaign_content_documents where id = p_campaign_content_document_id for update;
  if not found then
    raise exception 'Conteúdo de campanha não encontrado.' using errcode = 'no_data_found';
  end if;
  if not is_campaign_owner(v_doc.campaign_id, v_uid) then
    raise exception 'Sem acesso de narrador a esta campanha.' using errcode = 'insufficient_privilege';
  end if;
  if v_doc.origin_type <> 'override' then
    raise exception 'Este conteúdo não é um override — use arquivamento de homebrew.' using errcode = 'wrong_object_type';
  end if;
  if v_doc.local_version <> p_expected_local_version then
    raise exception 'Este override foi alterado desde que a tela foi carregada. Recarregue antes de remover.'
      using errcode = 'serialization_failure';
  end if;
  if v_doc.official_document_id is null or not exists (select 1 from content_documents where id = v_doc.official_document_id) then
    raise exception 'Não há conteúdo oficial disponível para restaurar — remoção bloqueada (o oficial está ausente ou arquivado).'
      using errcode = 'no_data_found';
  end if;

  update campaign_content_documents
  set status = 'archived', archived_at = now(), archive_reason = p_reason
  where id = p_campaign_content_document_id;

  insert into campaign_content_changelog (
    campaign_id, content_type, slug, operation, local_version,
    official_version_base, payload_before, payload_after, created_by, summary
  ) values (
    v_doc.campaign_id, v_doc.content_type, v_doc.slug, 'restauracao_oficial', v_doc.local_version,
    v_doc.official_version_base, v_doc.payload, null, v_uid, p_reason
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function remove_campaign_content_override(text, integer, text) from public;
grant execute on function remove_campaign_content_override(text, integer, text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. archive_campaign_homebrew — arquiva homebrew independente (sem
--    fallback oficial). Não apaga a linha nem o histórico — instâncias
--    históricas continuam podendo ler o modelo arquivado se necessário.
-- ---------------------------------------------------------------------
create or replace function archive_campaign_homebrew(
  p_campaign_content_document_id text,
  p_expected_local_version       integer,
  p_reason                       text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_doc campaign_content_documents%rowtype;
begin
  select * into v_doc from campaign_content_documents where id = p_campaign_content_document_id for update;
  if not found then
    raise exception 'Conteúdo de campanha não encontrado.' using errcode = 'no_data_found';
  end if;
  if not is_campaign_owner(v_doc.campaign_id, v_uid) then
    raise exception 'Sem acesso de narrador a esta campanha.' using errcode = 'insufficient_privilege';
  end if;
  if v_doc.origin_type <> 'homebrew' then
    raise exception 'Este conteúdo é um override — use remoção de override.' using errcode = 'wrong_object_type';
  end if;
  if v_doc.local_version <> p_expected_local_version then
    raise exception 'Este homebrew foi alterado desde que a tela foi carregada. Recarregue antes de arquivar.'
      using errcode = 'serialization_failure';
  end if;

  update campaign_content_documents
  set status = 'archived', archived_at = now(), archive_reason = p_reason
  where id = p_campaign_content_document_id;

  insert into campaign_content_changelog (
    campaign_id, content_type, slug, operation, local_version,
    payload_before, payload_after, created_by, summary
  ) values (
    v_doc.campaign_id, v_doc.content_type, v_doc.slug, 'arquivamento', v_doc.local_version,
    v_doc.payload, null, v_uid, p_reason
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function archive_campaign_homebrew(text, integer, text) from public;
grant execute on function archive_campaign_homebrew(text, integer, text) to authenticated;

commit;
