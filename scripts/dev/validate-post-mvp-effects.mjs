#!/usr/bin/env node
/**
 * Verificação focada da correção do bug de validação de efeitos pós-MVP
 * (`effectDraftValidation.ts`, ver
 * docs/CHECKPOINT_CORRECAO_VALIDACAO_TIPOS_EFEITO_POS_MVP.md).
 *
 * Roda a REGRA REAL de produção — `validarCamposTalento`, exatamente a
 * mesma função chamada por `atualizarRascunho` ("Salvar rascunho") e por
 * `montarRevisaoPublicacao` (revisão/publicação) — nunca chama
 * `isTipoEfeitoEditavel` diretamente nem reimplementa uma cópia do
 * validador. As duas dependências de I/O real (`getContentDocument`,
 * `findDraftBySlug`) são fakes em memória via injeção em
 * `require.cache`, mesma técnica de `validate-slug-collision.mjs`.
 *
 * Uso:
 *   npx tsc --module commonjs --target es2020 --moduleResolution node \
 *     --esModuleInterop --skipLibCheck --resolveJsonModule --outDir <dir> \
 *     src/lib/contentSchema/draftValidation.ts
 *   node scripts/dev/validate-post-mvp-effects.mjs <dir-compilado>
 */
import { createRequire } from "node:module";
import assert from "node:assert";
import path from "node:path";

const require = createRequire(import.meta.url);
const compiledDir = process.argv[2];
if (!compiledDir) {
  console.error("Uso: node validate-post-mvp-effects.mjs <diretorio-compilado>");
  process.exit(1);
}

function fakeModule(filename, exportsObj) {
  return { id: filename, filename, loaded: true, exports: exportsObj };
}
const queriesPath = require.resolve(path.join(compiledDir, "content/queries.js"));
require.cache[queriesPath] = fakeModule(queriesPath, { async getContentDocument() { return null; } });
const draftQueriesPath = require.resolve(path.join(compiledDir, "contentSchema/draftQueries.js"));
require.cache[draftQueriesPath] = fakeModule(draftQueriesPath, { async findDraftBySlug() { return null; } });

const { validarCamposTalento } = require(path.join(compiledDir, "contentSchema/draftValidation.js"));

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

function comuns(overrides = {}) {
  return { id: `efeito-${Math.random().toString(36).slice(2)}`, habilitado: true, ordem: 0, gatilho: "manualmente", alvo: "proprio", ...overrides };
}

function talentoComEfeito(efeito) {
  return {
    nome: "Talento de teste",
    slug: "talento_de_teste_harness",
    tags: [],
    niveis: [{ nivel: 1, nomeNivel: "Nível 1", requisitos: [], efeitos: [efeito] }],
  };
}

async function erros(efeito) {
  const r = await validarCamposTalento(talentoComEfeito(efeito));
  return r.erros;
}

const MENSAGEM_TIPO_INVALIDO_ANTIGA = "só os 6 tipos do MVP são suportados";

// --- Etapa 7 -------------------------------------------------------------
await check("[Etapa 7] teste_resistencia é aceito pelo gate (sem erro de 'tipo inválido')", async () => {
  const e = {
    ...comuns(),
    tipo: "teste_resistencia",
    campos: { modo: "resistencia", quemTesta: "alvo", pericia: "vontade", cd: { tipo: "fixa", valor: 14 }, confirmacaoManual: true, resultados: [] },
  };
  const errs = await erros(e);
  assert.ok(!errs.some((x) => x.includes(MENSAGEM_TIPO_INVALIDO_ANTIGA)), errs.join("; "));
});

// --- Etapa 8 -------------------------------------------------------------
await check("[Etapa 8] efeito_temporario é aceito pelo gate", async () => {
  const e = {
    ...comuns(),
    tipo: "efeito_temporario",
    campos: { duracao: { tipo: "rounds", rodadas: 3 }, politicaReaplicacao: "substituir", acumulavel: false, modificadores: [], confirmacaoManual: true },
  };
  const errs = await erros(e);
  assert.ok(!errs.some((x) => x.includes(MENSAGEM_TIPO_INVALIDO_ANTIGA)), errs.join("; "));
});

