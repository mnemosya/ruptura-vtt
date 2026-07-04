/**
 * Teste puro (sem Supabase) do inventário/carteira/loja — checkpoint
 * v0.49. Lê o DB real de itens para confirmar que a compra funciona
 * com um item de verdade, sem hardcoding.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeItemContent,
  purchaseItem,
  setItemLoadoutState,
  removeItemFromInventory,
  adjustItemQuantity,
  createInitialCharacter,
  normalizeCharacter,
  getRuneCompatibility,
  countInstalledRunes,
  type ItemContent,
} from "../src/lib/character";
import { normalizeTechnicalContentItem, type TechnicalContentItem } from "../src/lib/content";

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

// ===============================================================
// Modelo de slots de runa (checkpoint v0.56, fase 1) — só o modelo/
// compatibilidade; instalar/remover de verdade é testado em
// test-technical-effects.ts / scripts próprios da fase 2.
// ===============================================================

const runasDb = readJson<{ runas: Record<string, unknown>[] }>("content/db_runas_normalizado_v1_2.json");
const runas: TechnicalContentItem[] = runasDb.runas.map(normalizeTechnicalContentItem);
const runaRetratil = runas.find((r) => r.slug === "runa_cac_retratil");
assert.ok(runaRetratil, "Runa 'runa_cac_retratil' deve existir no DB real (slots_possiveis: ['arma'], restricao_subtipo: 'corpo_a_corpo').");

// -------------------------------------------------------------
// 6. normalizeItemContent extrai subtipo/slotsRunaMax reais do payload.
// -------------------------------------------------------------
assert.equal(faca!.subtipo, "corpo_a_corpo");
assert.equal(faca!.slotsRunaMax, 1, "Faca deve ter slots_runa_max real vindo do payload (não inventado).");
const municao = items.find((i) => i.categoria === "municao");
assert.ok(municao, "Deve haver pelo menos um item de munição no DB real.");
assert.equal(municao!.slotsRunaMax, null, "Categorias sem slots_runa_max no payload devem ficar null, nunca 0 inventado.");
console.log("6. normalizeItemContent extrai subtipo/slotsRunaMax reais do payload — OK");

// -------------------------------------------------------------
// 7. Personagem antigo/inventário antigo (sem subtipo/runasInstaladas) não quebra.
// -------------------------------------------------------------
const personagemAntigo = normalizeCharacter({
  nome: "Personagem Antigo",
  atributos: { corpo: 2, mente: 2, animo: 2 },
  pericias: {},
  inventario: [
    { id: "old-1", itemSlug: "faca", itemNome: "Faca", categoria: "arma", quantidade: 1, estado: "mochila", adquiridoEm: "2026-01-01T00:00:00.000Z" },
  ],
});
assert.equal(personagemAntigo.inventario?.length, 1, "Item antigo sem subtipo/runasInstaladas deve continuar carregando.");
assert.equal(countInstalledRunes(personagemAntigo.inventario![0]), 0, "Instância antiga sem runasInstaladas conta 0, nunca undefined/erro.");
console.log("7. Personagem/inventário antigo (sem subtipo/runasInstaladas) normaliza sem erro — OK");

// -------------------------------------------------------------
// 7b. Inventário ausente inteiramente também normaliza para [].
// -------------------------------------------------------------
const semInventario = normalizeCharacter({ nome: "X", atributos: { corpo: 1, mente: 1, animo: 1 }, pericias: {} });
assert.deepEqual(semInventario.inventario, []);
console.log("7b. Ausência total de inventário normaliza para [] — OK");

// -------------------------------------------------------------
// 8. Compatibilidade respeita a fonte quando é clara (categoria + subtipo).
// -------------------------------------------------------------
assert.equal(
  getRuneCompatibility({ categoria: "arma", subtipo: "corpo_a_corpo" }, runaRetratil!),
  "compatible",
  "Faca (arma/corpo_a_corpo) deve ser compatível com Runa Retrátil (slots_possiveis:['arma'], restricao_subtipo:'corpo_a_corpo').",
);
assert.equal(
  getRuneCompatibility({ categoria: "arma", subtipo: "fogo" }, runaRetratil!),
  "incompatible",
  "Arma de fogo deve ser incompatível com Runa Retrátil (restricao_subtipo exige corpo_a_corpo).",
);
assert.equal(
  getRuneCompatibility({ categoria: "municao" }, runaRetratil!),
  "incompatible",
  "Categoria fora de slots_possiveis deve ser incompatível.",
);
console.log("8. Compatibilidade respeita a fonte quando é clara (categoria + restricao_subtipo) — OK");

// -------------------------------------------------------------
// 9. Compatibilidade nunca inventa regra quando o dado está ausente ('unknown').
// -------------------------------------------------------------
const runaSemSlots = normalizeTechnicalContentItem({ id: "y", slug: "y", nome: "Y", status: "published" });
assert.equal(getRuneCompatibility({ categoria: "arma" }, runaSemSlots), "unknown", "Runa sem slots_possiveis nunca deve virar 'incompatible' inventado.");

const runaComRestricaoSemSubtipoDaInstancia = getRuneCompatibility({ categoria: "arma" }, runaRetratil!);
assert.equal(
  runaComRestricaoSemSubtipoDaInstancia,
  "unknown",
  "Item antigo sem subtipo registrado, mas runa exige restricao_subtipo — deve ficar 'unknown', nunca bloquear nem liberar sem saber.",
);
console.log("9. Compatibilidade nunca inventa limite/regra quando falta dado — devolve 'unknown' — OK");

console.log("\ntest-inventory — todos os cenários passaram.");
