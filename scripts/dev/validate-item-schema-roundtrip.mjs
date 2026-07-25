#!/usr/bin/env node
/**
 * Verificação focada da correção de serialização de item (auditoria
 * formal do Editor Universal): `serializarItem` não emitia
 * `categoria_label`/`raridade_label`, exigidos pelo schema oficial de
 * equipamentos (`schema_equipamentos_v1_2.json`) — um item publicado
 * pelo Editor Universal falhava a própria revalidação de schema usada
 * na importação, quebrando o round-trip "exportar e reimportar sem
 * perda" (Etapa 11).
 *
 * Roda a REGRA REAL de produção (`serializarRascunhoParaPublicacao` →
 * `serializarItem`, e `validarContraSchemaOficial`, o MESMO validador
 * usado por `packageImport.ts`), nunca uma cópia reimplementada do
 * serializer ou do schema.
 *
 * Uso:
 *   npx tsc --module commonjs --target es2020 --moduleResolution node \
 *     --esModuleInterop --skipLibCheck --resolveJsonModule --outDir <dir> \
 *     src/lib/contentSchema/publishSerialization.ts \
 *     src/lib/contentSchema/officialSchemaValidator.ts \
 *     src/lib/contentSchema/itemLabels.ts \
 *     src/lib/contentSchema/draftMapping.ts \
 *     src/lib/contentSchema/canonicalHash.ts \
 *     src/lib/contentSchema/contentPackage.ts
 *   node scripts/dev/validate-item-schema-roundtrip.mjs <dir-compilado>
 */
import { createRequire } from "node:module";
import assert from "node:assert";
import path from "node:path";

const require = createRequire(import.meta.url);
const compiledDir = process.argv[2];
if (!compiledDir) {
  console.error("Uso: node validate-item-schema-roundtrip.mjs <diretorio-compilado>");
  process.exit(1);
}

const { serializarRascunhoParaPublicacao } = require(path.join(compiledDir, "contentSchema/publishSerialization.js"));
const { validarContraSchemaOficial } = require(path.join(compiledDir, "contentSchema/officialSchemaValidator.js"));
const { vazioCamposItem, rawOriginalItemVazio } = require(path.join(compiledDir, "contentSchema/draftMapping.js"));
const { hashCanonico } = require(path.join(compiledDir, "contentSchema/canonicalHash.js"));

let passed = 0;
let failed = 0;
function check(nome, fn) {
  try {
    fn();
    passed++;
    console.log(`ok - ${nome}`);
  } catch (e) {
    failed++;
    console.error(`NOT OK - ${nome}`);
    console.error(`  ${e instanceof Error ? e.message : e}`);
  }
}

function draftItem(campos, rawOriginal = rawOriginalItemVazio()) {
  return {
    id: "draft-teste",
    content_type: "item",
    slug: campos.slug,
    base_document_id: null,
    base_payload_hash: null,
    duplicated_from: null,
    payload: {
      schemaVersion: "draft.v1",
      contentType: "item",
      camposEditaveis: { contentType: "item", campos },
      preservado: { rawOriginal, camposDesconhecidos: [] },
    },
    created_by: null,
    updated_by: null,
    created_at: "",
    updated_at: "",
    version: 1,
  };
}

function itemCompleto(overrides = {}) {
  return {
    ...vazioCamposItem(),
    nome: "Item de teste",
    slug: "item_de_teste_harness",
    categoria: "farmacia",
    raridade: "comum",
    preco: 50,
    descricaoCurta: "Curta.",
    descricaoLonga: "Longa o suficiente para o schema oficial.",
    ...overrides,
  };
}

// --- 1/2: categoria e raridade válidas geram os labels corretos --------
check("categoria válida gera categoria_label correto (farmacia -> Farmácia)", () => {
  const corpo = serializarRascunhoParaPublicacao(draftItem(itemCompleto({ categoria: "farmacia" })));
  assert.strictEqual(corpo.categoria, "farmacia");
  assert.strictEqual(corpo.categoria_label, "Farmácia");
});

check("raridade válida gera raridade_label correto (muito_raro -> Muito Raro)", () => {
  const corpo = serializarRascunhoParaPublicacao(draftItem(itemCompleto({ raridade: "muito_raro" })));
  assert.strictEqual(corpo.raridade, "muito_raro");
  assert.strictEqual(corpo.raridade_label, "Muito Raro");
});

// --- 3/4: nenhuma combinação incoerente é produzida ---------------------
check("todas as 10 categorias reais produzem exatamente o label esperado (nunca de outra categoria)", () => {
  const esperado = {
    arma: "Arma", armadura: "Armadura", escudo: "Escudo", explosivo: "Explosivo", farmacia: "Farmácia",
    vertina: "Vertina", ferramenta: "Ferramenta", dispositivo: "Dispositivo", veiculo: "Veículo", municao: "Munição",
  };
  for (const [categoria, label] of Object.entries(esperado)) {
    const corpo = serializarRascunhoParaPublicacao(draftItem(itemCompleto({ categoria })));
    assert.strictEqual(corpo.categoria_label, label, `categoria=${categoria}`);
  }
});

check("todas as 5 raridades reais produzem exatamente o label esperado", () => {
  const esperado = { comum: "Comum", incomum: "Incomum", muito_comum: "Muito Comum", muito_raro: "Muito Raro", raro: "Raro" };
  for (const [raridade, label] of Object.entries(esperado)) {
    const corpo = serializarRascunhoParaPublicacao(draftItem(itemCompleto({ raridade })));
    assert.strictEqual(corpo.raridade_label, label, `raridade=${raridade}`);
  }
});

