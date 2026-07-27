-- =====================================================================
-- Ruptura VTT — Inventário do bando: acesso de jogador (produção)
-- Migration: 0038_crew_inventory_member_access
--
-- `campaign_inventory_items` (migration 0019) só tinha
-- `campaign_inventory_items_owner_all` (dono da mesa) — por isso
-- "Enviar ao bando" já existia na ficha de produção (InventoryTab.tsx,
-- `handleSendItemToCrew`) mas SEMPRE falhava por RLS para um jogador
-- (só funcionava com sessão de narrador). Decisão de escopo (mesma
-- cautela pedida no checkpoint — "não assumir que todo jogador possui
-- controle total"):
--   - Jogador (membro da campanha, `is_campaign_member`) pode LER o
--     bando e DEPOSITAR itens (INSERT) — ação aditiva, sem risco de
--     tirar item de outro jogador.
--   - RETIRAR do bando (UPDATE/DELETE) continua exclusivo do narrador
--     — a política `_owner_all` já cobre isso; não se adiciona
--     UPDATE/DELETE para membro aqui.
-- =====================================================================

begin;

drop policy if exists campaign_inventory_items_member_select on campaign_inventory_items;
create policy campaign_inventory_items_member_select
  on campaign_inventory_items
  for select
  to authenticated
  using (is_campaign_member(campaign_id));

drop policy if exists campaign_inventory_items_member_insert on campaign_inventory_items;
create policy campaign_inventory_items_member_insert
  on campaign_inventory_items
  for insert
  to authenticated
  with check (is_campaign_member(campaign_id));

commit;
