#!/usr/bin/env node
/**
 * Verificação focada da Etapa 11 (importação/exportação de pacotes +
 * vínculos editoriais). Mesmo padrão das etapas anteriores: compila os
 * módulos REAIS com `tsc`, roda com `node` puro — nunca reimplementa a
 * lógica em duplicata.
 *
 * Uso:
 *   npx tsc src/lib/contentSchema/canonicalHash.ts src/lib/contentSchema/contentPackage.ts \
 *     src/lib/contentSchema/contentDependencies.ts src/lib/contentSchema/importPreview.ts \
 *     src/lib/contentSchema/draftTypes.ts src/lib/contentSchema/effectDraftTypes.ts \
 *     src/lib/contentSchema/types.ts \
 *     --module commonjs --target es2020 --outDir <dir> --esModuleInterop --skipLibCheck \
 *     --resolveJsonModule --moduleResolution node
 *   node scripts/dev/validate-import-export-book.mjs <dir-compilado>
 *
 * officialSchemaValidator.ts (usa node:fs para ler content/schema_*.json)
 * e packageExport.ts/packageImport.ts ("use server", dependem de I/O de
 * rede via Supabase) não são cobertos aqui — exigem sessão de admin
 * real, cobertos pelos 26 itens de checagem via browser (bloqueados
 * nesta sessão, ver checkpoint).
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
void __dirname;

const compiledDir = process.argv[2];
if (!compiledDir) {
  console.error("Uso: node validate-import-export-book.mjs <diretorio-compilado>");
  process.exit(1);
}

const { hashCanonico } = require(path.join(compiledDir, "contentSchema/canonicalHash.js"));
const { validarManifestPacote, ehContentTypeEditavel, CONTENT_PACKAGE_FORMATO, CONTENT_PACKAGE_VERSAO_ATUAL } = require(path.join(compiledDir, "contentSchema/contentPackage.js"));
const { coletarReferenciasBrutas, resolverDependencias } = require(path.join(compiledDir, "contentSchema/contentDependencies.js"));
const { classificarDocumentoImportado } = require(path.join(compiledDir, "contentSchema/importPreview.js"));

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

check("hash determinístico ignora ordem de chaves", () => {
  const a = { b: 1, a: 2, efeitos: [{ y: 1, x: 2 }, { x: 3 }] };
  const b = { a: 2, b: 1, efeitos: [{ x: 2, y: 1 }, { x: 3 }] };
  assert.strictEqual(hashCanonico(a), hashCanonico(b));
});

check("hash muda quando ordem de array muda (arrays são posicionalmente significativos)", () => {
  const a = { efeitos: [{ tipo: "x" }, { tipo: "y" }] };
  const b = { efeitos: [{ tipo: "y" }, { tipo: "x" }] };
  assert.notStrictEqual(hashCanonico(a), hashCanonico(b));
});

check("hash muda com alteração de valor (detecta corrupção/adulteração)", () => {
  assert.notStrictEqual(hashCanonico({ x: 1 }), hashCanonico({ x: 2 }));
});

check("manifest válido é aceito", () => {
  const manifest = {
    formato: CONTENT_PACKAGE_FORMATO,
    versaoFormato: CONTENT_PACKAGE_VERSAO_ATUAL,
    versaoMinimaImportador: 1,
    exportadoEm: new Date().toISOString(),
    origem: "teste",
    escopo: "documento_unico",
    quantidadeDocumentos: 1,
    avisos: [],
  };
  assert.strictEqual(validarManifestPacote(manifest).ok, true);
});

check("manifest com formato desconhecido é rejeitado", () => {
  const resultado = validarManifestPacote({ formato: "outro-formato", versaoFormato: 1, exportadoEm: new Date().toISOString(), quantidadeDocumentos: 0 });
  assert.strictEqual(resultado.ok, false);
});

check("manifest com versão futura desconhecida é rejeitado (nunca interpretado por tentativa)", () => {
  const resultado = validarManifestPacote({ formato: CONTENT_PACKAGE_FORMATO, versaoFormato: 999, exportadoEm: new Date().toISOString(), quantidadeDocumentos: 0 });
  assert.strictEqual(resultado.ok, false);
});

check("ehContentTypeEditavel reconhece os 5 tipos editáveis (4 mecânicos + capítulo, Etapa 11 correção)", () => {
  assert.strictEqual(ehContentTypeEditavel("spell"), true);
  assert.strictEqual(ehContentTypeEditavel("talent"), true);
  assert.strictEqual(ehContentTypeEditavel("item"), true);
  assert.strictEqual(ehContentTypeEditavel("rune"), true);
  assert.strictEqual(ehContentTypeEditavel("capitulo"), true);
  assert.strictEqual(ehContentTypeEditavel("condition"), false);
  assert.strictEqual(ehContentTypeEditavel("master_table"), false);
});

check("coleta dependências reais (requisitos de topo, condição em efeito, propriedades de item)", () => {
  const payload = {
    requisitos: [{ tipo_conteudo: "talent", slug: "talento_base" }],
    payload_automacao: { efeitos: [{ tipo: "aplicar_condicao", condicao: "atordoado" }] },
    estatisticas: { propriedades: ["cortante"] },
  };
  const refs = coletarReferenciasBrutas(payload);
  assert.strictEqual(refs.length, 3);
  assert.ok(refs.some((r) => r.tipo === "talent" && r.slugOuId === "talento_base" && r.obrigatoria === true));
  assert.ok(refs.some((r) => r.tipo === "condition" && r.slugOuId === "atordoado"));
  assert.ok(refs.some((r) => r.tipo === "property" && r.slugOuId === "cortante" && r.obrigatoria === false));
});

check("dependência resolvida no PRÓPRIO pacote nunca fica ausente", () => {
  const deps = resolverDependencias([{ tipo: "condition", slugOuId: "atordoado", obrigatoria: true }], new Set(["condition:atordoado"]), () => "ausente");
  assert.strictEqual(deps[0].estadoResolucao, "resolvida_no_pacote");
  assert.strictEqual(deps[0].incluida, true);
});

check("dependência fora do pacote nunca é assumida resolvida — consulta sempre o callback", () => {
  const deps = resolverDependencias([{ tipo: "condition", slugOuId: "fora_do_pacote", obrigatoria: true }], new Set(), () => "ambigua");
  assert.strictEqual(deps[0].estadoResolucao, "ambigua");
  assert.strictEqual(deps[0].incluida, false);
});

const documentoBase = {
  contentType: "spell",
  slug: "bola_de_fogo",
  payloadPublico: { nome: "Bola de fogo", slug: "bola_de_fogo" },
  hashPayload: hashCanonico({ nome: "Bola de fogo", slug: "bola_de_fogo" }),
  dependencias: [],
  vinculosEditoriais: [],
};

check("classifica como novo quando não há publicado nem rascunho", () => {
  const r = classificarDocumentoImportado({ documento: documentoBase, versaoFormatoSuportada: true, errosSchemaOficial: [], dependencias: [], estadoAtual: { publicado: null, rascunhoExistenteId: null } });
  assert.strictEqual(r.classificacao, "novo");
  assert.strictEqual(r.podeConfirmar, true);
});

check("classifica como identico quando hash bate com o publicado", () => {
  const r = classificarDocumentoImportado({
    documento: documentoBase,
    versaoFormatoSuportada: true,
    errosSchemaOficial: [],
    dependencias: [],
    estadoAtual: { publicado: { version: "1.0.0", payload: documentoBase.payloadPublico, payload_hash: "irrelevante" }, rascunhoExistenteId: null },
  });
  assert.strictEqual(r.classificacao, "identico");
  assert.strictEqual(r.podeConfirmar, false);
});

check("classifica como atualizacao quando publicado difere e a versão bate", () => {
  const r = classificarDocumentoImportado({
    documento: { ...documentoBase, versaoPublicada: "1.0.0" },
    versaoFormatoSuportada: true,
    errosSchemaOficial: [],
    dependencias: [],
    estadoAtual: { publicado: { version: "1.0.0", payload: { nome: "Outro nome", slug: "bola_de_fogo" }, payload_hash: "x" }, rascunhoExistenteId: null },
  });
  assert.strictEqual(r.classificacao, "atualizacao");
  assert.strictEqual(r.podeConfirmar, true);
});

check("classifica como conflito_com_publicado quando o publicado mudou desde a exportação", () => {
  const r = classificarDocumentoImportado({
    documento: { ...documentoBase, versaoPublicada: "1.0.0" },
    versaoFormatoSuportada: true,
    errosSchemaOficial: [],
    dependencias: [],
    estadoAtual: { publicado: { version: "2.0.0", payload: { nome: "Outro nome", slug: "bola_de_fogo" }, payload_hash: "x" }, rascunhoExistenteId: null },
  });
  assert.strictEqual(r.classificacao, "conflito_com_publicado");
});

check("classifica como conflito_com_rascunho quando já existe rascunho (nunca sobrescreve silenciosamente)", () => {
  const r = classificarDocumentoImportado({ documento: documentoBase, versaoFormatoSuportada: true, errosSchemaOficial: [], dependencias: [], estadoAtual: { publicado: null, rascunhoExistenteId: "draft-123" } });
  assert.strictEqual(r.classificacao, "conflito_com_rascunho");
  assert.strictEqual(r.podeConfirmar, false);
});

check("classifica como referencia_ausente quando dependência obrigatória não resolvida (bloqueia)", () => {
  const r = classificarDocumentoImportado({
    documento: documentoBase,
    versaoFormatoSuportada: true,
    errosSchemaOficial: [],
    dependencias: [{ tipo: "condition", slugOuId: "x", obrigatoria: true, incluida: false, estadoResolucao: "ausente" }],
    estadoAtual: { publicado: null, rascunhoExistenteId: null },
  });
  assert.strictEqual(r.classificacao, "referencia_ausente");
  assert.strictEqual(r.podeConfirmar, false);
});

check("classifica como schema_invalido quando há erros de schema oficial", () => {
  const r = classificarDocumentoImportado({ documento: documentoBase, versaoFormatoSuportada: true, errosSchemaOficial: ["campo obrigatório ausente"], dependencias: [], estadoAtual: { publicado: null, rascunhoExistenteId: null } });
  assert.strictEqual(r.classificacao, "schema_invalido");
  assert.strictEqual(r.podeConfirmar, false);
});

check("classifica como tipo_nao_editavel para tipos somente leitura (nunca fabrica rascunho)", () => {
  const r = classificarDocumentoImportado({ documento: { ...documentoBase, contentType: "condition" }, versaoFormatoSuportada: true, errosSchemaOficial: [], dependencias: [], estadoAtual: { publicado: null, rascunhoExistenteId: null } });
  assert.strictEqual(r.classificacao, "tipo_nao_editavel");
  assert.strictEqual(r.podeConfirmar, false);
});

check("classifica como versao_nao_suportada quando o manifest é de versão futura desconhecida", () => {
  const r = classificarDocumentoImportado({ documento: documentoBase, versaoFormatoSuportada: false, errosSchemaOficial: [], dependencias: [], estadoAtual: { publicado: null, rascunhoExistenteId: null } });
  assert.strictEqual(r.classificacao, "versao_nao_suportada");
  assert.strictEqual(r.podeConfirmar, false);
});

console.log(`\n${passed} verificações passaram.`);
if (process.exitCode) {
  console.error("Uma ou mais verificações falharam.");
  process.exit(1);
} else {
  console.log("Todas as verificações focadas da Etapa 11 passaram.");
}
