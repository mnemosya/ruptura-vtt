#!/usr/bin/env node
/**
 * Verificação focada da correção do bug de colisão de slug em
 * `existeSlugColidindo` (draftValidation.ts) — descoberto na auditoria
 * formal do Editor Universal: a checagem antiga bloqueava SALVAR
 * qualquer edição de conteúdo já publicado, para os 5 tipos editáveis,
 * porque tratava "existe qualquer documento publicado com esse
 * content_type+slug" como colisão, mesmo quando esse documento era o
 * próprio documento-base (`base_document_id`) do rascunho de edição.
 *
 * Roda a REGRA REAL de produção (`validarCamposMagia/Item/Runa/Talento/
 * Capitulo`, que chamam `existeSlugColidindo` internamente — a função
 * não é exportada, e não deveria ser só para teste), nunca uma cópia
 * reimplementada. As duas únicas dependências de I/O real dessas
 * funções (`getContentDocument`, de `content/queries.ts`, e
 * `findDraftBySlug`, de `contentSchema/draftQueries.ts`) são
 * substituídas por fakes em memória via injeção direta em
 * `require.cache`, no path RESOLVIDO dos módulos compilados — nunca
 * reimplementando a lógica de colisão em si, só as duas leituras que ela
 * consulta. `getContentDocument` já filtra `status='published'` na
 * implementação real (documentos arquivados nunca aparecem aqui) — o
 * fake reflete o mesmo contrato.
 *
 * Uso:
 *   npx tsc --module commonjs --target es2020 --moduleResolution node \
 *     --esModuleInterop --skipLibCheck --resolveJsonModule --outDir <dir> \
 *     src/lib/contentSchema/draftValidation.ts
 *   node scripts/dev/validate-slug-collision.mjs <dir-compilado>
 */
import { createRequire } from "node:module";
import assert from "node:assert";
import path from "node:path";

const require = createRequire(import.meta.url);

const compiledDir = process.argv[2];
if (!compiledDir) {
  console.error("Uso: node validate-slug-collision.mjs <diretorio-compilado>");
  process.exit(1);
}

// --- Fakes em memória, injetados via require.cache -----------------------
// Chave: `${contentType}:${slug}` — mesmo formato de `content_documents.id`.
const publicados = new Map();
const draftsExistentes = new Map();

function fakeModule(filename, exportsObj) {
  return { id: filename, filename, loaded: true, exports: exportsObj };
}

const queriesPath = require.resolve(path.join(compiledDir, "content/queries.js"));
require.cache[queriesPath] = fakeModule(queriesPath, {
  async getContentDocument(contentType, slug) {
    // Espelha o contrato real: só documentos PUBLICADOS aparecem aqui
    // (arquivados nunca colidem por este caminho — comportamento
    // preexistente, não alterado por esta correção).
    return publicados.get(`${contentType}:${slug}`) ?? null;
  },
});

const draftQueriesPath = require.resolve(path.join(compiledDir, "contentSchema/draftQueries.js"));
require.cache[draftQueriesPath] = fakeModule(draftQueriesPath, {
  async findDraftBySlug(contentType, slug) {
    return draftsExistentes.get(`${contentType}:${slug}`) ?? null;
  },
});

const { validarCamposMagia, validarCamposItem, validarCamposRuna, validarCamposTalento, validarCamposCapitulo } = require(
  path.join(compiledDir, "contentSchema/draftValidation.js"),
);

const VALIDADORES = {
  spell: validarCamposMagia,
  item: validarCamposItem,
  rune: validarCamposRuna,
  talent: validarCamposTalento,
  capitulo: validarCamposCapitulo,
};

function camposMinimos(contentType, slug, nome) {
  const base = { nome, slug, descricaoCurta: "x", tags: [] };
  if (contentType === "spell") return { ...base, requisitos: [], efeitos: [], custoPa: 0, custoMana: 0 };
  if (contentType === "item") return { ...base, requisitos: [], efeitos: [], propriedades: [], preco: 0, custoPa: 0, quantidadePadrao: 1, cargasPadrao: 0 };
  if (contentType === "rune") return { ...base, efeitos: [], slotsPossiveis: ["arma"], preco: 0 };
  if (contentType === "talent") return { ...base, niveis: [] };
  if (contentType === "capitulo") return { ...base, blocos: [] };
  throw new Error(`content type desconhecido: ${contentType}`);
}

