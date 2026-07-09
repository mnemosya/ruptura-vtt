"use server";

/**
 * Encerrar Cena CANÔNICO da mesa — checkpoint v0.45.
 *
 * `campaigns.current_scene` (migration 0017, v0.39) passa a ser a
 * fonte de verdade da cena — este módulo processa TODOS os
 * personagens ativos da mesa através do motor puro
 * `src/lib/character/rupture.ts` (Ruptura pendente/Integridade/Mana
 * máxima/Marca-Traço/Última Vontade), sem reimplementar regra nenhuma.
 * Mesmo padrão estrutural de `endRound.ts` (v0.44.1).
 *
 * `campaigns.current_round` NÃO é resetado ao encerrar cena — o código
 * já existente (`endScene`, v0.39) nunca fez isso, e este checkpoint
 * preserva esse comportamento (ver auditoria no relatório).
 *
 * Efeitos com duração "cena" (`expireSceneDurationEffects`): NÃO
 * implementado — não existe, hoje, nenhuma estrutura de efeito ativo
 * com metadado de duração estruturada (`ActiveCondition.duracao` é
 * texto livre, ex.: "cena inteira", nunca um enum/campo comparável).
 * Implementar isso exigiria inventar uma estrutura nova sem apoio no
 * schema atual — documentado como pendência, conforme instruído
 * ("se a estrutura não existir ou estiver ambígua, não implementar").
 */

import {
  normalizeCharacter,
  resolvePendingRupture,
  type Character,
} from "../character";
import { listCharactersForNarratorCampaign, updateCharacter } from "../character/storage";
import { getCampaign, canAdvanceCampaign, endScene as advanceCampaignScene, addLog } from "./storage";

export interface RuptureResolvedSummary {
  characterId: string;
  characterNome: string;
  profileId: string | null;
  ruptureLevel: number;
  integridadeAntes: number;
  integridadeDepois: number;
  manaMaxBonusAntes: number;
  manaMaxBonusDepois: number;
  manaBonusAplicado: number;
  pendingChoiceId?: string;
  ultimaVontadePendente: boolean;
  warnings: string[];
}

export interface ProcessedCharacterSceneSummary {
  characterId: string;
  characterNome: string;
  profileId: string | null;
  ruptureResolved: boolean;
  ruptureLevel: number;
  integridadeAntes: number;
  integridadeDepois: number;
  manaMaxBonusAntes: number;
  manaMaxBonusDepois: number;
  ultimaVontadePendente: boolean;
  warnings: string[];
}

export interface SkippedCharacterSceneSummary {
  characterId: string;
  characterNome: string;
  reason: string;
}

export interface CampaignEndSceneResult {
  campaignId: string;
  previousScene: number;
  nextScene: number;
  round: number;
  processedCharacters: ProcessedCharacterSceneSummary[];
  skippedCharacters: SkippedCharacterSceneSummary[];
  ruptureResolvedCount: number;
  integrityZeroCount: number;
  pendingChoiceCount: number;
  warnings: string[];
}

interface CampaignTableLog {
  type: string;
  payload: Record<string, unknown>;
}

/**
 * Resolve o motor de Ruptura pendente (v0.45) para cada personagem
 * ATIVO (não arquivado) vinculado à mesa, na cena `scene` ATUAL da
 * campanha. Nunca lança por causa de UM personagem — falhas viram
 * `SkippedCharacterSceneSummary`.
 */
export async function resolveCampaignEndSceneForCharacters(params: {
  campaignId: string;
  scene: number;
  nowIso: string;
}): Promise<{
  processedCharacters: ProcessedCharacterSceneSummary[];
  skippedCharacters: SkippedCharacterSceneSummary[];
  tableLogs: CampaignTableLog[];
  processedCharacterNames: string[];
  ruptureResolvedNames: string[];
}> {
  const { campaignId, scene, nowIso } = params;
  const allCharacters = await listCharactersForNarratorCampaign(campaignId);
  // Mesmo critério do dashboard (checkpoint v0.25) e de endRound.ts (v0.44.1).
  const activeCharacters = allCharacters.filter((record) => !record.archived_at);

  const processedCharacters: ProcessedCharacterSceneSummary[] = [];
  const skippedCharacters: SkippedCharacterSceneSummary[] = [];
  const tableLogs: CampaignTableLog[] = [];
  const processedCharacterNames: string[] = [];
  const ruptureResolvedNames: string[] = [];

  for (const record of activeCharacters) {
    try {
      const character = normalizeCharacter(record.payload);

      const result = resolvePendingRupture(character, { scene, nowIso });
      let nextCharacter: Character = result.character;

      if (result.resolved) {
        await updateCharacter(record.id, nextCharacter);
        ruptureResolvedNames.push(character.nome);

        tableLogs.push({
          type: "rupture_resolved",
          payload: {
            characterId: record.id,
            characterNome: character.nome,
            profileId: record.profile_id,
            scene,
            ruptureLevel: result.level,
            integrityBefore: result.integridadeAntes,
            integrityAfter: result.integridadeDepois,
            manaMaxBefore: result.manaMaxBonusAntes,
            manaMaxAfter: result.manaMaxBonusDepois,
            manaBonusApplied: result.manaBonusAplicado,
            pendingChoiceId: result.pendingChoiceId,
            ultimaVontadePendente: result.ultimaVontadePendente,
            source: "campaign_end_scene",
          },
        });
        tableLogs.push({
          type: "rupture_choice_created",
          payload: {
            characterId: record.id,
            characterNome: character.nome,
            profileId: record.profile_id,
            scene,
            ruptureLevel: result.level,
            pendingChoiceId: result.pendingChoiceId,
            source: "campaign_end_scene",
          },
        });
        if (result.ultimaVontadePendente && result.integridadeDepois === 0) {
          tableLogs.push({
            type: "integrity_zero_pending",
            payload: {
              characterId: record.id,
              characterNome: character.nome,
              profileId: record.profile_id,
              scene,
              integrityBefore: result.integridadeAntes,
              integrityAfter: result.integridadeDepois,
              source: "campaign_end_scene",
            },
          });
        }
      }
      // Sem Ruptura pendente: personagem ainda entra no resumo, mas não
      // é persistido de novo (nada mudou) nem gera log — evita escrita
      // desnecessária em todo personagem da mesa a cada cena.

      processedCharacters.push({
        characterId: record.id,
        characterNome: character.nome,
        profileId: record.profile_id,
        ruptureResolved: result.resolved,
        ruptureLevel: result.level,
        integridadeAntes: result.integridadeAntes,
        integridadeDepois: result.integridadeDepois,
        manaMaxBonusAntes: result.manaMaxBonusAntes,
        manaMaxBonusDepois: result.manaMaxBonusDepois,
        ultimaVontadePendente: result.ultimaVontadePendente,
        warnings: result.warnings,
      });
      processedCharacterNames.push(character.nome);
    } catch (err) {
      skippedCharacters.push({
        characterId: record.id,
        characterNome: record.name,
        reason: err instanceof Error ? err.message : "Falha desconhecida ao processar este personagem.",
      });
    }
  }

  return { processedCharacters, skippedCharacters, tableLogs, processedCharacterNames, ruptureResolvedNames };
}

