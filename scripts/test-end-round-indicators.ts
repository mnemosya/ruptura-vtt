/**
 * Testes puros do indicador de "fim de rodada" (`conditionHasEndRoundEffect`,
 * checkpoint v0.51, achado A2 da auditoria v0.50). Lê o DB real de
 * condições (sem Supabase) e confirma que o indicador é derivado de
 * `payload_automacao.efeitos` — não de um Set de slugs hardcoded
 * duplicado entre `ActiveStateStrip.tsx` e `endRound.ts`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  conditionHasEndRoundEffect,
  normalizeConditionContent,
  type ConditionContent,
} from "../src/lib/character";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

console.log("=== test-end-round-indicators ===\n");

const db = readJson<{ condicoes: Record<string, unknown>[] }>("content/db_condicoes_normalizado_v1_5.json");
const conditions: ConditionContent[] = db.condicoes.map(normalizeConditionContent);
assert.ok(conditions.length >= 17, "Catálogo real deve ter pelo menos 17 condições.");

function bySlug(slug: string): ConditionContent {
  const content = conditions.find((c) => c.slug === slug);
  assert.ok(content, `Condição '${slug}' deve existir no DB real.`);
  return content!;
}

// -------------------------------------------------------------
// 1. Condição com efeito de fim de rodada detectado via payload
//    (dano_fim_de_rodada: Queimando/Sangrando).
// -------------------------------------------------------------
assert.equal(conditionHasEndRoundEffect(bySlug("queimando")), true, "Queimando (dano_fim_de_rodada) deve ser detectado.");
assert.equal(conditionHasEndRoundEffect(bySlug("sangrando")), true, "Sangrando (dano_fim_de_rodada) deve ser detectado.");
console.log("1. Condição com efeito de fim de rodada (dano_fim_de_rodada) detectada via payload — OK");

// -------------------------------------------------------------
// 1b. Outros `tipo` de efeito que o motor também resolve no ciclo de
//     fim de rodada: reduzir_pa/teste_fim_de_rodada (Envenenado) e
//     teste_apos_exposicao (Insaturado/Saturado) — mesmo SEM a tag
//     "fim_de_rodada" no payload (achado original do piso hardcoded).
// -------------------------------------------------------------
assert.equal(conditionHasEndRoundEffect(bySlug("envenenado")), true, "Envenenado (reduzir_pa/teste_fim_de_rodada) deve ser detectado.");
assert.equal(conditionHasEndRoundEffect(bySlug("insaturado")), true, "Insaturado (teste_apos_exposicao) deve ser detectado mesmo sem tag 'fim_de_rodada'.");
assert.equal(conditionHasEndRoundEffect(bySlug("saturado")), true, "Saturado (teste_apos_exposicao) deve ser detectado mesmo sem tag 'fim_de_rodada'.");
const tagsInsaturado = (bySlug("insaturado") as unknown as { tags?: string[] }).tags;
console.log(`1b. Insaturado/Saturado/Envenenado detectados via payload_automacao (tags brutas não usadas: ${JSON.stringify(tagsInsaturado ?? "n/a")}) — OK`);

// -------------------------------------------------------------
// 2. Condição sem efeito de fim de rodada não é marcada.
// -------------------------------------------------------------
for (const slug of ["agarrado", "agarrando", "atordoado", "caido", "cego", "contundido", "imobilizado", "inconsciente", "lento", "ofuscado", "sufocando", "surdo"]) {
  assert.equal(conditionHasEndRoundEffect(bySlug(slug)), false, `${slug} não deveria ser marcado como fim de rodada.`);
}
console.log("2. Condições sem efeito de fim de rodada (Agarrado, Cego, Lento, etc.) não marcadas — OK");

// -------------------------------------------------------------
// 3. Payload ausente/inválido — nunca marca (fallback defensivo, sem inventar).
// -------------------------------------------------------------
const semPayload: ConditionContent = { id: "x", slug: "x", nome: "X", categoria: "condicao", status: "published" };
assert.equal(conditionHasEndRoundEffect(semPayload), false, "Condição sem payload_automacao não deve ser marcada.");

const payloadMalformado: ConditionContent = {
  id: "y",
  slug: "y",
  nome: "Y",
  categoria: "condicao",
  status: "published",
  payload_automacao: { efeitos: "não é um array" },
};
assert.equal(conditionHasEndRoundEffect(payloadMalformado), false, "payload_automacao.efeitos malformado não deve ser marcado.");
console.log("3. Payload ausente/inválido — nunca marca (fallback defensivo) — OK");

// -------------------------------------------------------------
// 4. Paridade exata com o antigo Set hardcoded (FIM_DE_RODADA_SLUGS =
//    queimando/sangrando/envenenado/insaturado/saturado) — nem a mais, nem a menos.
// -------------------------------------------------------------
const slugsAntigos = new Set(["queimando", "sangrando", "envenenado", "insaturado", "saturado"]);
const slugsDetectados = new Set(conditions.filter(conditionHasEndRoundEffect).map((c) => c.slug));
assert.deepEqual(slugsDetectados, slugsAntigos, "O conjunto data-driven deve ter paridade exata com o antigo Set hardcoded.");
console.log("4. Paridade exata com o antigo FIM_DE_RODADA_SLUGS hardcoded (nem a mais, nem a menos) — OK");

// -------------------------------------------------------------
// 5. Nenhuma duplicação hardcoded de slugs no código-fonte.
// -------------------------------------------------------------
const activeStateStripSrc = readFileSync("src/app/dev/character-sheet/components/ActiveStateStrip.tsx", "utf8");
const endRoundSrc = readFileSync("src/lib/table/endRound.ts", "utf8");
assert.ok(!activeStateStripSrc.includes("FIM_DE_RODADA_SLUGS"), "ActiveStateStrip.tsx não deve mais ter FIM_DE_RODADA_SLUGS hardcoded.");
assert.ok(!endRoundSrc.includes("FIM_DE_RODADA_SLUGS"), "endRound.ts não deve mais ter FIM_DE_RODADA_SLUGS hardcoded.");
assert.ok(activeStateStripSrc.includes("conditionHasEndRoundEffect"), "ActiveStateStrip.tsx deve usar o helper data-driven.");
assert.ok(endRoundSrc.includes("conditionHasEndRoundEffect"), "endRound.ts deve usar o helper data-driven.");
console.log("5. Nenhuma duplicação hardcoded de slugs — ambos os consumidores usam o mesmo helper — OK");

console.log("\ntest-end-round-indicators — todos os cenários passaram.");
