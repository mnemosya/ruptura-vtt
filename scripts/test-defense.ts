/**
 * Teste puro (sem Supabase) da resolução de MIT/PD contra dano
 * recebido — checkpoint v0.58, fase 2. Não integra com nenhum fluxo
 * de ataque ainda (isso é a Fase 3) — só confirma os números da
 * função pura `resolveDamageWithMitPd` contra a regra canônica
 * (PRD 13.5/13.6/8.6 + enums do DB de equipamentos).
 */

import assert from "node:assert/strict";
import { resolveDamageWithMitPd, type DefenseSourceInput } from "../src/lib/character";

console.log("=== test-defense ===\n");

function armor(overrides: Partial<DefenseSourceInput> = {}): DefenseSourceInput {
  return { atual: 3, max: 3, tipoProtecao: "fisica", ...overrides };
}
function shield(overrides: Partial<DefenseSourceInput> = {}): DefenseSourceInput {
  return { atual: 5, max: 5, tipoProtecao: "fisica", ...overrides };
}

// -------------------------------------------------------------
// 1. MIT reduz dano do tipo correspondente (sem Bloquear).
// -------------------------------------------------------------
const comMit = resolveDamageWithMitPd({ damageAmount: 5, damageType: "fisico", wasBlocked: false, armor: armor() });
assert.equal(comMit.mitigatedByMit, 3, "MIT (3) deve absorver até seu valor total quando o dano é maior.");
assert.equal(comMit.mitAfter, 0, "MIT absorvido reduz o MIT atual.");
assert.equal(comMit.finalDamage, 2, "Excesso (5-3) deve passar ao defensor.");
console.log("1. MIT reduz dano do tipo correspondente; excesso passa ao defensor — OK");

// -------------------------------------------------------------
// 2. PD absorve quando houve Bloquear (nunca junto com MIT).
// -------------------------------------------------------------
const comPd = resolveDamageWithMitPd({ damageAmount: 4, damageType: "fisico", wasBlocked: true, armor: armor(), shield: shield() });
assert.equal(comPd.mitigatedByPd, 4);
assert.equal(comPd.mitigatedByMit, 0, "MIT nunca resolve na mesma resolução que Bloquear (PD).");
assert.equal(comPd.pdAfter, 1);
assert.equal(comPd.mitAfter, 3, "MIT não deve ser tocado quando o dano foi bloqueado.");
assert.equal(comPd.finalDamage, 0);
console.log("2. Bloquear resolve contra PD, nunca contra MIT ao mesmo tempo — OK");

// -------------------------------------------------------------
// 3. Excesso de dano (maior que PD/MIT) passa ao defensor.
// -------------------------------------------------------------
const excessoPd = resolveDamageWithMitPd({ damageAmount: 10, damageType: "fisico", wasBlocked: true, shield: shield({ atual: 2 }) });
assert.equal(excessoPd.mitigatedByPd, 2);
assert.equal(excessoPd.pdAfter, 0);
assert.equal(excessoPd.finalDamage, 8, "Excesso além do PD disponível passa integralmente.");
console.log("3. Excesso de dano além do PD/MIT disponível passa ao defensor — OK");

// -------------------------------------------------------------
// 4. PD/MIT nunca ficam negativos.
// -------------------------------------------------------------
const pdZerado = resolveDamageWithMitPd({ damageAmount: 3, damageType: "fisico", wasBlocked: true, shield: shield({ atual: 1 }) });
assert.equal(pdZerado.pdAfter, 0, "PD nunca fica negativo mesmo com dano muito maior.");
console.log("4. PD/MIT nunca ficam negativos — OK");

// -------------------------------------------------------------
// 5. Dano 0 não altera nada.
// -------------------------------------------------------------
const semDano = resolveDamageWithMitPd({ damageAmount: 0, damageType: "fisico", wasBlocked: false, armor: armor() });
assert.equal(semDano.mitAfter, 3, "Dano 0 não deve alterar MIT/PD.");
assert.equal(semDano.finalDamage, 0);
console.log("5. Dano 0 não altera MIT/PD nem gera dano final — OK");

