/**
 * Testes puros da defesa sem Reação (v0.43).
 * Lê os DBs normalizados reais e não acessa Supabase.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildActionConsoleItems,
  executeActionOnCharacter,
  normalizeCombatActionContent,
  type CombatActionContent,
} from "../src/lib/character/actionConsole.js";
import { normalizeCharacter } from "../src/lib/character/normalizeCharacter.js";
import {
  canUseReactionAction,
  deriveReactionDefenseEffect,
  normalizeReactionRules,
  resetRoundReactionState,
  spendReactionForDefense,
} from "../src/lib/character/reactions.js";
import type { Character } from "../src/lib/character/types.js";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const flow = readJson<Record<string, unknown>>("content/db_fluxo_combate_normalizado_v1_1.json");
const actionDb = readJson<{ acoes: Record<string, unknown>[] }>(
  "content/db_acoes_combate_normalizado_v1_1.json",
);
const actions = actionDb.acoes.map(normalizeCombatActionContent);
const actionBySlug = new Map(actions.map((action) => [action.slug, action]));
const rules = normalizeReactionRules(flow);

function character(reacoesUsadas = 0, defesasSemReacao = 0): Character {
  return {
    nome: "Defensor de teste",
    atributos: { corpo: 1, mente: 1, animo: 1 },
    pericias: {},
    estado_jogo: {
      pa_gastos: 0,
      reacoes_usadas: reacoesUsadas,
      defesas_sem_reacao: defesasSemReacao,
    },
  };
}

function action(slug: string): CombatActionContent {
  const found = actionBySlug.get(slug);
  assert.ok(found, `Ação canônica ausente: ${slug}`);
  return found;
}

assert.equal(rules.valid, true);
assert.equal(rules.allowDefenseWithoutReaction, true);
assert.equal(rules.cumulativePenalty, -1);
assert.equal(rules.resetAt, "inicio_da_rodada");
assert.equal(
  normalizeReactionRules({
    ...flow,
    reacoes: {
      ...(flow.reacoes as Record<string, unknown>),
      max_por_rodada: { ref: "atributo", id: "corpo" },
    },
  }).valid,
  false,
  "A fonte de máximo deve continuar sendo Mente.",
);

const withReaction = spendReactionForDefense(character(), 1, rules);
assert.equal(withReaction.usedReaction, true);
assert.equal(withReaction.defenseWithoutReaction, false);
assert.equal(withReaction.character.estado_jogo?.reacoes_usadas, 1);
assert.equal(withReaction.character.estado_jogo?.defesas_sem_reacao, 0);
assert.equal(withReaction.penaltyApplied, 0);

let overflowCharacter = character(1);
for (const [expectedCount, expectedPenalty] of [[1, -1], [2, -2], [3, -3]] as const) {
  const result = spendReactionForDefense(overflowCharacter, 1, rules);
  assert.equal(result.defenseWithoutReaction, true);
  assert.equal(result.defensesWithoutReactionBefore, expectedCount - 1);
  assert.equal(result.defensesWithoutReactionAfter, expectedCount);
  assert.equal(result.penaltyApplied, expectedPenalty);
  assert.equal(result.character.estado_jogo?.reacoes_usadas, 1);
  overflowCharacter = result.character;
}

const invalidRules = normalizeReactionRules({});
const blockedCharacter = character(1);
const blocked = spendReactionForDefense(blockedCharacter, 1, invalidRules);
assert.equal(canUseReactionAction(blockedCharacter, 1, invalidRules).ok, false);
assert.equal(blocked.character, blockedCharacter);
assert.match(blocked.warnings[0] ?? "", /indisponíveis/);

const reset = resetRoundReactionState(overflowCharacter);
assert.equal(reset.estado_jogo?.reacoes_usadas, 0);
assert.equal(reset.estado_jogo?.defesas_sem_reacao, 0);
assert.equal(deriveReactionDefenseEffect(reset, rules), null);

for (const invalidValue of [undefined, -2, Number.NaN, "3"]) {
  const normalized = normalizeCharacter({
    ...character(),
    estado_jogo: { reacoes_usadas: 0, defesas_sem_reacao: invalidValue },
  });
  assert.equal(normalized.estado_jogo?.defesas_sem_reacao, 0);
}

const effect = deriveReactionDefenseEffect(character(1, 2), rules);
assert.ok(effect);
assert.equal(effect.modifier, -2);
assert.deepEqual(effect.affectedTags, ["defensiva", "reacao"]);
assert.equal(effect.affectedTags.some((tag) => ["ofensiva"].includes(tag)), false);
assert.equal(effect.affectedTags.some((tag) => ["defensiva"].includes(tag)), true);

for (const slug of ["aparar", "bloquear", "esquivar", "resistir"]) {
  const exhausted = character(1);
  const item = buildActionConsoleItems(exhausted, actions, [], 3, 1, [], rules)
    .find((candidate) => candidate.slug === slug);
  assert.equal(item?.enabled, true, `${slug} deve continuar habilitada sem Reação.`);
  assert.equal(item?.defenseWithoutReaction, true);
  assert.equal(item?.reactionPenalty, -1);

  const result = executeActionOnCharacter(
    exhausted,
    action(slug),
    3,
    1,
    "2026-07-02T15:00:00.000Z",
    rules,
  );
  assert.equal(result.defenseWithoutReaction, true);
  assert.equal(result.defensesWithoutReactionBefore, 0);
  assert.equal(result.defensesWithoutReactionAfter, 1);
  assert.equal(result.reactionPenaltyApplied, -1);
  assert.equal(result.character.estado_jogo?.reacoes_usadas, 1);
}

for (const slug of ["deslocar", "falar"]) {
  const initial = character(1, 2);
  const result = executeActionOnCharacter(
    initial,
    action(slug),
    3,
    1,
    "2026-07-02T15:00:00.000Z",
    rules,
  );
  assert.equal(result.character.estado_jogo?.defesas_sem_reacao, 2);
  assert.equal(result.defenseWithoutReaction, false);
}

console.log("test:reactions — todos os cenários passaram.");