let passed = 0;
let failed = 0;
async function check(nome, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${nome}`);
  } catch (e) {
    failed++;
    console.error(`NOT OK - ${nome}`);
    console.error(`  ${e instanceof Error ? e.message : e}`);
  }
}

async function erroDeColisao(contentType, slug, draftId, baseDocumentId) {
  const resultado = await VALIDADORES[contentType](camposMinimos(contentType, slug, "Nome"), draftId, baseDocumentId);
  return resultado.erros.some((e) => e.includes("Já existe conteúdo publicado ou outro rascunho"));
}

const TIPOS = ["spell", "talent", "item", "rune", "capitulo"];

for (const tipo of TIPOS) {
  publicados.clear();
  draftsExistentes.clear();

  // Fixture: um documento publicado real (`tipo:existente`) e um outro
  // documento publicado distinto (`tipo:outro_publicado`), simulando a
  // Biblioteca real antes de cada caso.
  publicados.set(`${tipo}:existente`, { id: `${tipo}:existente` });
  publicados.set(`${tipo}:outro_publicado`, { id: `${tipo}:outro_publicado` });

  await check(`[${tipo}] 1. rascunho novo, slug livre — permitido`, async () => {
    assert.strictEqual(await erroDeColisao(tipo, "slug_livre", undefined, undefined), false);
  });

  await check(`[${tipo}] 2. rascunho novo, slug já publicado — bloqueado`, async () => {
    assert.strictEqual(await erroDeColisao(tipo, "existente", undefined, undefined), true);
  });

  await check(`[${tipo}] 3. edição mantendo o slug do próprio documento-base — permitido`, async () => {
    // draftId = "draft-1" (o próprio rascunho de edição), base_document_id
    // aponta para o mesmo documento publicado que tem esse slug.
    assert.strictEqual(await erroDeColisao(tipo, "existente", "draft-1", `${tipo}:existente`), false);
  });

  await check(`[${tipo}] 4. edição mudando para slug livre — permitido`, async () => {
    assert.strictEqual(await erroDeColisao(tipo, "slug_livre", "draft-1", `${tipo}:existente`), false);
  });

  await check(`[${tipo}] 5. edição mudando para slug de OUTRO documento publicado — bloqueado`, async () => {
    assert.strictEqual(await erroDeColisao(tipo, "outro_publicado", "draft-1", `${tipo}:existente`), true);
  });

  await check(`[${tipo}] 6. base_document_id de outro content_type não libera colisão`, async () => {
    // base_document_id aponta para um documento de OUTRO content_type
    // (id sempre embute o tipo, ex.: "spell:existente" vs "item:existente")
    // — nunca pode coincidir com o id real do documento encontrado para
    // o tipo atual, então a colisão permanece bloqueada.
    const outroTipo = tipo === "spell" ? "item" : "spell";
    assert.strictEqual(await erroDeColisao(tipo, "existente", "draft-1", `${outroTipo}:existente`), true);
  });

  await check(`[${tipo}] 7. rascunho de atualização importado, mantendo o próprio slug — permitido`, async () => {
    // Mesmo formato que packageImport.ts::confirmarImportacao monta:
    // base_document_id = "<contentType>:<slug>" do documento publicado
    // que a importação está atualizando.
    assert.strictEqual(await erroDeColisao(tipo, "existente", "draft-importado-1", `${tipo}:existente`), false);
  });

  await check(`[${tipo}] 8. rascunho sem base_document_id não se beneficia da exceção`, async () => {
    assert.strictEqual(await erroDeColisao(tipo, "existente", "draft-1", undefined), true);
    assert.strictEqual(await erroDeColisao(tipo, "existente", "draft-1", null), true);
  });

  await check(`[${tipo}] 9. documento encontrado com id diferente do base_document_id — bloqueado`, async () => {
    // base_document_id aponta para um slug que sequer é o que está sendo
    // salvo agora (cenário defensivo: nunca confiar cegamente no id).
    assert.strictEqual(await erroDeColisao(tipo, "outro_publicado", "draft-1", `${tipo}:existente`), true);
  });
}

// Caso extra: rascunho novo colide com outro RASCUNHO existente (não
// documento publicado) — regra preexistente, preservada pela correção.
await check("rascunho novo colidindo com outro rascunho de mesmo slug — bloqueado", async () => {
  publicados.clear();
  draftsExistentes.clear();
  draftsExistentes.set("spell:rascunho_slug", { id: "outro-draft-id" });
  assert.strictEqual(await erroDeColisao("spell", "rascunho_slug", "draft-1", undefined), true);
});

console.log(`\n${passed} verificações passaram${failed > 0 ? `, ${failed} FALHARAM` : ""}.`);
if (failed > 0) {
  console.error("Alguma verificação da correção de colisão de slug falhou.");
  process.exit(1);
}
console.log("Todas as verificações focadas da correção de colisão de slug passaram.");
