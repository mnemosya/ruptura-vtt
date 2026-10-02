import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyAutoHealRemoval,
  applyConsoleMutation,
  applyGmCondition,
  normalizeConditionContent,
  resolveConditionResistanceCheck,
  resolveEndRoundConditionsForCharacter,
  type ActiveCondition,
  type Character,
  type ConditionContent,
} from "../src/lib/character/index.js";

const db = JSON.parse(readFileSync("content/db_condicoes_normalizado_v1_5.json", "utf8")) as {
  condicoes: Record<string, unknown>[];
};
const conditions: ConditionContent[] = db.condicoes.map(normalizeConditionContent);
const bySlug = new Map(conditions.map((condition) => [condition.slug, condition]));

assert.equal(conditions.length, 18);
assert.ok(bySlug.has("oculto"));
assert.deepEqual(
  Object.fromEntries(conditions.filter((condition) => condition.nivel_maximo).map((condition) => [condition.slug, condition.nivel_maximo])),
  { contundido: 2, envenenado: 3, lento: 2, ofuscado: 2, queimando: 3, sangrando: 3 },
);

const baseCharacter = (): Character => ({
  nome: "Teste",
  atributos: { corpo: 2, mente: 2, animo: 2 },
  pericias: {},
  recursos_atuais: { pv: 30, pe: 10 },
  condicoes_ativas: [],
  current_round: 1,
  current_scene: 1,
});

let character = baseCharacter();
let application = applyGmCondition(character, { slug: "queimando", nome: "Queimando", round: 1 }, "2026-10-01T12:00:00Z");
assert.equal(application.condicao?.nivel, 1);
assert.equal(application.condicao?.nivelMaximo, 3);
character = application.character;
application = applyGmCondition(character, { slug: "queimando", nome: "Queimando", round: 1 }, "2026-10-01T12:00:01Z");
assert.equal(application.agravada, true);
assert.equal(application.condicao?.nivel, 2);
character = application.character;
application = applyGmCondition(character, { slug: "queimando", nome: "Queimando", round: 1 }, "2026-10-01T12:00:02Z");
character = application.character;
application = applyGmCondition(character, { slug: "queimando", nome: "Queimando", round: 1 }, "2026-10-01T12:00:03Z");
assert.equal(application.agravada, false);
assert.equal(application.condicao?.nivel, 3);

const healConditions: ActiveCondition[] = [
  { id: "c", conditionId: "contundido", nome: "Contundido", aplicadaEm: "x", ativa: true, nivel: 2, nivelMaximo: 2 },
  { id: "s", conditionId: "sangrando", nome: "Sangrando", aplicadaEm: "x", ativa: true, nivel: 1, nivelMaximo: 3 },
  { id: "e", conditionId: "envenenado", nome: "Envenenado", aplicadaEm: "x", ativa: true, nivel: 2, nivelMaximo: 3 },
];
const healed = applyAutoHealRemoval(healConditions, 10, 11, "2026-10-01T12:01:00Z");
assert.equal(healed.condicoes.find((condition) => condition.id === "c")?.nivel, 1);
assert.equal(healed.condicoes.find((condition) => condition.id === "s")?.ativa, false);
assert.equal(healed.condicoes.find((condition) => condition.id === "e")?.nivel, 2);

const burning = baseCharacter();
burning.condicoes_ativas = [{ id: "q", conditionId: "queimando", nome: "Queimando", aplicadaEm: "x", ativa: true, nivel: 2, nivelMaximo: 3 }];
const burned = resolveEndRoundConditionsForCharacter({
  character: burning,
  conditions,
  round: 2,
  scene: 1,
  nowIso: "2026-10-01T12:02:00Z",
  rng: () => 0.5,
});
assert.equal(burned.damageEvents[0]?.formula, "1d8");
assert.equal(burned.damageEvents[0]?.rollResult, 5);

