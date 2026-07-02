/**
 * Testes puros do motor de fim de rodada para condições data-driven (v0.44).
 * Lê o DB normalizado real e não acessa Supabase.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyRoundScopedPaReductions,
  normalizeConditionContent,
  resolveConditionResistanceCheck,
  resolveEndRoundConditionsForCharacter,
  type ConditionContent,
} from "../src/lib/character/endRoundConditions.js";
import { normalizeCharacter } from "../src/lib/character/normalizeCharacter.js";
import {
  resetRoundReactionState,
  normalizeReactionRules,
} from "../src/lib/character/reactions.js";
import type { ActiveCondition, Character } from "../src/lib/character/types.js";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const conditionsDb = readJson<{ condicoes: Record<string, unknown>[] }>(
  "content/db_condicoes_normalizado_v1_5.json",
);
const conditions: ConditionContent[] = conditionsDb.condicoes.map(normalizeConditionContent);
const flow = readJson<Record<string, unknown>>("content/db_fluxo_combate_normalizado_v1_1.json");
assert.equal(flow.rodada && (flow.rodada as Record<string, unknown>).renova_pa_em, "inicio_da_rodada");
assert.equal(flow.rodada && (flow.rodada as Record<string, unknown>).renova_reacoes_em, "inicio_da_rodada");
const reactionRules = normalizeReactionRules(flow);
assert.equal(reactionRules.valid, true);

/** RNG fixo: 0.5 -> 1+floor(0.5*6)=4 num d6; 1+floor(0.5*4)=3 num d4. Determinístico para os testes. */
const fixedRng = () => 0.5;

function condition(slug: string): ActiveCondition {
  return {
    id: `cond-${slug}`,
    conditionId: slug,
    nome: slug.charAt(0).toUpperCase() + slug.slice(1),
    aplicadaEm: "2026-07-02T10:00:00.000Z",
    removidaEm: null,
    ativa: true,
  };
}

function character(overrides: Partial<Character> = {}): Character {
  return normalizeCharacter({
    nome: "Personagem de teste",
    atributos: { corpo: 2, mente: 2, animo: 2 },
    pericias: {},
    recursos_atuais: { pv: 20, pe: 20 },
    estado_jogo: { pa_gastos: 0, reacoes_usadas: 0, defesas_sem_reacao: 0 },
    condicoes_ativas: [],
    current_round: 1,
    current_scene: 1,
    ...overrides,
  });
}

// ---------------------------------------------------------------------
// 1. Queimando — dano determinístico, condição continua ativa.
// ---------------------------------------------------------------------
{
  const c = character({ condicoes_ativas: [condition("queimando")] });
  const result = resolveEndRoundConditionsForCharacter({
    character: c,
    conditions,
    round: 1,
    scene: 1,
    nowIso: "2026-07-02T10:01:00.000Z",
    rng: fixedRng,
  });
  assert.equal(result.damageEvents.length, 1);
  assert.equal(result.damageEvents[0].rollResult, 4); // 1d6 com rng fixo
  assert.equal(result.damageEvents[0].damageType, "igneo");
  assert.equal(result.character.recursos_atuais?.pv, 16);
  assert.equal(
    result.tableLogs.some((l) => l.type === "condition_end_round_damage"),
    true,
  );
  const queimandoAtiva = result.character.condicoes_ativas?.find((cc) => cc.conditionId === "queimando");
  assert.equal(queimandoAtiva?.ativa, true, "Queimando não é removido pelo fim de rodada.");
  console.log("1. Queimando — OK");
}

// ---------------------------------------------------------------------
// 2. Sangrando — dano determinístico, sem teste criado, continua ativo.
// ---------------------------------------------------------------------
{
  const c = character({ condicoes_ativas: [condition("sangrando")] });
  const result = resolveEndRoundConditionsForCharacter({
    character: c,
    conditions,
    round: 1,
    scene: 1,
    nowIso: "2026-07-02T10:01:00.000Z",
    rng: fixedRng,
  });
  assert.equal(result.damageEvents.length, 1);
  assert.equal(result.damageEvents[0].rollResult, 4);
  assert.equal(result.damageEvents[0].damageType, "fisico");
  assert.equal(result.character.recursos_atuais?.pv, 16);
  assert.equal(result.pendingChecks.length, 0, "Sangrando não cria teste.");
  const sangrandoAtiva = result.character.condicoes_ativas?.find((cc) => cc.conditionId === "sangrando");
  assert.equal(sangrandoAtiva?.ativa, true);
  console.log("2. Sangrando — OK");
}

