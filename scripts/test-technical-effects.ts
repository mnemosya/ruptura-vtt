/**
 * Teste puro (sem Supabase) da automação passiva limitada de Escalpos
 * instalados — checkpoint v0.55, fase 2. Lê o DB real de escalpos e
 * confirma que só o padrão "modificador" (mesmo formato de talentos)
 * vira `ActiveEffect`, e só para instâncias INSTALADAS — nunca para o
 * catálogo inteiro da Biblioteca.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  deriveInstalledTechnicalEffects,
  installEscalpo,
  removeInstalledEscalpo,
  createInitialCharacter,
} from "../src/lib/character";
import { normalizeTechnicalContentItem, type TechnicalContentItem } from "../src/lib/content";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

console.log("=== test-technical-effects ===\n");

const db = readJson<{ escalpos: Record<string, unknown>[] }>("content/db_escalpos_normalizado_v1_3.json");
const escalpos: TechnicalContentItem[] = db.escalpos.map(normalizeTechnicalContentItem);

const comModificador = escalpos.find((e) => e.slug === "radar_neural");
assert.ok(comModificador, "Escalpo 'radar_neural' deve existir no DB real (modificador +2 Percepção).");
const semModificador = escalpos.find((e) => e.slug === "rpi_oficial");
assert.ok(semModificador, "Escalpo 'rpi_oficial' deve existir no DB real (sem modificador — habilitar_recurso).");

const personagem = createInitialCharacter(null, "Testador de Efeitos Técnicos");
const nowIso = "2026-07-03T10:00:00.000Z";

// -------------------------------------------------------------
// 1. Personagem sem escalpos instalados não gera nenhum efeito.
// -------------------------------------------------------------
assert.deepEqual(deriveInstalledTechnicalEffects(personagem, escalpos), [], "Sem instalação nenhuma, nenhum efeito.");
console.log("1. Sem escalpos instalados — nenhum efeito ativo — OK");

// -------------------------------------------------------------
// 2. Conteúdo só consultado na Biblioteca (não instalado) não gera efeito.
// -------------------------------------------------------------
assert.deepEqual(
  deriveInstalledTechnicalEffects({ escalpos_instalados: [] }, escalpos),
  [],
  "Catálogo inteiro presente, mas sem NENHUMA instância instalada — zero efeitos.",
);
console.log("2. Catálogo consultado (não instalado) nunca gera efeito — OK");

// -------------------------------------------------------------
// 3. Escalpo instalado com modificador passivo gera ActiveEffect.
// -------------------------------------------------------------
const comRadar = installEscalpo(personagem, { contentId: comModificador!.slug, nowIso });
const efeitos = deriveInstalledTechnicalEffects(comRadar, escalpos);
assert.equal(efeitos.length, 1, "radar_neural deve gerar exatamente 1 ActiveEffect.");
assert.equal(efeitos[0].sourceType, "escalpo");
assert.equal(efeitos[0].modifier, 2);
assert.deepEqual(efeitos[0].affectedTags, ["percepcao"]);
assert.equal(efeitos[0].kind, "modifier");
assert.ok(efeitos[0].explanation.includes("Escalpo"), "Explicação deve identificar a fonte como Escalpo.");
console.log("3. Escalpo instalado com modificador passivo gera ActiveEffect (fonte 'escalpo') — OK");

// -------------------------------------------------------------
// 4. Remover a instância remove o efeito.
// -------------------------------------------------------------
const instanceId = comRadar.escalpos_instalados![0].id;
const semRadar = removeInstalledEscalpo(comRadar, instanceId);
assert.deepEqual(deriveInstalledTechnicalEffects(semRadar, escalpos), [], "Remover a instância deve remover o efeito ativo.");
console.log("4. Remover a instância remove o ActiveEffect — OK");

// -------------------------------------------------------------
// 5. Payload desconhecido (tipo != 'modificador') é ignorado sem quebrar.
// -------------------------------------------------------------
const comRpi = installEscalpo(personagem, { contentId: semModificador!.slug, nowIso });
assert.deepEqual(deriveInstalledTechnicalEffects(comRpi, escalpos), [], "rpi_oficial (habilitar_recurso) não deve gerar nenhum ActiveEffect.");
console.log("5. Payload de tipo desconhecido/não-modificador é ignorado, sem quebrar — OK");

// -------------------------------------------------------------
// 6. Payload condicional ('quando') não aplica efeito indevido.
// -------------------------------------------------------------
const escalpoCondicional = normalizeTechnicalContentItem({
  id: "x",
  slug: "escalpo_condicional_teste",
  nome: "Escalpo de Teste Condicional",
  status: "published",
  payload_automacao: {
    efeitos: [{ tipo: "modificador", valor: 3, alvo_tags: ["ofensiva"], quando: "alvo_desprevenido" }],
  },
});
const comCondicional = installEscalpo(personagem, { contentId: escalpoCondicional.slug, nowIso });
assert.deepEqual(
  deriveInstalledTechnicalEffects(comCondicional, [escalpoCondicional]),
  [],
  "Efeito condicional ('quando') não deve virar modificador incondicional automático.",
);
console.log("6. Efeito condicional ('quando') não aplica número indevido — OK");

// -------------------------------------------------------------
// 7. Modelo ausente/despublicado não quebra (instância órfã ignorada).
// -------------------------------------------------------------
const comModeloInexistente = installEscalpo(personagem, { contentId: "escalpo-removido-da-biblioteca", nowIso });
assert.deepEqual(deriveInstalledTechnicalEffects(comModeloInexistente, escalpos), [], "Modelo ausente não deve gerar efeito nem lançar erro.");
console.log("7. Modelo ausente/despublicado da Biblioteca não quebra (efeito vazio) — OK");

// -------------------------------------------------------------
// 8. Nome customizado aparece na fonte do chip explicador.
// -------------------------------------------------------------
const comApelido = installEscalpo(personagem, { contentId: comModificador!.slug, nomeCustomizado: "Radar do Kael", nowIso });
const efeitosApelido = deriveInstalledTechnicalEffects(comApelido, escalpos);
assert.equal(efeitosApelido[0].sourceName, "Radar do Kael");
console.log("8. Nome customizado da instância aparece como fonte do efeito — OK");

console.log("\ntest-technical-effects — todos os cenários passaram.");
