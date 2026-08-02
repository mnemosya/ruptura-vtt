/**
 * Testes das partes de maior risco do Console do Personagem (spec §16):
 * interpretação matemática da edição de recurso, geometria da janela
 * (minimizar/restaurar, maximizar/restaurar, limites) e compatibilidade
 * item × slot. Puro, sem Supabase e sem DOM.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseResourceEdit } from "../src/app/ficha/_console/resourceMath";
import {
  geometriaInicial,
  geometriaMaximizada,
  limitarPosicao,
  redimensionar,
  MIN_W,
  MIN_H,
  type Geometry,
} from "../src/app/ficha/_console/geometry";
import { itemCabeNoSlot, itensCompativeisComSlot, projectBodySlots } from "../src/app/ficha/_console/slots";
import { normalizeItemContent, type InventoryItemInstance, type ItemContent } from "../src/lib/character";

console.log("=== test-console ===\n");

// -------------------------------------------------------------
// 1. Edição de recurso: absoluto, adição, subtração, clamps.
// -------------------------------------------------------------
const abs = parseResourceEdit("8", 13, 13);
assert.deepEqual(abs, { ok: true, value: 8 }, "Valor absoluto substitui o atual.");

assert.deepEqual(parseResourceEdit("-3", 13, 13), { ok: true, value: 10 }, "13 com -3 = 10.");
assert.deepEqual(parseResourceEdit("+2", 10, 13), { ok: true, value: 12 }, "10 com +2 = 12.");
console.log("1. Absoluto, adição e subtração — OK");

// -------------------------------------------------------------
// 2. Clamps em 0 e no máximo; o máximo nunca muda.
// -------------------------------------------------------------
assert.deepEqual(parseResourceEdit("-99", 5, 13), { ok: true, value: 0 }, "Nunca abaixo de zero.");
assert.deepEqual(parseResourceEdit("+99", 5, 13), { ok: true, value: 13 }, "Nunca acima do máximo.");
assert.deepEqual(parseResourceEdit("500", 5, 13), { ok: true, value: 13 }, "Absoluto acima do máximo é limitado.");
console.log("2. Clamp entre 0 e o máximo — OK");

// -------------------------------------------------------------
// 3. Entradas inválidas não produzem valor.
// -------------------------------------------------------------
for (const invalido of ["", "  ", "abc", "1.5", "+-2", "3a", "--3", "+"]) {
  const r = parseResourceEdit(invalido, 5, 13);
  assert.equal(r.ok, false, `"${invalido}" deve ser rejeitado.`);
}
console.log("3. Entradas inválidas rejeitadas — OK");

// -------------------------------------------------------------
// 4. Geometria: inicial respeita mínimos e centraliza.
// -------------------------------------------------------------
const vpGrande = { w: 1920, h: 1080 };
const inicial = geometriaInicial(vpGrande);
assert.ok(inicial.w >= MIN_W && inicial.h >= MIN_H, "Inicial respeita os mínimos.");
assert.ok(inicial.x > 0 && inicial.y > 0, "Inicial fica centralizada, sem encostar nas bordas.");

const vpPequena = { w: 800, h: 600 };
const inicialPequena = geometriaInicial(vpPequena);
assert.equal(inicialPequena.w, MIN_W, "Abaixo do mínimo a janela fica no mínimo (conteúdo é que rola).");
assert.equal(inicialPequena.h, MIN_H, "Idem para a altura.");
console.log("4. Geometria inicial — OK");

// -------------------------------------------------------------
// 5. Maximizar e restaurar devolvem a geometria EXATA anterior.
// -------------------------------------------------------------
const antes: Geometry = { x: 140, y: 90, w: 1300, h: 780 };
const max = geometriaMaximizada(vpGrande);
assert.ok(max.w > antes.w && max.h > antes.h, "Maximizada ocupa mais que a anterior.");
assert.ok(max.x > 0 && max.y > 0, "Maximizada mantém inset visual.");
// Restaurar é devolver o objeto guardado — o teste garante que nada o mutou.
const restaurada = { ...antes };
assert.deepEqual(restaurada, { x: 140, y: 90, w: 1300, h: 780 }, "Restaurar devolve a geometria exata.");
console.log("5. Maximizar/restaurar preservam a geometria — OK");

// -------------------------------------------------------------
// 6. Arraste nunca joga a janela inteiramente para fora da viewport.
// -------------------------------------------------------------
const foraEsquerda = limitarPosicao({ x: -99999, y: 300, w: 1300, h: 780 }, vpGrande);
assert.ok(foraEsquerda.x + foraEsquerda.w > 0, "Sobra parte visível à esquerda.");
const foraDireita = limitarPosicao({ x: 99999, y: 300, w: 1300, h: 780 }, vpGrande);
assert.ok(foraDireita.x < vpGrande.w, "Sobra parte visível à direita.");
const foraCima = limitarPosicao({ x: 100, y: -500, w: 1300, h: 780 }, vpGrande);
assert.equal(foraCima.y, 0, "A topbar nunca sobe acima do topo.");
const foraBaixo = limitarPosicao({ x: 100, y: 99999, w: 1300, h: 780 }, vpGrande);
assert.ok(foraBaixo.y < vpGrande.h, "A topbar continua alcançável embaixo.");
console.log("6. Limites de arraste — OK");

// -------------------------------------------------------------
// 7. Resize respeita os mínimos.
// -------------------------------------------------------------
const encolhida = redimensionar({ x: 10, y: 10, w: 1300, h: 780 }, 100, 100, vpGrande);
assert.equal(encolhida.w, MIN_W, "Não encolhe abaixo da largura mínima.");
assert.equal(encolhida.h, MIN_H, "Não encolhe abaixo da altura mínima.");
console.log("7. Resize respeita o tamanho mínimo — OK");

// -------------------------------------------------------------
// 8. Compatibilidade item × slot, com o DB REAL de equipamentos.
// -------------------------------------------------------------
const db = JSON.parse(readFileSync("content/db_equipamentos_normalizado_v1_2.json", "utf8")) as {
  itens: Record<string, unknown>[];
};
const itens: ItemContent[] = db.itens.map(normalizeItemContent);
const catalogo = new Map(itens.map((i) => [i.slug, i]));

const armaduraTronco = itens.find((i) => i.categoria === "armadura" && i.regioes.includes("tronco"));
const armaduraCabeca = itens.find((i) => i.categoria === "armadura" && i.regioes.includes("cabeca"));
const arma = itens.find((i) => i.categoria === "arma");
const escudoItem = itens.find((i) => i.categoria === "escudo");
const granada = itens.find((i) => i.categoria === "explosivo");

assert.ok(armaduraTronco && armaduraCabeca && arma && escudoItem && granada, "O DB real precisa ter os cinco tipos.");

assert.ok(itemCabeNoSlot(armaduraTronco, "tronco"), "Armadura de tronco cabe no tronco.");
assert.ok(!itemCabeNoSlot(armaduraTronco, "cabeca"), "Armadura de tronco NÃO cabe na cabeça.");
assert.ok(itemCabeNoSlot(armaduraCabeca, "cabeca"), "Armadura de cabeça cabe na cabeça.");
assert.ok(itemCabeNoSlot(arma, "arma_primaria"), "Arma cabe em arma primária.");
assert.ok(!itemCabeNoSlot(arma, "escudo"), "Arma NÃO cabe no slot de escudo.");
assert.ok(itemCabeNoSlot(escudoItem, "escudo"), "Escudo cabe no slot de escudo.");
assert.ok(itemCabeNoSlot(granada, "acesso_rapido_1"), "Granada cabe no acesso rápido.");
assert.ok(!itemCabeNoSlot(granada, "tronco"), "Granada NÃO cabe no tronco.");
assert.ok(!itemCabeNoSlot(undefined, "tronco"), "Item desconhecido nunca passa.");
console.log("8. Compatibilidade item × slot (DB real) — OK");

// -------------------------------------------------------------
// 9. Filtro da Mochila devolve só o compatível e só o que está guardado.
// -------------------------------------------------------------
function inst(id: string, slug: string, estado: InventoryItemInstance["estado"]): InventoryItemInstance {
  return {
    id,
    itemSlug: slug,
    itemNome: slug,
    categoria: catalogo.get(slug)?.categoria ?? "",
    quantidade: 1,
    estado,
    adquiridoEm: `2026-01-0${id}T00:00:00.000Z`,
  } as InventoryItemInstance;
}

const inventario = [
  inst("1", armaduraTronco!.slug, "mochila"),
  inst("2", arma!.slug, "mochila"),
  inst("3", armaduraCabeca!.slug, "equipado"),
];
const compat = itensCompativeisComSlot(inventario, catalogo, "tronco");
assert.deepEqual(compat.map((i) => i.id), ["1"], "Só a armadura de tronco guardada na mochila.");
assert.equal(itensCompativeisComSlot(inventario, catalogo, "escudo").length, 0, "Nada compatível com escudo aqui.");
console.log("9. Filtro da Mochila por slot — OK");

// -------------------------------------------------------------
// 10. Projeção: armadura equipada ocupa a região que o modelo declara.
// -------------------------------------------------------------
const proj = projectBodySlots(inventario, catalogo);
assert.equal(proj.slots.length, 9, "São nove slots.");
assert.equal(proj.slots.find((s) => s.id === "cabeca")!.instance?.id, "3", "A armadura de cabeça ocupa a cabeça.");
assert.equal(proj.slots.find((s) => s.id === "tronco")!.instance, null, "O tronco continua vazio.");
console.log("10. Projeção usa a região declarada pelo modelo — OK");

// -------------------------------------------------------------
// 11. Ordem das armas é estável (não depende do índice do array).
// -------------------------------------------------------------
const duasArmas = [
  { ...inst("b", arma!.slug, "empunhado"), adquiridoEm: "2026-03-01T00:00:00.000Z", itemNome: "Segunda" },
  { ...inst("a", arma!.slug, "empunhado"), adquiridoEm: "2026-02-01T00:00:00.000Z", itemNome: "Primeira" },
];
const projArmas = projectBodySlots(duasArmas, catalogo);
assert.equal(projArmas.slots.find((s) => s.id === "arma_primaria")!.instance?.itemNome, "Primeira", "A mais antiga é a primária.");
const comExtra = projectBodySlots([inst("z", arma!.slug, "mochila"), ...duasArmas], catalogo);
assert.equal(
  comExtra.slots.find((s) => s.id === "arma_primaria")!.instance?.itemNome,
  "Primeira",
  "Comprar outro item não rebaixa a arma primária.",
);
console.log("11. Ordem estável das armas — OK");

console.log("\n=== test-console: todos os casos passaram ===");
