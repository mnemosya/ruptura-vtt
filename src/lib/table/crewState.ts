/**
 * Estado do Bando Refratário v1.2 (`campaign_crews`, migration
 * 20261001180000). Uma linha por campanha que usa bando; sem linha, a
 * campanha não usa a regra (é opcional).
 *
 * Leitura por qualquer participante (RLS). Escrita só pelo narrador, pela
 * RPC `save_campaign_crew`, com revisão otimista: `expectedRevision` 0 cria,
 * N atualiza se a linha ainda estiver na revisão N. Conflito volta como
 * `{ conflict: true }`, nunca lançado.
 */

import { getScopedTableClient } from "../auth/scopedClient";
import { TableStorageError } from "./storage.errors";
import type { CrewStateV12 } from "../rulesetV12";

export interface CampaignCrewRecord {
  campaignId: string;
  state: CrewStateV12;
  revision: number;
  updatedAt: string;
}

const TABLE = "campaign_crews";

export async function getCampaignCrew(campaignId: string): Promise<CampaignCrewRecord | null> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from(TABLE)
    .select("campaign_id, state, revision, updated_at")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (error) throw new TableStorageError(`Falha ao ler o bando: ${error.message}`, error);
  if (!data) return null;
  return {
    campaignId: data.campaign_id as string,
    state: data.state as CrewStateV12,
    revision: data.revision as number,
    updatedAt: data.updated_at as string,
  };
}

export async function saveCampaignCrew(
  campaignId: string,
  state: CrewStateV12,
  expectedRevision: number,
): Promise<{ revision: number } | { conflict: true }> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("save_campaign_crew", {
    p_campaign_id: campaignId,
    p_state: state,
    p_expected_revision: expectedRevision,
  });
  if (error) {
    if (error.message?.includes("revision_conflict")) return { conflict: true };
    throw new TableStorageError(`Falha ao salvar o bando: ${error.message}`, error);
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { revision: row.revision as number };
}

/**
 * Aretz entre a carteira de um personagem e o caixa do bando, numa
 * transação (RPC `transfer_crew_aretz`). `paraBando`: da carteira para o
 * caixa; senão, do caixa para a carteira.
 */
export async function transferCrewAretz(
  campaignId: string,
  characterId: string,
  amount: number,
  paraBando: boolean,
): Promise<{ saldoPersonagem: number; caixa: number; revision: number }> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("transfer_crew_aretz", {
    p_campaign_id: campaignId,
    p_character_id: characterId,
    p_amount: Math.trunc(amount),
    p_to_crew: paraBando,
  });
  if (error) throw new TableStorageError(error.message, error);
  const r = data as { saldo_personagem: number; caixa: number; revision: number };
  return { saldoPersonagem: Number(r.saldo_personagem), caixa: Number(r.caixa), revision: r.revision };
}
