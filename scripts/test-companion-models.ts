/**
 * Teste focado — checkpoint "Catálogo oficial de drones e robôs
 * consumido pela ficha", confirmações finais pendentes (ponto 1):
 * `pairDronesEnxame` compara por `(modeloSlug ?? modelo)`. Não repete
 * verificação de Sinal Limpo, registro de drone/seed ou ficha inteira
 * (já cobertos e aprovados nesta fase) — só o pareamento por slug.
 */

import assert from "node:assert/strict";
import { createInitialCharacter, registerDrone, pairDronesEnxame } from "../src/lib/character";

console.log("=== test-companion-models (pairDronesEnxame) ===\n");

const nowIso = "2026-07-28T12:00:00.000Z";

// -------------------------------------------------------------
// 1. Mesmo modeloSlug permite parear.
// -------------------------------------------------------------
{
  let personagem = createInitialCharacter(null, "Testador Enxame");
  personagem = registerDrone(personagem, { nome: "Mosca A", modeloSlug: "drone_mosca", modelo: "Drone Mosca", acoes: "" }, nowIso);
  personagem = registerDrone(personagem, { nome: "Mosca B", modeloSlug: "drone_mosca", modelo: "Drone Mosca", acoes: "" }, nowIso);
  const [a, b] = personagem.drones!;
  const paired = pairDronesEnxame(personagem, [a.id, b.id], "pareada", nowIso);
  assert.ok(paired.drones!.every((d) => d.pareamento?.grupoId), "Mesmo modeloSlug deve permitir parear os 2 drones.");
  assert.equal(paired.drones![0].pareamento!.grupoId, paired.drones![1].pareamento!.grupoId, "Os 2 devem cair no mesmo grupoId.");
  console.log("1. Mesmo modeloSlug permite parear — OK");
}

// -------------------------------------------------------------
// 2. modeloSlug diferentes impedem o pareamento (mesmo com nomes de
//    exibição parecidos/iguais) — a função deve devolver o character
//    inalterado (mesma referência, sem pareamento aplicado).
// -------------------------------------------------------------
{
  let personagem = createInitialCharacter(null, "Testador Enxame");
  personagem = registerDrone(personagem, { nome: "Mosca A", modeloSlug: "drone_mosca", modelo: "Drone Mosca", acoes: "" }, nowIso);
  personagem = registerDrone(personagem, { nome: "Reparador B", modeloSlug: "drone_reparador", modelo: "Drone Mosca (renomeado igual)", acoes: "" }, nowIso);
  const [a, b] = personagem.drones!;
  const result = pairDronesEnxame(personagem, [a.id, b.id], "pareada", nowIso);
  assert.equal(result, personagem, "modeloSlug diferentes devem impedir o pareamento (character devolvido inalterado).");
  assert.ok(result.drones!.every((d) => d.pareamento === null), "Nenhum dos dois deve ficar pareado.");
  console.log("2. modeloSlug diferentes impedem parear (mesmo com .modelo textual igual) — OK");
}

// -------------------------------------------------------------
// 3. Alterar o texto de `modelo` (snapshot editável) não interfere na
//    comparação — o pareamento continua decidido pelo modeloSlug, não
//    pelo texto de exibição.
// -------------------------------------------------------------
{
  let personagem = createInitialCharacter(null, "Testador Enxame");
  personagem = registerDrone(personagem, { nome: "Mosca A", modeloSlug: "drone_mosca", modelo: "Drone Mosca", acoes: "" }, nowIso);
  personagem = registerDrone(personagem, { nome: "Mosca B", modeloSlug: "drone_mosca", modelo: "Drone Mosca", acoes: "" }, nowIso);
  // Edita manualmente o snapshot de nome do 2º drone (simula edição pós-registro).
  personagem = {
    ...personagem,
    drones: personagem.drones!.map((d) => (d.nome === "Mosca B" ? { ...d, modelo: "Texto totalmente diferente" } : d)),
  };
  const [a, b] = personagem.drones!;
  const paired = pairDronesEnxame(personagem, [a.id, b.id], "pareada", nowIso);
  assert.ok(paired.drones!.every((d) => d.pareamento?.grupoId), "Editar o texto de .modelo não deve impedir o pareamento por modeloSlug.");
  console.log("3. Editar texto de .modelo (snapshot) não interfere no pareamento por slug — OK");
}

// -------------------------------------------------------------
// 4. Instâncias antigas sem modeloSlug (undefined) continuam usando o
//    fallback textual (.modelo) — mesmo modelo textual pareia, modelo
//    textual diferente não pareia.
// -------------------------------------------------------------
{
  let personagem = createInitialCharacter(null, "Testador Enxame");
  personagem = registerDrone(personagem, { nome: "Legado A", modelo: "Drone Mosca", acoes: "" }, nowIso);
  personagem = registerDrone(personagem, { nome: "Legado B", modelo: "Drone Mosca", acoes: "" }, nowIso);
  assert.ok(personagem.drones!.every((d) => d.modeloSlug === undefined), "Instâncias registradas sem modeloSlug devem ficar undefined (fallback legado).");
  const [a, b] = personagem.drones!;
  const paired = pairDronesEnxame(personagem, [a.id, b.id], "pareada", nowIso);
  assert.ok(paired.drones!.every((d) => d.pareamento?.grupoId), "Sem modeloSlug, mesmo .modelo textual deve permitir parear (fallback).");

  let personagem2 = createInitialCharacter(null, "Testador Enxame 2");
  personagem2 = registerDrone(personagem2, { nome: "Legado C", modelo: "Drone Mosca", acoes: "" }, nowIso);
  personagem2 = registerDrone(personagem2, { nome: "Legado D", modelo: "Drone Reparador", acoes: "" }, nowIso);
  const [c, d] = personagem2.drones!;
  const notPaired = pairDronesEnxame(personagem2, [c.id, d.id], "pareada", nowIso);
  assert.equal(notPaired, personagem2, "Sem modeloSlug, .modelo textual diferente deve impedir o pareamento (fallback).");
  console.log("4. Sem modeloSlug (instância legada) usa fallback textual — OK");
}

console.log("\n=== test-companion-models: todos os testes passaram ===");
