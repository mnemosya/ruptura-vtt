/**
 * Teste puro (sem Supabase) do ataque contestado básico — checkpoint
 * v0.47 (`src/lib/character/attack.ts`).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resolveContestedRoll,
  rollDamageFormula,
  applyAttackDamage,
  createInitialCharacter,
  normalizeAttackCriticalRules,
  normalizeItemContent,
  deriveCriticalItemPropertySuggestions,
  formatCriticalItemPropertySuggestions,
  type ItemContent,
} from "../src/lib/character";
import { normalizeTechnicalContentItem, type TechnicalContentItem } from "../src/lib/content";

console.log("=== test-attack-resolution ===\n");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const combatField = readJson<Record<string, unknown>>("content/db_campo_combate_normalizado_v1_1.json");
const itemDb = readJson<{ itens: Record<string, unknown>[] }>("content/db_equipamentos_normalizado_v1_2.json");
const propertyDb = readJson<{ propriedades: Record<string, unknown>[] }>("content/db_propriedades_normalizado_v1.json");
const runeDb = readJson<{ runas: Record<string, unknown>[] }>("content/db_runas_normalizado_v1_2.json");
const itemModels: ItemContent[] = itemDb.itens.map(normalizeItemContent);
const propertyModels: TechnicalContentItem[] = propertyDb.propriedades.map(normalizeTechnicalContentItem);
const runeModels: TechnicalContentItem[] = runeDb.runas.map(normalizeTechnicalContentItem);
const criticalRules = normalizeAttackCriticalRules(combatField);
assert.equal(criticalRules.minMargin, 5);

// -------------------------------------------------------------
// 1. Ataque contestado — maior total vence, empate favorece defensor.
// -------------------------------------------------------------
const vitoriaAtacante = resolveContestedRoll(15, 10);
assert.equal(vitoriaAtacante.margin, 5);
assert.equal(vitoriaAtacante.attackerWins, true);

const vitoriaDefensor = resolveContestedRoll(8, 12);
assert.equal(vitoriaDefensor.margin, -4);
assert.equal(vitoriaDefensor.attackerWins, false);

const empate = resolveContestedRoll(10, 10);
assert.equal(empate.margin, 0);
assert.equal(empate.attackerWins, false, "Empate deve favorecer o defensor.");
console.log("1. Ataque contestado (vitória/derrota/empate) — OK");

// -------------------------------------------------------------
// 2. rollDamageFormula — determinístico com RNG injetável.
// -------------------------------------------------------------
const rngFixo = () => 0.5; // 1d6 com rng=0.5 -> 1 + floor(0.5*6) = 4
assert.equal(rollDamageFormula("1d6", rngFixo), 4);
assert.equal(rollDamageFormula("2d6", rngFixo), 8);
assert.equal(rollDamageFormula("1d6+2", rngFixo), 6);
assert.equal(rollDamageFormula("formato_invalido", rngFixo), 0, "Fórmula inválida deve devolver 0, nunca lançar.");
console.log("2. rollDamageFormula (determinístico + fórmula inválida segura) — OK");

// -------------------------------------------------------------
// 3. applyAttackDamage — reduz PV, nunca abaixo de 0, aciona Colapso.
// -------------------------------------------------------------
const alvo = createInitialCharacter(null, "Alvo de Teste");
const alvoComPv = { ...alvo, recursos_atuais: { ...alvo.recursos_atuais, pv: 10, pe: 10 } };

const resultado = applyAttackDamage({
  character: alvoComPv,
  formula: "1d6",
  damageType: "fisico",
  nowIso: "2026-07-03T10:00:00.000Z",
  rng: rngFixo,
});
assert.equal(resultado.rollResult, 4);
assert.equal(resultado.pvBefore, 10);
assert.equal(resultado.pvAfter, 6);
assert.equal(resultado.character.recursos_atuais?.pv, 6);
console.log("3. applyAttackDamage (dano direto ao PV) — OK");

// -------------------------------------------------------------
// 4. Dano que zera PV aciona Colapso (reaproveita detectCollapseOnResourceChange, v0.38).
// -------------------------------------------------------------
const alvoQuaseMorto = { ...alvo, recursos_atuais: { ...alvo.recursos_atuais, pv: 3, pe: 10 } };
const resultadoColapso = applyAttackDamage({
  character: alvoQuaseMorto,
  formula: "1d6",
  damageType: "fisico",
  nowIso: "2026-07-03T10:00:00.000Z",
  rng: rngFixo, // 4 de dano, PV 3 -> 0
});
assert.equal(resultadoColapso.pvAfter, 0);
assert.equal(resultadoColapso.collapseStarted, true, "PV chegando a 0 deve acionar Colapso (v0.38).");
assert.equal(resultadoColapso.collapseTipo, "pv");
assert.equal(resultadoColapso.character.colapso?.ativo, true);
console.log("4. Dano que zera PV aciona Colapso (v0.38) — OK");

// -------------------------------------------------------------
// 5. PV nunca fica negativo.
// -------------------------------------------------------------
const alvoComPoucoPv = { ...alvo, recursos_atuais: { ...alvo.recursos_atuais, pv: 1, pe: 10 } };
const resultadoNegativo = applyAttackDamage({
  character: alvoComPoucoPv,
  formula: "2d6",
  damageType: "fisico",
  nowIso: "2026-07-03T10:00:00.000Z",
  rng: rngFixo, // 8 de dano, PV 1
});
assert.equal(resultadoNegativo.pvAfter, 0, "PV nunca deve ficar negativo.");
console.log("5. PV nunca fica negativo — OK");

// -------------------------------------------------------------
// 6. Propriedades críticas viram somente sugestões do item usado.
// -------------------------------------------------------------
const tonfa = itemModels.find((item) => item.slug === "tonfa");
assert.ok(tonfa);
const tonfaInstance = {
  id: "tonfa-1",
  itemSlug: tonfa!.slug,
  itemNome: tonfa!.nome,
  categoria: tonfa!.categoria,
  subtipo: tonfa!.subtipo,
  quantidade: 1,
  estado: "empunhado" as const,
  adquiridoEm: "2026-07-04T10:00:00.000Z",
};
const criticalSuggestions = deriveCriticalItemPropertySuggestions({
  margin: 5,
  rules: criticalRules,
  itemInstance: tonfaInstance,
  itemContent: tonfa,
  properties: propertyModels,
  runes: runeModels,
});
assert.deepEqual(criticalSuggestions.map((suggestion) => suggestion.slug), ["contusao"]);
assert.equal(criticalSuggestions[0].automatic, false);
assert.match(criticalSuggestions[0].text, /crítico/i);
assert.match(
  formatCriticalItemPropertySuggestions(criticalSuggestions) ?? "",
  /Contusão: Em sucesso crítico, aplica Contundido.*aplicação manual/,
);

assert.deepEqual(
  deriveCriticalItemPropertySuggestions({
    margin: 4,
    rules: criticalRules,
    itemInstance: tonfaInstance,
    itemContent: tonfa,
    properties: propertyModels,
  }),
  [],
  "Acerto normal não sugere propriedade crítica.",
);

const faca = itemModels.find((item) => item.slug === "faca");
assert.ok(faca);
assert.deepEqual(
  deriveCriticalItemPropertySuggestions({
    margin: 5,
    rules: criticalRules,
    itemInstance: { ...tonfaInstance, itemSlug: faca!.slug, itemNome: faca!.nome },
    itemContent: faca,
    properties: propertyModels,
  }),
  [],
  "Item sem propriedade crítica não sugere nada.",
);

assert.doesNotThrow(() =>
  deriveCriticalItemPropertySuggestions({
    margin: 5,
    rules: criticalRules,
    itemInstance: tonfaInstance,
    itemContent: { ...tonfa!, propertySlugs: ["ausente"] },
    properties: propertyModels,
  }),
);

const ambiguousCritical = normalizeTechnicalContentItem({
  id: "critica_ambigua",
  slug: "critica_ambigua",
  nome: "Crítica ambígua",
  status: "published",
  gatilhos: ["sucesso_critico"],
  margem_minima: "sucesso_critico",
  payload_automacao: { efeitos: "malformado" },
});
assert.deepEqual(
  deriveCriticalItemPropertySuggestions({
    margin: 5,
    rules: criticalRules,
    itemInstance: tonfaInstance,
    itemContent: { ...tonfa!, propertySlugs: [ambiguousCritical.slug] },
    properties: [ambiguousCritical],
  }),
  [],
  "Payload crítico ambíguo é ignorado, nunca aplicado.",
);
console.log("6. Crítico sugere somente propriedades do item usado, sem aplicação automática — OK");

console.log("\ntest-attack-resolution — todos os cenários passaram.");
