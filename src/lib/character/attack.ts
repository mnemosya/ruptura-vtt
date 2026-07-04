/**
 * Ataque contestado básico — checkpoint v0.47 (PRD 8.1/8.6).
 *
 * Escopo explícito e deliberadamente pequeno: resolve
 * "atacante rola vs. defensor rola, maior total vence" e aplica dano
 * DIRETO ao PV do alvo quando o atacante vence. A arma usada pode ser
 * identificada apenas para lembretes de propriedades críticas; fórmula
 * e tipo de dano continuam manuais e nunca são inferidos aqui.
 *
 * Fora de escopo, documentado no relatório (PRD 8.7/8.8, seções ainda
 * não implementadas por nenhum checkpoint anterior):
 * MIT, PD, região do corpo, resolução automática de propriedades críticas, cobertura, terreno,
 * modificadores ambientais, aplicação de condição por propriedade de
 * arma/magia (dano ígneo crítico sozinho NUNCA aplica Queimando aqui).
 *
 * Módulo puro: nunca acessa Supabase, nunca decide UI.
 */

import { detectCollapseOnResourceChange, resolveCollapseAdditionalDamage } from "./collapse";
import type { Character, CollapseRulesPayload } from "./types";
import {
  deriveItemProperties,
  type InventoryItemInstance,
  type ItemContent,
} from "./inventory";
import type { TechnicalContentItem } from "../content";

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

export interface AttackCriticalRules {
  minMargin: number | null;
  valid: boolean;
  invalidReason?: string;
}

export interface CriticalItemPropertySuggestion {
  id: string;
  slug: string;
  name: string;
  text: string;
  origins: string[];
  automatic: false;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Formata sugestões persistidas em log sem despejar JSON bruto. */
export function formatCriticalItemPropertySuggestions(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const formatted = value
    .map(asRecord)
    .filter((suggestion): suggestion is Record<string, unknown> => suggestion !== null)
    .map((suggestion) => {
      const name = typeof suggestion.name === "string" ? suggestion.name : null;
      const text = typeof suggestion.text === "string" ? suggestion.text : null;
      if (!name) return null;
      return text && text !== name ? `${name}: ${text}` : name;
    })
    .filter((suggestion): suggestion is string => suggestion !== null);
  return formatted.length > 0 ? `Propriedades críticas: ${formatted.join(" · ")} (aplicação manual).` : null;
}

/** Lê o limiar crítico do `combat_field.regiao_corpo_ataque`, sem fallback numérico inventado. */
export function normalizeAttackCriticalRules(combatField: unknown): AttackCriticalRules {
  const root = asRecord(combatField);
  const bodyRegion = asRecord(root?.regiao_corpo_ataque);
  const margins = Array.isArray(bodyRegion?.margens) ? bodyRegion.margens : [];
  const critical = margins.map(asRecord).find((margin) => margin?.id === "sucesso_critico");
  const interval = critical?.intervalo_margem;
  if (
    !Array.isArray(interval) ||
    typeof interval[0] !== "number" ||
    !Number.isFinite(interval[0])
  ) {
    return {
      minMargin: null,
      valid: false,
      invalidReason: "Limiar de sucesso crítico ausente ou inválido no combat_field.",
    };
  }
  return { minMargin: interval[0], valid: true };
}

/**
 * Sugere apenas propriedades críticas da instância explicitamente usada.
 * Nunca aplica condição, dano extra, resistência, movimento ou MIT.
 */
export function deriveCriticalItemPropertySuggestions(params: {
  margin: number;
  rules: AttackCriticalRules;
  itemInstance?: InventoryItemInstance;
  itemContent?: ItemContent;
  properties: TechnicalContentItem[];
  runes?: TechnicalContentItem[];
}): CriticalItemPropertySuggestion[] {
  if (
    !params.rules.valid ||
    params.rules.minMargin == null ||
    params.margin < params.rules.minMargin ||
    !params.itemInstance
  ) {
    return [];
  }

  return deriveItemProperties({
    instance: params.itemInstance,
    item: params.itemContent,
    properties: params.properties,
    runes: params.runes,
  })
    .filter((property) => property.critical)
    .map((property) => ({
      id: property.id,
      slug: property.slug,
      name: property.label,
      text: property.description ?? property.label,
      origins: property.sources.map((source) => source.label),
      automatic: false as const,
    }));
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
