#!/usr/bin/env node
/**
 * Verificação de compatibilidade de schema (correção pós-Etapa 5).
 *
 * Roda a serialização de publicação REAL (`publishSerialization.ts` +
 * `effectLegacySerialization.ts`, compiladas por `tsc` para um diretório
 * temporário — nada de fixtures escritas à mão para o payload final) e
 * valida o resultado contra os schemas OFICIAIS reais (`content/schema_
 * magias_v1_3.json`, `schema_equipamentos_v1_2.json`,
 * `schema_talentos_v1_3.json`) usando um avaliador mínimo de JSON Schema
 * (subconjunto: type, enum, const, pattern, required, properties,
 * additionalProperties, items, allOf/if-then, anyOf, $ref local).
 *
 * Por que não usa `tsx`/Playwright: mesmo conflito de arquitetura do
 * esbuild das etapas anteriores. Este script roda com `node` puro sobre
 * JS já compilado por `tsc` (que funciona neste ambiente) — nenhuma
 * dependência de esbuild.
 *
 * Uso:
 *   1. Compilar (uma vez, ou depois de qualquer mudança nos arquivos-fonte):
 *        npx tsc src/lib/contentSchema/publishSerialization.ts \
 *          src/lib/contentSchema/effectLegacySerialization.ts \
 *          src/lib/contentSchema/draftTypes.ts \
 *          src/lib/contentSchema/effectDraftTypes.ts \
 *          src/lib/contentSchema/effectTypeRegistry.ts \
 *          src/lib/contentSchema/types.ts \
 *          src/lib/content/types.ts \
 *          --outDir <tmp>/compiled --module commonjs --target es2020 \
 *          --moduleResolution node --esModuleInterop --skipLibCheck \
 *          --declaration false --rootDir src
 *   2. node scripts/dev/validate-published-schema.mjs <tmp>/compiled
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const compiledDir = process.argv[2];
if (!compiledDir) {
  console.error("Uso: node validate-published-schema.mjs <diretorio-compilado>");
  process.exit(1);
}

const { serializarRascunhoParaPublicacao } = require(path.join(compiledDir, "lib/contentSchema/publishSerialization.js"));

// ---------------------------------------------------------------------
// Avaliador mínimo de JSON Schema (subconjunto usado pelos schemas reais).
// ---------------------------------------------------------------------
function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v; // "object" | "string" | "number" | "boolean" | "undefined"
}

function validar(schema, valor, caminho, erros, raiz) {
  if (schema.$ref) {
    const alvo = resolverRef(schema.$ref, raiz);
    validar(alvo, valor, caminho, erros, raiz);
    return;
  }
  if (schema.const !== undefined) {
    if (valor !== schema.const) erros.push(`${caminho}: esperado const ${JSON.stringify(schema.const)}, recebeu ${JSON.stringify(valor)}`);
    return;
  }
  if (schema.enum) {
    if (!schema.enum.includes(valor)) erros.push(`${caminho}: valor ${JSON.stringify(valor)} fora do enum ${JSON.stringify(schema.enum)}`);
  }
  if (schema.pattern && typeof valor === "string") {
    if (!new RegExp(schema.pattern).test(valor)) erros.push(`${caminho}: "${valor}" não bate com o padrão ${schema.pattern}`);
  }
  if (schema.type) {
    const tipos = Array.isArray(schema.type) ? schema.type : [schema.type];
    const t = typeOf(valor);
    const tNorm = t === "number" && Number.isInteger(valor) ? ["number", "integer"] : [t];
    const bate = tipos.some((esperado) => tNorm.includes(esperado) || (esperado === "integer" && t === "number" && Number.isInteger(valor)));
    if (!bate) erros.push(`${caminho}: tipo ${t} não está em ${JSON.stringify(tipos)}`);
  }
  if (schema.type === "object" || (valor && typeof valor === "object" && !Array.isArray(valor) && schema.properties)) {
    if (valor && typeof valor === "object" && !Array.isArray(valor)) {
      for (const campo of schema.required ?? []) {
        if (!(campo in valor)) erros.push(`${caminho}: campo obrigatório "${campo}" ausente`);
      }
      if (schema.additionalProperties === false) {
        const permitidas = new Set(Object.keys(schema.properties ?? {}));
        for (const chave of Object.keys(valor)) {
          if (!permitidas.has(chave)) erros.push(`${caminho}.${chave}: chave NÃO permitida (additionalProperties: false)`);
        }
      }
      for (const [chave, subschema] of Object.entries(schema.properties ?? {})) {
        if (chave in valor) validar(subschema, valor[chave], `${caminho}.${chave}`, erros, raiz);
      }
    }
  }
  if (schema.type === "array" && Array.isArray(valor)) {
    if (schema.minItems != null && valor.length < schema.minItems) erros.push(`${caminho}: array tem ${valor.length} itens, mínimo ${schema.minItems}`);
    if (schema.maxItems != null && valor.length > schema.maxItems) erros.push(`${caminho}: array tem ${valor.length} itens, máximo ${schema.maxItems}`);
    if (schema.items) {
      valor.forEach((item, i) => validar(schema.items, item, `${caminho}[${i}]`, erros, raiz));
    }
    if (schema.contains) {
      const algumBate = valor.some((item) => {
        const errosLocais = [];
        validar(schema.contains, item, `${caminho}[contains]`, errosLocais, raiz);
        return errosLocais.length === 0;
      });
      if (!algumBate) erros.push(`${caminho}: nenhum item satisfaz "contains"`);
    }
  }
  if (schema.allOf) {
    for (const sub of schema.allOf) {
      if (sub.if) {
        const errosIf = [];
        validar(sub.if, valor, caminho, errosIf, raiz);
        if (errosIf.length === 0 && sub.then) validar(sub.then, valor, caminho, erros, raiz);
      } else {
        validar(sub, valor, caminho, erros, raiz);
      }
    }
  }
  if (schema.anyOf) {
    const algumBate = schema.anyOf.some((sub) => {
      const errosLocais = [];
      validar(sub, valor, caminho, errosLocais, raiz);
      return errosLocais.length === 0;
    });
    if (!algumBate) erros.push(`${caminho}: nenhuma alternativa de anyOf satisfeita`);
  }
}

function resolverRef(ref, raiz) {
  const partes = ref.replace(/^#\//, "").split("/");
  let atual = raiz;
  for (const parte of partes) atual = atual[parte];
  return atual;
}

function validarContra(schema, valor) {
  const erros = [];
  validar(schema, valor, "$", erros, schema);
  return erros;
}

// ---------------------------------------------------------------------
// Fixtures de RASCUNHO (entrada da serialização — não é o payload final;
// o payload final é PRODUZIDO pela função real, não escrito à mão aqui).
// ---------------------------------------------------------------------
function efeitoBase(overrides) {
  return { id: "efeito-teste-1", habilitado: true, ordem: 0, ...overrides };
}

function draftSpellDano() {
  return {
    id: "draft-1",
    content_type: "spell",
    slug: "zz_validacao_dano_fogo",
    version: 1,
    payload: {
      schemaVersion: "draft.v1",
      contentType: "spell",
      camposEditaveis: {
        contentType: "spell",
        campos: {
          nome: "ZZ Validação Dano Fogo",
          slug: "zz_validacao_dano_fogo",
          categoria: "magia",
          tags: ["magia", "ofensiva"],
          vertente: "energetica",
          nivel: 1,
          requisitos: [],
          efeitos: [
            efeitoBase({
              tipo: "dano",
              gatilho: "ao_acertar",
              alvo: "alvo_principal",
              campos: {
                tipoFormula: "dados",
                quantidadeDados: 1,
                faces: 8,
                tipoDano: "energetico",
                subtipoDano: "igneo",
                danoPrincipalOuAdicional: "principal",
                ignoraMit: false,
                ignoraPd: false,
                metadeEmSucesso: false,
              },
            }),
          ],
        },
      },
      preservado: {
        // Efeito legado preservado (teste_resistencia/outro) — precisa sobreviver intacto.
        rawOriginal: {
          id: "zz_validacao_dano_fogo",
          nome: "ZZ Validação Dano Fogo",
          slug: "zz_validacao_dano_fogo",
          categoria: "magia",
          categoria_label: "Magia",
          vertente: "energetica",
          vertente_label: "Energética",
          descricao_curta: "Descrição curta de teste.",
          descricao_longa: "Descrição longa de teste.",
          tags: ["magia", "ofensiva"],
          status: "published",
          versao: "1.0.0",
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
          estatisticas: { nivel: 1, tipo_magia: "ataque", custo_pa: 1, resolucao: "resistencia" },
          payload_automacao: {
            efeitos: [
              { tipo: "efeito_com_resistencia", resistencia: { cd_formula: "5 + nivel_vertente", acoes: ["esquivar"] } },
            ],
          },
        },
        camposDesconhecidos: [],
      },
    },
  };
}

function draftItemCura() {
  return {
    id: "draft-2",
    content_type: "item",
    slug: "zz_validacao_item_cura",
    version: 1,
    payload: {
      schemaVersion: "draft.v1",
      contentType: "item",
      camposEditaveis: {
        contentType: "item",
        campos: {
          nome: "ZZ Validação Item Cura",
          slug: "zz_validacao_item_cura",
          categoria: "farmacia",
          tags: ["cura"],
          propriedades: [],
          efeitos: [
            efeitoBase({
              tipo: "cura",
              gatilho: "ao_usar",
              alvo: "selecionado_manualmente",
              campos: { tipoFormula: "dados", quantidadeDados: 2, faces: 6, recurso: "pv", limitarAoMaximo: true, permitirValorTemporario: false },
            }),
          ],
        },
      },
      preservado: {
        // estatisticas preservadas — precisam sobreviver intactas.
        rawOriginal: {
          id: "zz_validacao_item_cura",
          nome: "ZZ Validação Item Cura",
          slug: "zz_validacao_item_cura",
          categoria: "farmacia",
          categoria_label: "Farmácia",
          raridade: "comum",
          raridade_label: "Comum",
          subtipo: "curativo",
          preco: 10,
          descricao_curta: "Descrição curta.",
          descricao_longa: "Descrição longa.",
          tags: ["cura"],
          status: "published",
          versao: "1.0.0",
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
          estatisticas: { peso_kg: 0.2, slots_runa_max: 0 },
          payload_automacao: { efeitos: [] },
        },
        camposDesconhecidos: [],
      },
    },
  };
}

function draftTalentoLuta() {
  const nivelBase = (n) => ({
    id: `zz_validacao_talento_n${n}`,
    slug: `zz_validacao_talento_n${n}`,
    talento_id: "zz_validacao_talento",
    nivel: n,
    nome: `Nível ${n} de teste`,
    requisitos: [],
    tags: [],
    descricao_curta: "desc curta",
    descricao_longa: "desc longa",
    status: "published",
    versao: "1.0.0",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    // Schema exige minItems:1 em payload_automacao.efeitos por nível — níveis
    // sem efeito editável configurado mantêm um efeito bespoke preservado
    // (representativo de conteúdo real; nunca inventado pela publicação).
    payload_automacao: { efeitos: [{ tipo: "regra_especial_de_teste", familia: "regra_especial" }] },
  });
  return {
    id: "draft-3",
    content_type: "talent",
    slug: "zz_validacao_talento",
    version: 1,
    payload: {
      schemaVersion: "draft.v1",
      contentType: "talent",
      camposEditaveis: {
        contentType: "talent",
        campos: {
          nome: "ZZ Validação Talento",
          slug: "zz_validacao_talento",
          tags: ["dano"],
          descricaoCurta: "desc curta talento",
          descricaoLonga: "desc longa talento",
          niveis: [
            {
              nivel: 1,
              nomeNivel: "Nível 1 de teste",
              requisitos: [],
              efeitos: [
                efeitoBase({
                  tipo: "modificar_teste",
                  gatilho: "manualmente",
                  alvo: "proprio",
                  campos: { modo: "bonus", valor: 1, pericia: "luta", tags: [], acumulavel: false, consumirNoProximoTeste: false, confirmacaoDeContexto: false },
                }),
              ],
            },
            { nivel: 2, nomeNivel: "Nível 2 de teste", requisitos: [], efeitos: [] },
            { nivel: 3, nomeNivel: "Nível 3 de teste", requisitos: [], efeitos: [] },
          ],
        },
      },
      preservado: {
        rawOriginal: {
          id: "zz_validacao_talento",
          slug: "zz_validacao_talento",
          nome: "ZZ Validação Talento",
          tags: ["dano"],
          descricao_curta: "desc curta talento",
          descricao_longa: "desc longa talento",
          status: "published",
          versao: "1.0.0",
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
          niveis: [nivelBase(1), nivelBase(2), nivelBase(3)],
        },
        camposDesconhecidos: [],
      },
    },
  };
}

// ---------------------------------------------------------------------
// Executa os 6 casos mínimos exigidos.
// ---------------------------------------------------------------------
const schemaMagias = JSON.parse(readFileSync(path.join(REPO_ROOT, "content/schema_magias_v1_3.json"), "utf8"));
const schemaEquipamentos = JSON.parse(readFileSync(path.join(REPO_ROOT, "content/schema_equipamentos_v1_2.json"), "utf8"));
const schemaTalentos = JSON.parse(readFileSync(path.join(REPO_ROOT, "content/schema_talentos_v1_3.json"), "utf8"));

const itemSchemaMagia = schemaMagias.properties.magias.items;
const itemSchemaEquipamento = schemaEquipamentos.properties.itens.items;
const itemSchemaTalento = schemaTalentos.properties.talentos.items;

let falhas = 0;

function checar(nome, corpo, schema, raizParaRef) {
  const jsonTexto = JSON.stringify(corpo);
  const chaveAdmin = jsonTexto.includes('"_editor"') || jsonTexto.includes("_editor");
  // $ref local (ex.: talento -> $defs.efeito) precisa da raiz do arquivo inteiro, não do subschema.
  const erros = [];
  validar(schema, corpo, "$", erros, raizParaRef ?? schema);
  const ok = erros.length === 0 && !chaveAdmin;
  console.log(`${ok ? "OK " : "FALHA"} — ${nome}`);
  if (chaveAdmin) console.log(`  ✕ chave administrativa "_editor" vazou para o payload publicado`);
  for (const e of erros) console.log(`  ✕ ${e}`);
  if (!ok) falhas++;
  return { ok, corpo };
}

// 1. Magia com dano 1d8 de fogo.
const corpoSpell = serializarRascunhoParaPublicacao(draftSpellDano());
checar("1. Magia — dano 1d8 de fogo válido contra schema_magias_v1_3", corpoSpell, itemSchemaMagia, schemaMagias);

// 4. Efeito legado preservado (efeito_com_resistencia) continua presente e no formato original.
const efeitosSpell = corpoSpell.payload_automacao.efeitos;
const resistenciaPreservada = efeitosSpell.find((e) => e.tipo === "efeito_com_resistencia");
console.log(`${resistenciaPreservada ? "OK " : "FALHA"} — 4. Efeito legado preservado (efeito_com_resistencia) presente`);
if (!resistenciaPreservada) falhas++;
else if (resistenciaPreservada.resistencia?.cd_formula !== "5 + nivel_vertente") {
  console.log(`  ✕ efeito_com_resistencia teve seu conteúdo alterado`);
  falhas++;
}
// Ordem: preservado (índice 0) antes do editável (índice 1).
if (efeitosSpell[0]?.tipo !== "efeito_com_resistencia" || efeitosSpell[1]?.tipo !== "dano") {
  console.log("  ✕ ordem dos efeitos não é [preservado, editável] como esperado");
  falhas++;
}

// 2. Item com cura 2d6 PV.
const corpoItem = serializarRascunhoParaPublicacao(draftItemCura());
checar("2. Item — cura 2d6 PV válido contra schema_equipamentos_v1_2", corpoItem, itemSchemaEquipamento);

// 5. Item com estatisticas preservado.
const estatisticasOk = corpoItem.estatisticas?.peso_kg === 0.2 && corpoItem.estatisticas?.slots_runa_max === 0;
console.log(`${estatisticasOk ? "OK " : "FALHA"} — 5. Item — estatisticas preservado`);
if (!estatisticasOk) falhas++;

// 3. Talento com +1 em Luta.
const corpoTalento = serializarRascunhoParaPublicacao(draftTalentoLuta());
checar("3. Talento — +1 em Luta válido contra schema_talentos_v1_3", corpoTalento, itemSchemaTalento, schemaTalentos);

// 6. Talento com três níveis preservados.
const niveisOk = Array.isArray(corpoTalento.niveis) && corpoTalento.niveis.length === 3;
console.log(`${niveisOk ? "OK " : "FALHA"} — 6. Talento — três níveis preservados`);
if (!niveisOk) falhas++;

console.log(`\n${falhas === 0 ? "=== TODOS OS CASOS PASSARAM ===" : `=== ${falhas} FALHA(S) ===`}`);
process.exit(falhas === 0 ? 0 : 1);
