import "server-only";

/**
 * Renovação de PA e Reações quando o narrador avança a rodada na trilha
 * do VTT.
 *
 * A trilha (`vtt_turn_tracks`) tem o próprio `paGasto` por participante,
 * mas a ficha guarda o seu em `estado_jogo.pa_gastos` — e até aqui só o
 * "Encerrar Rodada" da mesa antiga (`endRound.ts`) zerava esse contador.
 * No VTT ele nunca voltava: os gastos de todas as rodadas iam somando.
 *
 * Faz só a parte de recursos do fim de rodada canônico, pelos mesmos
 * redutores puros: PA renovado (com o crédito da Reserva Tática do
 * Caçador), Reações e penalidade de defesa sem Reação zeradas, e a
 * redução de PA das condições ativas já na rodada nova. Dano de
 * condição, Colapso e efeitos temporários continuam no Encerrar Rodada.
 *
 * Best-effort por personagem: falhar um não impede os outros, e nada
 * aqui desfaz o avanço da trilha, que já foi gravado.
 */

import {
  characterDerivedFormulas,
  computeDerivedStats,
  normalizeCharacter,
  normalizeConditionContent,
  resetRoundReactionState,
  applyRoundScopedPaReductions,
  type CharacterRulesPayload,
  type ConditionContent,
} from "../character";
import { listCharactersForNarratorCampaign, updateCharacter } from "../character/storage";
import { resetRoundPaWithClass } from "../character/classManagement";
import { getCharacterRules, listConditions } from "../content";
import { addLog } from "./storage";

export async function renovarRecursosDaRodadaVtt(params: {
  campaignId: string;
  characterIds: readonly string[];
  /** Rodada NOVA da trilha (a que acabou de começar). */
  rodada: number;
}): Promise<{ renovados: number; falhas: number }> {
  const ids = new Set(params.characterIds);
  if (ids.size === 0) return { renovados: 0, falhas: 0 };

  let regras: CharacterRulesPayload | null = null;
  try {
    const doc = await getCharacterRules();
    regras = (doc?.payload as CharacterRulesPayload | undefined) ?? null;
  } catch {
    // computeDerivedStats tem fallback interno.
  }
  let conditions: ConditionContent[] = [];
  try {
    const docs = await listConditions();
    conditions = docs.map((doc) => normalizeConditionContent(doc.payload as Record<string, unknown>));
  } catch {
    // Sem Biblioteca: PA e Reações renovam do mesmo jeito, só sem redução por condição.
  }

  const registros = (await listCharactersForNarratorCampaign(params.campaignId))
    .filter((r) => ids.has(r.id) && !r.archived_at);

  let renovados = 0;
  let falhas = 0;
  for (const record of registros) {
    try {
      const character = normalizeCharacter(record.payload);
      const derived = computeDerivedStats(character.atributos, regras, undefined, characterDerivedFormulas(character));
      const renovado = resetRoundReactionState(resetRoundPaWithClass(character));
      const reducao = applyRoundScopedPaReductions({
        character: renovado,
        conditions,
        paMax: derived.pa_max,
        round: params.rodada,
        scene: character.current_scene ?? 1,
      });
      await updateCharacter(record.id, reducao.character);
      renovados++;
      for (const entry of reducao.tableLogs) {
        await addLog({
          campaignId: params.campaignId,
          characterId: record.id,
          type: entry.type,
          visibility: "public",
          payload: { ...entry.payload, characterId: record.id, characterNome: character.nome },
        }).catch(() => undefined);
      }
    } catch {
      falhas++;
    }
  }
  return { renovados, falhas };
}
