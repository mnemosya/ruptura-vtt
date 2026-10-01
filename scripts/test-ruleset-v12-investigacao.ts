import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  accessAttemptsPerAction,
  advanceBreakIn,
  attemptAccessV12,
  canStartAccessAction,
  createAccessChallengeV12,
  endAccessActionV12,
  startAccessActionV12,
  type AccessChallengeV12,
} from "../src/lib/rulesetV12";

/**
 * Desafio de Acesso e Arrombamento (capítulo 20) + coerência das
 * transcrições de Investigação e Conflitos Sociais. Nada é publicado.
 */

const inv = JSON.parse(readFileSync("content/v12/db_investigacao_v1_2.json", "utf8"));
const soc = JSON.parse(readFileSync("content/v12/db_conflitos_sociais_v1_2.json", "utf8"));
const pericias = new Set((JSON.parse(readFileSync("content/db_regras_personagem_normalizado_v1_4.json", "utf8")).pericias as { id: string }[]).map((p) => p.id));

// Transcrição.
assert.deepEqual(
  inv.acoes.map((a: { slug: string }) => a.slug),
  ["acessar", "arrombar", "auxiliar", "correlacionar", "investigar", "preservar", "utilizar_recurso", "vasculhar"],
);
const custo = Object.fromEntries(inv.acoes.map((a: { slug: string; custo: { valor?: number } }) => [a.slug, a.custo.valor]));
assert.deepEqual([custo.acessar, custo.arrombar, custo.auxiliar, custo.vasculhar], [1, 2, 1, 2]);
for (const m of inv.desafio_de_acesso.modelos) {
  assert.doesNotThrow(() => createAccessChallengeV12(m), m.slug);
  assert.ok(["direcional", "confirmacao"].includes(m.leitura), m.slug);
}
for (const t of inv.desafio_de_acesso.tipos) if (t.pericia) assert.ok(pericias.has(t.pericia), t.slug);
for (const p of soc.pericias_abordagens) assert.ok(pericias.has(p.pericia), p.pericia);
assert.equal(soc.argumentos.vantagem_maxima_por_teste, 2);
assert.equal(soc.testes.contestado.contra, "vontade");

// Tentativas por nível de perícia (+ Auxílio).
assert.deepEqual([0, 1, 2, 3, 4, 5].map((n) => accessAttemptsPerAction(n)), [1, 1, 2, 2, 3, 3]);
assert.equal(accessAttemptsPerAction(3, 1), 3, "Auxílio concede uma tentativa adicional.");

// Exemplo do livro: Tecnomagia 3, 2d4 Confirmação, Tolerância 3, Código 3–1.
const fixo = (codigo: number[], leitura: "direcional" | "confirmacao", tolerancia: number): AccessChallengeV12 => ({
  faces: 4, codigo, leitura, tolerancia, superado: false, contramedidaDisparada: false, historico: [],
});
let d = fixo([3, 1], "confirmacao", 3);
let acao = startAccessActionV12(d, 3);
assert.equal(acao.tentativasRestantes, 2);
let r = attemptAccessV12(d, acao, [1, 1]);
assert.equal(r.resultado.corretas, 1);
r = attemptAccessV12(r.desafio, r.acao, [2, 1]);
assert.equal(r.resultado.corretas, 1);
assert.equal(r.acao.encerrada, true);
assert.equal(r.desafio.tolerancia, 2, "Ação sem sucesso consome 1 Tolerância (uma vez).");
d = r.desafio;
acao = startAccessActionV12(d, 3);
r = attemptAccessV12(d, acao, [3, 1]);
assert.equal(r.resultado.corretas, 2);
assert.equal(r.desafio.superado, true);
assert.equal(r.desafio.tolerancia, 2, "Superar não consome Tolerância.");
assert.equal(r.desafio.historico.length, 3);
assert.equal(canStartAccessAction(r.desafio), false);

// Leitura Direcional.
const dir = attemptAccessV12(fixo([2, 4, 3], "direcional", 3), { tentativasRestantes: 1, encerrada: false }, [1, 4, 4]);
assert.deepEqual(dir.resultado.direcional, ["aumentar", "correto", "diminuir"]);

// Encerrar voluntariamente consome Tolerância; Contramedida dispara uma vez em 0.
let t = fixo([1, 1], "confirmacao", 1);
const parcial = attemptAccessV12(t, startAccessActionV12(t, 5), [2, 2]);
assert.equal(parcial.acao.encerrada, false, "Ainda há tentativas.");
const fim = endAccessActionV12(parcial.desafio, parcial.acao);
assert.equal(fim.desafio.tolerancia, 0);
assert.equal(fim.contramedida, true);
assert.equal(endAccessActionV12(fim.desafio, { tentativasRestantes: 1, encerrada: false }).contramedida, false, "Contramedida não repete.");
assert.throws(() => startAccessActionV12(fim.desafio, 5), /Tolerância/);
t = fixo([1, 1], "confirmacao", 3);
assert.throws(() => attemptAccessV12(t, { tentativasRestantes: 1, encerrada: false }, [5, 1]), /entre 1 e 4/);
assert.throws(() => attemptAccessV12(t, { tentativasRestantes: 1, encerrada: false }, [1]), /2 valores/);

// Código secreto dentro do intervalo.
const gerado = createAccessChallengeV12({ codigo: "3d6", leitura: "direcional", tolerancia: 4 }, () => 0.999);
assert.deepEqual(gerado.codigo, [6, 6, 6]);

// Arrombamento: 1/2/3 segmentos; falha não regride.
let porta = { preenchidos: 0, total: 4 };
porta = advanceBreakIn(porta, "sucesso_padrao");
porta = advanceBreakIn(porta, "falha");
assert.equal(porta.preenchidos, 2);
const aberta = advanceBreakIn(porta, "sucesso_critico");
assert.equal(aberta.aberto, true);
assert.equal(aberta.preenchidos, 4);

console.log("test-ruleset-v12-investigacao — Desafio de Acesso, Arrombamento e transcrições válidos.");