check("categoria não reconhecida (texto livre) nunca produz um label inventado", () => {
  const corpo = serializarRascunhoParaPublicacao(draftItem(itemCompleto({ categoria: "consumivel" })));
  assert.strictEqual(corpo.categoria_label, undefined);
});

// `serializarRascunhoParaPublicacao` nunca injeta id/slug/status/versao/
// created_at/updated_at — isso é autoridade do RPC `publish_content_draft`
// (SQL). Simula exatamente os mesmos campos/formatos que o RPC injeta,
// só para validar contra o schema — mesma técnica usada em
// `publishReview.ts::montarRevisaoPublicacao`.
function comoSeRiaPublicado(corpo, slug) {
  return { ...corpo, id: slug, slug, status: "published", versao: "1.0.0", created_at: "2026-01-01", updated_at: "2026-01-01" };
}

// --- 5: item serializado passa no schema oficial (o achado principal) --
check("item completo e válido passa no schema oficial de equipamentos", () => {
  const corpo = serializarRascunhoParaPublicacao(draftItem(itemCompleto()));
  const resultado = validarContraSchemaOficial("item", comoSeRiaPublicado(corpo, "item_de_teste_harness"));
  assert.deepStrictEqual(resultado.erros, []);
  assert.strictEqual(resultado.ok, true);
});

// --- REPRODUÇÃO PRÉ-FIX: prova de regressão real ------------------------
// Remove manualmente os labels do corpo JÁ serializado pelo código REAL
// (nunca reimplementa o serializer) para provar que o schema realmente
// rejeita a ausência deles — ou seja, que o teste acima falharia contra
// o código anterior à correção (que nunca emitia essas duas chaves).
check("prova de regressão: corpo sem os labels (comportamento pré-fix) É rejeitado pelo schema oficial", () => {
  const corpo = serializarRascunhoParaPublicacao(draftItem(itemCompleto()));
  delete corpo.categoria_label;
  delete corpo.raridade_label;
  const resultado = validarContraSchemaOficial("item", comoSeRiaPublicado(corpo, "item_de_teste_harness"));
  assert.strictEqual(resultado.ok, false);
  assert.ok(resultado.erros.some((e) => e.includes("categoria_label")), "esperava erro sobre categoria_label ausente");
  assert.ok(resultado.erros.some((e) => e.includes("raridade_label")), "esperava erro sobre raridade_label ausente");
});

// --- categoria fora do enum é rejeitada pelo schema (não pelos labels) -
check("categoria fora do enum oficial é rejeitada pelo schema (não finge sucesso)", () => {
  const corpo = serializarRascunhoParaPublicacao(draftItem(itemCompleto({ categoria: "consumivel" })));
  const resultado = validarContraSchemaOficial("item", comoSeRiaPublicado(corpo, "item_de_teste_harness"));
  assert.strictEqual(resultado.ok, false);
});

// --- 8: hash canônico permanece válido para o payload corrigido --------
check("hash canônico é determinístico para o payload corrigido (round-trip de hash)", () => {
  const corpo = serializarRascunhoParaPublicacao(draftItem(itemCompleto()));
  const h1 = hashCanonico(corpo);
  const h2 = hashCanonico(JSON.parse(JSON.stringify(corpo)));
  assert.strictEqual(h1, h2);
});

// --- 9: round-trip preserva payload/campos desconhecidos ---------------
check("campos desconhecidos do rawOriginal sobrevivem à serialização (overlay sobre clone)", () => {
  const rawOriginal = { ...rawOriginalItemVazio(), campo_nunca_editavel_pelo_editor: "preservar-me" };
  const corpo = serializarRascunhoParaPublicacao(draftItem(itemCompleto(), rawOriginal));
  assert.strictEqual(corpo.campo_nunca_editavel_pelo_editor, "preservar-me");
});

// --- 10: item "legado" (categoria real, sem label pré-existente) -------
check("item legado (rawOriginal sem categoria_label/raridade_label prévios) ainda serializa com labels corretos", () => {
  const rawOriginal = { estatisticas: {}, payload_automacao: { efeitos: [] } }; // nunca teve label — simula legado
  const corpo = serializarRascunhoParaPublicacao(draftItem(itemCompleto({ categoria: "arma", raridade: "raro" }), rawOriginal));
  assert.strictEqual(corpo.categoria_label, "Arma");
  assert.strictEqual(corpo.raridade_label, "Raro");
});

// --- 12: efeitos do item permanecem intactos ----------------------------
check("efeitos do item sobrevivem à correção (não tocados por ela)", () => {
  const campos = itemCompleto({
    efeitos: [
      {
        id: "efeito-1",
        tipo: "cura",
        ordem: 0,
        habilitado: true,
        gatilho: "ao_usar",
        alvo: "proprio",
        campos: { tipoFormula: "dados", quantidadeDados: 2, faces: 6, recurso: "pv", limitarAoMaximo: true, permitirValorTemporario: false },
      },
    ],
  });
  const corpo = serializarRascunhoParaPublicacao(draftItem(campos));
  assert.strictEqual(corpo.payload_automacao.efeitos.length, 1);
  assert.strictEqual(corpo.payload_automacao.efeitos[0].tipo, "cura");
});

console.log(`\n${passed} verificações passaram${failed > 0 ? `, ${failed} FALHARAM` : ""}.`);
if (failed > 0) {
  console.error("Alguma verificação do round-trip de item falhou.");
  process.exit(1);
}
console.log("Todas as verificações focadas do round-trip de item (schema oficial) passaram.");
