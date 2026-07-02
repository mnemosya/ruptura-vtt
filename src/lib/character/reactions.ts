/**
 * Economia defensiva de Reações — checkpoint v0.43.
 *
 * A regra vem do singleton `combat_flow`. Este módulo é puro: interpreta
 * o payload, consulta o estado do personagem e devolve transições sem
 * acessar Supabase ou decidir UI.
 */

import type { ActiveEffect } from "./activeEffects";
import type { Character } from "./types";

export interface ReactionRules {
  actionsConsumeReaction: boolean;
  allowDefenseWithoutReaction: boolean;
  cumulativePenalty: number;
  resetAt: string;
  valid: boolean;
  invalidReason?: string;
}

export interface ReactionAvailability {
  remaining: number;
  used: number;
  max: number;
  defensesWithoutReaction: number;
  currentOverflowPenalty: number;
  nextOverflowPenalty: number;
}

export interface CanUseReactionResult {
  ok: boolean;
  defenseWithoutReaction: boolean;
  penaltyApplied: number;
  reason?: string;
}

export interface ReactionSpendResult {
  character: Character;
  reactionBefore: number;
  reactionAfter: number;
  usedReaction: boolean;
  defenseWithoutReaction: boolean;
  defensesWithoutReactionBefore: number;
  defensesWithoutReactionAfter: number;
  penaltyApplied: number;
  warnings: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function normalizeReactionCounter(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : 0;
}

/** Interpreta estritamente `combat_flow.payload.reacoes`; inválido falha fechado. */
export function normalizeReactionRules(combatFlowPayload: unknown): ReactionRules {
  const root = asRecord(combatFlowPayload);
  const reaction = asRecord(root?.reacoes);
  const withoutReaction = asRecord(reaction?.sem_reacao_disponivel);
  const maximumPerRound = asRecord(reaction?.max_por_rodada);
  const cumulativePenalty = withoutReaction?.penalidade_cumulativa;
  const resetAt = reaction?.reseta_em;
  const zeroAt = withoutReaction?.zera_em;

  const valid =
    maximumPerRound?.ref === "atributo" &&
    maximumPerRound?.id === "mente" &&
    reaction?.acoes_defensivas_consumem_reacao === true &&
    withoutReaction?.defesa_ainda_permitida === true &&
    typeof cumulativePenalty === "number" &&
    Number.isFinite(cumulativePenalty) &&
    cumulativePenalty < 0 &&
    withoutReaction?.escopo === "rodada" &&
    resetAt === "inicio_da_rodada" &&
    zeroAt === "inicio_da_rodada";

  if (!valid) {
    return {
      actionsConsumeReaction: false,
      allowDefenseWithoutReaction: false,
      cumulativePenalty: 0,
      resetAt: "",
      valid: false,
      invalidReason:
        "Regras de Reação indisponíveis ou incompatíveis no fluxo de combate.",
    };
  }

  return {
    actionsConsumeReaction: true,
    allowDefenseWithoutReaction: true,
    cumulativePenalty,
    resetAt,
    valid: true,
  };
}

export function getReactionAvailability(
  character: Pick<Character, "estado_jogo">,
  reactionMax: number | undefined,
  rules: ReactionRules,
): ReactionAvailability {
  const max = normalizeReactionCounter(reactionMax);
  const used = Math.min(max, normalizeReactionCounter(character.estado_jogo?.reacoes_usadas));
  const defensesWithoutReaction = normalizeReactionCounter(
    character.estado_jogo?.defesas_sem_reacao,
  );
  return {
    remaining: Math.max(0, max - used),
    used,
    max,
    defensesWithoutReaction,
    currentOverflowPenalty: rules.valid
      ? defensesWithoutReaction * rules.cumulativePenalty
      : 0,
    nextOverflowPenalty: rules.valid
      ? (defensesWithoutReaction + 1) * rules.cumulativePenalty
      : 0,
  };
}

export function canUseReactionAction(
  character: Pick<Character, "estado_jogo">,
  reactionMax: number | undefined,
  rules: ReactionRules,
  reactionCost = 1,
): CanUseReactionResult {
  if (reactionCost !== 1) {
    return {
      ok: false,
      defenseWithoutReaction: false,
      penaltyApplied: 0,
      reason: "Defesa sem Reação só suporta custo canônico de 1 Reação.",
    };
  }

  const availability = getReactionAvailability(character, reactionMax, rules);
  if (availability.remaining >= reactionCost) {
    return { ok: true, defenseWithoutReaction: false, penaltyApplied: 0 };
  }
  if (!rules.valid) {
    return {
      ok: false,
      defenseWithoutReaction: false,
      penaltyApplied: 0,
      reason: rules.invalidReason ?? "Regras de Reação indisponíveis.",
    };
  }
  if (rules.allowDefenseWithoutReaction) {
    return {
      ok: true,
      defenseWithoutReaction: true,
      penaltyApplied: availability.nextOverflowPenalty,
    };
  }
  return {
    ok: false,
    defenseWithoutReaction: false,
    penaltyApplied: 0,
    reason: "Sem Reação disponível.",
  };
}

export function spendReactionForDefense(
  character: Character,
  reactionMax: number | undefined,
  rules: ReactionRules,
  reactionCost = 1,
): ReactionSpendResult {
  const availability = getReactionAvailability(character, reactionMax, rules);
  const canUse = canUseReactionAction(character, reactionMax, rules, reactionCost);
  if (!canUse.ok) {
    return {
      character,
      reactionBefore: availability.remaining,
      reactionAfter: availability.remaining,
      usedReaction: false,
      defenseWithoutReaction: false,
      defensesWithoutReactionBefore: availability.defensesWithoutReaction,
      defensesWithoutReactionAfter: availability.defensesWithoutReaction,
      penaltyApplied: 0,
      warnings: [canUse.reason ?? "Ação defensiva não pôde ser executada."],
    };
  }

  if (!canUse.defenseWithoutReaction) {
    return {
      character: {
        ...character,
        estado_jogo: {
          ...character.estado_jogo,
          reacoes_usadas: availability.used + reactionCost,
          defesas_sem_reacao: availability.defensesWithoutReaction,
        },
      },
      reactionBefore: availability.remaining,
      reactionAfter: availability.remaining - reactionCost,
      usedReaction: true,
      defenseWithoutReaction: false,
      defensesWithoutReactionBefore: availability.defensesWithoutReaction,
      defensesWithoutReactionAfter: availability.defensesWithoutReaction,
      penaltyApplied: 0,
      warnings: [],
    };
  }

  const nextOverflowCount = availability.defensesWithoutReaction + 1;
  return {
    character: {
      ...character,
      estado_jogo: {
        ...character.estado_jogo,
        reacoes_usadas: availability.used,
        defesas_sem_reacao: nextOverflowCount,
      },
    },
    reactionBefore: 0,
    reactionAfter: 0,
    usedReaction: false,
    defenseWithoutReaction: true,
    defensesWithoutReactionBefore: availability.defensesWithoutReaction,
    defensesWithoutReactionAfter: nextOverflowCount,
    penaltyApplied: canUse.penaltyApplied,
    warnings: [],
  };
}

export function undoLastReactionUse(character: Character): Character {
  const overflow = normalizeReactionCounter(character.estado_jogo?.defesas_sem_reacao);
  if (overflow > 0) {
    return {
      ...character,
      estado_jogo: {
        ...character.estado_jogo,
        defesas_sem_reacao: overflow - 1,
      },
    };
  }
  const used = normalizeReactionCounter(character.estado_jogo?.reacoes_usadas);
  return {
    ...character,
    estado_jogo: {
      ...character.estado_jogo,
      reacoes_usadas: Math.max(0, used - 1),
    },
  };
}

export function resetRoundReactionState(character: Character): Character {
  return {
    ...character,
    estado_jogo: {
      ...character.estado_jogo,
      reacoes_usadas: 0,
      defesas_sem_reacao: 0,
    },
  };
}

export function deriveReactionDefenseEffect(
  character: Pick<Character, "estado_jogo">,
  rules: ReactionRules,
): ActiveEffect | null {
  const count = normalizeReactionCounter(character.estado_jogo?.defesas_sem_reacao);
  if (!rules.valid || count === 0) return null;
  const modifier = count * rules.cumulativePenalty;
  return {
    id: "reaction-overflow:defense",
    sourceType: "reaction_overflow",
    sourceId: "combat_flow:sem_reacao_disponivel",
    sourceName: `Defesa sem Reação ${modifier}`,
    affectedTags: ["defensiva", "reacao"],
    modifier,
    explanation: `${count}ª defesa sem Reação nesta rodada: ${modifier}.`,
    enabledByDefault: true,
    kind: "modifier",
    reversible: true,
  };
}
