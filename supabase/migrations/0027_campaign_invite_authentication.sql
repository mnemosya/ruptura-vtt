-- =====================================================================
-- Ruptura VTT — Autenticação real de jogador via convite (Etapa 12, correção 2)
-- Migration: 0027_campaign_invite_authentication
--
-- PROBLEMA CORRIGIDO: a correção anterior (0026) criou `campaign_members`
-- mas só o dono é membro de verdade — não existia NENHUM caminho para um
-- JOGADOR virar membro real, porque `/join/[token]` é inteiramente
-- anônimo (profile_sessions, nunca Supabase Auth). Esta migration cria
-- o caminho: aceitar um convite exige uma sessão real do Supabase Auth
-- (a MESMA infraestrutura já usada pelo narrador — `signInWithPassword`/
-- `signUpDevNarrator`, `src/lib/auth/actions.ts` — reaproveitada tal
-- qual, nenhuma auth nova inventada) e cria/ativa uma linha em
-- `campaign_members` com `role='player'`.
--
-- AUDITORIA CONFIRMADA (repetida para rastreabilidade):
--   • `campaign_invites` (migration 0008) é DELIBERADAMENTE multi-uso —
--     não há `accepted_by`/`used_at`, `is_active` persiste até revogado.
--     Um único link é compartilhado pelo grupo (várias pessoas entram
--     pelo mesmo convite) — por isso "aceitar" cria uma membership POR
--     usuário que aceita, nunca invalida o token para os demais.
--   • `campaign_profiles`/`profile_sessions` continuam SEM `user_id` —
--     não têm vínculo com `auth.users`. Esta migration NÃO tenta
--     associar automaticamente um perfil/personagem existente a um
--     usuário autenticado (a instrução explicitamente proíbe associação
--     insegura "só por conhecer o ID"/"assumir que o primeiro
--     personagem pertence ao usuário") — fica documentado como
--     limitação real, não implementado.
--   • `characters`/`campaign_profiles`/`table_logs` continuam com RLS
--     aberta (fora de escopo desta correção — exigiria refactor de
--     storage, já registrado como pendente desde a migration 0013).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. campaign_members ganha os campos de proveniência do convite.
-- ---------------------------------------------------------------------
alter table campaign_members
  add column if not exists invite_id  uuid references campaign_invites(id) on delete set null,
  add column if not exists invited_by uuid references auth.users(id) on delete set null,
  add column if not exists joined_at  timestamptz;

-- ---------------------------------------------------------------------
-- 2. accept_campaign_invite(token) — RPC transacional.
--    Exige auth.uid() (usuário já logado/cadastrado via o MESMO fluxo
--    de auth do narrador). Idempotente para o MESMO usuário (reaceitar
--    um convite já aceito só reativa/retorna o vínculo existente).
-- ---------------------------------------------------------------------
create or replace function accept_campaign_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid        uuid := auth.uid();
  v_invite     campaign_invites%rowtype;
  v_token_hash text;
  v_member_id  uuid;
begin
  if v_uid is null then
    raise exception 'É necessário estar autenticado para aceitar um convite.' using errcode = 'insufficient_privilege';
  end if;

  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select * into v_invite from campaign_invites where token_hash = v_token_hash;

  if not found then
    raise exception 'Convite não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'Este convite foi revogado.' using errcode = 'insufficient_privilege';
  end if;
  if not v_invite.is_active then
    raise exception 'Este convite está inativo.' using errcode = 'insufficient_privilege';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'Este convite expirou.' using errcode = 'insufficient_privilege';
  end if;

  insert into campaign_members (campaign_id, user_id, role, status, origem, invite_id, invited_by, joined_at)
  values (v_invite.campaign_id, v_uid, 'player', 'active', 'invite_accept', v_invite.id, v_invite.created_by, now())
  on conflict (campaign_id, user_id) do update set
    status = 'active',
    invite_id = coalesce(campaign_members.invite_id, excluded.invite_id),
    joined_at = coalesce(campaign_members.joined_at, excluded.joined_at)
  returning id into v_member_id;

  return jsonb_build_object('campaignId', v_invite.campaign_id, 'memberId', v_member_id);
end;
$$;

revoke all on function accept_campaign_invite(text) from public;
grant execute on function accept_campaign_invite(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. campaign_content_references — índice determinístico de dependências
--    estruturadas de conteúdo de campanha. Recalculado a cada publicação
--    (ver função abaixo), nunca alimentado pelo client.
-- ---------------------------------------------------------------------
create table if not exists campaign_content_references (
  id                        uuid primary key default gen_random_uuid(),
  campaign_id               uuid not null references campaigns(id) on delete cascade,
  source_campaign_content_id text not null references campaign_content_documents(id) on delete cascade,
  source_content_type       content_type not null,
  source_slug               text not null,
  target_scope              text not null check (target_scope in ('official', 'campaign')),
  target_content_type       text not null,
  target_slug               text not null,
  target_official_id        text,
  target_campaign_content_id text,
  required                  boolean not null default true,
  path                      text not null,
  source_version            integer not null,
  created_at                timestamptz not null default now()
);

create index if not exists campaign_content_references_campaign_idx on campaign_content_references (campaign_id);
create index if not exists campaign_content_references_source_idx on campaign_content_references (source_campaign_content_id);
create index if not exists campaign_content_references_target_idx on campaign_content_references (campaign_id, target_scope, target_content_type, target_slug);

alter table campaign_content_references enable row level security;

-- Só quem gerencia a campanha lê o índice — jogador não precisa de
-- detalhe administrativo de dependências.
drop policy if exists campaign_content_references_manager_read on campaign_content_references;
create policy campaign_content_references_manager_read
  on campaign_content_references
  for select
  to authenticated
  using (can_manage_campaign_content(campaign_id));

-- Nenhuma policy de escrita — só a função de publicação (abaixo) escreve.

-- ---------------------------------------------------------------------
-- 4. publish_campaign_content_draft — substituída (mesmo nome, corpo
--    novo) para também recalcular campaign_content_references na MESMA
--    transação da publicação. Precisa DROP porque a assinatura ganha um
--    parâmetro novo (Postgres não permite CREATE OR REPLACE mudando a
--    lista de parâmetros sem DEFAULT compatível com a chamada existente
--    — aqui o novo parâmetro tem DEFAULT, então CREATE OR REPLACE basta).
-- ---------------------------------------------------------------------
-- Postgres identifica função por (nome + tipos de parâmetro) — adicionar
-- um parâmetro muda a assinatura e CREATE OR REPLACE criaria uma
-- SOBRECARGA nova, deixando a função de 7 parâmetros órfã (ainda
-- chamável). DROP explícito da assinatura antiga evita isso.
drop function if exists publish_campaign_content_draft(uuid, integer, jsonb, jsonb, jsonb, text, jsonb);

create or replace function publish_campaign_content_draft(
  p_draft_id              uuid,
  p_expected_draft_version integer,
  p_final_payload         jsonb,
  p_metadata_efeitos      jsonb,
  p_official_snapshot     jsonb,
  p_summary               text,
  p_impact                jsonb,
  p_referencias           jsonb default '[]'::jsonb -- array de {targetScope, targetContentType, targetSlug, targetOfficialId, targetCampaignContentId, required, path}
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
  v_ref          jsonb;
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

  -- Recalcula o índice de referências: remove entradas antigas deste
  -- documento (de qualquer versão anterior) e insere as da versão atual
  -- — nunca acumula lixo de versões antigas, sempre reflete o publicado.
  delete from campaign_content_references where source_campaign_content_id = v_doc_id;
  for v_ref in select * from jsonb_array_elements(p_referencias)
  loop
    insert into campaign_content_references (
      campaign_id, source_campaign_content_id, source_content_type, source_slug,
      target_scope, target_content_type, target_slug, target_official_id, target_campaign_content_id,
      required, path, source_version
    ) values (
      v_draft.campaign_id, v_doc_id, v_draft.content_type, v_draft.slug,
      v_ref->>'targetScope', v_ref->>'targetContentType', v_ref->>'targetSlug',
      nullif(v_ref->>'targetOfficialId', ''), nullif(v_ref->>'targetCampaignContentId', ''),
      coalesce((v_ref->>'required')::boolean, true), v_ref->>'path', v_local_version
    );
  end loop;

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

revoke all on function publish_campaign_content_draft(uuid, integer, jsonb, jsonb, jsonb, text, jsonb, jsonb) from public;
grant execute on function publish_campaign_content_draft(uuid, integer, jsonb, jsonb, jsonb, text, jsonb, jsonb) to authenticated;

commit;