// ---------------------------------------------------------------------
// 3. Envenenado — redução de PA na rodada nova.
// ---------------------------------------------------------------------
{
  const c = character({ condicoes_ativas: [condition("envenenado")], estado_jogo: { pa_gastos: 0 } });
  const paMax = 3;
  const reduction = applyRoundScopedPaReductions({ character: c, conditions, paMax, round: 2, scene: 1 });
  assert.equal(reduction.totalReduction, 1);
  assert.equal(reduction.character.estado_jogo?.pa_gastos, 1);
  assert.equal(paMax - (reduction.character.estado_jogo?.pa_gastos ?? 0), 2, "PA final = PA máximo - 1.");
  assert.equal(
    reduction.tableLogs.some((l) => l.type === "round_pa_reduced_by_condition"),
    true,
  );
  console.log("3. Envenenado — PA — OK");
}

// ---------------------------------------------------------------------
// 4. Envenenado — teste de fim de rodada (sucesso e falha).
// ---------------------------------------------------------------------
{
  const c = character({ condicoes_ativas: [condition("envenenado")] });
  const result = resolveEndRoundConditionsForCharacter({
    character: c,
    conditions,
    round: 1,
    scene: 1,
    nowIso: "2026-07-02T10:01:00.000Z",
    rng: fixedRng,
  });
  assert.equal(result.pendingChecks.length, 1);
  const check = result.pendingChecks[0];
  assert.equal(check.effectType, "teste_fim_de_rodada");
  assert.equal(check.resistance.pericia, "vigor");
  assert.equal(check.resistance.cd, 7);
  assert.equal(
    result.tableLogs.some((l) => l.type === "condition_end_round_check_created"),
    true,
  );

  // Sucesso: não aplica dano, não remove Envenenado.
  const afterSuccess = resolveConditionResistanceCheck({
    character: result.character,
    check,
    outcome: "success",
    conditions,
    nowIso: "2026-07-02T10:02:00.000Z",
    rng: fixedRng,
  });
  assert.equal(afterSuccess.damageEvent, undefined);
  assert.equal(afterSuccess.character.pending_condition_checks?.length, 0);
  const envenenadoAindaAtivo = afterSuccess.character.condicoes_ativas?.find((cc) => cc.conditionId === "envenenado");
  assert.equal(envenenadoAindaAtivo?.ativa, true, "Sucesso não remove Envenenado.");

  // Falha: aplica 1d4 tóxico.
  const afterFailure = resolveConditionResistanceCheck({
    character: result.character,
    check,
    outcome: "failure",
    conditions,
    nowIso: "2026-07-02T10:02:00.000Z",
    rng: fixedRng,
  });
  assert.ok(afterFailure.damageEvent);
  assert.equal(afterFailure.damageEvent?.rollResult, 3); // 1d4 com rng fixo
  assert.equal(afterFailure.damageEvent?.damageType, "toxico");
  assert.equal(
    afterFailure.tableLogs.some((l) => l.type === "condition_end_round_check_resolved"),
    true,
  );
  console.log("4. Envenenado — teste — OK");
}

// ---------------------------------------------------------------------
// 5. Saturado + Envenenado — teste para remover Envenenado.
// ---------------------------------------------------------------------
{
  const c = character({ condicoes_ativas: [condition("saturado"), condition("envenenado")] });
  const result = resolveEndRoundConditionsForCharacter({
    character: c,
    conditions,
    round: 1,
    scene: 1,
    nowIso: "2026-07-02T10:01:00.000Z",
    rng: fixedRng,
  });
  const removalCheck = result.pendingChecks.find((p) => p.effectType === "teste_fim_de_rodada_para_remover_condicao");
  assert.ok(removalCheck, "Deve criar pendência para remover Envenenado.");
  assert.equal(removalCheck?.targetConditionId, "envenenado");

  const afterSuccess = resolveConditionResistanceCheck({
    character: result.character,
    check: removalCheck!,
    outcome: "success",
    conditions,
    nowIso: "2026-07-02T10:02:00.000Z",
  });
  assert.equal(afterSuccess.removedConditionSlug, "envenenado");
  const envenenadoRemovido = afterSuccess.character.condicoes_ativas?.find((cc) => cc.conditionId === "envenenado");
  assert.equal(envenenadoRemovido?.ativa, false);
  assert.equal(envenenadoRemovido?.removidaOrigem, "end_round_condition_check");

  const afterFailure = resolveConditionResistanceCheck({
    character: result.character,
    check: removalCheck!,
    outcome: "failure",
    conditions,
    nowIso: "2026-07-02T10:02:00.000Z",
  });
  const envenenadoMantido = afterFailure.character.condicoes_ativas?.find((cc) => cc.conditionId === "envenenado");
  assert.equal(envenenadoMantido?.ativa, true, "Falha mantém Envenenado ativo.");
  console.log("5. Saturado + Envenenado — OK");
}

