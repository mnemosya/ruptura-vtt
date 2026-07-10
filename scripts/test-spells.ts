/**
 * Teste puro (sem Supabase) de Vertentes e Magias — checkpoint v0.50.
 * Lê o DB real de magias para confirmar conjuração, atalho de dano e
 * vertentes conhecidas, sem hardcoding de catálogo.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeSpellContent,
  castSpell,
  rollSpellDamage,
  getSpellDamageEffect,
  getSpellResistanceEffect,
  getVertenteCd,
  resolveSpellResistance,
  getKnownVertentes,
  learnSpell,
  forgetSpell,
  isSpellLearned,
  createInitialCharacter,
  applyLongRest,
  computeDerivedStats,
  type SpellContent,
} from "../src/lib/character";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

console.log("=== test-spells ===\n");

const db = readJson<{ magias: Record<string, unknown>[] }>("content/db_magias_normalizado_v1_3.json");
const spells: SpellContent[] = db.magias.map(normalizeSpellContent);
assert.ok(spells.length >= 100, "Catálogo real deve ter pelo menos 100 magias.");

const controle = spells.find((s) => s.slug === "cinetica_controle");
assert.ok(controle, "Magia 'cinetica_controle' deve existir no DB real.");
assert.equal(controle!.estatisticas.custo_pa, 2);
assert.equal(controle!.estatisticas.custo_mana, null, "custo_mana é placeholder (null) para esta magia no DB atual.");

// -------------------------------------------------------------
// 1. Vertentes conhecidas — DERIVADAS de magias aprendidas (checkpoint
// v0.50.2: sem passo manual de "conhecer vertente").
// -------------------------------------------------------------
const personagem = createInitialCharacter(null, "Testador de Magias");
assert.deepEqual(getKnownVertentes(personagem, spells), [], "Personagem novo não conhece nenhuma vertente.");
console.log("1. Vertentes conhecidas começam vazias (nenhuma magia aprendida ainda) — OK");

// -------------------------------------------------------------
// 2. Conjurar com PA suficiente — desconta PA; custo_mana ausente não bloqueia.
// -------------------------------------------------------------
const personagemComRecursos = {
  ...personagem,
  estado_jogo: { pa_gastos: 0, reacoes_usadas: 0, defesas_sem_reacao: 0 },
  recursos_atuais: { pv: 10, pe: 10, mana: 10, integridade: 10 },
};
const conjuracao = castSpell({ character: personagemComRecursos, spell: controle!, paMax: 3, manaMax: 10 });
assert.equal(conjuracao.ok, true);
assert.equal(conjuracao.paBefore, 3);
assert.equal(conjuracao.paAfter, 1, "3 PA - custo_pa(2) = 1.");
assert.equal(conjuracao.manaCostUnknown, true, "custo_mana null deve marcar manaCostUnknown.");
assert.equal(conjuracao.character.recursos_atuais?.mana, 10, "Mana não deve mudar quando o custo é placeholder.");
assert.equal(conjuracao.character.estado_jogo?.pa_gastos, 2);
console.log("2. Conjurar com PA suficiente (custo_mana placeholder não bloqueia/não desconta) — OK");

// -------------------------------------------------------------
// 3. Conjurar sem PA suficiente — não muda nada.
// -------------------------------------------------------------
const personagemSemPa = { ...personagemComRecursos, estado_jogo: { pa_gastos: 3, reacoes_usadas: 0, defesas_sem_reacao: 0 } };
const falhaConjuracao = castSpell({ character: personagemSemPa, spell: controle!, paMax: 3, manaMax: 10 });
assert.equal(falhaConjuracao.ok, false);
assert.ok(falhaConjuracao.reason?.includes("PA insuficiente"));
assert.equal(falhaConjuracao.character, personagemSemPa);
console.log("3. Conjurar sem PA suficiente — não muda o personagem — OK");

// -------------------------------------------------------------
// 4. Magia com custo_mana REAL (se existir no DB) desconta Mana de verdade.
// -------------------------------------------------------------
const comCustoManaReal = spells.find((s) => typeof s.estatisticas.custo_mana === "number");
if (comCustoManaReal) {
  const resultado = castSpell({ character: personagemComRecursos, spell: comCustoManaReal, paMax: 10, manaMax: 10 });
  if (resultado.ok) {
    assert.equal(resultado.manaCostUnknown, false);
    assert.equal(resultado.manaAfter, (resultado.manaBefore ?? 0) - comCustoManaReal.estatisticas.custo_mana!);
    console.log(`4. Magia com custo_mana real ("${comCustoManaReal.nome}") desconta Mana de verdade — OK`);
  } else {
    console.log(`4. Magia com custo_mana real encontrada mas PA/Mana de teste insuficiente — cenário pulado (${resultado.reason}).`);
  }
} else {
  console.log("4. Nenhuma magia com custo_mana real no DB atual (todas placeholder) — cenário documentado, não é bug.");
}

// -------------------------------------------------------------
// 4b. Mana insuficiente bloqueia a conjuração — não gasta PA, não muda nada.
// -------------------------------------------------------------
if (comCustoManaReal) {
  const personagemSemMana = {
    ...personagemComRecursos,
    recursos_atuais: { pv: 10, pe: 10, mana: 0, integridade: 10, mana_temporaria: 0 },
  };
  const bloqueado = castSpell({ character: personagemSemMana, spell: comCustoManaReal, paMax: 10, manaMax: 10 });
  assert.equal(bloqueado.ok, false, "Mana insuficiente deve bloquear a conjuração.");
  assert.ok(bloqueado.reason?.includes("Mana insuficiente"));
  assert.equal(bloqueado.character, personagemSemMana, "Nada deve mudar quando bloqueado por Mana insuficiente.");
  assert.equal(bloqueado.character.estado_jogo?.pa_gastos, personagemSemMana.estado_jogo.pa_gastos, "PA não deve ser gasto quando Mana é insuficiente.");
  console.log("4b. Mana insuficiente bloqueia a conjuração — PA não é gasto, nada muda — OK");
} else {
  console.log("4b. Sem magia de custo_mana real no DB atual — cenário pulado.");
}

// -------------------------------------------------------------
// 4c. Mana temporária é consumida ANTES da mana normal (PRD 10.3).
// -------------------------------------------------------------
if (comCustoManaReal) {
  const custo = comCustoManaReal.estatisticas.custo_mana!;
  const personagemComTemporaria = {
    ...personagemComRecursos,
    recursos_atuais: { pv: 10, pe: 10, mana: 10, integridade: 10, mana_temporaria: 1 },
  };
  const comTemporaria = castSpell({ character: personagemComTemporaria, spell: comCustoManaReal, paMax: 10, manaMax: 10 });
  assert.equal(comTemporaria.ok, true);
  const consumidoDaTemporaria = Math.min(1, custo);
  assert.equal(comTemporaria.manaTemporariaAfter, 1 - consumidoDaTemporaria, "Mana temporária deve ser drenada primeiro.");
  assert.equal(comTemporaria.manaAfter, 10 - (custo - consumidoDaTemporaria), "Só o restante do custo (após a temporária) desconta a Mana normal.");
  assert.equal(comTemporaria.character.recursos_atuais?.mana_temporaria, 1 - consumidoDaTemporaria);
  console.log(`4c. Mana temporária consumida antes da Mana normal (custo ${custo}, temporária 1) — OK`);

  // 4d. Insuficiência combinada: mana normal 0, mas temporária cobre o custo -> sucesso.
  const personagemSoComTemporaria = {
    ...personagemComRecursos,
    recursos_atuais: { pv: 10, pe: 10, mana: 0, integridade: 10, mana_temporaria: custo },
  };
  const soComTemporaria = castSpell({ character: personagemSoComTemporaria, spell: comCustoManaReal, paMax: 10, manaMax: 10 });
  assert.equal(soComTemporaria.ok, true, "Mana temporária suficiente por si só deve permitir a conjuração mesmo com Mana normal em 0.");
  assert.equal(soComTemporaria.manaAfter, 0, "Mana normal não deve ser tocada quando a temporária cobre todo o custo.");
  assert.equal(soComTemporaria.manaTemporariaAfter, 0);
  console.log("4d. Mana temporária sozinha cobre o custo (Mana normal em 0) — Mana normal intocada — OK");
} else {
  console.log("4c/4d. Sem magia de custo_mana real no DB atual — cenários pulados.");
}

// -------------------------------------------------------------
// 5. Atalho de dano — extrai fórmula real e rola determinística.
// -------------------------------------------------------------
const danoEfeito = getSpellDamageEffect(controle!);
assert.ok(danoEfeito, "cinetica_controle deve ter efeito de dano (1d4 contundente).");
assert.equal(danoEfeito!.dado, "1d4");
const rngFixo = () => 0.5; // 1d4 com rng=0.5 -> 1 + floor(0.5*4) = 3
const danoRolado = rollSpellDamage(controle!, rngFixo);
assert.equal(danoRolado, 3);
console.log("5. Atalho de dano (fórmula real do DB, rolagem determinística) — OK");

// -------------------------------------------------------------
// 6. Resistência do alvo — CD/ações extraídas, sem resolver o alvo.
// -------------------------------------------------------------
const resistencia = getSpellResistanceEffect(controle!);
assert.ok(resistencia, "cinetica_controle deve ter efeito de resistência.");
// `cdFormula` é a string BRUTA do conteúdo publicado (ainda não editada na
// digitalização original) — só verificamos aqui que referencia
// nivel_vertente, nunca o número que a precede. A CD NUMÉRICA de verdade
// é sempre `6 + nível` (regra do VTT, ver getVertenteCd/resolveSpellResistance
// abaixo) — nunca `5 + nível`, mesmo que o texto bruto do conteúdo ainda diga isso.
assert.ok(resistencia!.cdFormula.includes("nivel_vertente"));
assert.deepEqual(resistencia!.acoes, ["resistir"]);
console.log("6. Resistência do alvo — CD/ação extraídas como texto (sem resolver automaticamente) — OK");

// -------------------------------------------------------------
// 6b. CD de vertente — regra do VTT é 6 + nível (NUNCA 5 + nível).
// -------------------------------------------------------------
assert.equal(getVertenteCd(1), 7, "nível 1 → CD 7");
assert.equal(getVertenteCd(2), 8, "nível 2 → CD 8");
assert.equal(getVertenteCd(3), 9, "nível 3 → CD 9");
assert.equal(getVertenteCd(4), 10, "nível 4 → CD 10");
assert.equal(getVertenteCd(5), 11, "nível 5 → CD 11");
const semNivel = resolveSpellResistance(controle!, null);
assert.equal(semNivel!.cd, null, "sem nível de vertente definido, CD fica null (nunca inventa número).");
const comNivel2 = resolveSpellResistance(controle!, 2);
assert.equal(comNivel2!.cd, 8, "cinetica_controle nível de vertente 2 → CD 8 (6 + 2).");
console.log("6b. CD de vertente = 6 + nível (nunca 5 + nível) — OK");

// -------------------------------------------------------------
// 7. Magia sem efeito de dano não gera atalho (nunca inventa fórmula).
// -------------------------------------------------------------
const semDano = spells.find((s) => getSpellDamageEffect(s) === null);
assert.ok(semDano, "Deve haver pelo menos uma magia sem efeito de dano no DB real.");
assert.equal(rollSpellDamage(semDano!), null);
console.log("7. Magia sem efeito de dano não gera atalho de rolagem — OK");

// -------------------------------------------------------------
// 8. Aprender magia individual — idempotente (checkpoint v0.50.1).
// -------------------------------------------------------------
assert.equal(isSpellLearned(personagem, controle!.slug), false, "Personagem novo não aprendeu nenhuma magia.");
const comControleAprendido = learnSpell(personagem, controle!.slug, "2026-07-03T10:00:00.000Z");
assert.equal(isSpellLearned(comControleAprendido, controle!.slug), true);
assert.equal(comControleAprendido.magias_aprendidas?.length, 1);
const duplicadoAprendizado = learnSpell(comControleAprendido, controle!.slug, "2026-07-03T10:05:00.000Z");
assert.equal(duplicadoAprendizado, comControleAprendido, "Aprender a mesma magia de novo não deve mudar o personagem.");
console.log("8. Aprender magia individual (idempotente) — OK");

// -------------------------------------------------------------
// 9. Aprender a primeira magia de uma vertente já a torna "conhecida"
// (derivada, checkpoint v0.50.2) — sem passo manual separado.
// -------------------------------------------------------------
assert.ok(getKnownVertentes(comControleAprendido, spells).includes("cinetica"), "Aprender uma magia de 'cinetica' já deve tornar a vertente conhecida.");
assert.equal(getKnownVertentes(personagem, spells).includes("cinetica"), false, "Sem nenhuma magia aprendida, a vertente não é conhecida.");
console.log("9. Aprender a primeira magia de uma vertente já a torna conhecida (derivado, sem passo manual) — OK");

// -------------------------------------------------------------
// 10. Esquecer magia remove a entrada.
// -------------------------------------------------------------
const learnedId = comControleAprendido.magias_aprendidas![0].id;
const semControle = forgetSpell(comControleAprendido, learnedId);
assert.equal(isSpellLearned(semControle, controle!.slug), false);
assert.equal(semControle.magias_aprendidas?.length, 0);
console.log("10. Esquecer magia remove a entrada — OK");

// -------------------------------------------------------------
// 11. Descanso longo ainda restaura Mana ao máximo (e zera mana_temporaria)
//     mesmo depois de uma conjuração ter gastado Mana de verdade.
// -------------------------------------------------------------
if (comCustoManaReal) {
  const derived = computeDerivedStats(personagemComRecursos.atributos, null);
  const personagemGastouMana = {
    ...personagemComRecursos,
    recursos_atuais: { pv: 10, pe: 10, mana: 1, integridade: 10, mana_temporaria: 0 },
  };
  const descansado = applyLongRest(personagemGastouMana, derived, "2026-07-03T10:00:00.000Z");
  assert.equal(descansado.character.recursos_atuais?.mana, derived.mana_max, "Descanso longo deve restaurar Mana ao máximo.");
  assert.equal(descansado.character.recursos_atuais?.mana_temporaria, 0, "Descanso longo zera Mana temporária (PRD 10.3).");
  console.log("11. Descanso longo ainda restaura Mana ao máximo após conjuração ter gastado Mana — OK");
} else {
  console.log("11. Sem magia de custo_mana real no DB atual — cenário pulado.");
}

console.log("\ntest-spells — todos os cenários passaram.");
