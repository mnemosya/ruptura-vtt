#!/usr/bin/env node
/**
 * Verificação focada da Etapa 11 (correção do drag-and-drop editorial —
 * content_type "capitulo"). Mesmo padrão das etapas anteriores: compila
 * os módulos REAIS com `tsc`, roda com `node` puro — nunca reimplementa
 * a lógica em duplicata. Cobre só lógica PURA (serialização de
 * publicação, coleta de dependências) — a validação com I/O real
 * (`validarCamposCapitulo`, que confirma existência contra o banco) é
 * coberta pelo aceite de browser, não aqui.
 *
 * Uso:
 *   npx tsc --module commonjs --target es2020 --moduleResolution node \
 *     --esModuleInterop --skipLibCheck --resolveJsonModule --outDir <dir> \
 *     src/lib/contentSchema/draftTypes.ts src/lib/contentSchema/effectDraftTypes.ts \
 *     src/lib/contentSchema/effectTypeRegistry.ts src/lib/contentSchema/effectLegacySerialization.ts \
 *     src/lib/contentSchema/publishSerialization.ts src/lib/contentSchema/contentDependencies.ts \
 *     src/lib/contentSchema/contentPackage.ts src/lib/contentSchema/types.ts src/lib/content/types.ts
 *   node scripts/dev/validate-editorial-drag.mjs <dir-compilado>
 */
import { createRequire } from "node:module";
import assert from "node:assert";
import path from "node:path";

const require = createRequire(import.meta.url);

const compiledDir = process.argv[2];
if (!compiledDir) {
  console.error("Uso: node validate-editorial-drag.mjs <diretorio-compilado>");
  process.exit(1);
}

const { serializarRascunhoParaPublicacao } = require(path.join(compiledDir, "contentSchema/publishSerialization.js"));
const { coletarReferenciasBrutas } = require(path.join(compiledDir, "contentSchema/contentDependencies.js"));

let passed = 0;
function check(nome, fn) {
  try {
    fn();
    passed++;
    console.log(`ok - ${nome}`);
  } catch (err) {
    console.error(`FAIL - ${nome}: ${err.message}`);
    process.exitCode = 1;
  }
}

function draftCapitulo(blocos, corpo = "Introdução do capítulo.") {
  return {
    id: "draft-1",
    content_type: "capitulo",
    slug: "mercado_noturno",
    base_document_id: null,
    base_payload_hash: null,
    duplicated_from: null,
    payload: {
      schemaVersion: "draft.v1",
      contentType: "capitulo",
      camposEditaveis: {
        contentType: "capitulo",
        campos: { nome: "Mercado Noturno", slug: "mercado_noturno", tags: [], corpo, blocos },
      },
      preservado: { rawOriginal: { blocos: [] }, camposDesconhecidos: [] },
    },
    created_by: null,
    updated_by: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    version: 1,
  };
}

// ---------------------------------------------------------------------
// 1. Serialização — bloco de texto e bloco de entidade, ordem preservada.
// ---------------------------------------------------------------------
check("serializarRascunhoParaPublicacao (capítulo): preserva ordem e forma dos blocos", () => {
  const blocos = [
    { id: "b1", tipo: "texto", texto: "Uma pistola vastrana está à venda aqui." },
    { id: "b2", tipo: "entidade", entidade: { contentType: "item", slug: "pistola_vastrana" } },
  ];
  const draft = draftCapitulo(blocos);
  const corpo = serializarRascunhoParaPublicacao(draft);

  assert.strictEqual(corpo.nome, "Mercado Noturno");
  assert.strictEqual(corpo.corpo, "Introdução do capítulo.");
  assert.strictEqual(corpo.blocos.length, 2);
  assert.strictEqual(corpo.blocos[0].tipo, "texto");
  assert.strictEqual(corpo.blocos[0].texto, "Uma pistola vastrana está à venda aqui.");
  assert.strictEqual(corpo.blocos[1].tipo, "entidade");
  assert.strictEqual(corpo.blocos[1].entidade.tipo_conteudo, "item");
  assert.strictEqual(corpo.blocos[1].entidade.slug, "pistola_vastrana");
  // NUNCA serializa payload_automacao/estatisticas — capítulo não tem automação (aditivo §11.11).
  assert.strictEqual(corpo.payload_automacao, undefined);
  assert.strictEqual(corpo.estatisticas, undefined);
});

