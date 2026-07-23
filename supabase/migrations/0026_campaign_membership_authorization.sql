-- =====================================================================
-- Ruptura VTT — Correção de autorização de conteúdo de campanha (Etapa 12, correção)
-- Migration: 0026_campaign_membership_authorization
--
-- PROBLEMA CORRIGIDO (auditoria completa no checkpoint da Etapa 12):
-- a migration 0025 protegia a leitura de `campaign_content_documents`
-- publicado só por `campaign_id` + a MESMA policy permissiva já usada
-- por `characters`/`campaign_profiles`/`table_logs` (anon/authenticated,
-- sem checar identidade real). Conhecer o `campaign_id` NUNCA comprovou
-- pertencimento à campanha — é particionamento lógico, não autorização.
--
-- AUDITORIA CONFIRMADA (repetida aqui para rastreabilidade): não existe
-- NENHUMA autenticação real de jogador no projeto. `campaign_profiles`/
-- `characters` são identificados por sessão/token opaco
-- (`profile_sessions`), nunca por `auth.users`/`auth.uid()`. A ÚNICA
-- relação real que já vincula `auth.uid()` a uma campanha é
-- `campaigns.owner_id` (migrations 0006/0013). `resolveCampaignInvite`
-- (0008) nunca cria vínculo de `auth.uid()` — só resolve o token e
-- devolve a campanha, para um visitante ANÔNIMO montar um
-- `campaign_profile`.
--
-- DECISÃO (ordem de preferência do pedido, aplicada em ordem):
--   1. Não existe membership real de JOGADOR para reaproveitar.
--   2. A única relação real que vincula auth.uid() a uma campanha é
--      `owner_id` — reaproveitada como fonte de verdade.
--   3. Criamos uma tabela MÍNIMA de membership (`campaign_members`),
--      mas só populada com o OWNER (backfill) — nenhuma linha de
--      jogador é inventada, porque não existe `auth.uid()` de jogador
--      para vincular. A tabela existe para que uma autenticação real
--      de jogador (fora de escopo) só precise INSERIR linhas aqui,
--      sem reabrir RLS depois.
--
-- CONSEQUÊNCIA HONESTA E DELIBERADA: a leitura de conteúdo efetivo de
-- campanha (`campaign_content_documents` publicado) deixa de ser
-- acessível pela chave anon pura — só por sessão autenticada que seja
-- membro (hoje, só o narrador dono). Isso significa que a ficha do
-- JOGADOR (rota anônima `/ficha`), que não tem `auth.uid()`, passa a
-- ler SEMPRE o catálogo oficial puro para conteúdo de campanha (nenhum
-- override/homebrew aparece para ela) — documentado no checkpoint como
-- limitação estrutural, não escondida. O narrador (com sessão) continua
-- vendo e publicando tudo normalmente.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. campaign_members — mínima, só para autoridade real vinculada a
--    auth.uid(). Hoje só recebe o OWNER (backfill abaixo); nenhuma
--    linha de jogador é criada sem autenticação real de jogador.
-- ---------------------------------------------------------------------
create table if not exists campaign_members (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner', 'player')),
  status      text not null default 'active' check (status in ('active', 'invited', 'removed')),
  origem      text not null default 'manual',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint campaign_members_unique unique (campaign_id, user_id)
);

create index if not exists campaign_members_campaign_idx on campaign_members (campaign_id);
create index if not exists campaign_members_user_idx on campaign_members (user_id);

drop trigger if exists campaign_members_set_updated_at on campaign_members;
create trigger campaign_members_set_updated_at
  before update on campaign_members
  for each row execute function set_updated_at();

alter table campaign_members enable row level security;

-- Cada usuário só vê sua PRÓPRIA linha de membership, mais o narrador
-- dono vê todas as linhas da sua campanha (para uma futura tela de
-- gestão de membros). Nenhuma policy para anon.
drop policy if exists campaign_members_self_read on campaign_members;
create policy campaign_members_self_read
  on campaign_members
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists campaign_members_owner_read_all on campaign_members;
create policy campaign_members_owner_read_all
  on campaign_members
  for select
  to authenticated
  using (exists (select 1 from campaigns c where c.id = campaign_id and c.owner_id = (select auth.uid())));

-- Nenhuma policy de insert/update/delete: sem autenticação real de
-- jogador, não há um fluxo seguro de "aceitar convite → virar membro"
-- para expor via RLS ainda — escrita só pelo backfill desta migration
-- (rodado como dono do banco) e por uma função SECURITY DEFINER futura,
-- quando essa autenticação existir. Documentado como limitação real.

-- Backfill: o dono de cada campanha já é, por definição, um membro
-- autorizado. Nenhuma linha de jogador é inventada aqui.
insert into campaign_members (campaign_id, user_id, role, status, origem)
select id, owner_id, 'owner', 'active', 'backfill_0026'
from campaigns
where owner_id is not null
on conflict (campaign_id, user_id) do nothing;

-- ---------------------------------------------------------------------
-- 2. Funções de autorização — nunca confiam em argumento de user_id
--    vindo do client (default sempre auth.uid()); search_path explícito
--    (nunca resolvido por busca ambígua); SECURITY DEFINER só onde
--    necessário para ler tabelas sem policy de leitura ampla.
-- ---------------------------------------------------------------------