// ---------------------------------------------------------------------
// 6. Saturado sem Envenenado — não cria pendência de remoção.
// ---------------------------------------------------------------------
{
  const c = character({ condicoes_ativas: [condition("saturado")] });
  const result = resolveEndRoundConditionsForCharacter({
    character: c,
    conditions,
    round: 1,
    scene: 1,
    nowIso: "2026-07-02T10:01:00.000Z",
    rng: fixedRng,
  });
  const removalCheck = result.pendingChecks.find((p) => p.effectType === "teste_fim_de_rodada_para_remover_condicao");
  assert.equal(removalCheck, undefined, "Sem Envenenado ativo, não cria teste de remoção.");
  console.log("6. Saturado sem Envenenado — OK");
}

// ---------------------------------------------------------------------
// 7. Saturado — exposição (após 1 rodada, uma vez por cena, falha aplica Envenenado).
// ---------------------------------------------------------------------
{
  let c = character({ condicoes_ativas: [condition("saturado")], current_round: 1, current_scene: 1 });

  // Rodada 1: ainda dentro da janela de exposição (apos_rodadas=1) — não cria pendência ainda.
  const round1 = resolveEndRoundConditionsForCharacter({
    character: c,
    conditions,
    round: 1,
    scene: 1,
    nowIso: "2026-07-02T10:01:00.000Z",
    rng: fixedRng,
  });
  const exposureCheckRound1 = round1.pendingChecks.find((p) => p.effectType === "teste_apos_exposicao");
  assert.equal(exposureCheckRound1, undefined, "Rodada 1 ainda é a rodada de início da exposição.");
  c = round1.character;

  // Rodada 2: 1 rodada de exposição completa — cria pendência.
  const round2 = resolveEndRoundConditionsForCharacter({
    character: c,
    conditions,
    round: 2,
    scene: 1,
    nowIso: "2026-07-02T10:02:00.000Z",
    rng: fixedRng,
  });
  const exposureCheck = round2.pendingChecks.find((p) => p.effectType === "teste_apos_exposicao");
  assert.ok(exposureCheck, "Rodada 2 deve criar a pendência de exposição.");
  c = round2.character;

  const afterFailure = resolveConditionResistanceCheck({
    character: c,
    check: exposureCheck!,
    outcome: "failure",
    conditions,
    nowIso: "2026-07-02T10:03:00.000Z",
  });
  assert.equal(afterFailure.appliedConditionSlug, "envenenado");
  const envenenadoAplicado = afterFailure.character.condicoes_ativas?.find((cc) => cc.conditionId === "envenenado");
  assert.ok(envenenadoAplicado?.ativa);

  // Sucesso não aplica.
  const afterSuccess = resolveConditionResistanceCheck({
    character: c,
    check: exposureCheck!,
    outcome: "success",
    conditions,
    nowIso: "2026-07-02T10:03:00.000Z",
  });
  assert.equal(afterSuccess.appliedConditionSlug, undefined);

  // Não duplica na mesma cena (rodada 3, mesma cena).
  const round3 = resolveEndRoundConditionsForCharacter({
    character: c,
    conditions,
    round: 3,
    scene: 1,
    nowIso: "2026-07-02T10:04:00.000Z",
    rng: fixedRng,
  });
  const duplicated = round3.pendingChecks.find((p) => p.effectType === "teste_apos_exposicao");
  assert.equal(duplicated, undefined, "Não deve duplicar a pendência de exposição na mesma cena.");
  console.log("7. Saturado — exposição — OK");
}