const poisoned = baseCharacter();
poisoned.condicoes_ativas = [{ id: "e", conditionId: "envenenado", nome: "Envenenado", aplicadaEm: "x", ativa: true, nivel: 3, nivelMaximo: 3 }];
const poisonRound = resolveEndRoundConditionsForCharacter({
  character: poisoned,
  conditions,
  round: 2,
  scene: 1,
  nowIso: "2026-10-01T12:03:00Z",
  rng: () => 0.5,
});
assert.equal(poisonRound.pendingChecks[0]?.onFailure && (poisonRound.pendingChecks[0].onFailure as { dano: string }).dano, "1d8");
const poisonFailure = resolveConditionResistanceCheck({
  character: poisonRound.character,
  check: poisonRound.pendingChecks[0],
  outcome: "failure",
  conditions,
  nowIso: "2026-10-01T12:03:30Z",
  rng: () => 0.5,
});
assert.equal(poisonFailure.damageEvent?.rollResult, 5);

const bleeding = baseCharacter();
bleeding.condicoes_ativas = [{ id: "s", conditionId: "sangrando", nome: "Sangrando", aplicadaEm: "x", ativa: true, nivel: 1, nivelMaximo: 3, aplicadaNaRodada: 1 }];
const bled = resolveEndRoundConditionsForCharacter({
  character: bleeding,
  conditions,
  round: 2,
  scene: 1,
  nowIso: "2026-10-01T12:04:00Z",
  rng: () => 0.5,
});
assert.equal(bled.character.condicoes_ativas?.[0]?.nivel, 2);

const suffocating = baseCharacter();
suffocating.condicoes_ativas = [{ id: "sf", conditionId: "sufocando", nome: "Sufocando", aplicadaEm: "2026-10-01T12:00:00Z", ativa: true }];
const suffocationRound1 = resolveEndRoundConditionsForCharacter({
  character: suffocating, conditions, round: 1, scene: 1, nowIso: "2026-10-01T12:05:00Z",
});
assert.equal(suffocationRound1.pendingChecks[0]?.resistance.cd, 6);
const unconscious = resolveConditionResistanceCheck({
  character: suffocationRound1.character,
  check: suffocationRound1.pendingChecks[0],
  outcome: "failure",
  conditions,
  nowIso: "2026-10-01T12:05:30Z",
});
assert.ok(unconscious.character.condicoes_ativas?.some((condition) => condition.conditionId === "inconsciente" && condition.ativa));
const suffocationRound2 = resolveEndRoundConditionsForCharacter({
  character: unconscious.character, conditions, round: 2, scene: 1, nowIso: "2026-10-01T12:06:00Z",
});
assert.equal(suffocationRound2.pendingChecks[0]?.resistance.cd, 7);
const dead = resolveConditionResistanceCheck({
  character: suffocationRound2.character,
  check: suffocationRound2.pendingChecks[0],
  outcome: "failure",
  conditions,
  nowIso: "2026-10-01T12:06:30Z",
});
assert.equal(dead.character.estado_terminal?.tipo, "morte");

// Transbordo no nível máximo: Ofuscado 2 → Cego; Contundido 2 → fratura sinalizada.
let ofuscado = baseCharacter();
for (let i = 0; i < 2; i++) ofuscado = applyGmCondition(ofuscado, { slug: "ofuscado", nome: "Ofuscado", round: 1 }, "2026-10-01T12:07:00Z").character;
const transbordo = applyGmCondition(ofuscado, { slug: "ofuscado", nome: "Ofuscado", round: 1 }, "2026-10-01T12:07:01Z");
assert.equal(transbordo.transbordo, "cego");
assert.ok(transbordo.character.condicoes_ativas?.some((c) => c.conditionId === "cego" && c.ativa && c.duracao === "ate_fim_do_proximo_turno"));
assert.equal(transbordo.character.condicoes_ativas?.find((c) => c.conditionId === "ofuscado")?.nivel, 2, "Ofuscado continua no nível 2.");
let contundido = baseCharacter();
for (let i = 0; i < 2; i++) contundido = applyGmCondition(contundido, { slug: "contundido", nome: "Contundido" }, "2026-10-01T12:07:02Z").character;
assert.equal(applyGmCondition(contundido, { slug: "contundido", nome: "Contundido" }, "2026-10-01T12:07:03Z").transbordo, "fratura");

