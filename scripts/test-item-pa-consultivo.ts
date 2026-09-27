import assert from "node:assert/strict";
import { createInitialCharacter, normalizeItemContent, type InventoryItemInstance } from "../src/lib/character";
import { getItemUsePaCost, useItemOnCharacter } from "../src/lib/character/itemUse";

const item = normalizeItemContent({ slug: "fixture", nome: "Item de teste", categoria: "explosivo", estatisticas: { custo_pa: 2 }, payload_automacao: { efeitos: [] } });
const instance: InventoryItemInstance = { id: "item", itemSlug: item.slug, itemNome: item.nome, categoria: item.categoria, quantidade: 1, estado: "acesso_rapido", adquiridoEm: "2026-09-27T00:00:00Z" };
const character = { ...createInitialCharacter(null, "Teste"), estado_jogo: { pa_gastos: 3 }, inventario: [instance] };
const params = { character, item, instance, paMax: 3, pvMax: 10, peMax: 10, nowIso: "2026-09-27T00:00:00Z" };
assert.equal(getItemUsePaCost(item), 2);
const usado = useItemOnCharacter(params);
assert.equal(usado.ok, true);
assert.equal(usado.character.estado_jogo?.pa_gastos, 5);
assert(usado.reminders.some(t => t.includes("PA insuficiente")));
const vazio = useItemOnCharacter({ ...params, instance: { ...instance, quantidade: 0 } });
assert.equal(vazio.ok, false, "Falta de estoque continua bloqueando.");
assert.equal(vazio.character, character, "Bloqueio de estoque não altera recursos.");
console.log("item-pa-consultivo: aviso sem bloquear, custo registrado, estoque protegido — OK");