// ---------------------------------------------------------------------
// 8. Insaturado — exposição, falha aplica Lento com duração textual.
// ---------------------------------------------------------------------
{
  let c = character({ condicoes_ativas: [condition("insaturado")], current_round: 1, current_scene: 1 });
  const round1 = resolveEndRoundConditionsForCharacter({
    character: c,
    conditions,
    round: 1,
    scene: 1,
    nowIso: "2026-07-02T10:01:00.000Z",
    rng: fixedRng,
  });
  c = round1.character;
  const round2 = resolveEndRoundConditionsForCharacter({
    character: c,
    conditions,
    round: 2,
    scene: 1,
    nowIso: "2026-07-02T10:02:00.000Z",
    rng: fixedRng,
  });
  const exposureCheck = round2.pendingChecks.find((p) => p.effectType === "teste_apos_exposicao");
  assert.ok(exposureCheck, "Insaturado também cria pendência após 1 rodada de exposição.");
  const afterFailure = resolveConditionResistanceCheck({
    character: round2.character,
    check: exposureCheck!,
    outcome: "failure",
    conditions,
    nowIso: "2026-07-02T10:03:00.000Z",
  });
  assert.equal(afterFailure.appliedConditionSlug, "lento");
  const lento = afterFailure.character.condicoes_ativas?.find((cc) => cc.conditionId === "lento");
  assert.equal(lento?.duracao, "ate_sair_da_area");
  console.log("8. Insaturado — exposição — OK");
}

// ---------------------------------------------------------------------
// 9. Idempotência — processar a mesma rodada duas vezes não duplica.
// ---------------------------------------------------------------------
{
  const c = character({ condicoes_ativas: [condition("queimando")] });
  const first = resolveEndRoundConditionsForCharacter({
    character: c,
    conditions,
    round: 1,
    scene: 1,
    nowIso: "2026-07-02T10:01:00.000Z",
    rng: fixedRng,
  });
  const second = resolveEndRoundConditionsForCharacter({
    character: first.character,
    conditions,
    round: 1, // mesma rodada de novo (ex.: reload/clique duplo)
    scene: 1,
    nowIso: "2026-07-02T10:01:05.000Z",
    rng: fixedRng,
  });
  assert.equal(second.damageEvents.length, 0, "Reprocessar a mesma rodada não aplica dano de novo.");
  assert.equal(second.character.recursos_atuais?.pv, first.character.recursos_atuais?.pv, "PV não muda na segunda chamada.");

  const c2 = character({ condicoes_ativas: [condition("envenenado")] });
  const firstCheck = resolveEndRoundConditionsForCharacter({
    character: c2,
    conditions,
    round: 1,
    scene: 1,
    nowIso: "2026-07-02T10:01:00.000Z",
    rng: fixedRng,
  });
  const secondCheck = resolveEndRoundConditionsForCharacter({
    character: firstCheck.character,
    conditions,
    round: 1,
    scene: 1,
    nowIso: "2026-07-02T10:01:05.000Z",
    rng: fixedRng,
  });
  assert.equal(secondCheck.pendingChecks.length, 0, "Reprocessar a mesma rodada não duplica pendência.");
  assert.equal(secondCheck.character.pending_condition_checks?.length, 1);
  console.log("9. Idempotência — OK");
}

// ---------------------------------------------------------------------
// 10. Colapso — dano de condição reduz PV a 0 aciona Colapso existente.
// ---------------------------------------------------------------------
{
  const c = character({ condicoes_ativas: [condition("sangrando")], recursos_atuais: { pv: 3, pe: 10 } });
  const result = resolveEndRoundConditionsForCharacter({
    character: c,
    conditions,
    round: 1,
    scene: 1,
    nowIso: "2026-07-02T10:01:00.000Z",
    rng: fixedRng, // 1d6 = 4 > 3 de PV
  });
  assert.equal(result.character.recursos_atuais?.pv, 0);
  assert.equal(result.character.colapso?.ativo, true);
  assert.equal(result.character.colapso?.tipo, "pv");
  assert.equal(
    result.warnings.some((w) => w.includes("Colapso")),
    true,
  );
  console.log("10. Colapso — OK");
}

// ---------------------------------------------------------------------
// 11. Regressão v0.43 — reset de Reações/penalidade continua funcionando.
// ---------------------------------------------------------------------
{
  const c = character({ estado_jogo: { pa_gastos: 2, reacoes_usadas: 2, defesas_sem_reacao: 3 } });
  const reset = resetRoundReactionState(c);
  assert.equal(reset.estado_jogo?.reacoes_usadas, 0);
  assert.equal(reset.estado_jogo?.defesas_sem_reacao, 0);
  assert.equal(reset.estado_jogo?.pa_gastos, 2, "resetRoundReactionState não mexe em PA — reset de PA é separado (handleEndRoundForCharacter).");
  console.log("11. Regressão v0.43 — OK");
}

console.log("\ntest:end-round-conditions — todos os cenários passaram.");
