/**
 * Teste puro (sem Supabase) do fallback de Integridade — checkpoint
 * v0.45.1. Cobre o bug relatado no smoke test do v0.45: um personagem
 * legado/incompleto (sem `recursos_atuais.integridade` no payload)
 * normalizava para Integridade 0 e aparecia como "Fim da ficha" — um
 * artefato de campo ausente, não um estado real de Integridade zerada.
 */

import assert from "node:assert/strict";
import { normalizeCharacter, createInitialCharacter, getIntegrityBand } from "../src/lib/character";

console.log("=== test-integrity-fallback ===\n");

// -------------------------------------------------------------
// 1. Personagem legado sem integridade_atual/integridade_max (payload
//    bruto, sem passar `derived`) — não deve virar "fim da ficha".
// -------------------------------------------------------------
const legado = normalizeCharacter({
  nome: "Legado sem Integridade",
  atributos: { corpo: 1, mente: 1, animo: 3 },
  pericias: {},
  recursos_atuais: {}, // sem integridade — payload salvo antes deste campo existir
});
const integridadeEsperada = 10 + 3 * 2; // fallback do PRD: 10 + Ânimo×2
assert.equal(legado.recursos_atuais?.integridade, integridadeEsperada, "Integridade ausente deve virar o máximo derivado, não 0.");
assert.notEqual(getIntegrityBand(legado.recursos_atuais!.integridade!).label, "fim_da_ficha", "Personagem legado não deve aparecer como fim da ficha.");
assert.equal(getIntegrityBand(legado.recursos_atuais!.integridade!).label, "integro", "10+3*2=16 deve cair na faixa 'íntegro'.");
console.log("1. Personagem legado sem Integridade — normaliza para o máximo derivado, não 0 — OK");

// -------------------------------------------------------------
// 2. Personagem realmente com integridade_atual = 0 — deve continuar
//    aparecendo como fim da ficha (0 é um valor REAL, preservado).
// -------------------------------------------------------------
const zerado = normalizeCharacter({
  nome: "Integridade Real Zero",
  atributos: { corpo: 1, mente: 1, animo: 3 },
  pericias: {},
  recursos_atuais: { integridade: 0 },
});
assert.equal(zerado.recursos_atuais?.integridade, 0, "Integridade explicitamente 0 deve ser preservada.");
assert.equal(getIntegrityBand(zerado.recursos_atuais!.integridade!).label, "fim_da_ficha", "Integridade 0 real deve continuar como fim da ficha.");
console.log("2. Personagem com Integridade real 0 — continua fim da ficha — OK");

// -------------------------------------------------------------
// 3. createInitialCharacter (personagem novo, nunca salvo) também não
//    deve nascer com Integridade 0/undefined.
// -------------------------------------------------------------
const novo = createInitialCharacter(null, "Novo Personagem");
assert.equal(novo.recursos_atuais?.integridade, 10 + 1 * 2, "Personagem novo (Ânimo=1 fallback) deve nascer com Integridade = 12.");
assert.notEqual(getIntegrityBand(novo.recursos_atuais!.integridade!).label, "fim_da_ficha", "Personagem novo não deve nascer como fim da ficha.");
console.log("3. createInitialCharacter nasce com Integridade no máximo derivado — OK");

// -------------------------------------------------------------
// 4. Um valor real já salvo (ex.: 5, "1 distorção") nunca é sobrescrito
//    pelo fallback — normalizeCharacter só preenche AUSENTES.
// -------------------------------------------------------------
const comValorReal = normalizeCharacter({
  nome: "Com Integridade real",
  atributos: { corpo: 1, mente: 1, animo: 3 },
  pericias: {},
  recursos_atuais: { integridade: 5 },
});
assert.equal(comValorReal.recursos_atuais?.integridade, 5, "Valor real já salvo nunca é sobrescrito pelo fallback.");
assert.equal(getIntegrityBand(comValorReal.recursos_atuais!.integridade!).label, "distorcao_1");
console.log("4. Valor real de Integridade preservado (não sobrescrito) — OK");

console.log("\ntest-integrity-fallback — todos os cenários passaram.");
