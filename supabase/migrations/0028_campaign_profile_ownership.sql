-- =====================================================================
-- Ruptura VTT — Vínculo autenticado usuário↔perfil↔personagem (Etapa 12, correção 3)
-- Migration: 0028_campaign_profile_ownership
--
-- PROBLEMA: `campaign_members` (0026/0027) prova que um usuário PERTENCE
-- a uma campanha, mas nunca provou QUAL perfil (`campaign_profiles`) ou
-- personagem (`characters`) é dele — um membro ativo, hoje, ainda não
-- tem como comprovar "este é o MEU perfil" além de conhecer o ID (ou a
-- sessão opaca `profile_session`, que nunca teve `auth.uid()`).
--
-- DECISÃO (ordem de preferência do pedido): `campaign_profiles` ganha
-- `user_id` NULLABLE (preferência explícita do pedido, em vez de tabela
-- associativa nova — o perfil já é a entidade 1:1 certa para isso).
-- `characters.profile_id` (migration 0011) já existe e já é a fonte de
-- verdade de "personagem pertence a qual perfil" — propriedade de
-- personagem passa a ser DERIVADA do perfil (characters não ganha
-- coluna nova).
--
-- ESCOPO DELIBERADAMENTE LIMITADO (documentado no checkpoint, não
-- escondido): esta migration cria a COLUNA, a RPC transacional de
-- reivindicação e as funções de autorização — mas NÃO substitui as
-- policies `*_dev_transition_*` abertas de `campaign_profiles`/
-- `characters` por policies restritas. Fazer isso com segurança exige
-- primeiro migrar TODAS as Server Actions de `character/storage.ts`
-- (~15 funções) do client anon para o client "scoped", e validar que
-- nenhum fluxo anônimo existente (mesas sem convite autenticado, dev)
-- quebra — um refactor de storage já sinalizado como fora de escopo
-- desde a migration 0013 (v0.27) e não seguro de fazer sem essa
-- auditoria completa nesta sessão. As funções de autorização abaixo
-- ficam prontas (`can_access_campaign_profile` etc.) para quando esse
-- refactor acontecer; não são usadas em RLS ainda — ver checkpoint.
--
-- NENHUM BACKFILL ESPECULATIVO: perfis/personagens existentes ficam com
-- `user_id`/vínculo NÃO reivindicado (null) — nenhuma linha é associada
-- a um usuário sem uma reivindicação explícita e autenticada.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. campaign_profiles ganha user_id (nullable) + claimed_at.
-- ---------------------------------------------------------------------
alter table campaign_profiles
  add column if not exists user_id    uuid references auth.users(id) on delete set null,
  add column if not exists claimed_at timestamptz;

-- Um usuário só pode ter UM perfil reivindicado por campanha (evita um
-- jogador acumular vários perfis "seus" na mesma mesa por engano).
create unique index if not exists campaign_profiles_campaign_user_unique
  on campaign_profiles (campaign_id, user_id)
  where user_id is not null;

-- ---------------------------------------------------------------------
-- 2. Funções de autorização (ADITIVAS — não usadas em RLS nesta
--    migration, ver nota de escopo acima). Nunca confiam em user_id
--    vindo do client (default sempre auth.uid()).
-- ---------------------------------------------------------------------
create or replace function can_access_campaign_profile(p_profile_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from campaign_profiles p
    where p.id = p_profile_id
      and (p.user_id = check_user_id or is_campaign_owner(p.campaign_id, check_user_id))
  );
$$;

create or replace function can_manage_campaign_profile(p_profile_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from campaign_profiles p
    where p.id = p_profile_id and is_campaign_owner(p.campaign_id, check_user_id)
  );
$$;

create or replace function can_read_character(p_character_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from characters c
    left join campaign_profiles p on p.id = c.profile_id
    where c.id = p_character_id
      and (
        (c.campaign_id is not null and is_campaign_owner(c.campaign_id, check_user_id))
        or (p.user_id is not null and p.user_id = check_user_id)
      )
  );
$$;

create or replace function can_manage_character(p_character_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select can_read_character(p_character_id, check_user_id);
$$;

revoke all on function can_access_campaign_profile(uuid, uuid) from public;
revoke all on function can_manage_campaign_profile(uuid, uuid) from public;
revoke all on function can_read_character(uuid, uuid) from public;
revoke all on function can_manage_character(uuid, uuid) from public;
grant execute on function can_access_campaign_profile(uuid, uuid) to authenticated;
grant execute on function can_manage_campaign_profile(uuid, uuid) to authenticated;
grant execute on function can_read_character(uuid, uuid) to authenticated;
grant execute on function can_manage_character(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. claim_campaign_profile(profile_id) — reivindica um perfil NÃO
--    reivindicado. Idempotente para o MESMO usuário; bloqueia se já
--    pertence a OUTRO usuário (nunca sobrescreve reivindicação alheia —
--    fecha a corrida "dois jogadores reivindicam o mesmo perfil" via
--    `for update` + a unique index acima como cinto-e-suspensório).
-- ---------------------------------------------------------------------
create or replace function claim_campaign_profile(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_profile campaign_profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'É necessário estar autenticado para reivindicar um perfil.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_profile from campaign_profiles where id = p_profile_id for update;
  if not found then
    raise exception 'Perfil não encontrado.' using errcode = 'no_data_found';
  end if;

  if not is_campaign_member(v_profile.campaign_id, v_uid) then
    raise exception 'Você não é membro desta campanha.' using errcode = 'insufficient_privilege';
  end if;

  if v_profile.user_id is not null and v_profile.user_id <> v_uid then
    raise exception 'Este perfil já pertence a outro jogador.' using errcode = 'unique_violation';
  end if;

  update campaign_profiles
  set user_id = v_uid, claimed_at = coalesce(claimed_at, now())
  where id = p_profile_id;

  return jsonb_build_object('profileId', p_profile_id, 'campaignId', v_profile.campaign_id);
end;
$$;

revoke all on function claim_campaign_profile(uuid) from public;
grant execute on function claim_campaign_profile(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. create_and_claim_campaign_profile(campaign_id, nickname) — cria um
--    perfil NOVO já reivindicado pelo usuário autenticado (fluxo "criar
--    meu perfil" em vez de reivindicar um existente).
-- ---------------------------------------------------------------------
create or replace function create_and_claim_campaign_profile(p_campaign_id uuid, p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_profile_id uuid;
begin
  if v_uid is null then
    raise exception 'É necessário estar autenticado para criar um perfil.' using errcode = 'insufficient_privilege';
  end if;
  if not is_campaign_member(p_campaign_id, v_uid) then
    raise exception 'Você não é membro desta campanha.' using errcode = 'insufficient_privilege';
  end if;
  if p_nickname is null or btrim(p_nickname) = '' then
    raise exception 'Nome do perfil é obrigatório.' using errcode = 'check_violation';
  end if;

  insert into campaign_profiles (campaign_id, nickname, user_id, claimed_at)
  values (p_campaign_id, btrim(p_nickname), v_uid, now())
  returning id into v_profile_id;

  return jsonb_build_object('profileId', v_profile_id, 'campaignId', p_campaign_id);
end;
$$;

revoke all on function create_and_claim_campaign_profile(uuid, text) from public;
grant execute on function create_and_claim_campaign_profile(uuid, text) to authenticated;

commit;