check("serializarRascunhoParaPublicacao (capítulo): nunca serializa o payload da entidade referenciada", () => {
  const draft = draftCapitulo([{ id: "b1", tipo: "entidade", entidade: { contentType: "spell", slug: "rajada_ignea" } }]);
  const corpo = serializarRascunhoParaPublicacao(draft);
  const bloco = corpo.blocos[0];
  assert.deepStrictEqual(Object.keys(bloco).sort(), ["entidade", "id", "tipo"]);
  assert.deepStrictEqual(Object.keys(bloco.entidade).sort(), ["slug", "tipo_conteudo"]);
});

check("serializarRascunhoParaPublicacao (capítulo): array de blocos vazio serializa como array vazio, nunca omitido", () => {
  const corpo = serializarRascunhoParaPublicacao(draftCapitulo([]));
  assert.ok(Array.isArray(corpo.blocos));
  assert.strictEqual(corpo.blocos.length, 0);
});

// ---------------------------------------------------------------------
// 2. Coleta de dependências — blocos de entidade viram referências OPCIONAIS.
// ---------------------------------------------------------------------
check("coletarReferenciasBrutas: bloco de entidade vira dependência opcional", () => {
  const payload = {
    blocos: [
      { id: "b1", tipo: "texto", texto: "..." },
      { id: "b2", tipo: "entidade", entidade: { tipo_conteudo: "item", slug: "pistola_vastrana" } },
      { id: "b3", tipo: "entidade", entidade: { tipo_conteudo: "condition", slug: "atordoado" } },
    ],
  };
  const refs = coletarReferenciasBrutas(payload);
  assert.strictEqual(refs.length, 2);
  const porChave = new Map(refs.map((r) => [`${r.tipo}:${r.slugOuId}`, r]));
  assert.ok(porChave.has("item:pistola_vastrana"));
  assert.ok(porChave.has("condition:atordoado"));
  for (const r of refs) assert.strictEqual(r.obrigatoria, false, `${r.tipo}:${r.slugOuId} deveria ser opcional`);
});

check("coletarReferenciasBrutas: capítulo sem blocos de entidade não gera dependências", () => {
  const refs = coletarReferenciasBrutas({ blocos: [{ id: "b1", tipo: "texto", texto: "..." }] });
  assert.strictEqual(refs.length, 0);
});

check("coletarReferenciasBrutas: dedup entre bloco de capítulo e requisitos de topo (mesma chave tipo:slug)", () => {
  const payload = {
    requisitos: [{ tipo_conteudo: "item", slug: "pistola_vastrana" }],
    blocos: [{ id: "b1", tipo: "entidade", entidade: { tipo_conteudo: "item", slug: "pistola_vastrana" } }],
  };
  const refs = coletarReferenciasBrutas(payload);
  const doItem = refs.filter((r) => r.tipo === "item" && r.slugOuId === "pistola_vastrana");
  assert.strictEqual(doItem.length, 1, "não deve duplicar a mesma referência vinda de duas fontes diferentes");
  // obrigatória (requisito) vence sobre opcional (bloco de capítulo) — mesma regra já usada para outras fontes.
  assert.strictEqual(doItem[0].obrigatoria, true);
});

console.log(`\n${passed} verificações passaram.`);
if (process.exitCode) {
  console.error("Há verificações reprovadas — ver FAIL acima.");
} else {
  console.log("Todas as verificações focadas da correção do drag editorial (Etapa 11) passaram.");
  console.log("LEMBRETE: isto cobre só serialização/dependências (lógica pura). Existência de referência,");
  console.log("duplicidade e auto-referência (validarCamposCapitulo) exigem Supabase conectado — cobertas pelo aceite de browser.");
}