// HUD/Console (applyConsoleMutation) segue a mesma regra: agrava, não duplica.
const ctx = { derived: {} as never, rules: null, reactionRules: {} as never, talents: [] };
const add = (c: Character, slug: string, nome: string) => applyConsoleMutation(c, {
  type: "condition_add",
  condition: { id: crypto.randomUUID(), conditionId: slug, nome, aplicadaEm: "2026-10-01T12:08:00Z", removidaEm: null, ativa: true },
}, ctx);
let hud = add(baseCharacter(), "sangrando", "Sangrando").character;
hud = add(hud, "sangrando", "Sangrando").character;
assert.equal(hud.condicoes_ativas?.length, 1, "HUD não duplica Sangrando.");
assert.equal(hud.condicoes_ativas?.[0]?.nivel, 2, "HUD agrava Sangrando para 2.");
const cegoDuplo = add(add(baseCharacter(), "cego", "Cego").character, "cego", "Cego");
assert.equal(cegoDuplo.character.condicoes_ativas?.length, 1, "Condição não cumulativa não duplica.");
assert.ok(cegoDuplo.meta.warnings?.some((w) => w.includes("já está ativa")));

// Conter sangramento impede o agravamento daquela rodada (o dano continua).
const contido = baseCharacter();
contido.condicoes_ativas = [{ id: "s", conditionId: "sangrando", nome: "Sangrando", aplicadaEm: "x", ativa: true, nivel: 1, nivelMaximo: 3, aplicadaNaRodada: 1, contidaNaRodada: 2 }];
const contidoFim = resolveEndRoundConditionsForCharacter({ character: contido, conditions, round: 2, scene: 1, nowIso: "2026-10-01T12:09:00Z", rng: () => 0.5 });
assert.equal(contidoFim.character.condicoes_ativas?.[0]?.nivel, 1, "Contido: não agrava.");
assert.equal(contidoFim.damageEvents.length, 1, "Contido: o dano da rodada continua.");

// Sangrando aplicado nesta rodada não agrava ainda.
const recente = baseCharacter();
recente.condicoes_ativas = [{ id: "s", conditionId: "sangrando", nome: "Sangrando", aplicadaEm: "x", ativa: true, nivel: 1, nivelMaximo: 3, aplicadaNaRodada: 3 }];
assert.equal(resolveEndRoundConditionsForCharacter({ character: recente, conditions, round: 3, scene: 1, nowIso: "2026-10-01T12:10:00Z", rng: () => 0.5 }).character.condicoes_ativas?.[0]?.nivel, 1);

// Um novo episódio de Sufocando recomeça em CD 6.
const respirou = {
  ...suffocationRound2.character,
  condicoes_ativas: (suffocationRound2.character.condicoes_ativas ?? []).map((c) => c.conditionId === "sufocando" ? { ...c, ativa: false } : c)
    .concat([{ id: "sf2", conditionId: "sufocando", nome: "Sufocando", aplicadaEm: "2026-10-01T13:00:00Z", ativa: true }]),
};
const novoEpisodio = resolveEndRoundConditionsForCharacter({ character: respirou, conditions, round: 9, scene: 2, nowIso: "2026-10-01T13:01:00Z" });
assert.equal(novoEpisodio.pendingChecks[0]?.resistance.cd, 6, "Novo episódio recomeça em CD 6.");

console.log("test-ruleset-v12-condicoes — 18 condições e níveis cumulativos válidos.");
