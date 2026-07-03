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
  addKnownVertente,
  removeKnownVertente,
  createInitialCharacter,
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
// 1. Vertentes conhecidas — adicionar/remover, idempotente.
// -------------------------------------------------------------
const personagem = createInitialCharacter(null, "Testador de Magias");
const comCinetica = addKnownVertente(personagem, "cinetica");
assert.deepEqual(comCinetica.vertentes_conhecidas, ["cinetica"]);
const duplicado = addKnownVertente(comCinetica, "cinetica");
assert.equal(duplicado, comCinetica, "Adicionar a mesma vertente de novo não deve mudar o personagem.");
const semCinetica = removeKnownVertente(comCinetica, "cinetica");
assert.deepEqual(semCinetica.vertentes_conhecidas, []);
console.log("1. Vertentes conhecidas (adicionar/remover, idempotente) — OK");

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
assert.equal(resistencia!.cdFormula, "5 + nivel_vertente");
assert.deepEqual(resistencia!.acoes, ["resistir"]);
console.log("6. Resistência do alvo — CD/ação extraídas como texto (sem resolver automaticamente) — OK");

// -------------------------------------------------------------
// 7. Magia sem efeito de dano não gera atalho (nunca inventa fórmula).
// -------------------------------------------------------------
const semDano = spells.find((s) => getSpellDamageEffect(s) === null);
assert.ok(semDano, "Deve haver pelo menos uma magia sem efeito de dano no DB real.");
assert.equal(rollSpellDamage(semDano!), null);
console.log("7. Magia sem efeito de dano não gera atalho de rolagem — OK");

console.log("\ntest-spells — todos os cenários passaram.");