-- Reforça a MESMA função já existente na 0025 (mantida — não recriar
-- com corpo diferente evitaria confusão de qual é a fonte de verdade).
-- is_campaign_owner(uuid, uuid) já existe desde 0025.

create or replace function is_campaign_member(p_campaign_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    exists (select 1 from campaigns c where c.id = p_campaign_id and c.owner_id = check_user_id)
    or exists (
      select 1 from campaign_members m
      where m.campaign_id = p_campaign_id and m.user_id = check_user_id and m.status = 'active'
    );
$$;

revoke all on function is_campaign_member(uuid, uuid) from public;
grant execute on function is_campaign_member(uuid, uuid) to authenticated;

-- Autoridade de ESCRITA/gestão — hoje idêntica a is_campaign_owner (só
-- o papel 'owner' existe de fato; 'narrator' seria um papel distinto
-- do dono, que a auditoria não encontrou em lugar nenhum do projeto —
-- nomeada separadamente para o dia em que um papel de "narrador
-- convidado, não-dono" existir de verdade).
create or replace function can_manage_campaign_content(p_campaign_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select is_campaign_owner(p_campaign_id, check_user_id);
$$;

revoke all on function can_manage_campaign_content(uuid, uuid) from public;
grant execute on function can_manage_campaign_content(uuid, uuid) to authenticated;

-- Autoridade de LEITURA de conteúdo publicado — membro ativo (hoje só
-- o dono, via backfill; membership real de jogador é aditiva no futuro).
create or replace function can_read_campaign_content(p_campaign_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select is_campaign_member(p_campaign_id, check_user_id);
$$;

revoke all on function can_read_campaign_content(uuid, uuid) from public;
grant execute on function can_read_campaign_content(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Corrige RLS de campaign_content_documents — remove a leitura
--    aberta a anon/qualquer authenticated; exige membership real.
-- ---------------------------------------------------------------------
drop policy if exists campaign_content_documents_public_read on campaign_content_documents;
drop policy if exists campaign_content_documents_owner_read_all on campaign_content_documents;

create policy campaign_content_documents_member_read
  on campaign_content_documents
  for select
  to authenticated
  using (status = 'published' and can_read_campaign_content(campaign_id));

create policy campaign_content_documents_manager_read_all
  on campaign_content_documents
  for select
  to authenticated
  using (can_manage_campaign_content(campaign_id));

-- Continua sem NENHUMA policy de insert/update/delete — toda escrita
-- só pelas funções SECURITY DEFINER (0025), que já revalidam autoridade
-- internamente.

-- ---------------------------------------------------------------------
-- 4. Realinha as demais tabelas da Etapa 12 para usar
--    can_manage_campaign_content (mesmo efeito de is_campaign_owner
--    hoje, nomeação semântica correta para consumidores/auditoria).
-- ---------------------------------------------------------------------
drop policy if exists campaign_content_drafts_owner_all on campaign_content_drafts;
create policy campaign_content_drafts_owner_all
  on campaign_content_drafts
  for all
  to authenticated
  using (can_manage_campaign_content(campaign_id))
  with check (can_manage_campaign_content(campaign_id));

drop policy if exists campaign_content_editor_metadata_owner_read on campaign_content_editor_metadata;
create policy campaign_content_editor_metadata_owner_read
  on campaign_content_editor_metadata
  for select
  to authenticated
  using (
    exists (
      select 1 from campaign_content_documents ccd
      where ccd.id = campaign_content_document_id and can_manage_campaign_content(ccd.campaign_id)
    )
  );

drop policy if exists campaign_content_changelog_owner_read on campaign_content_changelog;
create policy campaign_content_changelog_owner_read
  on campaign_content_changelog
  for select
  to authenticated
  using (can_manage_campaign_content(campaign_id));

-- ---------------------------------------------------------------------
-- 5. Limite de segurança (defesa em profundidade — a validação
--    primária acontece na Server Action, em TypeScript, ANTES de
--    chamar o RPC; este gatilho é só um teto absoluto no banco, nunca
--    a única barreira). Valores de playtest, documentados no checkpoint.
-- ---------------------------------------------------------------------
create or replace function enforce_campaign_content_limits()
returns trigger
language plpgsql
as $$
declare
  v_count integer;
begin
  if tg_table_name = 'campaign_content_documents' then
    select count(*) into v_count from campaign_content_documents
      where campaign_id = new.campaign_id and status = 'published' and id <> new.id;
    if v_count >= 300 then
      raise exception 'Limite de 300 conteúdos publicados por campanha atingido.' using errcode = 'check_violation';
    end if;
  elsif tg_table_name = 'campaign_content_drafts' then
    select count(*) into v_count from campaign_content_drafts
      where campaign_id = new.campaign_id and id <> new.id;
    if v_count >= 50 then
      raise exception 'Limite de 50 rascunhos ativos por campanha atingido.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists campaign_content_documents_limit on campaign_content_documents;
create trigger campaign_content_documents_limit
  before insert on campaign_content_documents
  for each row execute function enforce_campaign_content_limits();

drop trigger if exists campaign_content_drafts_limit on campaign_content_drafts;
create trigger campaign_content_drafts_limit
  before insert on campaign_content_drafts
  for each row execute function enforce_campaign_content_limits();

commit;
