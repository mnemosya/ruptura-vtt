"use server";

/**
 * Encerrar Rodada CANÔNICO da mesa — checkpoint v0.44.1.
 *
 * A rodada/cena da CAMPANHA (`campaigns.current_round`/`current_scene`,
 * migration 0017, checkpoint v0.39) passam a ser a fonte de verdade —
 * este módulo processa TODOS os personagens vinculados/ativos da mesa
 * usando o motor puro já existente (`src/lib/character/endRoundConditions.ts`,
 * checkpoint v0.44), sem reimplementar nenhuma regra de condição.
 *
 * Não substitui a rodada LOCAL da ficha (`Character.current_round`,
 * v0.44) — este módulo simplesmente ESCREVE por cima dela com o valor
 * canônico da campanha ao processar (mesmo padrão de "a campanha é
 * quem manda"), deixando a ficha sempre consistente após reload.
 */

import {
  computeDerivedStats,
  getActiveConditionIds,
  normalizeCharacter,
  normalizeConditionContent,
  resetRoundReactionState,
  resolveEndRoundConditionsForCharacter,
  applyRoundScopedPaReductions,
  type Character,
  type CharacterRulesPayload,
  type ConditionContent,
} from "../character";
import { listCharactersForNarratorCampaign, updateCharacter } from "../character/storage";
import { getCharacterRules, listConditions } from "../content";
import { getCampaign, endRound as advanceCampaignRound, addLog } from "./storage";

/** Slugs de condição com gatilho de fim de rodada (mesmo piso mínimo de ActiveStateStrip/MesaDetailClient, v0.35/v0.39). */
const FIM_DE_RODADA_SLUGS = new Set(["queimando", "sangrando", "envenenado", "insaturado", "saturado"]);

export interface ProcessedCharacterSummary {
  characterId: string;
  characterNome: string;
  profileId: string | null;
  pvBefore: number;
  pvAfter: number;
  paBefore: number;
  paAfter: number;
  reactionsBefore: number;
  reactionsAfter: number;
  activeConditionsBefore: string[];
  activeConditionsAfter: string[];
  damageEvents: number;
  pendingChecks: number;
  paReductions: number;
  warnings: string[];
}

export interface SkippedCharacterSummary {
  characterId: string;
  characterNome: string;
  reason: string;
}

export interface CampaignEndRoundResult {
  campaignId: string;
  previousRound: number;
  nextRound: number;
  scene: number;
  processedCharacters: ProcessedCharacterSummary[];
  skippedCharacters: SkippedCharacterSummary[];
  damageEventCount: number;
  pendingCheckCount: number;
  appliedConditionCount: number;
  removedConditionCount: number;
  paReductionCount: number;
  warnings: string[];
}

interface CampaignTableLog {
  type: string;
  payload: Record<string, unknown>;
}

/**
 * Resolve o motor de fim de rodada (v0.44) para cada personagem ATIVO
 * (não arquivado) vinculado à mesa, na ordem operacional pedida:
 *   A. resolve efeitos da rodada `round`/cena `scene` ATUAIS;
 *   B. renova PA (`pa_gastos=0`);
 *   C. renova Reações + zera penalidade de defesa sem Reação (v0.43);
 *   D. aplica redução de PA por condição já na rodada `round+1`;
 *   E. persiste o personagem (payload inteiro, via `updateCharacter`).
 * Nunca lança por causa de UM personagem — falhas individuais viram
 * `SkippedCharacterSummary`, sem interromper os demais.
 */
