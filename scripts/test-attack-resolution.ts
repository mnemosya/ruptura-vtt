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
  purchaseItem,
  equipDefensiveItem,
  getEquippedDefenseProfile,
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

// -------------------------------------------------------------
// 7. Integração MIT/PD (checkpoint v0.58, fase 3) — applyAttackDamage
//    aplica mitigação quando o alvo tem armadura/escudo equipado, e
//    preserva o comportamento antigo (dano integral) quando não tem.
// -------------------------------------------------------------
const armaduraModel = itemModels.find((item) => item.slug === "jaqueta_couro_reforcada");
const escudoModel = itemModels.find((item) => item.slug === "escudo_compacto");
assert.ok(armaduraModel, "Armadura 'jaqueta_couro_reforcada' deve existir no DB real (mit_base:3).");
assert.ok(escudoModel, "Escudo 'escudo_compacto' deve existir no DB real (pd_max:5).");

const alvoSemDefesa = { ...alvo, recursos_atuais: { ...alvo.recursos_atuais, pv: 10, pe: 10 } };
const resultadoSemDefesa = applyAttackDamage({
  character: alvoSemDefesa,
  formula: "1d6",
  damageType: "fisico",
  wasBlocked: false,
  defense: getEquippedDefenseProfile(alvoSemDefesa, itemModels),
  nowIso: "2026-07-04T10:00:00.000Z",
  rng: rngFixo,
});
assert.equal(resultadoSemDefesa.finalDamage, 4, "Alvo sem armadura/escudo equipado preserva o comportamento antigo (dano integral).");
assert.equal(resultadoSemDefesa.mitigatedByMit, 0);
assert.equal(resultadoSemDefesa.pvAfter, 6);

let alvoComArmadura = createInitialCharacter(null, "Alvo com armadura");
alvoComArmadura = { ...alvoComArmadura, recursos_atuais: { ...alvoComArmadura.recursos_atuais, pv: 10, pe: 10 }, carteira: { aretz_informal: 100000, cdi: 0, cdi_craqueada: 0 } };
const compraArmadura = purchaseItem({ character: alvoComArmadura, item: armaduraModel!, quantidade: 1, walletId: "aretz_informal", nowIso: "2026-07-04T10:00:00.000Z" });
assert.ok(compraArmadura.ok, "Compra da armadura deve ter sucesso (personagem inicial tem carteira suficiente).");
alvoComArmadura = equipDefensiveItem(compraArmadura.character, compraArmadura.instance!.id, armaduraModel!);

const resultadoComMit = applyAttackDamage({
  character: alvoComArmadura,
  formula: "1d6",
  damageType: "fisico",
  wasBlocked: false,
  defense: getEquippedDefenseProfile(alvoComArmadura, itemModels),
  nowIso: "2026-07-04T10:00:00.000Z",
  rng: rngFixo, // 4 de dano
});
assert.equal(resultadoComMit.mitigatedByMit, 3, "MIT (3) da armadura equipada deve absorver o dano físico.");
assert.equal(resultadoComMit.finalDamage, 1, "Excesso (4-3) passa ao PV.");
assert.equal(resultadoComMit.pvAfter, 9);
const mitApósGolpe = resultadoComMit.character.inventario?.find((i) => i.id === compraArmadura.instance!.id)?.mitAtual;
assert.equal(mitApósGolpe, 0, "MIT atual do item deve persistir zerado no personagem devolvido.");
assert.match(resultadoComMit.defenseSummary, /MIT absorveu/);
console.log("7. Ataque sem defesa preserva comportamento antigo; armadura equipada aplica MIT e persiste no personagem — OK");

