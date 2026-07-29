-- =====================================================================
-- Ruptura VTT — desacopla character_creation_drafts de campaign_profiles
-- Migration: 0053_character_creation_drafts_decouple_profile
--
-- Passo 2 (continuação) da ordem interna segura. character_creation_drafts
-- tinha profile_id NOT NULL com FK para campaign_profiles — dependência
-- descoberta durante a auditoria de dependências que a tabela precisava
-- ser adaptada ANTES de campaign_profiles poder ser removida (§13.7,
-- passo 5). Como a tabela está vazia em desenvolvimento (0 linhas),
-- a troca de chave é feita sem migração de dados.
--
-- Nova chave de unicidade: (campaign_id, owner_id) — um rascunho de
-- criação em andamento por campanha por conta (era por campanha por
-- perfil). owner_id já existia (default auth.uid()), sempre foi a
-- conta que está criando.
--
-- Achado incidental durante a reescrita: a policy antiga
-- character_creation_drafts_owner_all tinha uma tautologia
-- (`p.campaign_id = p.campaign_id`, sempre verdadeira) no lugar do que
-- deveria ser `p.campaign_id = character_creation_drafts.campaign_id` —
-- não é uma das quatro lacunas revisadas pelo usuário, mas a nova
-- policy (baseada em is_campaign_member, sem esse join) corrige o
-- problema como efeito colateral da própria reestruturação.
-- =====================================================================

begin;

drop policy if exists character_creation_drafts_owner_all on character_creation_drafts;

alter table character_creation_drafts
  drop constraint if exists character_creation_drafts_profile_id_fkey;

drop index if exists character_creation_drafts_campaign_profile_unique;

alter table character_creation_drafts
  drop column if exists profile_id;

create unique index if not exists character_creation_drafts_campaign_owner_unique
  on character_creation_drafts (campaign_id, owner_id);

create policy character_creation_drafts_owner_all on character_creation_drafts
  for all to authenticated
  using (owner_id = (select auth.uid()) and is_campaign_member(campaign_id))
  with check (owner_id = (select auth.uid()) and is_campaign_member(campaign_id));

drop function if exists save_character_creation_draft(uuid, uuid, text, jsonb, integer);

create or replace function save_character_creation_draft(
  p_campaign_id uuid,
  p_creation_request_id text,
  p_payload jsonb,
  p_expected_revision integer
) returns table(revision integer)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_current character_creation_drafts%rowtype;
begin
  if v_uid is null then
    raise exception 'É necessário estar autenticado.' using errcode = 'insufficient_privilege';
  end if;

  if not is_campaign_member(p_campaign_id, v_uid) then
    raise exception 'Você não é participante ativo desta campanha.' using errcode = 'insufficient_privilege';
  end if;

  -- Fecha a corrida "autosave atrasado recria o draft depois da
  -- conclusão": se ESTE creation_request_id já produziu um personagem
  -- (owner_id = v_uid nesta campanha), a gravação é rejeitada em vez de
  -- ressuscitar um rascunho obsoleto. Diferente da versão anterior
  -- (que bloqueava por QUALQUER personagem do perfil na campanha), esta
  -- checagem é por creation_request_id específico — não impede a conta
  -- de iniciar um segundo personagem via um novo wizard na mesma
  -- campanha, alinhado ao modelo N:N de character_controllers.
  if exists (
    select 1 from characters c
    where c.campaign_id = p_campaign_id
      and c.owner_id = v_uid
      and c.payload->'metadados'->>'creationRequestId' = p_creation_request_id
  ) then
    raise exception 'Este personagem já foi criado — rascunho não pode ser salvo.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_current from character_creation_drafts
    where campaign_id = p_campaign_id and owner_id = v_uid
    for update;

  if not found then
    begin
      insert into character_creation_drafts (campaign_id, owner_id, creation_request_id, payload, revision, updated_at)
      values (p_campaign_id, v_uid, p_creation_request_id, p_payload, 1, now());
    exception
      when unique_violation then
        raise exception 'revision_conflict' using errcode = 'P0001';
    end;
    return query select 1;
    return;
  end if;

  if p_expected_revision is distinct from v_current.revision then
    raise exception 'revision_conflict' using errcode = 'P0001';
  end if;

  update character_creation_drafts
    set payload = p_payload,
        creation_request_id = p_creation_request_id,
        revision = v_current.revision + 1,
        updated_at = now()
    where campaign_id = p_campaign_id and owner_id = v_uid;

  return query select v_current.revision + 1;
end;
$$;
revoke all on function save_character_creation_draft(uuid, text, jsonb, integer) from public;
revoke all on function save_character_creation_draft(uuid, text, jsonb, integer) from anon;
grant execute on function save_character_creation_draft(uuid, text, jsonb, integer) to authenticated;

commit;