export async function resolveCampaignEndRoundForCharacters(params: {
  campaignId: string;
  round: number;
  scene: number;
  regras: CharacterRulesPayload | null;
  conditions: ConditionContent[];
  nowIso: string;
  rng?: () => number;
}): Promise<{
  processedCharacters: ProcessedCharacterSummary[];
  skippedCharacters: SkippedCharacterSummary[];
  tableLogs: CampaignTableLog[];
  processedCharacterNames: string[];
  attentionCharacterNames: string[];
}> {
  const { campaignId, round, scene, regras, conditions, nowIso } = params;
  const allCharacters = await listCharactersForNarratorCampaign(campaignId);
  // Mesmo critério do dashboard (checkpoint v0.25): só personagens
  // ativos (não arquivados) participam do ciclo de jogo.
  const activeCharacters = allCharacters.filter((record) => !record.archived_at);

  const processedCharacters: ProcessedCharacterSummary[] = [];
  const skippedCharacters: SkippedCharacterSummary[] = [];
  const tableLogs: CampaignTableLog[] = [];
  const processedCharacterNames: string[] = [];
  const attentionCharacterNames: string[] = [];

  for (const record of activeCharacters) {
    try {
      const character = normalizeCharacter(record.payload);
      const derived = computeDerivedStats(character.atributos, regras);

      const pvBefore = character.recursos_atuais?.pv ?? 0;
      const paBefore = Math.max(0, derived.pa_max - (character.estado_jogo?.pa_gastos ?? 0));
      const reactionsBefore = Math.max(0, derived.reacoes_por_rodada - (character.estado_jogo?.reacoes_usadas ?? 0));
      const conditionsBefore = getActiveConditionIds(character);

      // A. Resolve efeitos da rodada/cena ATUAIS da campanha.
      const resolved = resolveEndRoundConditionsForCharacter({
        character,
        conditions,
        round,
        scene,
        nowIso,
        rng: params.rng,
      });

      // B/C. Renova PA e Reações; zera penalidade de defesa sem Reação.
      let nextCharacter: Character = { ...resolved.character, estado_jogo: { ...resolved.character.estado_jogo, pa_gastos: 0 } };
      nextCharacter = resetRoundReactionState(nextCharacter);

      // D. Redução de PA por condição, já na rodada nova.
      const paReduction = applyRoundScopedPaReductions({
        character: nextCharacter,
        conditions,
        paMax: derived.pa_max,
        round: round + 1,
        scene,
      });
      // A rodada CANÔNICA passa a ser a da campanha — sobrescreve o
      // contador local (`current_round`) que a ficha usa isoladamente.
      nextCharacter = { ...paReduction.character, current_round: round + 1, current_scene: scene };

      // E. Persiste.
      await updateCharacter(record.id, nextCharacter);

      const paAfter = Math.max(0, derived.pa_max - (nextCharacter.estado_jogo?.pa_gastos ?? 0));
      const reactionsAfter = Math.max(0, derived.reacoes_por_rodada - (nextCharacter.estado_jogo?.reacoes_usadas ?? 0));
      const conditionsAfter = getActiveConditionIds(nextCharacter);
      const pvAfter = nextCharacter.recursos_atuais?.pv ?? 0;

      processedCharacters.push({
        characterId: record.id,
        characterNome: character.nome,
        profileId: record.profile_id,
        pvBefore,
        pvAfter,
        paBefore,
        paAfter,
        reactionsBefore,
        reactionsAfter,
        activeConditionsBefore: conditionsBefore,
        activeConditionsAfter: conditionsAfter,
        damageEvents: resolved.damageEvents.length,
        pendingChecks: resolved.pendingChecks.length,
        paReductions: paReduction.reductions.length,
        warnings: resolved.warnings,
      });
      processedCharacterNames.push(character.nome);
      if (
        resolved.damageEvents.length > 0 ||
        resolved.pendingChecks.length > 0 ||
        conditionsAfter.some((slug) => FIM_DE_RODADA_SLUGS.has(slug))
      ) {
        attentionCharacterNames.push(character.nome);
      }

      for (const entry of [...resolved.tableLogs, ...paReduction.tableLogs]) {
        tableLogs.push({
          type: entry.type,
          payload: { ...entry.payload, characterId: record.id, characterNome: character.nome, profileId: record.profile_id },
        });
      }
    } catch (err) {
      skippedCharacters.push({
        characterId: record.id,
        characterNome: record.name,
        reason: err instanceof Error ? err.message : "Falha desconhecida ao processar este personagem.",
      });
    }
  }

  return { processedCharacters, skippedCharacters, tableLogs, processedCharacterNames, attentionCharacterNames };
}

