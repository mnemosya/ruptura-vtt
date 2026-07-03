/**
 * Teste puro (sem Supabase) do ataque contestado básico — checkpoint
 * v0.47 (`src/lib/character/attack.ts`).
 */

import assert from "node:assert/strict";
import { resolveContestedRoll, rollDamageFormula, applyAttackDamage, createInitialCharacter } from "../src/lib/character";

console.log("=== test-attack-resolution ===\n");

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

console.log("\ntest-attack-resolution — todos os cenários passaram.");
