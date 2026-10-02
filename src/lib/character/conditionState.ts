import type { ActiveCondition } from "./types";

/** Limites canônicos das condições cumulativas de RUPTURA v1.2. */
export const CONDITION_LEVEL_CAPS_V12 = {
  contundido: 2,
  envenenado: 3,
  lento: 2,
  ofuscado: 2,
  queimando: 3,
  sangrando: 3,
} as const;

export type CumulativeConditionSlugV12 = keyof typeof CONDITION_LEVEL_CAPS_V12;

export function getConditionLevelCap(conditionId: string | null | undefined): number | undefined {
  if (!conditionId) return undefined;
  return CONDITION_LEVEL_CAPS_V12[conditionId as CumulativeConditionSlugV12];
}

export function getConditionLevel(condition: Pick<ActiveCondition, "nivel">): number {
  return Math.max(1, Math.trunc(condition.nivel ?? 1));
}

export function reduceConditionLevel(
  condition: ActiveCondition,
  amount: number,
  nowIso: string,
  removedOrigin?: ActiveCondition["removidaOrigem"],
): ActiveCondition {
  if (!condition.ativa) return condition;
  const nextLevel = getConditionLevel(condition) - Math.max(0, Math.trunc(amount));
  if (nextLevel >= 1) return { ...condition, nivel: nextLevel };
  return {
    ...condition,
    nivel: 0,
    ativa: false,
    removidaEm: nowIso,
    removidaOrigem: removedOrigin,
  };
}

export function conditionFormulaForLevel(
  effect: Record<string, unknown>,
  condition: Pick<ActiveCondition, "nivel">,
): string | undefined {
  const byLevel = effect.dano_por_nivel;
  if (byLevel && typeof byLevel === "object" && !Array.isArray(byLevel)) {
    const formula = (byLevel as Record<string, unknown>)[String(getConditionLevel(condition))];
    if (typeof formula === "string") return formula;
  }
  return typeof effect.dano === "string" ? effect.dano : undefined;
}