/**
 * Encerra a rodada CANÔNICA da mesa: processa todos os personagens
 * ativos (via `resolveCampaignEndRoundForCharacters`), depois avança
 * `campaigns.current_round` (reaproveitando `endRound`, v0.39 — nenhuma
 * regra de campanha é reimplementada aqui) e grava um `table_log`
 * agregado (`round_end_processed`).
 *
 * Idempotência: `expectedRound`, quando informado pelo chamador (o
 * `current_round` que a UI tinha na hora do clique), é comparado com o
 * valor real lido do banco — se a campanha já avançou (outro clique já
 * processou, ou outra aba do narrador), a chamada falha com erro claro
 * em vez de processar a rodada errada de novo. Isso NÃO é uma
 * transação atômica no Postgres (ver pendência do relatório) — é uma
 * checagem otimista, suficiente para o cenário de um único narrador
 * clicando duas vezes ou dando F5 no meio do processamento.
 */
export async function endCampaignRound(params: {
  campaignId: string;
  expectedRound?: number;
  nowIso?: string;
  rng?: () => number;
}): Promise<CampaignEndRoundResult> {
  const campaign = await getCampaign(params.campaignId);
  if (!campaign) {
    throw new Error(`Mesa "${params.campaignId}" não encontrada.`);
  }
  if (params.expectedRound != null && campaign.current_round !== params.expectedRound) {
    throw new Error(
      `A rodada da mesa já avançou (esperada ${params.expectedRound}, atual ${campaign.current_round}) — recarregue a página e tente de novo.`,
    );
  }

  const round = campaign.current_round;
  const scene = campaign.current_scene;
  const nowIso = params.nowIso ?? new Date().toISOString();

  let regras: CharacterRulesPayload | null = null;
  try {
    const doc = await getCharacterRules();
    regras = (doc?.payload as CharacterRulesPayload | undefined) ?? null;
  } catch {
    // computeDerivedStats já tem fallback interno — segue sem travar o encerramento.
  }

  let conditions: ConditionContent[] = [];
  try {
    const docs = await listConditions();
    conditions = docs.map((doc) => normalizeConditionContent(doc.payload as Record<string, unknown>));
  } catch {
    // Biblioteca fora do ar — motor não encontra nenhum efeito, mas PA/Reações ainda renovam.
  }

  const { processedCharacters, skippedCharacters, tableLogs, processedCharacterNames, attentionCharacterNames } =
    await resolveCampaignEndRoundForCharacters({
      campaignId: params.campaignId,
      round,
      scene,
      regras,
      conditions,
      nowIso,
      rng: params.rng,
    });

  // Avança a rodada da campanha SÓ DEPOIS de processar os personagens
  // (ordem operacional A→E) — reaproveita endRound (v0.39) sem alterar
  // sua regra; attentionSummary reusa o mesmo critério de antes.
  const updatedCampaign = await advanceCampaignRound(params.campaignId, attentionCharacterNames);
  const nextRound = updatedCampaign.current_round;

  const damageEventCount = processedCharacters.reduce((sum, p) => sum + p.damageEvents, 0);
  const pendingCheckCount = processedCharacters.reduce((sum, p) => sum + p.pendingChecks, 0);
  const paReductionCount = processedCharacters.reduce((sum, p) => sum + p.paReductions, 0);
  const appliedConditionCount = tableLogs.filter((l) => l.type === "condition_applied").length;
  const removedConditionCount = tableLogs.filter((l) => l.type === "condition_removed").length;
  const warnings = processedCharacters.flatMap((p) => p.warnings);

  // Grava, best-effort, cada table_log individual gerado pelo motor
  // (dano, pendência criada, condição aplicada/removida, redução de PA)
  // — mesmo padrão best-effort de handleUseAction/handleAddCondition da
  // ficha: falha ao gravar log não desfaz o que já foi persistido.
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
      type: "round_end_processed",
      visibility: "public",
      payload: {
        campaignId: params.campaignId,
        previousRound: round,
        nextRound,
        scene,
        processedCharacterIds: processedCharacters.map((p) => p.characterId),
        processedCharacterNames,
        damageCount: damageEventCount,
        pendingCheckCount,
        appliedConditionCount,
        removedConditionCount,
        paReductionCount,
        warnings,
        source: "campaign_end_round",
      },
    });
  } catch {
    // Best-effort — o processamento já foi concluído e persistido.
  }

  return {
    campaignId: params.campaignId,
    previousRound: round,
    nextRound,
    scene,
    processedCharacters,
    skippedCharacters,
    damageEventCount,
    pendingCheckCount,
    appliedConditionCount,
    removedConditionCount,
    paReductionCount,
    warnings,
  };
}
