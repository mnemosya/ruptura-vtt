"use server";

/**
 * Persistência mínima de Mesa/Log (tabelas `campaigns` e `table_logs`,
 * migration 0003_campaigns_table_logs.sql).
 *
 * Server Actions ("use server"): mesmo padrão de
 * src/lib/character/storage.ts — chamadas diretamente do Client
 * Component mas executadas no servidor, usando a anon key
 * (getContentClient(), nunca a service role key).
 *
 * Isso só funciona porque a migration 0003 cria policies de RLS
 * TEMPORÁRIAS de desenvolvimento (campaigns: CRUD completo;
 * table_logs: só select/insert, append-only) — ver o aviso completo no
 * topo daquela migration, incluindo o risco de que `visibility`
 * ('public'/'private'/'gm') hoje é só um campo de dados, sem filtro
 * real de RLS.
 */

import { getContentClient } from "../content";
import { TableStorageError } from "./storage.errors";
import type { Campaign, TableLogEntry, TableLogVisibility } from "./types";

const CAMPAIGNS_TABLE = "campaigns";
const TABLE_LOGS_TABLE = "table_logs";

/** Cria uma mesa (campaign) de desenvolvimento. */
export async function createCampaign(name: string): Promise<Campaign> {
  const client = getContentClient();
  const finalName = name.trim() ? name.trim() : "Mesa sem nome";
  const { data, error } = await client.from(CAMPAIGNS_TABLE).insert({ name: finalName }).select().single();

  if (error) {
    throw new TableStorageError(`Falha ao criar mesa: ${error.message}`, error);
  }
  return data as Campaign;
}

/** Lista mesas, mais recentemente atualizadas primeiro. */
export async function listCampaigns(): Promise<Campaign[]> {
  const client = getContentClient();
  const { data, error } = await client.from(CAMPAIGNS_TABLE).select().order("updated_at", { ascending: false });

  if (error) {
    throw new TableStorageError(`Falha ao listar mesas: ${error.message}`, error);
  }
  return (data as Campaign[]) ?? [];
}

export interface AddLogParams {
  campaignId: string;
  characterId?: string;
  type: string;
  visibility: TableLogVisibility;
  payload: Record<string, unknown>;
}

/** Registra uma entrada no log persistente de uma mesa. Append-only. */
export async function addLog(params: AddLogParams): Promise<TableLogEntry> {
  const client = getContentClient();
  const { data, error } = await client
    .from(TABLE_LOGS_TABLE)
    .insert({
      campaign_id: params.campaignId,
      character_id: params.characterId ?? null,
      type: params.type,
      visibility: params.visibility,
      payload: params.payload,
    })
    .select()
    .single();

  if (error) {
    throw new TableStorageError(`Falha ao registrar log na mesa "${params.campaignId}": ${error.message}`, error);
  }
  return data as TableLogEntry;
}

/** Lista os logs de uma mesa, mais recentes primeiro. */
export async function listLogs(campaignId: string): Promise<TableLogEntry[]> {
  const client = getContentClient();
  const { data, error } = await client
    .from(TABLE_LOGS_TABLE)
    .select()
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new TableStorageError(`Falha ao listar logs da mesa "${campaignId}": ${error.message}`, error);
  }
  return (data as TableLogEntry[]) ?? [];
}