// -------------------------------------------------------------
// 8. Bloqueio com escudo equipado resolve contra PD (nunca MIT); PD atual persiste.
// -------------------------------------------------------------
let alvoComEscudo = createInitialCharacter(null, "Alvo com escudo");
alvoComEscudo = { ...alvoComEscudo, recursos_atuais: { ...alvoComEscudo.recursos_atuais, pv: 10, pe: 10 }, carteira: { aretz_informal: 100000, cdi: 0, cdi_craqueada: 0 } };
const compraEscudo = purchaseItem({ character: alvoComEscudo, item: escudoModel!, quantidade: 1, walletId: "aretz_informal", nowIso: "2026-07-04T10:00:00.000Z" });
assert.ok(compraEscudo.ok, "Compra do escudo deve ter sucesso.");
alvoComEscudo = equipDefensiveItem(compraEscudo.character, compraEscudo.instance!.id, escudoModel!);

const resultadoComPd = applyAttackDamage({
  character: alvoComEscudo,
  formula: "1d6",
  damageType: "fisico",
  wasBlocked: true,
  defense: getEquippedDefenseProfile(alvoComEscudo, itemModels),
  nowIso: "2026-07-04T10:00:00.000Z",
  rng: rngFixo, // 4 de dano
});
assert.equal(resultadoComPd.mitigatedByPd, 4, "PD (5) absorve o dano bloqueado.");
assert.equal(resultadoComPd.mitigatedByMit, 0, "Bloqueio nunca resolve contra MIT.");
assert.equal(resultadoComPd.finalDamage, 0);
assert.equal(resultadoComPd.pvAfter, 10, "PV não muda quando o PD absorve tudo.");
const pdApósGolpe = resultadoComPd.character.inventario?.find((i) => i.id === compraEscudo.instance!.id)?.pdAtual;
assert.equal(pdApósGolpe, 1, "PD atual do escudo deve persistir reduzido (5-4=1) no personagem devolvido.");
console.log("8. Bloqueio com escudo equipado resolve contra PD, nunca MIT; PD atual persiste no personagem — OK");

// -------------------------------------------------------------
// 9. Colapso continua funcionando com o dano final já mitigado (não com o dano bruto do dado).
// -------------------------------------------------------------
let alvoComArmaduraQuaseMorto = createInitialCharacter(null, "Alvo quase morto com armadura");
alvoComArmaduraQuaseMorto = { ...alvoComArmaduraQuaseMorto, carteira: { aretz_informal: 100000, cdi: 0, cdi_craqueada: 0 } };
const compraArmadura2 = purchaseItem({ character: alvoComArmaduraQuaseMorto, item: armaduraModel!, quantidade: 1, walletId: "aretz_informal", nowIso: "2026-07-04T10:00:00.000Z" });
assert.ok(compraArmadura2.ok);
alvoComArmaduraQuaseMorto = equipDefensiveItem(compraArmadura2.character, compraArmadura2.instance!.id, armaduraModel!);
alvoComArmaduraQuaseMorto = { ...alvoComArmaduraQuaseMorto, recursos_atuais: { ...alvoComArmaduraQuaseMorto.recursos_atuais, pv: 1, pe: 10 } };

const resultadoColapsoComMit = applyAttackDamage({
  character: alvoComArmaduraQuaseMorto,
  formula: "2d6",
  damageType: "fisico",
  wasBlocked: false,
  defense: getEquippedDefenseProfile(alvoComArmaduraQuaseMorto, itemModels),
  nowIso: "2026-07-04T10:00:00.000Z",
  rng: rngFixo, // 8 de dano bruto, MIT(3) absorve -> 5 de dano final
});
assert.equal(resultadoColapsoComMit.finalDamage, 5, "Dano final já deve refletir a mitigação do MIT (8-3).");
assert.equal(resultadoColapsoComMit.pvAfter, 0, "PV 1 - 5 de dano final nunca fica negativo.");
assert.equal(resultadoColapsoComMit.collapseStarted, true, "PV chegando a 0 aciona Colapso mesmo com dano mitigado.");
console.log("9. Colapso usa o dano final já mitigado pelo MIT/PD, não o dano bruto do dado — OK");

console.log("\ntest-attack-resolution — todos os cenários passaram.");
