-- =====================================================================
-- Ruptura VTT — Ownership de mesa (groundwork de RLS real)
-- Migration: 0006_campaign_owner
--
-- Checkpoint v0.14. Esta migration é DELIBERADAMENTE ADITIVA e NÃO
-- endurece a segurança de verdade ainda — ver o aviso longo abaixo.
--
-- O que faz:
--   1. Adiciona campaigns.owner_id (uuid, NULLABLE, FK -> auth.users)
--      como base de "dono da mesa". Nullable para não quebrar mesas
--      antigas (criadas antes de existir auth) — elas ficam owner_id
--      = null ("mesa dev legada").
--   2. Cria policies owner-scoped para o papel `authenticated`
--      (campaigns/table_logs/campaign_profiles), prontas para quando a
--      segurança real for ativada.
--
-- O que NÃO faz (e por quê):
--   • NÃO remove as policies dev abertas (anon/authenticated USING(true))
--     das migrations 0002/0003/0004. Elas CONTINUAM valendo. Como
--     policies PERMISSIVE do mesmo comando se combinam com OR, as
--     policies owner-scoped abaixo NÃO restringem nada enquanto as
--     dev-abertas existirem — ou seja, ISTO NÃO É SEGURANÇA REAL AINDA.
--     É só o terreno preparado.
--   • Motivo de não cortar anon agora: o fluxo de jogador
--     (/dev/join/[campaignId]) é anon por design (jogador não tem
--     login). Cortar o SELECT anon de campaigns/campaign_profiles ou o
--     INSERT anon de table_logs quebraria entrar na mesa, rolar e
--     conversar pela ficha. Auth real de jogador (link de convite
--     seguro) ainda não existe. Além disso, a camada de storage
--     (getContentClient) usa a anon key SEM sessão — nenhuma Server
--     Action anexa o JWT do narrador hoje, então qualquer policy que
--     dependa de auth.uid() negaria TODAS as Server Actions atuais
--     (lockout). Endurecer de verdade exige (a) auth de jogador e
--     (b) refatorar o storage para cliente autenticado — fora do
--     escopo seguro deste checkpoint.
--
-- COMO ATIVAR SEGURANÇA REAL no futuro (NÃO fazer agora — quebraria
-- /dev/join):
--   1. Ter auth de jogador (convite seguro) e refatorar o storage para
--      anexar o JWT (narrador e jogador) nas Server Actions.
--   2. Dropar as policies *_dev_anon_* de campaigns/table_logs/
--      campaign_profiles.
--   3. As policies *_owner_* abaixo passam a valer; adicionar policies
--      de jogador (membro da mesa) conforme o modelo de convite.
--
-- Sem risco de lockout nesta migration: nada é removido, a coluna é
-- nullable, e as policies novas só ampliam acesso (nunca restringem
-- enquanto as dev-abertas coexistem).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. owner_id (nullable, FK -> auth.users)
-- ---------------------------------------------------------------------
alter table campaigns
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

create index if not exists campaigns_owner_id_idx on campaigns (owner_id);

-- ---------------------------------------------------------------------
-- 2. Policies owner-scoped para `authenticated` (ADITIVAS / groundwork)
--
-- IMPORTANTE: enquanto as policies *_dev_anon_* coexistirem, estas NÃO
-- restringem nada (PERMISSIVE + OR). Só passam a valer de fato quando as
-- dev-abertas forem removidas (ver "COMO ATIVAR" acima).
-- ---------------------------------------------------------------------

-- campaigns: narrador vê/edita/apaga as próprias mesas
drop policy if exists campaigns_owner_select on campaigns;
create policy campaigns_owner_select on campaigns
  for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists campaigns_owner_insert on campaigns;
create policy campaigns_owner_insert on campaigns
  for insert to authenticated with check (owner_id = (select auth.uid()));

drop policy if exists campaigns_owner_update on campaigns;
create policy campaigns_owner_update on campaigns
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists campaigns_owner_delete on campaigns;
create policy campaigns_owner_delete on campaigns
  for delete to authenticated using (owner_id = (select auth.uid()));

-- table_logs: logs pertencem a mesas do narrador
drop policy if exists table_logs_owner_select on table_logs;
create policy table_logs_owner_select on table_logs
  for select to authenticated
  using (campaign_id in (select id from campaigns where owner_id = (select auth.uid())));

drop policy if exists table_logs_owner_insert on table_logs;
create policy table_logs_owner_insert on table_logs
  for insert to authenticated
  with check (campaign_id in (select id from campaigns where owner_id = (select auth.uid())));

-- campaign_profiles: perfis pertencem a mesas do narrador
drop policy if exists campaign_profiles_owner_all on campaign_profiles;
create policy campaign_profiles_owner_all on campaign_profiles
  for all to authenticated
  using (campaign_id in (select id from campaigns where owner_id = (select auth.uid())))
  with check (campaign_id in (select id from campaigns where owner_id = (select auth.uid())));

commit;
