/**
 * Teste de unidade da regra dos protótipos `/dev/rolagem-*`.
 *
 *   node --import tsx --test src/app/dev/rolagem/_base/regra.test.ts
 *
 * Cobre o exemplo da Ilya (cap. 13), as seis faixas nas bordas, os três
 * cenários de custo da troca (cap. 18), a Última Vontade, o desfazer e
 * o teste contestado com a comparação refeita depois da troca.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aplicarTroca,
  classificarMargem,
  custoDaTroca,
  desfazerTroca,
  distribuirD4,
  resolverTeste,
  reverterTroca,
  type Conduto,
  type Parcelas,
} from "./regra";

const ILYA: Parcelas = { atributo: 2, pericia: 3, modificador: 0 }; // Corpo 2 + Mobilidade 3

test("exemplo da Ilya: Normal 3 falha padrão –4; Sobrecarga 8 vira sucesso limitado +1", () => {
  const normal = resolverTeste(ILYA, { tipo: "cd", cd: 12 }, 3);
  assert.equal(normal.total, 8);
  assert.equal(normal.margem, -4);
  assert.equal(normal.faixa, "falha_padrao");
  assert.equal(normal.sucesso, false);

  const sobrecarga = resolverTeste(ILYA, { tipo: "cd", cd: 12 }, 8);
  assert.equal(sobrecarga.total, 13);
  assert.equal(sobrecarga.margem, 1);
  assert.equal(sobrecarga.faixa, "sucesso_limitado");
  assert.equal(sobrecarga.sucesso, true);

  // A troca da Ilya, longe do limite: recebe 1 Sobrecarga e nada mais.
  const t = aplicarTroca({ sobrecarga: 0, limite: 3, integridade: 8, rupturas: 0 });
  assert.equal(t.custo.faixa, "abaixo");
  assert.equal(t.depois.sobrecarga, 1);
  assert.equal(t.perdaIntegridade, 0);
});

test("seis faixas, nas bordas", () => {
  const casos: [number, string][] = [
    [9, "sucesso_critico"], [7, "sucesso_critico"], [6, "sucesso_padrao"], [3, "sucesso_padrao"],
    [2, "sucesso_limitado"], [0, "sucesso_limitado"], [-1, "falha_limitada"], [-2, "falha_limitada"],
    [-3, "falha_padrao"], [-6, "falha_padrao"], [-7, "falha_critica"], [-12, "falha_critica"],
  ];
  for (const [margem, faixa] of casos) assert.equal(classificarMargem(margem), faixa, `margem ${margem}`);
});

test("valor natural do dado não decide: um 10 pode dar sucesso padrão", () => {
  const r = resolverTeste({ atributo: 0, pericia: 0, modificador: 0 }, { tipo: "cd", cd: 6 }, 10);
  assert.equal(r.faixa, "sucesso_padrao");
});

test("sem CD não há margem nem faixa", () => {
  const r = resolverTeste(ILYA, { tipo: "livre" }, 7);
  assert.equal(r.total, 12);
  assert.equal(r.margem, null);
  assert.equal(r.faixa, null);
});

test("custo 1 — abaixo do limite: só 1 Sobrecarga", () => {
  const c: Conduto = { sobrecarga: 1, limite: 3, integridade: 8, rupturas: 0 };
  const custo = custoDaTroca(c);
  assert.equal(custo.faixa, "abaixo");
  assert.equal(custo.sobrecargaDepois, 2);
  const t = aplicarTroca(c);
  assert.deepEqual(t.depois, { sobrecarga: 2, limite: 3, integridade: 8, rupturas: 0 });
});

test("custo 2 — alcança o limite: Ruptura, Integridade cai o total de Rupturas", () => {
  // Primeira Ruptura: perde 1.
  const primeira = aplicarTroca({ sobrecarga: 2, limite: 3, integridade: 8, rupturas: 0 });
  assert.equal(primeira.custo.faixa, "alcanca");
  if (primeira.custo.faixa !== "alcanca") return;
  assert.equal(primeira.custo.ruptura, 1);
  assert.equal(primeira.perdaIntegridade, 1);
  assert.deepEqual(primeira.depois, { sobrecarga: 3, limite: 3, integridade: 7, rupturas: 1 });

  // Terceira Ruptura (duas já sofridas), limite 4: perde 3.
  const terceira = aplicarTroca({ sobrecarga: 3, limite: 4, integridade: 6, rupturas: 2 });
  assert.equal(terceira.custo.faixa, "alcanca");
  assert.equal(terceira.perdaIntegridade, 3);
  assert.equal(terceira.depois.integridade, 3);
  assert.equal(terceira.ultimaVontade, false);
});

test("custo 3 — ultrapassa o limite: 1º excedente 1d4, 2º 2d4, 3º 3d4", () => {
  const um = custoDaTroca({ sobrecarga: 3, limite: 3, integridade: 9, rupturas: 1 });
  const dois = custoDaTroca({ sobrecarga: 4, limite: 3, integridade: 9, rupturas: 1 });
  const tres = custoDaTroca({ sobrecarga: 5, limite: 3, integridade: 9, rupturas: 1 });
  assert.equal(um.faixa, "ultrapassa");
  assert.equal(dois.faixa, "ultrapassa");
  assert.equal(tres.faixa, "ultrapassa");
  if (um.faixa !== "ultrapassa" || dois.faixa !== "ultrapassa" || tres.faixa !== "ultrapassa") return;
  assert.deepEqual([um.excedente, um.d4], [1, 1]);
  assert.deepEqual([dois.excedente, dois.d4], [2, 2]);
  assert.deepEqual([tres.excedente, tres.d4, tres.perdaMinima, tres.perdaMaxima], [3, 3, 3, 12]);

  const t = aplicarTroca({ sobrecarga: 4, limite: 3, integridade: 9, rupturas: 1 }, [3, 2]);
  assert.equal(t.perdaIntegridade, 5);
  assert.deepEqual(t.depois, { sobrecarga: 5, limite: 3, integridade: 4, rupturas: 1 });
  // Ultrapassar não provoca nova Ruptura.
  assert.equal(t.depois.rupturas, 1);
  assert.throws(() => aplicarTroca({ sobrecarga: 4, limite: 3, integridade: 9, rupturas: 1 }, [3]));
});

test("Última Vontade: Integridade em 0 pela Ruptura ou pelos excedentes", () => {
  const ruptura = aplicarTroca({ sobrecarga: 2, limite: 3, integridade: 1, rupturas: 0 });
  assert.equal(ruptura.ultimaVontade, true);
  assert.equal(ruptura.depois.integridade, 0);

  const certa = custoDaTroca({ sobrecarga: 3, limite: 3, integridade: 1, rupturas: 1 });
  const pode = custoDaTroca({ sobrecarga: 3, limite: 3, integridade: 3, rupturas: 1 });
  const nao = custoDaTroca({ sobrecarga: 3, limite: 3, integridade: 5, rupturas: 1 });
  assert.equal(certa.faixa === "ultrapassa" && certa.ultimaVontade, "certa");
  assert.equal(pode.faixa === "ultrapassa" && pode.ultimaVontade, "pode");
  assert.equal(nao.faixa === "ultrapassa" && nao.ultimaVontade, "nao");

  const zerou = aplicarTroca({ sobrecarga: 3, limite: 3, integridade: 3, rupturas: 1 }, [4]);
  assert.equal(zerou.ultimaVontade, true);
});

test("desfazer devolve o ponto, a Ruptura e a Integridade", () => {
  const antes: Conduto = { sobrecarga: 2, limite: 3, integridade: 5, rupturas: 1 };
  const t = aplicarTroca(antes);
  assert.notDeepEqual(t.depois, antes);
  assert.deepEqual(desfazerTroca(t), antes);
  assert.deepEqual(reverterTroca(t.depois, t), antes);

  // Perda maior que a Integridade restante: zera, e o desfazer devolve só o que saiu.
  const passou = aplicarTroca({ sobrecarga: 4, limite: 3, integridade: 5, rupturas: 1 }, [3, 3]);
  assert.equal(passou.depois.integridade, 0);
  assert.equal(passou.ultimaVontade, true);
  assert.deepEqual(reverterTroca(passou.depois, passou), { sobrecarga: 4, limite: 3, integridade: 5, rupturas: 1 });

  // Duas trocas em rolagens diferentes; desfazer a PRIMEIRA mantém a segunda.
  const t1 = aplicarTroca({ sobrecarga: 3, limite: 3, integridade: 9, rupturas: 1 }, [2]);
  const t2 = aplicarTroca(t1.depois, [3, 1]);
  assert.deepEqual(reverterTroca(t2.depois, t1), { sobrecarga: 4, limite: 3, integridade: 5, rupturas: 1 });
});

test("contestado: a comparação é refeita depois da troca", () => {
  const alvo = { tipo: "contestado", oponente: 11, iniciou: "eu" } as const;
  const normal = resolverTeste(ILYA, alvo, 3); // 8 × 11
  assert.equal(normal.sucesso, false);
  assert.equal(normal.margem, -3);
  assert.equal(normal.faixa, "falha_padrao");
  const trocado = resolverTeste(ILYA, alvo, 8); // 13 × 11
  assert.equal(trocado.sucesso, true);
  assert.equal(trocado.margem, 2);
  assert.equal(trocado.faixa, "sucesso_limitado");
});

test("contestado empatado: vence quem iniciou", () => {
  const eu = resolverTeste(ILYA, { tipo: "contestado", oponente: 13, iniciou: "eu" }, 8);
  assert.deepEqual([eu.sucesso, eu.margem, eu.faixa, eu.empate], [true, 0, "sucesso_limitado", "eu"]);
  const ele = resolverTeste(ILYA, { tipo: "contestado", oponente: 13, iniciou: "oponente" }, 8);
  assert.deepEqual([ele.sucesso, ele.margem, ele.faixa, ele.empate], [false, 0, null, "oponente"]);
});

test("perda forçada vira d4 válidos", () => {
  assert.deepEqual(distribuirD4(5, 2), [3, 2]);
  assert.deepEqual(distribuirD4(99, 2), [4, 4]);
  assert.deepEqual(distribuirD4(0, 3), [1, 1, 1]);
});