// --- Etapa 9 (os 4 + o 5º = efeito_temporario, já coberto acima) --------
await check("[Etapa 9] modificar_instancia é aceito pelo gate", async () => {
  const e = { ...comuns(), tipo: "modificar_instancia", campos: { operacao: "alterar_carga_atual", valor: 1, confirmacaoManual: true } };
  const errs = await erros(e);
  assert.ok(!errs.some((x) => x.includes(MENSAGEM_TIPO_INVALIDO_ANTIGA)), errs.join("; "));
});

await check("[Etapa 9] conceder_item é aceito pelo gate", async () => {
  const e = {
    ...comuns(),
    tipo: "conceder_item",
    campos: { itemSlug: "faca", quantidade: 1, destino: "personagem", permitirDuplicata: false, empilharQuandoCompativel: true, confirmacaoManual: true },
  };
  const errs = await erros(e);
  assert.ok(!errs.some((x) => x.includes(MENSAGEM_TIPO_INVALIDO_ANTIGA)), errs.join("; "));
});

await check("[Etapa 9] consumir_item é aceito pelo gate", async () => {
  const e = { ...comuns(), tipo: "consumir_item", campos: { itemSlug: "faca", quantidade: 1, comportamentoPilha: "reduzir_quantidade", refund: false, confirmacaoManual: true } };
  const errs = await erros(e);
  assert.ok(!errs.some((x) => x.includes(MENSAGEM_TIPO_INVALIDO_ANTIGA)), errs.join("; "));
});

await check("[Etapa 9] alterar_disponibilidade é aceito pelo gate", async () => {
  const e = { ...comuns(), tipo: "alterar_disponibilidade", campos: { operacao: "marcar_disponivel", confirmacaoManual: true } };
  const errs = await erros(e);
  assert.ok(!errs.some((x) => x.includes(MENSAGEM_TIPO_INVALIDO_ANTIGA)), errs.join("; "));
});

// --- Etapa 10 (todos os 6) -----------------------------------------------
await check("[Etapa 10] companheiro é aceito pelo gate", async () => {
  const e = { ...comuns(), tipo: "companheiro", campos: { tipo: "drone", destino: "proprio", quantidade: 1, persistente: false, confirmacaoManual: true } };
  const errs = await erros(e);
  assert.ok(!errs.some((x) => x.includes(MENSAGEM_TIPO_INVALIDO_ANTIGA)), errs.join("; "));
});

await check("[Etapa 10] modificar_companheiro é aceito pelo gate", async () => {
  const e = { ...comuns(), tipo: "modificar_companheiro", campos: { operacao: "conceder_pa", confirmacaoManual: true } };
  const errs = await erros(e);
  assert.ok(!errs.some((x) => x.includes(MENSAGEM_TIPO_INVALIDO_ANTIGA)), errs.join("; "));
});

await check("[Etapa 10] acao_companheiro é aceito pelo gate", async () => {
  const e = { ...comuns(), tipo: "acao_companheiro", campos: { exigeTeste: false, independente: true, efeitosConsequencia: [], confirmacaoManual: true } };
  const errs = await erros(e);
  assert.ok(!errs.some((x) => x.includes(MENSAGEM_TIPO_INVALIDO_ANTIGA)), errs.join("; "));
});

await check("[Etapa 10] programar_gatilho é aceito pelo gate", async () => {
  const e = { ...comuns(), tipo: "programar_gatilho", campos: {} };
  const errs = await erros(e);
  assert.ok(!errs.some((x) => x.includes(MENSAGEM_TIPO_INVALIDO_ANTIGA)), errs.join("; "));
});

