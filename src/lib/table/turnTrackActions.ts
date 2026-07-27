"use server";

/**
 * Server Actions da trilha de turnos (checkpoint pós-v0.94, migration
 * 0036/0037). Camada fina: monta os participantes a partir dos
 * personagens ativos da mesa, delega toda a regra de ordem/alternância
 * ao motor puro (`turnTrack.ts`) e persiste via as duas RPCs
 * SECURITY DEFINER (ver migration 0037 para o porquê da divisão
 * narrador vs. jogador).
 */

import { getScopedTableClient } from "../auth/scopedClient";
import { listCharactersForNarratorCampaign } from "../character/storage";
import { TableStorageError } from "./storage.errors";
import { getCampaign } from "./storage";
import {
  advanceToLenta,
  buildTurnOrder,
  narratorAdvance,
  narratorOverrideToParticipant,
  startRound,
  type TurnParticipantInput,
  type TurnTrackState,
} from "./turnTrack";
import type { Campaign } from "./types";

/**
 * Reflexos usado só para desempate de ordem — valor investido em
 * `pericias.reflexos`. Este módulo não tem acesso a qual atributo cada
 * perícia soma (isso vem do payload de regras da Biblioteca, ligado
 * caso a caso) — para um desempate determinístico, o valor investido
 * já é suficiente e nunca é usado para nenhum outro cálculo mecânico.
 */
function reflexosDeDesempate(payload: { pericias?: Record<string, number> } | null | undefined): number {
  return payload?.pericias?.reflexos ?? 0;
}

/**
 * Participantes elegíveis: personagens ativos (não arquivados) da mesa.
 * "PJ" = tem profile_id (vinculado a um jogador); "PNJ" = sem
 * profile_id (controlado pelo narrador) — não existe campo dedicado no
 * schema de personagem, esta é a única distinção disponível nos dados.
 */
async function buildParticipantsForCampaign(campaignId: string): Promise<TurnParticipantInput[]> {
  const records = await listCharactersForNarratorCampaign(campaignId);
  return records
    .filter((record) => !record.archived_at)
    .map((record) => ({
      characterId: record.id,
      characterNome: record.payload?.nome ?? record.name,
      side: record.profile_id ? ("pj" as const) : ("pnj" as const),
      reflexos: reflexosDeDesempate(record.payload as unknown as { pericias?: Record<string, number> }),
      active: true,
    }));
}

async function requireCampaign(campaignId: string): Promise<Campaign> {
  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    throw new TableStorageError(`Mesa "${campaignId}" não encontrada.`);
  }
  return campaign;
}

async function persistNarratorState(campaignId: string, expectedVersion: number, next: TurnTrackState): Promise<Campaign> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("narrator_set_turn_track", {
    p_campaign_id: campaignId,
    p_expected_version: expectedVersion,
    p_next_turn_track: next,
  });
  if (error) {
    throw new TableStorageError(`Falha ao atualizar a trilha de turnos: ${error.message}`, error);
  }
  return data as Campaign;
}

/** Lê o estado atual da trilha de turnos (para renderizar a UI, narrador ou jogador). */
export async function getTurnTrackState(campaignId: string): Promise<{ turnTrack: TurnTrackState; version: number }> {
  const campaign = await requireCampaign(campaignId);
  return { turnTrack: campaign.turn_track, version: campaign.turn_track_version };
}

/** Narrador: "Iniciar rodada" — sempre abre em Turnos Rápidos (PRD 6.2). */
export async function startTurnRound(campaignId: string): Promise<Campaign> {
  const campaign = await requireCampaign(campaignId);
  const participants = await buildParticipantsForCampaign(campaignId);
  const next = startRound(participants, campaign.current_round);
  return persistNarratorState(campaignId, campaign.turn_track_version, next);
}

/** Narrador: avança de Turnos Rápidos para Turnos Lentos (PRD 6.1). */
export async function advanceTurnWindowToLenta(campaignId: string): Promise<Campaign> {
  const campaign = await requireCampaign(campaignId);
  if (campaign.turn_track.window !== "rapida") {
    throw new TableStorageError("Só é possível avançar para Turnos Lentos a partir de Turnos Rápidos.");
  }
  const participants = await buildParticipantsForCampaign(campaignId);
  const next = advanceToLenta(campaign.turn_track, participants);
  return persistNarratorState(campaignId, campaign.turn_track_version, next);
}

/** Narrador: avança o cursor para o próximo participante sem exigir que o atual tenha agido. */
export async function narratorAdvanceTurn(campaignId: string): Promise<Campaign> {
  const campaign = await requireCampaign(campaignId);
  const next = narratorAdvance(campaign.turn_track, new Date().toISOString());
  return persistNarratorState(campaignId, campaign.turn_track_version, next);
}

/** Narrador: override — devolve o turno a um participante específico (PRD 6.1, "exceção operacional"). */
export async function narratorOverrideTurn(campaignId: string, characterId: string): Promise<Campaign> {
  const campaign = await requireCampaign(campaignId);
  const next = narratorOverrideToParticipant(campaign.turn_track, characterId, new Date().toISOString());
  return persistNarratorState(campaignId, campaign.turn_track_version, next);
}

/**
 * Jogador (ou narrador agindo por um PNJ): "Encerrar turno". Passa pela
 * RPC `end_own_turn`, que revalida tudo dentro da transação — este
 * módulo não confia em nenhum estado local para decidir se é a vez do
 * personagem.
 */
export async function endOwnTurn(campaignId: string, characterId: string): Promise<Campaign> {
  const campaign = await requireCampaign(campaignId);
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("end_own_turn", {
    p_campaign_id: campaignId,
    p_character_id: characterId,
    p_expected_version: campaign.turn_track_version,
  });
  if (error) {
    throw new TableStorageError(`Falha ao encerrar o turno: ${error.message}`, error);
  }
  return data as Campaign;
}

/** Preview local (sem persistir) da ordem para um conjunto de participantes — usado pela UI antes de "Iniciar rodada". */
export { buildTurnOrder };
