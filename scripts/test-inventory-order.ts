import assert from "node:assert/strict";
import { createInitialCharacter } from "../src/lib/character/createCharacter";
import { reorderInventoryItem } from "../src/lib/character/inventoryOrder";

const initial = createInitialCharacter(null);
const character = { ...initial, inventario: ["a", "hidden", "b", "c"].map((id, index) => ({
  id, itemSlug: "faca", itemNome: id, categoria: "arma", quantidade: index + 1,
  estado: id === "hidden" ? "abrigo" as const : "mochila" as const, adquiridoEm: "2026-10-12T00:00:00Z",
})) };
const down = reorderInventoryItem(character, "a", "c", "depois");
assert.deepEqual(down.inventario?.map(item => item.id), ["hidden", "b", "c", "a"]);
const up = reorderInventoryItem(down, "c", "b", "antes");
assert.deepEqual(up.inventario?.map(item => item.id), ["hidden", "c", "b", "a"]);
for (const item of up.inventario ?? []) assert.equal(item, character.inventario.find(original => original.id === item.id));
assert.deepEqual(character.inventario.map(item => item.id), ["a", "hidden", "b", "c"]);
assert.equal(reorderInventoryItem(character, "missing", "a", "antes"), character);
assert.equal(reorderInventoryItem(character, "a", "missing", "antes"), character);
assert.equal(reorderInventoryItem(character, "a", "a", "depois"), character);
assert.equal(reorderInventoryItem(character, "b", "c", "antes"), character);
console.log("✓ Reordenação antes/depois, itens ocultos preservados, dados intactos e IDs inválidos sem efeito");