// -------------------------------------------------------------
// 6. Ausência de escudo/armadura — comportamento antigo preservado (dano integral).
// -------------------------------------------------------------
const semArmadura = resolveDamageWithMitPd({ damageAmount: 5, damageType: "fisico", wasBlocked: false });
assert.equal(semArmadura.finalDamage, 5, "Sem armadura equipada, todo o dano passa (comportamento antigo).");
const semEscudoBloqueio = resolveDamageWithMitPd({ damageAmount: 5, damageType: "fisico", wasBlocked: true });
assert.equal(semEscudoBloqueio.finalDamage, 5, "Bloqueio sem escudo equipado também deixa o dano passar integralmente.");
console.log("6. Ausência de escudo/armadura preserva o comportamento antigo (dano integral) — OK");

// -------------------------------------------------------------
// 7. Ordem bate com a fonte canônica: perfuração ignora 1 MIT; ácido corrói 2 MIT extras.
// -------------------------------------------------------------
const perfurante = resolveDamageWithMitPd({ damageAmount: 3, damageType: "fisico", damageSubtype: "perfurante", wasBlocked: false, armor: armor({ atual: 3 }) });
assert.equal(perfurante.mitigatedByMit, 2, "Perfuração ignora 1 MIT — só 2 de 3 MIT disponíveis absorvem neste golpe.");
assert.equal(perfurante.finalDamage, 1);
assert.equal(perfurante.mitAfter, 1, "MIT atual só reduz pelo absorvido (2), não pelo ignorado.");

const acido = resolveDamageWithMitPd({ damageAmount: 1, damageType: "fisico", damageSubtype: "acido", wasBlocked: false, armor: armor({ atual: 3 }) });
assert.equal(acido.mitigatedByMit, 1, "Ácido ainda absorve normalmente o dano deste golpe.");
assert.equal(acido.mitAfter, 1, "Ácido dobra a redução de MIT (3 - 1*2 = 1).");
console.log("7. Perfuração ignora 1 MIT; ácido dobra a redução de MIT (regra canônica PRD 13.5) — OK");

// -------------------------------------------------------------
// 8. Payload/tipo ausente não quebra — sem tipo de dano informado, MIT/PD não é aplicado (fallback seguro).
// -------------------------------------------------------------
const semTipo = resolveDamageWithMitPd({ damageAmount: 5, wasBlocked: false, armor: armor() });
assert.equal(semTipo.mitigatedByMit, 0, "Sem damageType informado, não há como confirmar a correspondência — não aplica MIT.");
assert.equal(semTipo.finalDamage, 5);

const armaduraSemTipo = resolveDamageWithMitPd({ damageAmount: 5, damageType: "fisico", wasBlocked: false, armor: armor({ tipoProtecao: null }) });
assert.equal(armaduraSemTipo.mitigatedByMit, 0, "Armadura sem tipo_protecao conhecido nunca absorve (nunca inventa correspondência).");
console.log("8. Tipo de dano/proteção ausente não quebra — MIT/PD simplesmente não se aplica (fallback seguro) — OK");

// -------------------------------------------------------------
// 9. Proteção híbrida cobre físico e energético; proteção energética não cobre físico.
// -------------------------------------------------------------
const hibrida = resolveDamageWithMitPd({ damageAmount: 2, damageType: "energetico", wasBlocked: false, armor: armor({ tipoProtecao: "hibrida" }) });
assert.equal(hibrida.mitigatedByMit, 2, "Proteção híbrida deve cobrir dano energético.");
const energeticaContraFisico = resolveDamageWithMitPd({ damageAmount: 2, damageType: "fisico", wasBlocked: false, armor: armor({ tipoProtecao: "energetica" }) });
assert.equal(energeticaContraFisico.mitigatedByMit, 0, "Proteção só energética não deve cobrir dano físico.");
console.log("9. Proteção híbrida cobre físico+energético; tipo específico não cobre o tipo errado — OK");

console.log("\ntest-defense — todos os cenários passaram.");
