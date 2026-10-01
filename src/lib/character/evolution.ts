/**
 * Histórico de ajustes permanentes (botão "Ajustar" da ficha).
 *
 * Na RUPTURA v1.2 a progressão é o avanço de Ranking
 * (`lib/rulesetV12/progression.ts`); PM saiu na Fase 10 da migração. O que
 * fica aqui é só o registro de correções de atributo e perícia feitas pelo
 * "Ajustar". Módulo puro: sempre devolve um novo `Character`.
 */

import type { Character, EvolutionHistoryEntry } from "./types";

function pushHistorico(character: Character, entry: EvolutionHistoryEntry): EvolutionHistoryEntry[] {
  return [...(character.historico_evolucao ?? []), entry];
}

/**
 * Registra um ajuste permanente de atributo/perícia feito em Modo
 * Evolução (checkpoint v0.40, item 4 do pedido) — sem custo de PM
 * fechado ainda (`quantidade: 0`), só o rastro auditável de
 * antes/depois. Chamado automaticamente por `updateAtributo`/
 * `updatePericia` sempre que o valor muda em Modo Evolução — não
 * exige um prompt de confirmação separado (mantém a edição fluida).
 */
export function logPermanentAdjustment(
  character: Character,
  campoAfetado: string,
  antes: number,
  depois: number,
  descricao: string,
  nowIso: string,
): Character {
  if (antes === depois) return character;
  const entry: EvolutionHistoryEntry = {
    id: crypto.randomUUID(),
    tipo: "ajuste",
    quantidade: 0,
    descricao,
    campoAfetado,
    antes,
    depois,
    criadoEm: nowIso,
    criadoPor: "character_sheet",
  };
  return { ...character, historico_evolucao: pushHistorico(character, entry) };
}
