import assert from "node:assert/strict";
import { anotacaoDeLinha, corAnotacaoValida, hexDaAnotacao, limitarTraco, pontosValidos, pontosValidosParaAtualizacao, simplificarTraco } from "../src/app/mesas/[campaignId]/vtt/_dominio/anotacoes";

const reta = Array.from({ length: 1000 }, (_, i) => ({ q: i / 100, r: i / 200 }));
const reduzida = simplificarTraco(reta);
assert.deepEqual(reduzida, [reta[0], reta[reta.length - 1]], "reta deve preservar só extremos");

const curva = Array.from({ length: 4000 }, (_, i) => ({ q: i / 100, r: Math.sin(i / 12) }));
const limitada = limitarTraco(curva);
assert.ok(limitada.length <= 512, "nenhum traço persistido ultrapassa 512 pontos");
assert.deepEqual(limitada[0], curva[0]);
assert.deepEqual(limitada.at(-1), { q: 39.99, r: Math.round(Math.sin(3999 / 12) * 1000) / 1000 });
assert.ok(pontosValidos(limitada, "desenho"));
assert.equal(pontosValidos([{ q: 0, r: 0 }, { q: Infinity, r: 1 }], "desenho"), false);
assert.equal(pontosValidos([{ q: 0, r: 0 }, { q: 1, r: 1 }], "texto"), false);
assert.equal(pontosValidosParaAtualizacao([{ q: 3.25, r: -2.5 }]), true, "mover texto preserva seu único ponto");
assert.equal(pontosValidosParaAtualizacao([{ q: 0, r: 0 }, { q: 1, r: 1 }]), true, "mover desenho preserva seus pontos");
assert.equal(pontosValidosParaAtualizacao([{ q: Infinity, r: 0 }]), false);
assert.equal(anotacaoDeLinha({ id: "a", scene_id: "s", autor_id: "u", tipo: "texto", pontos: [{ q: 0, r: 0 }], texto: "<script>", cor: "ciano", espessura: 2, tamanho: 16, privada: true, revision: 1 })?.texto, "<script>");
assert.equal(anotacaoDeLinha({ id: "a", scene_id: "s", autor_id: "u", tipo: "texto", pontos: [{ q: Infinity, r: 0 }], texto: "x", cor: "ciano", espessura: 2, tamanho: 16, privada: false, revision: 1 }), null);
assert.equal(anotacaoDeLinha({ id: "a", scene_id: "s", autor_id: "u", tipo: "texto", pontos: [{ q: 0, r: 0 }], texto: "x", cor: "ciano", espessura: 2, tamanho: 16, privada: "false", revision: 1 }), null);
assert.equal(corAnotacaoValida("#3a9Bef"), true);
assert.equal(corAnotacaoValida("#3a9B"), false);
assert.equal(corAnotacaoValida("red"), false);
assert.equal(hexDaAnotacao("ciano"), "#00d4ff");
assert.equal(hexDaAnotacao("#3a9bef"), "#3a9bef");
console.log("Anotações: simplificação, limite e validação OK.");
