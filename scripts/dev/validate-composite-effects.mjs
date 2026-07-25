#!/usr/bin/env node
/**
 * Verificação focada da Etapa 7 (efeitos compostos). Roda o código REAL
 * compilado por `tsc` (mesmo padrão da Etapa 5/6 — `node` puro, sem
 * `tsx`/esbuild) contra fixtures de RASCUNHO (nunca o payload final —
 * esse é PRODUZIDO pela função real) e valida o resultado contra os
 * schemas oficiais reais com o mesmo avaliador mínimo de JSON Schema já
 * usado em `validate-published-schema.mjs`.
 *
 * Uso: node scripts/dev/validate-composite-effects.mjs <dir-compilado>
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
  console.error("Uso: node validate-composite-effects.mjs <diretorio-compilado>");
  process.exit(1);
}

const { serializarRascunhoParaPublicacao } = require(path.join(compiledDir, "lib/contentSchema/publishSerialization.js"));
const { validarEfeitoParaPublicacao } = require(path.join(compiledDir, "lib/contentSchema/effectLegacySerialization.js"));

// --- avaliador mínimo de JSON Schema (mesmo subconjunto do validador da Etapa 5) ---
function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}
function validar(schema, valor, caminho, erros, raiz) {
  if (schema.$ref) return validar(resolverRef(schema.$ref, raiz), valor, caminho, erros, raiz);
  if (schema.const !== undefined) {
    if (valor !== schema.const) erros.push(`${caminho}: esperado const ${JSON.stringify(schema.const)}`);
    return;
  }
  if (schema.enum && !schema.enum.includes(valor)) erros.push(`${caminho}: valor ${JSON.stringify(valor)} fora do enum`);
  if (schema.pattern && typeof valor === "string" && !new RegExp(schema.pattern).test(valor)) erros.push(`${caminho}: não bate com o padrão`);
  if (schema.type) {
    const tipos = Array.isArray(schema.type) ? schema.type : [schema.type];
    const t = typeOf(valor);
    const bate = tipos.some((esperado) => esperado === t || (esperado === "integer" && t === "number" && Number.isInteger(valor)));
    if (!bate) erros.push(`${caminho}: tipo ${t} não está em ${JSON.stringify(tipos)}`);
  }
  if (valor && typeof valor === "object" && !Array.isArray(valor) && (schema.type === "object" || schema.properties)) {
    for (const campo of schema.required ?? []) if (!(campo in valor)) erros.push(`${caminho}: campo obrigatório "${campo}" ausente`);
    if (schema.additionalProperties === false) {
      const permitidas = new Set(Object.keys(schema.properties ?? {}));
      for (const chave of Object.keys(valor)) if (!permitidas.has(chave)) erros.push(`${caminho}.${chave}: chave NÃO permitida`);
    }
    for (const [chave, sub] of Object.entries(schema.properties ?? {})) if (chave in valor) validar(sub, valor[chave], `${caminho}.${chave}`, erros, raiz);
  }
  if (schema.type === "array" && Array.isArray(valor)) {
    if (schema.minItems != null && valor.length < schema.minItems) erros.push(`${caminho}: mínimo ${schema.minItems} itens`);
    if (schema.items) valor.forEach((item, i) => validar(schema.items, item, `${caminho}[${i}]`, erros, raiz));
  }
  if (schema.allOf) {
    for (const sub of schema.allOf) {
      if (sub.if) {
        const errosIf = [];
        validar(sub.if, valor, caminho, errosIf, raiz);
        if (errosIf.length === 0 && sub.then) validar(sub.then, valor, caminho, erros, raiz);
      } else validar(sub, valor, caminho, erros, raiz);
    }
  }
  if (schema.anyOf) {
    const algumBate = schema.anyOf.some((sub) => {
      const e = [];
      validar(sub, valor, caminho, e, raiz);
      return e.length === 0;
    });
    if (!algumBate) erros.push(`${caminho}: nenhuma alternativa de anyOf satisfeita`);
  }
}
function resolverRef(ref, raiz) {
  let atual = raiz;
  for (const parte of ref.replace(/^#\//, "").split("/")) atual = atual[parte];
  return atual;
}

const schemaMagias = JSON.parse(readFileSync(path.join(REPO_ROOT, "content/schema_magias_v1_3.json"), "utf8"));
const schemaEquipamentos = JSON.parse(readFileSync(path.join(REPO_ROOT, "content/schema_equipamentos_v1_2.json"), "utf8"));
const itemSchemaMagia = schemaMagias.properties.magias.items;
const itemSchemaEquipamento = schemaEquipamentos.properties.itens.items;

let falhas = 0;
function checar(nome, condicao, detalhe) {
  console.log(`${condicao ? "OK " : "FALHA"} — ${nome}`);
  if (!condicao) {
    falhas++;
    if (detalhe) console.log(`  ✕ ${detalhe}`);
  }
}
function validarPayload(schema, payload, raiz) {
  const erros = [];
  validar(schema, payload, "$", erros, raiz ?? schema);
  return erros;
}

function efeitoBase(overrides) {
  return { id: "efeito-1", habilitado: true, ordem: 0, ...overrides };
}
function rawSpellBase(slug, efeitosOriginais = []) {
  return {
    id: slug, nome: "ZZ Teste Composto", slug, categoria: "magia", categoria_label: "Magia", vertente: "energetica", vertente_label: "Energética",
    descricao_curta: "d", descricao_longa: "d", tags: ["magia"], status: "published", versao: "1.0.0", created_at: "2026-01-01", updated_at: "2026-01-01",
    estatisticas: { nivel: 1, tipo_magia: "ataque", custo_pa: 1, resolucao: "resistencia" },
    payload_automacao: { efeitos: efeitosOriginais },
  };
}
function rawItemBase(slug, efeitosOriginais = []) {
  return {
    id: slug, nome: "ZZ Item Composto", slug, categoria: "farmacia", categoria_label: "Farmácia", raridade: "comum", raridade_label: "Comum",
    preco: 10, descricao_curta: "d", descricao_longa: "d", tags: ["cura"], status: "published", versao: "1.0.0", created_at: "2026-01-01", updated_at: "2026-01-01",
    estatisticas: {}, payload_automacao: { efeitos: efeitosOriginais },
  };
}
function draftSpell(efeitos, efeitosOriginais = [], origemLegado = undefined) {
  return {
    id: "draft-1", content_type: "spell", slug: "zz_teste_composto", version: 1,
    payload: {
      schemaVersion: "draft.v1", contentType: "spell",
      camposEditaveis: { contentType: "spell", campos: { nome: "ZZ Teste Composto", slug: "zz_teste_composto", categoria: "magia", tags: ["magia"], vertente: "energetica", requisitos: [], efeitos } },
      preservado: { rawOriginal: rawSpellBase("zz_teste_composto", efeitosOriginais), camposDesconhecidos: [] },
      ...(origemLegado ? { origemLegado } : {}),
    },
  };
}
function draftItem(efeitos) {
  return {
    id: "draft-2", content_type: "item", slug: "zz_item_composto", version: 1,
    payload: {
      schemaVersion: "draft.v1", contentType: "item",
      camposEditaveis: { contentType: "item", campos: { nome: "ZZ Item Composto", slug: "zz_item_composto", categoria: "farmacia", tags: ["cura"], propriedades: [], efeitos } },
      preservado: { rawOriginal: rawItemBase("zz_item_composto"), camposDesconhecidos: [] },
    },
  };
}

// ---------------------------------------------------------------------
// 1. Magia: teste/resistência completo — CD derivada de vertente, sucesso
//    (metade do dano) + falha (dano completo + Atordoado).
// ---------------------------------------------------------------------
const arvoreSpell = efeitoBase({
  tipo: "teste_resistencia",
  gatilho: "ao_acertar",
  campos: {
    modo: "resistencia", pericia: "vigor", cd: { tipo: "derivada", origem: "vertente" }, confirmacaoManual: true,
    resultados: [
      { id: "r-sucesso", ordem: 0, faixa: "sucesso_padrao", efeitos: [efeitoBase({ id: "f-dano-s", tipo: "dano", campos: { tipoFormula: "dados", quantidadeDados: 3, faces: 6, tipoDano: "energetico", subtipoDano: "igneo", danoPrincipalOuAdicional: "principal", ignoraMit: false, ignoraPd: false, metadeEmSucesso: false } })] },
      { id: "r-falha", ordem: 1, faixa: "falha", efeitos: [
        efeitoBase({ id: "f-dano-f", tipo: "dano", campos: { tipoFormula: "dados", quantidadeDados: 3, faces: 6, tipoDano: "energetico", subtipoDano: "igneo", danoPrincipalOuAdicional: "principal", ignoraMit: false, ignoraPd: false, metadeEmSucesso: false } }),
        efeitoBase({ id: "f-cond-f", tipo: "aplicar_condicao", campos: { condicaoSlug: "atordoado", acumulavel: false, autoria: "sem_autoria", confirmacaoManual: false } }),
      ] },
    ],
  },
});
const draft1 = draftSpell([arvoreSpell]);
const corpo1 = serializarRascunhoParaPublicacao(draft1);
const efeitos1 = corpo1.payload_automacao.efeitos;
checar("1. Magia: árvore serializa para efeito_com_resistencia + siblings", efeitos1[0]?.tipo === "efeito_com_resistencia" && efeitos1.some((e) => e.tipo === "dano" && e.sucesso === "metade") && efeitos1.some((e) => e.tipo === "aplicar_condicao"));
checar("2. Magia: CD derivada usa '6 + nivel_vertente' (nunca '5 +')", efeitos1[0]?.resistencia?.cd_formula === "6 + nivel_vertente");
checar("3. Magia: payload publicado válido contra schema_magias_v1_3", validarPayload(itemSchemaMagia, corpo1, schemaMagias).length === 0, JSON.stringify(validarPayload(itemSchemaMagia, corpo1, schemaMagias)));
checar("4. Magia: nenhuma chave _editor no payload", !JSON.stringify(corpo1).includes("_editor"));

// ---------------------------------------------------------------------
// 5. Efeito legado preservado (spell): rascunho de CONVERSÃO DE LEGADO
//    (origemLegado presente, Etapa 6) constrói uma árvore NOVA do zero
//    ao lado de um efeito_com_resistencia legado nunca auto-convertido —
//    os dois devem coexistir (o antigo intacto/somente leitura, o novo
//    editável), nunca um apagar o outro. Só se aplica quando o rascunho
//    É de conversão de legado — ver caso 15 para o contraste (reedição
//    de conteúdo já publicado pelo Editor, onde a regra é a oposta).
// ---------------------------------------------------------------------
const efeitoLegadoAntigo = { tipo: "efeito_com_resistencia", resistencia: { cd_formula: "5 + nivel_vertente", acoes: ["esquivar"] } };
const origemLegadoStub = {
  adapterId: "spell", adapterVersion: "spell.legacy.v1", classificacaoLegado: "conversao_com_confirmacao",
  decisoesConfirmadas: {}, camposSomenteLeitura: [], camposDesconhecidos: [], efeitosPreservados: [], avisos: [],
  convertidoEm: "2026-01-01T00:00:00.000Z", convertidoPor: "zz_e2e_test",
};
const draft1b = draftSpell([arvoreSpell], [efeitoLegadoAntigo], origemLegadoStub);
const corpo1b = serializarRascunhoParaPublicacao(draft1b);
checar("5. Legado (origemLegado presente): efeito_com_resistencia antigo nunca auto-convertido convive intacto ao lado da árvore nova", corpo1b.payload_automacao.efeitos.some((e) => e.tipo === "efeito_com_resistencia" && e.resistencia?.cd_formula === "5 + nivel_vertente"));

// ---------------------------------------------------------------------
// 6. Bloqueio: CD legada '5 + nivel_vertente' nunca é produzida pela
//    serialização de uma árvore NOVA (só existe se vier de conteúdo
//    legado preservado, nunca escrita pelo Construtor).
// ---------------------------------------------------------------------
checar("6. Bloqueio: serialização de árvore nova nunca escreve '5 + nivel_vertente'", !JSON.stringify(corpo1).includes("5 + nivel_vertente"));

// ---------------------------------------------------------------------
// 7. Bloqueio: árvore com 3 resultados (excede o limite serializável para magia).
// ---------------------------------------------------------------------
const arvoreExcedente = { ...arvoreSpell, campos: { ...arvoreSpell.campos, resultados: [...arvoreSpell.campos.resultados, { id: "r-critico", ordem: 2, faixa: "sucesso_critico", efeitos: [] }] } };
const errosExcedente = validarEfeitoParaPublicacao("spell", arvoreExcedente);
checar("7. Bloqueio: árvore com mais resultados que o formato legado suporta é rejeitada", errosExcedente.length > 0);

// ---------------------------------------------------------------------
// 8. Bloqueio: modificar_margem numa magia (sem representação segura).
// ---------------------------------------------------------------------
const margemSpell = efeitoBase({ tipo: "modificar_margem", gatilho: "manualmente", campos: { operacao: "promover", faixaOrigem: "falha_limitada", faixaDestino: "sucesso_limitado", contexto: "teste", pericias: ["luta"], tags: [], confirmacaoManual: true } });
checar("8. Bloqueio: modificar_margem em magia é rejeitado", validarEfeitoParaPublicacao("spell", margemSpell).length > 0);

// ---------------------------------------------------------------------
// 9. Talento: modificar_margem serializa exatamente no formato real que
//    getMarginPromotions já lê (tipo "promocao_margem", família "margem").
// ---------------------------------------------------------------------
const margemTalento = efeitoBase({ tipo: "modificar_margem", gatilho: "manualmente", campos: { operacao: "promover", faixaOrigem: "falha_limitada", faixaDestino: "sucesso_limitado", contexto: "ataque", pericias: ["balistica"], tags: [], contextoTexto: "ataque com pistola", confirmacaoManual: true } });
const draftTalento = {
  id: "draft-3", content_type: "talent", slug: "zz_talento_composto", version: 1,
  payload: {
    schemaVersion: "draft.v1", contentType: "talent",
    camposEditaveis: { contentType: "talent", campos: { nome: "ZZ", slug: "zz_talento_composto", tags: [], niveis: [
      { nivel: 1, nomeNivel: "N1", requisitos: [], efeitos: [margemTalento] },
      { nivel: 2, nomeNivel: "N2", requisitos: [], efeitos: [] },
      { nivel: 3, nomeNivel: "N3", requisitos: [], efeitos: [] },
    ] } },
    preservado: { rawOriginal: { id: "zz_talento_composto", slug: "zz_talento_composto", nome: "ZZ", tags: [], descricao_curta: "d", descricao_longa: "d", status: "published", versao: "1.0.0", created_at: "2026-01-01", updated_at: "2026-01-01", niveis: [1, 2, 3].map((n) => ({ id: `zz_n${n}`, slug: `zz_n${n}`, talento_id: "zz_talento_composto", nivel: n, nome: `N${n}`, requisitos: [], tags: [], descricao_curta: "d", descricao_longa: "d", status: "published", versao: "1.0.0", created_at: "2026-01-01", updated_at: "2026-01-01", payload_automacao: { efeitos: n === 1 ? [] : [{ tipo: "regra_especial_de_teste", familia: "regra_especial" }] } })) }, camposDesconhecidos: [] },
  },
};
const corpoTalento = serializarRascunhoParaPublicacao(draftTalento);
const efeitoMargemSerializado = corpoTalento.niveis[0].payload_automacao.efeitos.find((e) => e.tipo === "promocao_margem");
checar(
  "9. Talento: modificar_margem serializa como promocao_margem/família margem no formato real de getMarginPromotions",
  efeitoMargemSerializado?.familia === "margem" && Array.isArray(efeitoMargemSerializado?.pericias) && efeitoMargemSerializado.pericias.includes("balistica") && efeitoMargemSerializado.de === "falha_limitada" && efeitoMargemSerializado.para === "sucesso_limitado",
);

// ---------------------------------------------------------------------
// 10. Item: alterar_dano_recebido serializa via bucket "utilitario" (schema-legal, additionalProperties:true).
// ---------------------------------------------------------------------
const danoRecebidoItem = efeitoBase({ tipo: "alterar_dano_recebido", gatilho: "ao_sofrer_dano", campos: { operacao: "reduzir", valorFixo: 2, momento: "antes_mit", confirmacaoManual: true } });
const draft2 = draftItem([danoRecebidoItem]);
const corpo2 = serializarRascunhoParaPublicacao(draft2);
const efeitoDanoRecebido = corpo2.payload_automacao.efeitos.find((e) => e.operacao === "reduzir");
checar("10. Item: alterar_dano_recebido serializa (tipo utilitario, campos preservados)", efeitoDanoRecebido?.tipo === "utilitario" && efeitoDanoRecebido.valor_fixo === 2 && efeitoDanoRecebido.momento === "antes_mit");
checar("11. Item: payload publicado válido contra schema_equipamentos_v1_2", validarPayload(itemSchemaEquipamento, corpo2).length === 0, JSON.stringify(validarPayload(itemSchemaEquipamento, corpo2)));

// ---------------------------------------------------------------------
// 12. Bloqueio: alterar_dano_recebido numa magia (schema fechado, sem bucket genérico).
// ---------------------------------------------------------------------
const danoRecebidoSpell = efeitoBase({ tipo: "alterar_dano_recebido", gatilho: "ao_sofrer_dano", campos: { operacao: "anular", momento: "antes_mit", confirmacaoManual: true } });
checar("12. Bloqueio: alterar_dano_recebido em magia é rejeitado", validarEfeitoParaPublicacao("spell", danoRecebidoSpell).length > 0);

// ---------------------------------------------------------------------
// 13. Bloqueio: teste_resistencia em talento (sem schema seguro para a árvore).
// ---------------------------------------------------------------------
checar("13. Bloqueio: teste_resistencia em talento é rejeitado", validarEfeitoParaPublicacao("talent", arvoreSpell).length > 0);

// ---------------------------------------------------------------------
// 14. Bloqueio: CD derivada numa árvore de ITEM (exige valor literal).
// ---------------------------------------------------------------------
const arvoreItemDerivada = { ...arvoreSpell, campos: { ...arvoreSpell.campos, cd: { tipo: "derivada", origem: "vertente" } } };
checar("14. Bloqueio: CD derivada em item é rejeitada (exige valor literal)", validarEfeitoParaPublicacao("item", arvoreItemDerivada).length > 0);

// ---------------------------------------------------------------------
// 15. REGRESSÃO (achado ao vivo na rodada de aceite das Etapas 6/7):
//     reeditar um `teste_resistencia` já publicado pelo PRÓPRIO Editor
//     (origemLegado AUSENTE — draft normal, recuperado de
//     content_editor_metadata; rawOriginal JÁ contém o
//     `efeito_com_resistencia`+siblings da publicação anterior) não pode
//     DUPLICAR essas entradas — a serialização deve SUBSTITUIR, nunca
//     acumular a cada republicação. Contraste direto com o caso 5 acima
//     (origemLegado PRESENTE → coexistência é o comportamento certo).
//     `ehEfeitoMvpLegado` (publishSerialization.ts) checava só os 6 tipos
//     originais do MVP em QUALQUER caso (mesma classe de bug do
//     e584abb, em outro arquivo) — um `teste_resistencia`/
//     `modificar_margem`/`alterar_dano_recebido` reeditado nunca
//     substituía sua própria entrada legada, duplicando a cada ciclo de
//     edição→publicação. Reproduzido ao vivo: republicar 3x seguidas
//     acumulava 1→2→3 cópias de `efeito_com_resistencia` no payload real.
// ---------------------------------------------------------------------
const efeitosJaPublicadosAntes = [
  { tipo: "efeito_com_resistencia", resistencia: { pericias: ["vigor"], cd_formula: "6 + nivel_vertente" } },
  { dado: "3d6", tipo: "dano", tipo_dano: "energetico", subtipo_dano: "igneo", sucesso: "metade" },
  { tipo: "dano", dado: "3d6", tipo_dano: "energetico", subtipo_dano: "igneo" },
  { tipo: "aplicar_condicao", condicao: "atordoado" },
];
const draftReedicao = draftSpell([arvoreSpell], efeitosJaPublicadosAntes);
const corpoReedicao = serializarRascunhoParaPublicacao(draftReedicao);
const efeitosReedicao = corpoReedicao.payload_automacao.efeitos;
const qtdResistenciaReedicao = efeitosReedicao.filter((e) => e.tipo === "efeito_com_resistencia").length;
checar(
  "15. Reedição: republicar uma árvore teste_resistencia recuperada de metadata NÃO duplica efeito_com_resistencia (rawOriginal já continha a publicação anterior)",
  qtdResistenciaReedicao === 1,
  `esperado 1 efeito_com_resistencia, encontrado ${qtdResistenciaReedicao}: ${JSON.stringify(efeitosReedicao)}`,
);

console.log(`\n${falhas === 0 ? "=== TODOS OS CASOS PASSARAM ===" : `=== ${falhas} FALHA(S) ===`}`);
process.exit(falhas === 0 ? 0 : 1);
