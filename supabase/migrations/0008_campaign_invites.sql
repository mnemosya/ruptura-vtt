-- =====================================================================
-- Ruptura VTT — Convite real de mesa (token seguro)
-- Migration: 0008_campaign_invites
--
-- Checkpoint v0.18. Substitui o /dev/join por campaignId cru por um
-- convite com token revogável. O banco guarda APENAS o hash SHA-256 do
-- token (token_hash) — o token bruto só existe no momento da criação
-- (mostrado uma vez na UI) e no link. Resolver um convite = hashear o
-- token recebido e comparar com token_hash.
--
-- RLS: mesma estratégia de transição das outras tabelas de mesa
-- (checkpoint v0.17). Policies dev_transition abertas (necessárias
-- porque a rota /join é anon — jogador não tem login) + policies
-- owner-scoped (produto). token_hash NÃO é o token bruto (é um digest
-- irreversível), mas a leitura anon ainda expõe a LISTA de hashes —
-- risco de transição documentado, a remover junto com as demais
-- dev_transition quando houver auth de jogador.
-- =====================================================================

begin;

create table if not exists campaign_invites (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  token_hash   text not null unique,
  label        text,
  is_active    boolean not null default true,
  expires_at   timestamptz,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz
);

create index if not exists campaign_invites_campaign_id_idx on campaign_invites (campaign_id);
create index if not exists campaign_invites_token_hash_idx on campaign_invites (token_hash);

alter table campaign_invites enable row level security;

-- --- Policies dev/transição (abertas — necessárias para /join anon) ---
drop policy if exists campaign_invites_dev_transition_select on campaign_invites;
create policy campaign_invites_dev_transition_select on campaign_invites
  for select to anon, authenticated using (true);
comment on policy campaign_invites_dev_transition_select on campaign_invites is
  'TRANSICAO/INSEGURA: leitura aberta a anon (necessaria para resolver convite em /join sem login). Expoe lista de token_hash (digests). Remover quando resolver de convite for server-only confiavel.';

drop policy if exists campaign_invites_dev_transition_insert on campaign_invites;
create policy campaign_invites_dev_transition_insert on campaign_invites
  for insert to anon, authenticated with check (true);
comment on policy campaign_invites_dev_transition_insert on campaign_invites is
  'TRANSICAO/INSEGURA: insert aberto a anon. Remover; produto usa campaign_invites_owner_all.';

drop policy if exists campaign_invites_dev_transition_update on campaign_invites;
create policy campaign_invites_dev_transition_update on campaign_invites
  for update to anon, authenticated using (true) with check (true);
comment on policy campaign_invites_dev_transition_update on campaign_invites is
  'TRANSICAO/INSEGURA: update aberto a anon (revogar). Remover; produto usa campaign_invites_owner_all.';

drop policy if exists campaign_invites_dev_transition_delete on campaign_invites;
create policy campaign_invites_dev_transition_delete on campaign_invites
  for delete to anon, authenticated using (true);
comment on policy campaign_invites_dev_transition_delete on campaign_invites is
  'TRANSICAO/INSEGURA: delete aberto a anon. Remover; produto usa campaign_invites_owner_all.';

-- --- Policy owner-scoped (produto, migration 0006 pattern) ---
drop policy if exists campaign_invites_owner_all on campaign_invites;
create policy campaign_invites_owner_all on campaign_invites
  for all to authenticated
  using (campaign_id in (select id from campaigns where owner_id = (select auth.uid())))
  with check (campaign_id in (select id from campaigns where owner_id = (select auth.uid())));

commit;
