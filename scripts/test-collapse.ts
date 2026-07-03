/**
 * Testes puros do ciclo de Colapso de fim de rodada (`resolveCollapseEndRound`,
 * checkpoint v0.51, achado A3 da auditoria v0.50). Lê a regra CANÔNICA
 * de `regras_personagem.colapso` do DB normalizado (sem Supabase) e
 * confirma teste/avanço/desfecho derivados do payload — nunca de
 * limiares hardcoded no código.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resolveCollapseEndRound,
  parseTerceiroSegmentoThreshold,
  detectCollapseOnResourceChange,
  endCollapseByHealing,
  resolveEndRoundConditionsForCharacter,
  normalizeConditionContent,
  type Character,
  type CollapseRulesPayload,
  type ConditionContent,
} from "../src/lib/character";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

console.log("=== test-collapse ===\n");

const regras = readJson<{ colapso: CollapseRulesPayload }>("content/db_regras_personagem_normalizado_v1_4.json");
const collapseRules = regras.colapso;

// -------------------------------------------------------------
// 0. Regra canônica confirmada a partir do DB (não hardcoded no código).
// -------------------------------------------------------------
assert.equal(collapseRules.segmentos, 3, "segmentos deve ser 3 na regra canônica.");
const gatilhoPv = collapseRules.gatilhos?.find((g) => g.recurso === "pv");
const gatilhoPe = collapseRules.gatilhos?.find((g) => g.recurso === "pe");
assert.ok(gatilhoPv && gatilhoPe, "Gatilhos de PV e PE devem existir.");
assert.equal(gatilhoPv!.teste_fim_rodada.atributo, "corpo", "Gatilho PV testa Corpo.");
assert.equal(gatilhoPe!.teste_fim_rodada.atributo, "mente", "Gatilho PE testa Mente.");
assert.equal(gatilhoPv!.teste_fim_rodada.falha_se_menor_que, 7, "Limiar regular = 7 (canônico).");
assert.equal(parseTerceiroSegmentoThreshold(collapseRules), 8, "Limiar do 3º segmento = 8 (canônico, via chave resultado_8).");
console.log("0. Regra canônica de Colapso confirmada do DB (segmentos 3, Corpo/Mente CD 7, 3º segmento 8) — OK");

// RNGs determinísticos para 1d8 (atributo = 1): 1 + floor(rng*8).
const rngD8_8 = () => 0.9; // -> 8 (mantém tudo)
const rngD8_1 = () => 0.0; // -> 1 (falha tudo)
const rngD8_7 = () => 0.8; // -> 7 (mantém regular, falha 3º segmento)

function character(colapso?: Character["colapso"], overrides: Partial<Character> = {}): Character {
  return {
    nome: "Testador de Colapso",
    atributos: { corpo: 1, mente: 1, animo: 1 },
    pericias: {},
    recursos_atuais: { pv: 0, pe: 0 },
    colapso,
    ...overrides,
  } as Character;
}

function colapso(tipo: "pv" | "pe", segmentos: number, extra: Partial<NonNullable<Character["colapso"]>> = {}) {
  return { ativo: true, tipo, segmentos, estabilizado: false, ...extra } as Character["colapso"];
}

const round = 2;
const scene = 1;
const nowIso = "2026-07-03T10:00:00.000Z";

// -------------------------------------------------------------
// 1. Personagem sem Colapso não faz teste.
// -------------------------------------------------------------
const semColapso = resolveCollapseEndRound({ character: character(undefined), rules: collapseRules, round, scene, nowIso, rng: rngD8_1 });
assert.equal(semColapso.outcome, "no_collapse");
assert.equal(semColapso.rollTotal, undefined, "Sem colapso não deve rolar dado.");
console.log("1. Sem Colapso ativo — nenhum teste rolado — OK");

// -------------------------------------------------------------
// 2. PV = 0 usa Corpo.
// -------------------------------------------------------------
const pvTest = resolveCollapseEndRound({ character: character(colapso("pv", 0)), rules: collapseRules, round, scene, nowIso, rng: rngD8_8 });
assert.equal(pvTest.atributo, "corpo", "Colapso de PV deve testar Corpo.");
console.log("2. Colapso de PV testa Corpo — OK");

// -------------------------------------------------------------
// 3. PE = 0 usa Mente.
// -------------------------------------------------------------
const peTest = resolveCollapseEndRound({ character: character(colapso("pe", 0)), rules: collapseRules, round, scene, nowIso, rng: rngD8_8 });
assert.equal(peTest.atributo, "mente", "Colapso de PE deve testar Mente.");
console.log("3. Colapso de PE testa Mente — OK");

// -------------------------------------------------------------
// 4. Sucesso (>= 7) mantém o segmento.
// -------------------------------------------------------------
const mantido = resolveCollapseEndRound({ character: character(colapso("pv", 1)), rules: collapseRules, round, scene, nowIso, rng: rngD8_8 });
assert.equal(mantido.outcome, "maintained");
assert.equal(mantido.rollTotal, 8);
assert.equal(mantido.segmentosAfter, 1, "Sucesso não avança segmento.");
assert.equal(mantido.character.colapso?.segmentos, 1);
console.log("4. Sucesso (8 ≥ 7) mantém o segmento — OK");

// -------------------------------------------------------------
// 5. Falha (< 7) avança o segmento.
// -------------------------------------------------------------
const avancado = resolveCollapseEndRound({ character: character(colapso("pv", 0)), rules: collapseRules, round, scene, nowIso, rng: rngD8_1 });
assert.equal(avancado.outcome, "advanced");
assert.equal(avancado.rollTotal, 1);
assert.equal(avancado.segmentosAfter, 1, "Falha avança 1 segmento.");
assert.equal(avancado.character.colapso?.segmentos, 1);
console.log("5. Falha (1 < 7) avança o segmento — OK");

// -------------------------------------------------------------
// 5b. Limiar regular é 7, não 8: resultado 7 MANTÉM.
// -------------------------------------------------------------
const sete = resolveCollapseEndRound({ character: character(colapso("pv", 1)), rules: collapseRules, round, scene, nowIso, rng: rngD8_7 });
assert.equal(sete.outcome, "maintained", "Resultado 7 deve manter (limiar regular é 7).");
console.log("5b. Resultado 7 mantém no teste regular (limiar 7) — OK");

// -------------------------------------------------------------
// 6. 3º segmento gera MORTE (PV/físico) e COMA (PE/mental) conforme o caso.
// -------------------------------------------------------------
// 6a. Falha no seg 2 empurra ao 3º e falha o teste imediato -> morte (PV).
const morte = resolveCollapseEndRound({ character: character(colapso("pv", 2)), rules: collapseRules, round, scene, nowIso, rng: rngD8_1 });
assert.equal(morte.outcome, "death", "PV no 3º segmento com falha -> morte.");
assert.equal(morte.character.colapso?.desfecho, "morte");
assert.equal(morte.character.colapso?.ativo, false, "Após morte o colapso não fica ativo.");
assert.equal(morte.segmentosAfter, 3);
console.log("6a. 3º segmento (PV) com falha imediata → morte — OK");

// 6b. Colapso de PE no 3º segmento com falha -> coma.
const coma = resolveCollapseEndRound({ character: character(colapso("pe", 2)), rules: collapseRules, round, scene, nowIso, rng: rngD8_1 });
assert.equal(coma.outcome, "coma", "PE no 3º segmento com falha -> coma.");
assert.equal(coma.character.colapso?.desfecho, "coma");
console.log("6b. 3º segmento (PE) com falha imediata → coma — OK");

// 6c. Já no 3º segmento (segmentos=3), teste imediato 8+ SOBREVIVE mais uma rodada.
const sobrevive = resolveCollapseEndRound({ character: character(colapso("pv", 3)), rules: collapseRules, round, scene, nowIso, rng: rngD8_8 });
assert.equal(sobrevive.outcome, "third_segment_survived", "8 ≥ 8 mantém por mais uma rodada.");
assert.equal(sobrevive.character.colapso?.ativo, true, "Sobreviver não encerra o colapso.");
assert.equal(sobrevive.character.colapso?.segmentos, 3);
console.log("6c. 3º segmento com 8+ sobrevive por mais uma rodada — OK");

// 6d. 3º segmento com resultado 7 (< 8) morre — confirma limiar 8 do teste imediato.
const morteSete = resolveCollapseEndRound({ character: character(colapso("pv", 3)), rules: collapseRules, round, scene, nowIso, rng: rngD8_7 });
assert.equal(morteSete.outcome, "death", "No 3º segmento, 7 < 8 → morte (limiar imediato é 8, não 7).");
console.log("6d. 3º segmento: resultado 7 < 8 → morte (limiar imediato 8) — OK");

// -------------------------------------------------------------
// 7. Cura/recuperação acima de 0 encerra Colapso (intervencao.cura_1_ou_mais).
// -------------------------------------------------------------
const colapsado = character(colapso("pv", 2), { recursos_atuais: { pv: 0, pe: 5 } });
const curado = detectCollapseOnResourceChange(colapsado, { pv: 0, pe: 5 }, { pv: 4, pe: 5 }, nowIso);
assert.equal(curado.ended, true, "Cura de 1+ PV deve encerrar o colapso de PV.");
assert.equal(curado.character.colapso?.ativo, false);
assert.equal(curado.character.colapso?.cicatrizPendente, true, "Sobrevivência marca cicatriz pendente.");
// endCollapseByHealing direto tem o mesmo efeito.
const curadoDireto = endCollapseByHealing(colapsado, nowIso);
assert.equal(curadoDireto.colapso?.ativo, false);
console.log("7. Cura de 1+ no recurso colapsado encerra o Colapso e marca cicatriz — OK");

// -------------------------------------------------------------
// 8. Estabilizado interrompe avanço — sem teste.
// -------------------------------------------------------------
const estab = resolveCollapseEndRound({
  character: character(colapso("pv", 1, { estabilizado: true })),
  rules: collapseRules,
  round, scene, nowIso, rng: rngD8_1,
});
assert.equal(estab.outcome, "stabilized");
assert.equal(estab.segmentosAfter, 1, "Estabilizado não avança segmento mesmo com RNG de falha.");
console.log("8. Colapso estabilizado — sem teste, sem avanço — OK");

// -------------------------------------------------------------
// 9. Sem regra canônica (rules ausente) — fallback defensivo, nada aplicado.
// -------------------------------------------------------------
const semRegra = resolveCollapseEndRound({ character: character(colapso("pv", 1)), rules: null, round, scene, nowIso, rng: rngD8_1 });
assert.equal(semRegra.outcome, "no_rule");
assert.equal(semRegra.character.colapso?.segmentos, 1, "Sem regra não altera o segmento (não inventa teste).");
assert.ok(semRegra.warnings.length > 0, "Sem regra deve avisar.");
console.log("9. Sem regra canônica — fallback defensivo, nada aplicado — OK");

// -------------------------------------------------------------
// 10. Integração com fim de rodada: Colapso + condições compõem sem regressão.
//     Personagem colapsado (PV 0) COM Sangrando: o teste de Colapso roda,
//     e o dano de Sangrando continua sendo aplicado pelo motor de condições.
// -------------------------------------------------------------
const conditionsDb = readJson<{ condicoes: Record<string, unknown>[] }>("content/db_condicoes_normalizado_v1_5.json");
const conditions: ConditionContent[] = conditionsDb.condicoes.map(normalizeConditionContent);

const comSangrando = character(colapso("pv", 1), {
  recursos_atuais: { pv: 0, pe: 5 },
  condicoes_ativas: [
    { id: "c1", conditionId: "sangrando", nome: "Sangrando", aplicadaEm: nowIso, removidaEm: null, ativa: true },
  ],
  current_round: round,
  current_scene: scene,
});

const colapsoStep = resolveCollapseEndRound({ character: comSangrando, rules: collapseRules, round, scene, nowIso, rng: rngD8_8 });
assert.equal(colapsoStep.outcome, "maintained", "Colapso mantém com RNG alto.");
const condStep = resolveEndRoundConditionsForCharacter({
  character: colapsoStep.character,
  conditions,
  round,
  scene,
  nowIso,
  rng: () => 0.5, // 1d6 -> 4 de dano físico
});
assert.equal(condStep.damageEvents.length, 1, "Sangrando ainda deve gerar 1 evento de dano após o passo de Colapso.");
assert.equal(condStep.character.colapso?.segmentos, 1, "O estado de Colapso mantido persiste através do motor de condições.");
console.log("10. Integração fim de rodada: Colapso + Sangrando compõem sem regressão — OK");

console.log("\ntest-collapse — todos os cenários passaram.");
