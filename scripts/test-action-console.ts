/**
 * Testes puros do Console de Ação (v0.42.1).
 *
 * Usa os JSONs canônicos locais, sem Supabase e sem alterar estado externo.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildActionConsoleItems,
  executeActionOnCharacter,
  getActionCost,
  normalizeCombatActionContent,
  normalizeConditionSlug,
  validateConditionalActionConsistency,
  type CombatActionContent,
} from "../src/lib/character/actionConsole.js";
import type { ActiveCondition, Character } from "../src/lib/character/types.js";

interface ConditionContent {
  slug: string;
  acoes_habilitadas?: { acao: string }[];
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const actionDb = readJson<{ acoes: Record<string, unknown>[] }>(
  "content/db_acoes_combate_normalizado_v1_1.json",
);
const conditionDb = readJson<{ condicoes: ConditionContent[] }>(
  "content/db_condicoes_normalizado_v1_5.json",
);
const characterRulesDb = readJson<{ pericias: { id: string }[] }>(
  "content/db_regras_personagem_normalizado_v1_4.json",
);

const actions = actionDb.acoes.map(normalizeCombatActionContent);
const actionBySlug = new Map(actions.map((action) => [action.slug, action]));
const conditions = conditionDb.condicoes.map(({ slug, acoes_habilitadas }) => ({
  slug,
  acoes_habilitadas,
}));
const knownSkillIds = characterRulesDb.pericias.map((skill) => skill.id);

function action(slug: string): CombatActionContent {
  const found = actionBySlug.get(slug);
  assert.ok(found, `Ação canônica ausente: ${slug}`);
  return found;
}

function activeCondition(name: string, conditionId?: string): ActiveCondition {
  return {
    id: `condition-${normalizeConditionSlug(conditionId ?? name)}`,
    conditionId,
    nome: name,
    aplicadaEm: "2026-07-02T12:00:00.000Z",
    ativa: true,
  };
}

function characterWith(
  activeConditions: ActiveCondition[] = [],
  paGastos = 0,
  reacoesUsadas = 0,
): Character {
  return {
    nome: "Personagem de teste",
    atributos: { corpo: 1, mente: 1, animo: 1 },
    pericias: {},
    estado_jogo: { pa_gastos: paGastos, reacoes_usadas: reacoesUsadas },
    condicoes_ativas: activeConditions,
  };
}

function consoleItems(character: Character, sourceActions = actions, sourceConditions = conditions) {
  return buildActionConsoleItems(
    character,
    sourceActions,
    sourceConditions,
    3,
    1,
    knownSkillIds,
  );
}

function visibleSlugs(character: Character): string[] {
  return consoleItems(character).map((item) => item.slug);
}

function execute(slug: string, character: Character) {
  return executeActionOnCharacter(
    character,
    action(slug),
    3,
    1,
    "2026-07-02T13:00:00.000Z",
  );
}

assert.equal(actions.length, 28, "O DB deve conter 28 ações canônicas.");

const noConditions = visibleSlugs(characterWith());
assert.equal(noConditions.length, 24, "Sem condições, devem existir 24 ações visíveis.");
for (const hidden of ["levantar", "escapar", "soltar_alvo", "apagar_fogo"]) {
  assert.ok(!noConditions.includes(hidden), `${hidden} deve ficar oculta sem condição.`);
}

const conditionalCases = [
  { conditionId: "caido", name: "Caído", action: "levantar", pa: 1, removed: "caido" },
  { conditionId: "agarrado", name: "Agarrado", action: "escapar", pa: 2, removed: "agarrado" },
  { conditionId: "imobilizado", name: "Imobilizado", action: "escapar", pa: 2, removed: "imobilizado" },
  { conditionId: "agarrando", name: "Agarrando", action: "soltar_alvo", pa: 0, removed: "agarrando" },
  { conditionId: "queimando", name: "Queimando", action: "apagar_fogo", pa: 1, removed: "queimando" },
] as const;

for (const testCase of conditionalCases) {
  const unrelated = activeCondition("Ofuscado", "ofuscado");
  const initial = characterWith([
    activeCondition(testCase.name, testCase.conditionId),
    unrelated,
  ]);
  const item = consoleItems(initial).find((candidate) => candidate.slug === testCase.action);
  assert.ok(item, `${testCase.conditionId} deve tornar ${testCase.action} visível.`);
  assert.ok(item.isConditionEnabled, `${testCase.action} deve receber badge de condição.`);

  const result = execute(testCase.action, initial);
  assert.equal(result.paBefore - result.paAfter, testCase.pa, `${testCase.action}: custo de PA incorreto.`);
  const removed = result.character.condicoes_ativas?.find(
    (condition) => condition.conditionId === testCase.removed,
  );
  assert.equal(removed?.ativa, false, `${testCase.action} deve remover ${testCase.removed}.`);
  assert.equal(removed?.removidaOrigem, "acao_combate");
  assert.equal(
    result.character.condicoes_ativas?.find((condition) => condition.conditionId === "ofuscado")?.ativa,
    true,
    `${testCase.action} não deve remover condição não relacionada.`,
  );
}

const manualFallen = characterWith([activeCondition("Caído")]);
assert.ok(visibleSlugs(manualFallen).includes("levantar"), "Nome manual Caído deve normalizar para caido.");
const manualFallenResult = execute("levantar", manualFallen);
assert.equal(manualFallenResult.character.condicoes_ativas?.[0]?.ativa, false);

const insufficientPa = characterWith([], 3, 0);
const insufficientPaResult = execute("atacar", insufficientPa);
assert.equal(insufficientPaResult.character, insufficientPa, "PA insuficiente não pode alterar o personagem.");
assert.match(insufficientPaResult.warnings[0] ?? "", /PA insuficiente/);

const insufficientReaction = characterWith([], 0, 1);
const insufficientReactionResult = execute("esquivar", insufficientReaction);
assert.equal(
  insufficientReactionResult.character,
  insufficientReaction,
  "Reação insuficiente não pode alterar o personagem.",
);
assert.match(insufficientReactionResult.warnings[0] ?? "", /Defesa sem Reação/);

const invalidCostAction: CombatActionContent = {
  ...action("falar"),
  id: "custo_invalido",
  slug: "custo_invalido",
  custo: { tipo: "misterioso" },
};
const invalidCost = getActionCost(invalidCostAction);
assert.equal(invalidCost.valid, false);
const invalidCostItem = consoleItems(characterWith(), [invalidCostAction], []).at(0);
assert.equal(invalidCostItem?.enabled, false, "Custo desconhecido nunca pode virar execução gratuita.");

const invalidVisibilityAction: CombatActionContent = {
  ...action("falar"),
  id: "visibilidade_invalida",
  slug: "visibilidade_invalida",
  visibilidade: "lua_cheia",
};
const invalidVisibilityItem = consoleItems(characterWith(), [invalidVisibilityAction], []).at(0);
assert.equal(invalidVisibilityItem?.enabled, false);
assert.match(invalidVisibilityItem?.disabledReason ?? "", /visibilidade não suportado/);

for (const postureSlug of ["postura_ofensiva", "postura_defensiva"]) {
  const postureItem = consoleItems(characterWith()).find((item) => item.slug === postureSlug);
  assert.ok(postureItem?.pendingEffects.some((effect) => effect.includes("Postura")));
  assert.ok(!postureItem?.automatedEffects.some((effect) => effect.includes("Postura")));
}

const compoundItem = consoleItems(characterWith()).find((item) => item.slug === "preparar_turno");
assert.equal(compoundItem?.enabled, false);
assert.match(compoundItem?.disabledReason ?? "", /Custo composto/);

for (const conditional of ["levantar", "escapar", "soltar_alvo", "apagar_fogo"]) {
  assert.equal(
    validateConditionalActionConsistency(action(conditional), conditions),
    undefined,
    `${conditional} deve estar coerente nos dois DBs.`,
  );
}

const inconsistentConditions = conditions.map((condition) =>
  condition.slug === "caido" ? { ...condition, acoes_habilitadas: [] } : condition,
);
const inconsistentItem = consoleItems(
  characterWith([activeCondition("Caído", "caido")]),
  actions,
  inconsistentConditions,
).find((item) => item.slug === "levantar");
assert.equal(inconsistentItem?.enabled, false);
assert.match(inconsistentItem?.disabledReason ?? "", /Conteúdo inconsistente/);

const mirar = consoleItems(characterWith()).find((item) => item.slug === "mirar");
assert.equal(mirar?.rollSkillId, "percepcao", "Mirar tem teste simples integrado.");
const usarPericia = consoleItems(characterWith()).find((item) => item.slug === "usar_pericia");
assert.equal(usarPericia?.rollSkillId, undefined, "Perícia variável não pode ser preparada automaticamente.");
assert.match(usarPericia?.rollDisabledReason ?? "", /manualmente/);
const escapar = consoleItems(characterWith([activeCondition("Agarrado", "agarrado")])).find(
  (item) => item.slug === "escapar",
);
assert.equal(escapar?.rollSkillId, undefined, "Teste aninhado/contestado não pode ser preparado automaticamente.");

console.log("test:action-console — todos os cenários passaram.");
