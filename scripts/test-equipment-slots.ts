/**
 * Teste puro (sem Supabase) da projeção de slots corporais do Console
 * do Personagem — Tempo 1.
 *
 * O ponto central verificado aqui: a projeção é SÓ LEITURA e não
 * inventa dado. Slots sem fonte no modelo atual (cabeça, membro
 * superior, membro inferior) precisam sair como `supported: false`, e
 * nunca podem ser preenchidos por acidente. A ordem entre armas
 * empunhadas tem que ser estável por `adquiridoEm`/`id` — nunca pelo
 * índice do array, que muda quando qualquer outro item é comprado ou
 * descartado.
 */

import assert from "node:assert/strict";
import { createInitialCharacter, projectBodySlots, type Character } from "../src/lib/character";

console.log("=== test-equipment-slots ===\n");

type InventarioEntry = NonNullable<Character["inventario"]>[number];

function item(over: Partial<InventarioEntry> & { id: string; itemNome: string }): InventarioEntry {
  return {
    itemSlug: over.id,
    categoria: "arma",
    quantidade: 1,
    estado: "mochila",
    adquiridoEm: "2026-01-01T00:00:00.000Z",
    ...over,
  } as InventarioEntry;
}

function slotDe(character: Character, id: string) {
  return projectBodySlots(character).slots.find((s) => s.id === id)!;
}

// -------------------------------------------------------------
// 1. Personagem sem inventário: nada quebra, nada é preenchido.
// -------------------------------------------------------------
const vazio = createInitialCharacter(null, "Sem Inventário");
const projVazio = projectBodySlots(vazio);
assert.equal(projVazio.slots.length, 9, "Devem existir os 9 slots do wireframe.");
assert.ok(
  projVazio.slots.every((s) => s.instance === null),
  "Sem inventário, nenhum slot pode vir preenchido.",
);
assert.deepEqual(projVazio.semSlot, [], "Sem inventário não há itens sem slot.");
console.log("1. Personagem sem inventário projeta 9 slots vazios — OK");

// -------------------------------------------------------------
// 2. Slots sem fonte no modelo continuam `supported: false` e vazios.
// -------------------------------------------------------------
for (const id of ["cabeca", "membro_superior", "membro_inferior"]) {
  const slot = slotDe(vazio, id);
  assert.equal(slot.supported, false, `"${id}" não tem fonte no modelo atual — deve ser supported:false.`);
  assert.equal(slot.instance, null, `"${id}" nunca pode ser preenchido nesta fase.`);
}
console.log("2. Cabeça/membros marcados como sem fonte de dado (supported:false) — OK");

// -------------------------------------------------------------
// 3. Empunhados viram arma primária/secundária em ordem ESTÁVEL.
// -------------------------------------------------------------
const comArmas: Character = {
  ...vazio,
  inventario: [
    item({ id: "b", itemNome: "Faca", estado: "empunhado", adquiridoEm: "2026-03-01T00:00:00.000Z" }),
    item({ id: "a", itemNome: "Rifle", estado: "empunhado", adquiridoEm: "2026-02-01T00:00:00.000Z" }),
  ],
};
assert.equal(slotDe(comArmas, "arma_primaria").instance?.itemNome, "Rifle", "A mais antiga é a primária.");
assert.equal(slotDe(comArmas, "arma_secundaria").instance?.itemNome, "Faca", "A seguinte é a secundária.");

// Inserir um item NÃO empunhado no começo do array não pode trocar as armas.
const comArmasReordenado: Character = {
  ...comArmas,
  inventario: [item({ id: "z", itemNome: "Corda", estado: "mochila" }), ...comArmas.inventario!],
};
assert.equal(
  slotDe(comArmasReordenado, "arma_primaria").instance?.itemNome,
  "Rifle",
  "Comprar outro item não pode rebaixar a arma primária (ordem não depende do índice).",
);
console.log("3. Armas empunhadas em ordem estável, imune a mudança de índice — OK");

// -------------------------------------------------------------
// 4. Tronco/escudo vêm da fonte defensiva ATIVA, não só de `estado`.
// -------------------------------------------------------------
const comDefesa: Character = {
  ...vazio,
  inventario: [
    item({ id: "arm1", itemNome: "Peitoral Ativo", categoria: "armadura", estado: "equipado", equipadoDefensivo: true, equipamentoSlot: "armadura" }),
    item({ id: "arm2", itemNome: "Peitoral Reserva", categoria: "armadura", estado: "equipado" }),
    item({ id: "esc1", itemNome: "Broquel", categoria: "escudo", estado: "equipado", equipadoDefensivo: true, equipamentoSlot: "escudo" }),
  ],
};
assert.equal(slotDe(comDefesa, "tronco").instance?.itemNome, "Peitoral Ativo", "O tronco mostra a fonte de MIT ativa.");
assert.equal(slotDe(comDefesa, "escudo").instance?.itemNome, "Broquel", "O escudo mostra a fonte de PD ativa.");
const semSlot = projectBodySlots(comDefesa).semSlot;
assert.deepEqual(
  semSlot.map((i) => i.itemNome),
  ["Peitoral Reserva"],
  "A armadura vestida que NÃO é a fonte ativa precisa aparecer como 'sem slot', nunca sumir.",
);
console.log("4. Tronco/escudo leem a fonte defensiva ativa; o resto vira 'sem slot' — OK");

// -------------------------------------------------------------
// 5. Acesso rápido preenche os dois slots; o excedente não some.
// -------------------------------------------------------------
const comRapido: Character = {
  ...vazio,
  inventario: [
    item({ id: "q1", itemNome: "Estimulante", estado: "acesso_rapido", adquiridoEm: "2026-01-01T00:00:00.000Z" }),
    item({ id: "q2", itemNome: "Granada", estado: "acesso_rapido", adquiridoEm: "2026-01-02T00:00:00.000Z" }),
    item({ id: "q3", itemNome: "Sonda", estado: "acesso_rapido", adquiridoEm: "2026-01-03T00:00:00.000Z" }),
  ],
};
assert.equal(slotDe(comRapido, "acesso_rapido_1").instance?.itemNome, "Estimulante");
assert.equal(slotDe(comRapido, "acesso_rapido_2").instance?.itemNome, "Granada");
assert.deepEqual(
  projectBodySlots(comRapido).semSlot.map((i) => i.itemNome),
  ["Sonda"],
  "O terceiro item de acesso rápido não cabe em slot, mas precisa ser reportado.",
);
console.log("5. Acesso rápido preenche 2 slots e reporta o excedente — OK");

// -------------------------------------------------------------
// 6. Itens na mochila nunca aparecem no paper doll nem em `semSlot`.
// -------------------------------------------------------------
const comMochila: Character = {
  ...vazio,
  inventario: [item({ id: "m1", itemNome: "Ração", estado: "mochila" })],
};
const projMochila = projectBodySlots(comMochila);
assert.ok(projMochila.slots.every((s) => s.instance === null), "Item de mochila não ocupa slot corporal.");
assert.deepEqual(projMochila.semSlot, [], "Item de mochila não é 'equipado sem slot' — ele está guardado.");
console.log("6. Itens de mochila ficam fora do paper doll — OK");

// -------------------------------------------------------------
// 7. A projeção NÃO muta o personagem (é leitura pura).
// -------------------------------------------------------------
const antes = JSON.stringify(comDefesa);
projectBodySlots(comDefesa);
assert.equal(JSON.stringify(comDefesa), antes, "projectBodySlots não pode alterar o personagem.");
console.log("7. Projeção é leitura pura, sem mutação — OK");

console.log("\n=== test-equipment-slots: todos os casos passaram ===");
