/**
 * Mutacoes puras usadas pelos controles de combate do Console e pelo
 * HUD do VTT. Este modulo concentra as regras que antes ficavam
 * acopladas aos handlers React de CharacterSheetClient: os componentes
 * escolhem a intencao, esta funcao calcula o proximo Character e a
 * camada chamadora decide estado otimista, log e persistencia.
 */

import { applyAutoHealRemoval } from "./autoHeal";
import { detectCollapseOnResourceChange, resolveCollapseAdditionalDamage } from "./collapse";
import { spendReactionForDefense, type ReactionRules } from "./reactions";
import { enforcePvGatedToggleDeactivation } from "./talentEngine";
import type { TalentContent } from "./talents";
import type {
  ActiveCondition,
  Character,
  CharacterRulesPayload,
  DerivedStats,
} from "./types";

export type ConsoleResourceId = "pv" | "pe" | "mana";

export type ConsoleMutation =
  | { type: "resource"; resource: ConsoleResourceId; value: number; nowIso: string }
  | { type: "pa"; delta: number }
  | { type: "reactions"; delta: number }
  | { type: "defense" }
  | { type: "condition_add"; condition: ActiveCondition }
  | { type: "condition_remove"; conditionId: string; nowIso: string };

export interface ConsoleMutationContext {
  derived: DerivedStats;
  rules: CharacterRulesPayload | null;
  reactionRules: ReactionRules;
  talents: TalentContent[];
}

export interface ConsoleMutationResult {
  character: Character;
  meta: {
    autoRemovedConditions?: ActiveCondition[];
    collapseStarted?: "pv" | "pe" | null;
    collapseEnded?: "pv" | "pe" | null;
    collapseAdvanceLogs?: string[];
    collapseAdvanceOutcome?: unknown;
    pvGatedDeactivated?: { talentNome: string; nivelNome: string }[];
    usedReaction?: boolean;
    defenseWithoutReaction?: boolean;
    reactionPenalty?: number;
    defensesWithoutReaction?: number;
    reactionBefore?: number;
    reactionAfter?: number;
    defensesWithoutReactionBefore?: number;
    warnings?: string[];
  };
}

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function applyResourceMutation(
  character: Character,
  mutation: Extract<ConsoleMutation, { type: "resource" }>,
  context: ConsoleMutationContext,
): ConsoleMutationResult {
  const value = nonNegativeInteger(mutation.value);
  if (mutation.resource === "mana") {
    return {
      character: {
        ...character,
        recursos_atuais: { ...character.recursos_atuais, mana: value },
      },
      meta: {},
    };
  }

  const before = {
    pv: character.recursos_atuais?.pv ?? 0,
    pe: character.recursos_atuais?.pe ?? 0,
  };
  const after = { ...before, [mutation.resource]: value };
  const { condicoes: conditionsAfterHealing, removidas } = applyAutoHealRemoval(
    character.condicoes_ativas ?? [],
    before.pv,
    after.pv,
    mutation.nowIso,
  );
  const afterHealing: Character = { ...character, condicoes_ativas: conditionsAfterHealing };
  const collapse = detectCollapseOnResourceChange(afterHealing, before, after, mutation.nowIso);

  let next = collapse.character;
  let collapseAdvance: ReturnType<typeof resolveCollapseAdditionalDamage> | null = null;
  if (!collapse.started && !collapse.ended) {
    const pvDelta = before.pv - after.pv;
    const peDelta = before.pe - after.pe;
    const damageResource: "pv" | "pe" | null = pvDelta > 0 ? "pv" : peDelta > 0 ? "pe" : null;
    if (damageResource) {
      collapseAdvance = resolveCollapseAdditionalDamage({
        character: next,
        resource: damageResource,
        damageAmount: damageResource === "pv" ? pvDelta : peDelta,
        rules: context.rules?.colapso,
        round: next.current_round,
        scene: next.current_scene,
        nowIso: mutation.nowIso,
      });
      next = collapseAdvance.character;
    }
  }

  const pvGated = enforcePvGatedToggleDeactivation(
    next,
    context.talents,
    after.pv,
    context.derived.pv_max,
    mutation.nowIso,
  );
  next = {
    ...pvGated.character,
    recursos_atuais: { ...pvGated.character.recursos_atuais, [mutation.resource]: value },
  };

  return {
    character: next,
    meta: {
      autoRemovedConditions: removidas,
      collapseStarted: collapse.started ? collapse.tipo : null,
      collapseEnded: collapse.ended ? collapse.tipo : null,
      collapseAdvanceLogs: collapseAdvance?.logs ?? [],
      collapseAdvanceOutcome: collapseAdvance?.outcome,
      pvGatedDeactivated: pvGated.deactivated,
    },
  };
}

/** Aplica uma unica intencao do Console sem I/O e sem estado React. */
export function applyConsoleMutation(
  character: Character,
  mutation: ConsoleMutation,
  context: ConsoleMutationContext,
): ConsoleMutationResult {
  if (mutation.type === "resource") return applyResourceMutation(character, mutation, context);

  if (mutation.type === "pa") {
    const spent = nonNegativeInteger((character.estado_jogo?.pa_gastos ?? 0) + mutation.delta);
    return {
      character: { ...character, estado_jogo: { ...character.estado_jogo, pa_gastos: spent } },
      meta: {},
    };
  }

  if (mutation.type === "reactions") {
    const used = nonNegativeInteger((character.estado_jogo?.reacoes_usadas ?? 0) + mutation.delta);
    const clearOverflow = mutation.delta < 0 && (character.estado_jogo?.defesas_sem_reacao ?? 0) > 0;
    return {
      character: {
        ...character,
        estado_jogo: {
          ...character.estado_jogo,
          reacoes_usadas: used,
          ...(clearOverflow ? { defesas_sem_reacao: 0 } : {}),
        },
      },
      meta: {},
    };
  }

  if (mutation.type === "defense") {
    const spent = spendReactionForDefense(character, context.derived.reacoes_por_rodada, context.reactionRules);
    return {
      character: spent.character,
      meta: {
        usedReaction: spent.usedReaction,
        defenseWithoutReaction: spent.defenseWithoutReaction,
        reactionPenalty: spent.penaltyApplied,
        defensesWithoutReaction: spent.defensesWithoutReactionAfter,
        reactionBefore: spent.reactionBefore,
        reactionAfter: spent.reactionAfter,
        defensesWithoutReactionBefore: spent.defensesWithoutReactionBefore,
        warnings: spent.warnings,
      },
    };
  }

  if (mutation.type === "condition_add") {
    return {
      character: {
        ...character,
        condicoes_ativas: [...(character.condicoes_ativas ?? []), mutation.condition],
      },
      meta: {},
    };
  }

  return {
    character: {
      ...character,
      condicoes_ativas: (character.condicoes_ativas ?? []).map((condition) =>
        condition.id === mutation.conditionId && condition.ativa !== false
          ? { ...condition, ativa: false, removidaEm: mutation.nowIso }
          : condition,
      ),
    },
    meta: {},
  };
}
