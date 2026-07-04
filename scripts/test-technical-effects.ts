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
  deriveInstalledRuneEffects,
  installEscalpo,
  removeInstalledEscalpo,
  createInitialCharacter,
  normalizeItemContent,
  purchaseItem,
  installRuneOnItem,
  removeRuneFromItem,
  type ItemContent,
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

// ===============================================================
// Runas instaladas em item — automação passiva limitada (checkpoint v0.57).
// ===============================================================

const itemsDb = readJson<{ itens: Record<string, unknown>[] }>("content/db_equipamentos_normalizado_v1_2.json");
const items: ItemContent[] = itemsDb.itens.map(normalizeItemContent);
const runasDb = readJson<{ runas: Record<string, unknown>[] }>("content/db_runas_normalizado_v1_2.json");
const runas: TechnicalContentItem[] = runasDb.runas.map(normalizeTechnicalContentItem);

const rifleDeFogo = items.find((i) => i.categoria === "arma" && i.subtipo === "fogo");
assert.ok(rifleDeFogo, "Deve haver uma arma de fogo no DB real.");
const runaEstabilidade = runas.find((r) => r.slug === "runa_fogo_estabilidade");
assert.ok(runaEstabilidade, "Runa 'runa_fogo_estabilidade' (bonus:1, alvo_tags:['ataque_distancia'], sem restrição) deve existir no DB real.");
const runaGuarda = runas.find((r) => r.slug === "runa_escudo_guarda");
assert.ok(runaGuarda, "Runa 'runa_escudo_guarda' (bonus + restrito_a:'bloquear') deve existir no DB real.");
const runaRetratil = runas.find((r) => r.slug === "runa_cac_retratil");
assert.ok(runaRetratil, "Runa 'runa_cac_retratil' (efeito textual, sem bonus numérico) deve existir no DB real.");

const personagemComArma = createInitialCharacter(null, "Testador de Runas");
const compra = purchaseItem({ character: personagemComArma, item: rifleDeFogo!, quantidade: 1, walletId: "aretz_informal", precoUnitario: 0, nowIso: "2026-07-03T10:00:00.000Z" });

// -------------------------------------------------------------
// 9. Runa instalada com modificador passivo (bonus + alvo_tags, sem restrição) gera ActiveEffect.
// -------------------------------------------------------------
const comRunaEstabilidade = installRuneOnItem({
  character: compra.character,
  instanceId: compra.instance!.id,
  itemContent: rifleDeFogo,
  rune: runaEstabilidade!,
  nowIso: "2026-07-03T10:05:00.000Z",
});
assert.equal(comRunaEstabilidade.ok, true);
const efeitosRuna = deriveInstalledRuneEffects(comRunaEstabilidade.character, runas);
assert.equal(efeitosRuna.length, 1, "runa_fogo_estabilidade deve gerar exatamente 1 ActiveEffect.");
assert.equal(efeitosRuna[0].sourceType, "rune");
assert.equal(efeitosRuna[0].modifier, 1);
assert.deepEqual(efeitosRuna[0].affectedTags, ["ataque_distancia"]);
console.log("9. Runa instalada com modificador passivo (bonus+alvo_tags) gera ActiveEffect (fonte 'rune') — OK");

// -------------------------------------------------------------
// 10. Remover a instalação da runa remove o ActiveEffect.
// -------------------------------------------------------------
const runeInstallId = comRunaEstabilidade.installation!.id;
const semRuna = removeRuneFromItem(comRunaEstabilidade.character, compra.instance!.id, runeInstallId);
assert.deepEqual(deriveInstalledRuneEffects(semRuna, runas), [], "Remover a instalação deve remover o ActiveEffect.");
console.log("10. Remover a instalação da runa remove o ActiveEffect — OK");

// -------------------------------------------------------------
// 11. Payload restrito (restrito_a) não é automatizado (mesmo tendo bonus+alvo_tags).
// -------------------------------------------------------------
const escudo = items.find((i) => i.categoria === "escudo");
assert.ok(escudo, "Deve haver um escudo no DB real.");
const compraEscudo = purchaseItem({ character: personagemComArma, item: escudo!, quantidade: 1, walletId: "aretz_informal", precoUnitario: 0, nowIso: "2026-07-03T10:00:00.000Z" });
const comRunaGuarda = installRuneOnItem({
  character: compraEscudo.character,
  instanceId: compraEscudo.instance!.id,
  itemContent: escudo,
  rune: runaGuarda!,
  nowIso: "2026-07-03T10:05:00.000Z",
});
assert.equal(comRunaGuarda.ok, true);
assert.deepEqual(
  deriveInstalledRuneEffects(comRunaGuarda.character, runas),
  [],
  "runa_escudo_guarda tem restrito_a:'bloquear' — não deve virar modificador incondicional.",
);
console.log("11. Runa com restrito_a (contexto que o motor não distingue) não gera efeito indevido — OK");

// -------------------------------------------------------------
// 12. Efeito textual sem número (a maioria das runas) não gera efeito, sem quebrar.
// -------------------------------------------------------------
const comRunaRetratil = installRuneOnItem({
  character: compra.character,
  instanceId: compra.instance!.id,
  itemContent: rifleDeFogo,
  rune: runaRetratil!,
  nowIso: "2026-07-03T10:05:00.000Z",
});
assert.deepEqual(deriveInstalledRuneEffects(comRunaRetratil.character, runas), [], "Runa com 'efeito' textual (torna_ocultavel) não deve gerar ActiveEffect.");
console.log("12. Runa com efeito textual (sem bonus numérico) não gera ActiveEffect, sem quebrar — OK");

// -------------------------------------------------------------
// 13. Nenhum efeito aparece para runa só consultada na Biblioteca (não instalada).
// -------------------------------------------------------------
assert.deepEqual(deriveInstalledRuneEffects(compra.character, runas), [], "Sem NENHUMA runa instalada, zero efeitos — catálogo consultado não conta.");
console.log("13. Runa só consultada na Biblioteca (não instalada) nunca gera efeito — OK");

console.log("\ntest-technical-effects — todos os cenários passaram.");
