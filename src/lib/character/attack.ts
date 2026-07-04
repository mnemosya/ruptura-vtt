/**
 * Ataque contestado básico — checkpoint v0.47 (PRD 8.1/8.6).
 *
 * Escopo explícito e deliberadamente pequeno: resolve
 * "atacante rola vs. defensor rola, maior total vence" e aplica dano
 * DIRETO ao PV do alvo quando o atacante vence. Nenhum sistema de arma
 * ainda existe (inventário é v0.49) — a fórmula/tipo de dano são
 * informados manualmente por quem resolve o ataque (narrador, hoje só
 * pela mesa — ver `MesaDetailClient.tsx`), nunca inventados aqui.
 *
 * Fora de escopo, documentado no relatório (PRD 8.7/8.8, seções ainda
 * não implementadas por nenhum checkpoint anterior):
 * MIT, PD, região do corpo, propriedades críticas, cobertura, terreno,
 * modificadores ambientais, aplicação de condição por propriedade de
 * arma/magia (dano ígneo crítico sozinho NUNCA aplica Queimando aqui).
 *
 * Módulo puro: nunca acessa Supabase, nunca decide UI.
 */

import { detectCollapseOnResourceChange, resolveCollapseAdditionalDamage } from "./collapse";
import type { Character, CollapseRulesPayload } from "./types";

export interface ContestedRollResult {
  attackerTotal: number;
  defenderTotal: number;
  /** attackerTotal - defenderTotal. */
  margin: number;
  /**
   * Empate (margin === 0) favorece o DEFENSOR — decisão de produto
   * deste checkpoint (o PRD não especifica desempate de ataque
   * contestado); documentada aqui por ser a única regra nova
   * inventada neste módulo.
   */
  attackerWins: boolean;
}

/** Compara dois totais já rolados (ex.: via `rollPericia`, `lib/dice`) — nunca rola dado sozinho. */
export function resolveContestedRoll(attackerTotal: number, defenderTotal: number): ContestedRollResult {
  const margin = attackerTotal - defenderTotal;
  return { attackerTotal, defenderTotal, margin, attackerWins: margin > 0 };
}

/** Rola "NdM" (ex.: "1d6+2") com RNG injetável — mesmo padrão de `endRoundConditions.ts`/`overload.ts` (sem acoplar ao parser genérico de `lib/dice`, que não aceita RNG injetável). */
export function rollDamageFormula(formula: string, rng: () => number = Math.random): number {
  const cleaned = formula.trim().replace(/\s+/g, "");
  const match = /^(\d+)d(\d+)([+-]\d+)?$/.exec(cleaned);
  if (!match) return 0;
  const quantidade = Number(match[1]);
  const lados = Number(match[2]);
  const modificador = match[3] ? Number(match[3]) : 0;
  let total = 0;
  for (let i = 0; i < quantidade; i++) {
    total += 1 + Math.floor(rng() * lados);
  }
  return Math.max(0, total + modificador);
}

export interface AttackDamageResult {
  character: Character;
  rollResult: number;
  formula: string;
  damageType: string;
  pvBefore: number;
  pvAfter: number;
  collapseStarted: boolean;
  collapseTipo: "pv" | "pe" | null;
  collapseWarnings: string[];
  /** Logs/tableLogs do avanço de Colapso por "dano adicional da mesma dimensão" (checkpoint v0.52) — vazio quando não aplicável. */
  collapseAdvanceLogs: string[];
  collapseAdvanceTableLogs: { type: string; payload: Record<string, unknown> }[];
}

/**
 * Aplica dano de ataque DIRETO ao PV do alvo (nunca MIT/PD/armadura) e
 * aciona a lógica de Colapso já existente (`detectCollapseOnResourceChange`,
 * v0.38) quando o PV chega a 0. Se o alvo já estava em Colapso de PV
 * ANTES deste ataque, o dano conta como "dano adicional da mesma
 * dimensão" (checkpoint v0.52, `resolveCollapseAdditionalDamage`) e
 * pode avançar o segmento — `collapseRules` (opcional) é a fonte
 * canônica; sem ela, o avanço simplesmente não é aplicado (fallback
 * defensivo, nunca inventa regra).
 */
export function applyAttackDamage(params: {
  character: Character;
  formula: string;
  damageType: string;
  nowIso: string;
  rng?: () => number;
  collapseRules?: CollapseRulesPayload | null;
  round?: number;
  scene?: number;
}): AttackDamageResult {
  const rollResult = rollDamageFormula(params.formula, params.rng);
  const pvBefore = params.character.recursos_atuais?.pv ?? 0;
  const peAtual = params.character.recursos_atuais?.pe ?? 0;
  const pvAfter = Math.max(0, pvBefore - rollResult);

  const withDamage: Character = {
    ...params.character,
    recursos_atuais: { ...params.character.recursos_atuais, pv: pvAfter },
  };
  const collapse = detectCollapseOnResourceChange(
    withDamage,
    { pv: pvBefore, pe: peAtual },
    { pv: pvAfter, pe: peAtual },
    params.nowIso,
  );

  let finalCharacter = collapse.character;
  let collapseAdvanceLogs: string[] = [];
  let collapseAdvanceTableLogs: { type: string; payload: Record<string, unknown> }[] = [];
  if (!collapse.started && !collapse.ended && rollResult > 0) {
    const additional = resolveCollapseAdditionalDamage({
      character: finalCharacter,
      resource: "pv",
      damageAmount: rollResult,
      rules: params.collapseRules,
      round: params.round,
      scene: params.scene,
      nowIso: params.nowIso,
      rng: params.rng,
    });
    finalCharacter = additional.character;
    collapseAdvanceLogs = additional.logs;
    collapseAdvanceTableLogs = additional.tableLogs;
  }

  return {
    character: finalCharacter,
    rollResult,
    formula: params.formula,
    damageType: params.damageType,
    pvBefore,
    pvAfter,
    collapseStarted: collapse.started,
    collapseTipo: collapse.tipo,
    collapseWarnings: collapse.warnings,
    collapseAdvanceLogs,
    collapseAdvanceTableLogs,
  };
}