await check("[Etapa 10] parear é aceito pelo gate", async () => {
  const e = { ...comuns(), tipo: "parear", campos: { tiposCompativeis: [], compartilhamentos: [], confirmacaoManual: true } };
  const errs = await erros(e);
  assert.ok(!errs.some((x) => x.includes(MENSAGEM_TIPO_INVALIDO_ANTIGA)), errs.join("; "));
});

await check("[Etapa 10] acao_trama é aceito pelo gate", async () => {
  const e = { ...comuns(), tipo: "acao_trama", campos: { acao: "avancar", exigeTeste: false, alcanceAvancarEspacos: 15, confirmacaoManual: true } };
  const errs = await erros(e);
  assert.ok(!errs.some((x) => x.includes(MENSAGEM_TIPO_INVALIDO_ANTIGA)), errs.join("; "));
});

// --- Validação genérica continua rodando para tipos pós-MVP -------------
await check("validação genérica (gatilho/alvo obrigatórios) ainda roda para tipo pós-MVP", async () => {
  const e = {
    id: "efeito-sem-gatilho",
    habilitado: true,
    ordem: 0,
    // gatilho/alvo propositalmente ausentes
    tipo: "acao_trama",
    campos: { acao: "avancar", exigeTeste: false, confirmacaoManual: true },
  };
  const errs = await erros(e);
  assert.ok(errs.some((x) => x.includes("gatilho obrigatório ausente")), errs.join("; "));
  assert.ok(errs.some((x) => x.includes("alvo obrigatório ausente")), errs.join("; "));
});

// --- Tipo realmente desconhecido continua rejeitado ----------------------
await check("tipo realmente inventado/desconhecido continua rejeitado", async () => {
  const e = { ...comuns(), tipo: "efeito_completamente_inventado_xyz", campos: {} };
  const errs = await erros(e);
  assert.ok(errs.some((x) => x.includes("tipo de efeito inválido")), errs.join("; "));
});

// --- Tipos MVP continuam funcionando --------------------------------------
await check("tipo MVP (dano) continua sendo aceito e validado normalmente", async () => {
  const e = { ...comuns(), tipo: "dano", campos: { tipoFormula: "dados", quantidadeDados: 1, faces: 8, tipoDano: "energetico" } };
  const errs = await erros(e);
  assert.deepStrictEqual(errs, []);
});

await check("tipo MVP (dano) com payload inválido continua rejeitado (validação específica ainda roda)", async () => {
  const e = { ...comuns(), tipo: "dano", campos: { tipoFormula: "dados", quantidadeDados: -1, faces: 8, tipoDano: "energetico" } };
  const errs = await erros(e);
  assert.ok(errs.length > 0, "esperava erro de quantidade de dados inválida");
});

// --- Persistência em talento continua permitida (rascunho completo) -----
await check("rascunho de talento com múltiplos tipos pós-MVP passa a validação completa (sem erros)", async () => {
  const talento = {
    nome: "Talento completo",
    slug: "talento_completo_harness",
    tags: [],
    niveis: [
      {
        nivel: 1,
        nomeNivel: "Nível 1",
        requisitos: [],
        efeitos: [
          { ...comuns({ ordem: 0 }), tipo: "modificar_instancia", campos: { operacao: "alterar_carga_atual", valor: 1, confirmacaoManual: true } },
          { ...comuns({ ordem: 1 }), tipo: "acao_trama", campos: { acao: "avancar", exigeTeste: false, alcanceAvancarEspacos: 15, confirmacaoManual: true } },
        ],
      },
    ],
  };
  const r = await validarCamposTalento(talento);
  assert.deepStrictEqual(r.erros, []);
});

console.log(`\n${passed} verificações passaram${failed > 0 ? `, ${failed} FALHARAM` : ""}.`);
if (failed > 0) {
  console.error("Alguma verificação de efeitos pós-MVP falhou.");
  process.exit(1);
}
console.log("Todas as verificações focadas dos efeitos pós-MVP passaram.");
