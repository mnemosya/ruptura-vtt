/**
 * Teste puro (sem Supabase) de Escalpos instalados — checkpoint v0.54,
 * fase 1. Lê o DB real de escalpos para confirmar instalação/remoção
 * passiva (referência ao modelo, sem efeito mecânico) e que
 * `normalizeCharacter` continua carregando personagens antigos.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  installEscalpo,
  removeInstalledEscalpo,
  normalizeCharacter,
  createInitialCharacter,
} from "../src/lib/character";
import { normalizeTechnicalContentItem, type TechnicalContentItem } from "../src/lib/content";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

console.log("=== test-escalpos ===\n");

const db = readJson<{ escalpos: Record<string, unknown>[] }>("content/db_escalpos_normalizado_v1_3.json");
const escalpos: TechnicalContentItem[] = db.escalpos.map(normalizeTechnicalContentItem);
const rpi = escalpos.find((e) => e.slug === "rpi_oficial");
assert.ok(rpi, "Escalpo 'rpi_oficial' deve existir no DB real.");

// -------------------------------------------------------------
// 1. Personagem antigo (sem escalpos_instalados no payload) normaliza sem erro.
// -------------------------------------------------------------
const personagemAntigo = normalizeCharacter({
  nome: "Personagem Antigo",
  atributos: { corpo: 2, mente: 2, animo: 2 },
  pericias: {},
  // sem escalpos_instalados — simula payload salvo antes do checkpoint v0.54.
});
assert.deepEqual(personagemAntigo.escalpos_instalados, [], "Ausência de escalpos_instalados vira [], nunca undefined/erro.");
console.log("1. Personagem antigo (sem escalpos_instalados) normaliza sem erro — OK");

// -------------------------------------------------------------
// 2. Instalar escalpo cria instância referenciando o modelo por slug.
// -------------------------------------------------------------
const personagem = createInitialCharacter(null, "Testador de Escalpos");
const nowIso = "2026-07-03T10:00:00.000Z";
const comEscalpo = installEscalpo(personagem, { contentId: rpi!.slug, nowIso });
assert.equal(comEscalpo.escalpos_instalados?.length, 1);
const instancia = comEscalpo.escalpos_instalados![0];
assert.equal(instancia.contentId, rpi!.slug, "Instância deve referenciar o modelo pelo slug, nunca copiar o payload.");
assert.equal(instancia.instaladoEm, nowIso);
assert.ok(instancia.id, "Instância deve ter um instanceId próprio.");
console.log("2. Instalar escalpo cria instância com referência ao modelo (slug) — OK");

// -------------------------------------------------------------
// 2b. Instalar com nome customizado/notas.
// -------------------------------------------------------------
const comApelido = installEscalpo(personagem, {
  contentId: rpi!.slug,
  nomeCustomizado: "  RPI da Sombra  ",
  notas: "  Ganho na missão X  ",
  nowIso,
});
assert.equal(comApelido.escalpos_instalados![0].nomeCustomizado, "RPI da Sombra", "Nome customizado deve ser aparado (trim).");
assert.equal(comApelido.escalpos_instalados![0].notas, "Ganho na missão X");
const semApelido = installEscalpo(personagem, { contentId: rpi!.slug, nomeCustomizado: "   ", nowIso });
assert.equal(semApelido.escalpos_instalados![0].nomeCustomizado, undefined, "Nome customizado só espaços vira undefined, não string vazia.");
console.log("2b. Nome customizado/notas opcionais são aparados e preservados — OK");

// -------------------------------------------------------------
// 3. Instalar duas vezes o MESMO modelo cria duas instâncias distintas
//    (ex.: dois implantes iguais) — nunca funde/ignora a segunda.
// -------------------------------------------------------------
const comDois = installEscalpo(comEscalpo, { contentId: rpi!.slug, nowIso });
assert.equal(comDois.escalpos_instalados?.length, 2);
assert.notEqual(comDois.escalpos_instalados![0].id, comDois.escalpos_instalados![1].id, "Cada instalação deve ter um instanceId próprio.");
console.log("3. Instalar o mesmo modelo duas vezes cria duas instâncias distintas — OK");

// -------------------------------------------------------------
// 4. Remover escalpo remove SÓ a instância — nunca o modelo (o modelo
//    nem existe no personagem, só o slug de referência).
// -------------------------------------------------------------
const semEscalpo = removeInstalledEscalpo(comEscalpo, instancia.id);
assert.equal(semEscalpo.escalpos_instalados?.length, 0);
const removerInexistente = removeInstalledEscalpo(comEscalpo, "id-que-nao-existe");
assert.equal(removerInexistente, comEscalpo, "Remover um instanceId inexistente não deve mudar o personagem.");
console.log("4. Remover escalpo remove só a instância (nunca o modelo) — OK");

// -------------------------------------------------------------
// 5. Save/load (round-trip via normalizeCharacter) preserva instâncias.
// -------------------------------------------------------------
const payloadSalvo = JSON.parse(JSON.stringify(comDois)) as Record<string, unknown>;
const recarregado = normalizeCharacter(payloadSalvo);
assert.equal(recarregado.escalpos_instalados?.length, 2, "Round-trip de save/load deve preservar as 2 instâncias.");
assert.deepEqual(
  recarregado.escalpos_instalados?.map((e) => ({ id: e.id, contentId: e.contentId })),
  comDois.escalpos_instalados?.map((e) => ({ id: e.id, contentId: e.contentId })),
  "id/contentId de cada instância devem sobreviver ao round-trip JSON (save/load real via Supabase).",
);
console.log("5. Save/load (round-trip) preserva as instâncias instaladas — OK");

// -------------------------------------------------------------
// 6. Modelo ausente da Biblioteca (slug não encontrado) não quebra —
//    a instância continua existindo, só sem dados do modelo para exibir.
// -------------------------------------------------------------
const comModeloInexistente = installEscalpo(personagem, { contentId: "escalpo-que-nao-existe-mais", nowIso });
const modeloEncontrado = escalpos.find((e) => e.slug === comModeloInexistente.escalpos_instalados![0].contentId);
assert.equal(modeloEncontrado, undefined, "Slug inexistente não deve casar com nenhum modelo real — a UI trata isso defensivamente (ver BibliotecaTab).");
assert.equal(comModeloInexistente.escalpos_instalados?.length, 1, "A instância continua registrada mesmo sem o modelo correspondente.");
console.log("6. Modelo ausente da Biblioteca não quebra a instância (UI trata defensivamente) — OK");

console.log("\ntest-escalpos — todos os cenários passaram.");
