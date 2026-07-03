/**
 * Teste puro (sem Supabase) do inventário/carteira/loja — checkpoint
 * v0.49. Lê o DB real de itens para confirmar que a compra funciona
 * com um item de verdade, sem hardcoding.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeItemContent, purchaseItem, setItemLoadoutState, removeItemFromInventory, adjustItemQuantity, createInitialCharacter, type ItemContent } from "../src/lib/character";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

console.log("=== test-inventory ===\n");

const db = readJson<{ itens: Record<string, unknown>[] }>("content/db_equipamentos_normalizado_v1_2.json");
const items: ItemContent[] = db.itens.map(normalizeItemContent);
assert.ok(items.length >= 100, "Catálogo real deve ter pelo menos 100 itens.");

const faca = items.find((i) => i.slug === "faca");
assert.ok(faca, "Item 'faca' deve existir no DB real.");
assert.equal(faca!.preco, 15);

const personagem = createInitialCharacter(null, "Comprador de Teste");

// -------------------------------------------------------------
// 1. Personagem novo nasce com carteira zerada e inventário vazio.
// -------------------------------------------------------------
assert.equal(personagem.carteira, undefined, "createInitialCharacter não define carteira (normalizeCharacter faz isso no load/save).");
console.log("1. Personagem novo sem carteira definida ainda (normalizada só no load/save) — OK");

const comCarteira = { ...personagem, carteira: { aretz_informal: 100, cdi: 0, cdi_craqueada: 0 } };

// -------------------------------------------------------------
// 2. Comprar item com fundos suficientes — desconta carteira, cria instância.
// -------------------------------------------------------------
const compra = purchaseItem({ character: comCarteira, item: faca!, quantidade: 1, walletId: "aretz_informal", nowIso: "2026-07-03T10:00:00.000Z" });
assert.equal(compra.ok, true);
assert.equal(compra.totalCost, 15);
assert.equal(compra.character.carteira?.aretz_informal, 85);
assert.equal(compra.character.inventario?.length, 1);
assert.equal(compra.instance?.itemSlug, "faca");
assert.equal(compra.instance?.estado, "mochila", "Item novo entra na mochila por padrão.");
console.log("2. Compra com fundos suficientes — desconta carteira, cria instância na mochila — OK");

// -------------------------------------------------------------
// 3. Comprar sem fundos suficientes — não muda nada.
// -------------------------------------------------------------
const semFundos = { ...personagem, carteira: { aretz_informal: 5, cdi: 0, cdi_craqueada: 0 } };
const compraFalha = purchaseItem({ character: semFundos, item: faca!, quantidade: 1, walletId: "aretz_informal", nowIso: "2026-07-03T10:00:00.000Z" });
assert.equal(compraFalha.ok, false);
assert.ok(compraFalha.reason?.includes("insuficiente"));
assert.equal(compraFalha.character, semFundos, "Sem fundos, o personagem não deve mudar.");
console.log("3. Compra sem fundos suficientes — não muda o personagem — OK");

// -------------------------------------------------------------
// 4. Preço unitário editável (PRD 13.2) e quantidade múltipla.
// -------------------------------------------------------------
const compraMultipla = purchaseItem({ character: comCarteira, item: faca!, quantidade: 3, walletId: "aretz_informal", precoUnitario: 10, nowIso: "2026-07-03T10:00:00.000Z" });
assert.equal(compraMultipla.totalCost, 30, "3 unidades a 10 cada = 30, preço editado ignora o preço do livro.");
assert.equal(compraMultipla.character.carteira?.aretz_informal, 70);
assert.equal(compraMultipla.instance?.quantidade, 3);
console.log("4. Preço unitário editável + quantidade múltipla — OK");

// -------------------------------------------------------------
// 5. Loadout: mudar estado, ajustar quantidade, remover.
// -------------------------------------------------------------
const instanceId = compra.instance!.id;
const equipado = setItemLoadoutState(compra.character, instanceId, "equipado");
assert.equal(equipado.inventario?.find((i) => i.id === instanceId)?.estado, "equipado");

const maisUnidades = adjustItemQuantity(equipado, instanceId, 2);
assert.equal(maisUnidades.inventario?.find((i) => i.id === instanceId)?.quantidade, 3);

const semItem = removeItemFromInventory(maisUnidades, instanceId);
assert.equal(semItem.inventario?.length, 0);
console.log("5. Loadout (mudar estado/ajustar quantidade/remover) — OK");

console.log("\ntest-inventory — todos os cenários passaram.");
