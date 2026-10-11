import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createInitialCharacter, normalizeCharacter, normalizeItemContent, purchaseItem } from "../src/lib/character";
import { normalizeTechnicalContentItem } from "../src/lib/content/technicalLibrary";
import { catalogWithMarketEscalpos, marketEscalpoParents } from "../src/lib/character/marketEscalpos";

const db = JSON.parse(readFileSync("content/db_escalpos_normalizado_v1_3.json", "utf8"));
const escalpos = db.escalpos.map(normalizeTechnicalContentItem);
const ordinary = normalizeItemContent({ slug: "adaga", nome: "Adaga", categoria: "arma", preco: 120 });
const catalog = catalogWithMarketEscalpos([ordinary], escalpos);
const saleable = escalpos.filter((e: ReturnType<typeof normalizeTechnicalContentItem>) => e.status === "published" && e.preco !== null && e.preco > 0);
assert.equal(catalog.size, saleable.length + 1);
assert.equal(catalog.get("adaga"), ordinary);
const source = saleable[0];
assert.ok(source);
const item = catalog.get(source.slug)!;
assert.equal(item.nome, source.nome);
assert.equal(item.preco, source.preco);
assert.equal(item.categoria, "escalpo");
for (const source of saleable) {
  assert.equal(catalog.get(source.slug)?.subtipo, source.categoriaLabel ?? source.categoria);
}
assert.equal(catalogWithMarketEscalpos([item], [source, source]).size, 1);
for (const preco of [null, 0, -1, NaN, Infinity]) {
  assert.equal(catalogWithMarketEscalpos([], [{ ...source, preco }]).size, 0);
}
assert.equal(catalogWithMarketEscalpos([], [{ ...source, status: "draft" }]).size, 0);
const character = {
  ...createInitialCharacter(null, "Comprador"),
  carteira: { aretz_informal: item.preco * 3, cdi: 0, cdi_craqueada: 0 },
};
const result = purchaseItem({ character, item, quantidade: 2, walletId: "aretz_informal", nowIso: "2026-10-10T12:00:00Z" });
assert.ok(result.character);
assert.equal(result.character.carteira?.aretz_informal, item.preco);
assert.deepEqual(result.character.escalpos_instalados, character.escalpos_instalados);
const saved = normalizeCharacter(result.character);
assert.equal(saved.inventario?.[0].itemSlug, source.slug);
assert.equal(saved.inventario?.[0].estado, "mochila");
assert.equal(saved.inventario?.[0].quantidade, 2);
assert.equal(purchaseItem({ character, item, quantidade: 4, walletId: "aretz_informal", nowIso: "2026-10-10T12:00:00Z" }).character, character);
console.log(`✓ Mercado: ${saleable.length} escalpos reais, compra, saldo e persistência sem instalação automática`);

const parent = normalizeItemContent({ slug: "escalpos_ouvidos_de_cacador", nome: "Ouvidos de Caçador", categoria: "escalpo", preco: 1200 });
const poisonParent = normalizeItemContent({ slug: "beijo_da_morte", nome: "Beijo da Morte", categoria: "escalpo", preco: 2500 });
const familyCatalog = new Map([parent, poisonParent].map(p => [p.slug, p]));
const module = normalizeItemContent({ slug: "escalpos_escuta_ampliada", nome: "Escuta Ampliada", categoria: "modulo_escalpo", preco: 800,
  vinculos_sugeridos: { content_type: "escalpo", slugs: [parent.slug, parent.slug, "inexistente"] } });
assert.deepEqual(marketEscalpoParents(module, familyCatalog), [parent.slug]);
assert.deepEqual(marketEscalpoParents(module, new Map()), [], "Não esconder complemento cujo pai não está no catálogo.");
assert.deepEqual(marketEscalpoParents(normalizeItemContent({ slug: "escalpos_toxico", categoria: "veneno" }), familyCatalog), [poisonParent.slug]);
assert.deepEqual(marketEscalpoParents(normalizeItemContent({ slug: "farmacia_toxico", categoria: "veneno" }), familyCatalog), [], "Não atribuir outros venenos a Beijo da Morte.");
const modulePurchase = purchaseItem({ character, item: module, quantidade: 1, walletId: "aretz_informal", nowIso: "2026-10-10T12:00:00Z" });
assert.equal(modulePurchase.ok, true);
assert.equal(modulePurchase.character.inventario?.[0].itemSlug, module.slug);
assert.equal(modulePurchase.character.carteira?.aretz_informal, character.carteira.aretz_informal - 800);
console.log("✓ Vínculos, pais ausentes, venenos e compra do complemento sem comprar a base");