/**
 * Encerra a cena CANÔNICA da mesa: resolve Ruptura pendente de todos
 * os personagens ativos (via `resolveCampaignEndSceneForCharacters`),
 * depois avança `campaigns.current_scene` (reaproveitando `endScene`,
 * v0.39 — regra de campanha intacta) e grava um `table_log` agregado
 * (`scene_end_processed`).
 *
 * Idempotência: mesma checagem otimista de `expectedScene` usada em
 * `endCampaignRound` (v0.44.1) — se a campanha já avançou de cena, a
 * chamada falha antes de tocar em qualquer personagem.
 */
export async function endCampaignScene(params: {
  campaignId: string;
  expectedScene?: number;
  nowIso?: string;
}): Promise<CampaignEndSceneResult> {
  const campaign = await getCampaign(params.campaignId);
  if (!campaign) {
    throw new Error(`Mesa "${params.campaignId}" não encontrada.`);
  }
  if (params.expectedScene != null && campaign.current_scene !== params.expectedScene) {
    throw new Error(
      `A cena da mesa já avançou (esperada ${params.expectedScene}, atual ${campaign.current_scene}) — recarregue a página e tente de novo.`,
    );
  }
  // Preflight (checkpoint pós-v0.58): aborta ANTES de processar Ruptura de
  // qualquer personagem se esta sessão não puder avançar `campaigns` (mesma
  // RLS endurecida na migration 0013). Evita estado parcial (Ruptura
  // resolvida em um personagem sem a cena avançar).
  if (!(await canAdvanceCampaign(params.campaignId))) {
    throw new Error("Esta sessão não pode avançar a campanha. Entre como narrador dono da mesa para confirmar.");
  }

  const scene = campaign.current_scene;
  const round = campaign.current_round;
  const nowIso = params.nowIso ?? new Date().toISOString();

  const { processedCharacters, skippedCharacters, tableLogs, processedCharacterNames, ruptureResolvedNames } =
    await resolveCampaignEndSceneForCharacters({ campaignId: params.campaignId, scene, nowIso });

  // Avança a cena da campanha SÓ DEPOIS de processar os personagens —
  // reaproveita endScene (v0.39); attentionSummary vira os nomes com
  // Ruptura resolvida (mesmo papel do antigo scene_rupture_pending,
  // agora já resolvida em vez de só avisada).
  const updatedCampaign = await advanceCampaignScene(params.campaignId, ruptureResolvedNames);
  const nextScene = updatedCampaign.current_scene;

  const ruptureResolvedCount = processedCharacters.filter((p) => p.ruptureResolved).length;
  const integrityZeroCount = processedCharacters.filter((p) => p.ruptureResolved && p.integridadeDepois === 0).length;
  const pendingChoiceCount = ruptureResolvedCount; // cada Ruptura resolvida cria exatamente 1 pendência de Marca/Traço.
  const warnings = processedCharacters.flatMap((p) => p.warnings);

  // Grava, best-effort, cada table_log individual (mesmo padrão de endRound.ts).
  for (const entry of tableLogs) {
    try {
      await addLog({
        campaignId: params.campaignId,
        characterId: typeof entry.payload.characterId === "string" ? entry.payload.characterId : undefined,
        profileId: typeof entry.payload.profileId === "string" ? entry.payload.profileId : null,
        type: entry.type,
        visibility: "public",
        payload: entry.payload,
      });
    } catch {
      // Best-effort.
    }
  }

  try {
    await addLog({
      campaignId: params.campaignId,
      type: "scene_end_processed",
      visibility: "public",
      payload: {
        campaignId: params.campaignId,
        previousScene: scene,
        nextScene,
        round,
        processedCharacterIds: processedCharacters.map((p) => p.characterId),
        processedCharacterNames,
        ruptureResolvedCount,
        pendingChoiceCount,
        expiredSceneEffectCount: 0,
        warnings,
        source: "campaign_end_scene",
      },
    });
  } catch {
    // Best-effort.
  }

  return {
    campaignId: params.campaignId,
    previousScene: scene,
    nextScene,
    round,
    processedCharacters,
    skippedCharacters,
    ruptureResolvedCount,
    integrityZeroCount,
    pendingChoiceCount,
    warnings,
  };
}
