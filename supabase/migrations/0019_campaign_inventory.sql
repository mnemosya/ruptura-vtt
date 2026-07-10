-- =====================================================================
-- Ruptura VTT — Inventário do bando/mesa
-- Migration: 0019_campaign_inventory
--
-- Checkpoint pós-v0.68 (CP7, agora autorizado). Antes desta migration
-- NÃO existia nenhum modelo de inventário de campanha — `campaigns`
-- só tinha name/current_round/current_scene (migrations 0003/0017).
-- Esta migration cria a tabela mínima que faltava, seguindo o MESMO
-- princípio JSONB-first de `characters` (migration 0002): `payload`
-- guarda a instância de item INTEIRA (mesmo formato de
-- `Character.inventario[]`/`InventoryItemInstance`, ver
-- src/lib/character/inventory.ts) — cargas, munição carregada, Aljava
-- com flechas, propriedades/estados técnicos, tudo preservado sem
-- normalizar. As colunas escalares (item_name/item_slug/quantity) são
-- só projeções para filtro/listagem, igual `characters.name`.
--
-- O conteúdo OFICIAL de item continua vindo só da Biblioteca
-- (content_documents) — esta tabela guarda ESTADO MUTÁVEL de
-- instância pertencente ao bando, nunca uma cópia do catálogo.
-- =====================================================================

begin;

create table if not exists campaign_inventory_items (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references campaigns(id) on delete cascade,
  -- id da InventoryItemInstance (src/lib/character/inventory.ts) — correlaciona
  -- com o instanceId citado nos logs inventory_transfer, mesmo texto livre
  -- (não FK: a instância não vive em nenhuma outra tabela relacional).
  item_instance_id text not null,
  item_name        text,
  item_slug        text,
  -- Projeção de payload.quantidade só para filtro/exibição — nullable porque
  -- nem toda instância tem quantidade como conceito central (payload é a
  -- fonte de verdade sempre).
  quantity         integer,
  payload          jsonb not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists campaign_inventory_items_campaign_id_idx
  on campaign_inventory_items (campaign_id);

create index if not exists campaign_inventory_items_item_slug_idx
  on campaign_inventory_items (item_slug);

-- Evita duplicar a MESMA instância física na mesma mesa (nunca bloqueia
-- itens diferentes com o mesmo item_slug — cada instância tem seu próprio id).
create unique index if not exists campaign_inventory_items_campaign_instance_uidx
  on campaign_inventory_items (campaign_id, item_instance_id);

-- updated_at automático (reusa a função set_updated_at criada em
-- 0001_content_library.sql, já existente no banco quando esta migration roda).
drop trigger if exists campaign_inventory_items_set_updated_at on campaign_inventory_items;
create trigger campaign_inventory_items_set_updated_at
  before update on campaign_inventory_items
  for each row execute function set_updated_at();

-- =====================================================================
-- RLS — ESTRITA desde o início, sem camada dev_transition/anon. Esta é
-- uma tabela NOVA (ainda sem nenhum consumidor dependendo de acesso
-- anônimo, ao contrário de characters/campaigns/table_logs em 2026,
-- que já tinham produto rodando anon quando a RLS foi criada) — não há
-- motivo para abrir `using (true)` "por enquanto" aqui. Único
-- consumidor: o narrador dono da mesa, autenticado via Supabase Auth
-- (mesmo mecanismo de /dev/login, `signInWithPassword`/
-- `signUpDevNarrator`, src/lib/auth/actions.ts).
--
-- Mesmo modelo de `campaign_profiles_owner_all`/`campaign_invites_owner_all`
-- (migrations 0006/0013): uma única policy `for all` escopada por
-- `campaign_id in (select id from campaigns where owner_id = auth.uid())`.
-- Sem policy para `anon` em NENHUM comando — ler ou escrever o
-- inventário do bando exige sessão real de narrador dono da mesa.
--
-- Consequência conhecida (registrada como pendência, não como bug):
-- `/dev/table` e a ficha em modo dev/anon (sem login) NÃO conseguem
-- ler nem transferir para o inventário do bando enquanto não houver
-- narrador autenticado logado — mesmo critério do checkpoint
-- ("implementar primeiro no /dev/table para narrador/dono... registrar
-- pendência para jogador"). O lado PERSONAGEM da transferência
-- (characters.payload) continua usando as policies já existentes de
-- characters (inalteradas por esta migration).
-- =====================================================================

alter table campaign_inventory_items enable row level security;

drop policy if exists campaign_inventory_items_owner_all on campaign_inventory_items;
create policy campaign_inventory_items_owner_all
  on campaign_inventory_items
  for all
  to authenticated
  using (campaign_id in (select id from campaigns where owner_id = (select auth.uid())))
  with check (campaign_id in (select id from campaigns where owner_id = (select auth.uid())));

commit;
