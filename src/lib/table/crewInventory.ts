"use server";

/**
 * Inventário do bando/mesa — checkpoint pós-v0.68 (CP7, autorizado).
 * Tabela `campaign_inventory_items` (migration 0019): guarda a
 * INSTÂNCIA inteira de item (mesmo formato de
 * `Character.inventario[]`/`InventoryItemInstance`,
 * src/lib/character/inventory.ts) em `payload` jsonb — cargas, munição
 * carregada, Aljava com flechas, propriedades/estados técnicos, nada é
 * achatado. O conteúdo oficial de item continua vindo só da
 * Biblioteca; esta tabela guarda só estado mutável de instância.
 *
 * RLS estrita desde o início (migration 0019): só `authenticated`, dono
 * da mesa (`campaign_id in (select id from campaigns where owner_id =
 * auth.uid())`) — sem policy para `anon` em nenhum comando. Por isso
 * este módulo, como o resto de `lib/table/storage.ts`, usa
 * `getScopedTableClient()` (anexa o JWT do narrador logado quando
 * existir) — SEM sessão de narrador, toda chamada aqui falha por RLS
 * (esperado, não um bug: ver pendência no relatório do checkpoint).
 *
 * Mesclagem de stack (`upsertCrewInventoryItem`) segue o MESMO
 * critério de `purchaseItem`/`addInstanceToInventory`
 * (lib/character/inventory.ts): só mescla quando `categoria ===
 * "municao"` (sem estado individual); qualquer outra categoria sempre
 * vira uma linha nova, nunca mesclada (evita perder cargas/munição
 * carregada/Aljava/propriedades diferentes).
 */

import { getScopedTableClient } from "../auth/scopedClient";
import { TableStorageError } from "./storage.errors";
import type { InventoryItemInstance } from "../character/inventory";

const CAMPAIGN_INVENTORY_TABLE = "campaign_inventory_items";

export interface CrewInventoryItem {
  id: string;
  campaignId: string;
  itemInstanceId: string;
  itemName: string | null;
  itemSlug: string | null;
  quantity: number | null;
  payload: InventoryItemInstance;
  createdAt: string;
  updatedAt: string;
}

function normalizeCrewInventoryRow(row: Record<string, unknown>): CrewInventoryItem {
  return {
    id: String(row.id),
    campaignId: String(row.campaign_id),
    itemInstanceId: String(row.item_instance_id),
    itemName: typeof row.item_name === "string" ? row.item_name : null,
    itemSlug: typeof row.item_slug === "string" ? row.item_slug : null,
    quantity: typeof row.quantity === "number" ? row.quantity : null,
    payload: row.payload as InventoryItemInstance,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Lista o inventário do bando de uma mesa — exige narrador dono da mesa autenticado (RLS estrita, migration 0019). */
export async function listCrewInventory(campaignId: string): Promise<CrewInventoryItem[]> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from(CAMPAIGN_INVENTORY_TABLE)
    .select()
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new TableStorageError(`Falha ao listar inventário do bando da mesa "${campaignId}": ${error.message}`, error);
  }
  return (data ?? []).map(normalizeCrewInventoryRow);
}

/**
 * Adiciona uma instância ao inventário do bando — mescla com um stack
 * existente SÓ para `categoria === "municao"` (mesmo critério de
 * `addInstanceToInventory`); qualquer outra categoria sempre insere uma
 * linha nova.
 */
export async function upsertCrewInventoryItem(campaignId: string, instance: InventoryItemInstance): Promise<CrewInventoryItem> {
  const client = await getScopedTableClient();

  // Concorrência (migration 0040): busca+merge+update de uma stack de
  // munição precisa acontecer dentro de UMA transação com lock de linha
  // — feito na RPC `upsert_crew_inventory_munition`, nunca mais como
  // dois passos separados aqui (SELECT então UPDATE), que permitia
  // "lost update" com dois depósitos concorrentes na mesma stack.
  if (instance.categoria === "municao" && instance.itemSlug) {
    const { data, error } = await client.rpc("upsert_crew_inventory_munition", {
      p_campaign_id: campaignId,
      p_item_slug: instance.itemSlug,
      p_instance: instance,
    });
    if (error) {
      throw new TableStorageError(`Falha ao mesclar item no bando: ${error.message}`, error);
    }
    return normalizeCrewInventoryRow(data as Record<string, unknown>);
  }

  const { data, error } = await client
    .from(CAMPAIGN_INVENTORY_TABLE)
    .insert({
      campaign_id: campaignId,
      item_instance_id: instance.id,
      item_name: instance.itemNome,
      item_slug: instance.itemSlug,
      quantity: instance.quantidade,
      payload: instance,
    })
    .select()
    .single();

  if (error) {
    throw new TableStorageError(`Falha ao adicionar item ao bando: ${error.message}`, error);
  }
  return normalizeCrewInventoryRow(data);
}

/** Remove um item INTEIRO do inventário do bando (linha da tabela). */
export async function removeCrewInventoryItem(campaignId: string, rowId: string): Promise<void> {
  const client = await getScopedTableClient();
  const { error } = await client.from(CAMPAIGN_INVENTORY_TABLE).delete().eq("id", rowId).eq("campaign_id", campaignId);
  if (error) {
    throw new TableStorageError(`Falha ao remover item do bando: ${error.message}`, error);
  }
}

/** Atualiza o payload/quantidade de UMA linha do bando (usado ao reduzir quantidade numa transferência parcial para fora do bando). */
export async function updateCrewInventoryItemInstance(
  campaignId: string,
  rowId: string,
  instance: InventoryItemInstance,
): Promise<CrewInventoryItem> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from(CAMPAIGN_INVENTORY_TABLE)
    .update({ item_name: instance.itemNome, item_slug: instance.itemSlug, quantity: instance.quantidade, payload: instance })
    .eq("id", rowId)
    .eq("campaign_id", campaignId)
    .select()
    .single();
  if (error) {
    throw new TableStorageError(`Falha ao atualizar item do bando: ${error.message}`, error);
  }
  return normalizeCrewInventoryRow(data);
}
