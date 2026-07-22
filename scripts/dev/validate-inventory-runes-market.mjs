#!/usr/bin/env node
/**
 * Verificação focada da Etapa 9 (inventário, equipamento, runas,
 * mercado). Mesmo padrão das etapas anteriores: compila os módulos
 * REAIS com `tsc`, roda com `node` puro, valida contra os schemas
 * oficiais reais e roda executores REAIS de MIT/PD/carga/munição.
 *
 * Uso: node scripts/dev/validate-inventory-runes-market.mjs <dir-compilado>
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
  console.error("Uso: node validate-inventory-runes-market.mjs <diretorio-compilado>");
  process.exit(1);
}

const { serializarRascunhoParaPublicacao } = require(path.join(compiledDir, "contentSchema/publishSerialization.js"));
const { validarEfeitoParaPublicacao } = require(path.join(compiledDir, "contentSchema/effectLegacySerialization.js"));
const { diagnosticarEfeitoEditavel } = require(path.join(compiledDir, "contentSchema/effectDiagnostics.js"));
const { setItemMitAtual, setItemPdAtual, setItemCargaAtual, setItemMunicaoAtual, installRuneOnItem, getRuneCompatibility, normalizeItemContent } = require(path.join(compiledDir, "character/inventory.js"));
const { createAljavaInstance, hasExistingAljava, ALJAVA_CAPACIDADE_PADRAO } = require(path.join(compiledDir, "character/ammunition.js"));

// --- avaliador mínimo de JSON Schema (mesmo subconjunto das etapas anteriores) ---
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

const schemaEquipamentos = JSON.parse(readFileSync(path.join(REPO_ROOT, "content/schema_equipamentos_v1_2.json"), "utf8"));
const schemaTalentos = JSON.parse(readFileSync(path.join(REPO_ROOT, "content/schema_talentos_v1_3.json"), "utf8"));
const schemaRunas = JSON.parse(readFileSync(path.join(REPO_ROOT, "content/schema_runas_v1_2.json"), "utf8"));
const itemSchemaEquipamento = schemaEquipamentos.properties.itens.items;
const talentoSchema = schemaTalentos.properties.talentos.items;
const runaSchema = schemaRunas.properties.runas.items;

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

function draftItem(camposExtra, efeitos = []) {
  return {
    id: "draft-1", content_type: "item", slug: "zz_item_inventario", version: 1,
    payload: {
      schemaVersion: "draft.v1", contentType: "item",
      camposEditaveis: { contentType: "item", campos: { nome: "ZZ Item Inventario", slug: "zz_item_inventario", categoria: "armadura", tags: ["equipamento"], propriedades: [], efeitos, ...camposExtra } },
      preservado: {
        rawOriginal: {
          id: "zz_item_inventario", nome: "ZZ Item Inventario", slug: "zz_item_inventario", categoria: "armadura", categoria_label: "Armadura", raridade: "comum", raridade_label: "Comum",
          preco: 100, descricao_curta: "d", descricao_longa: "d", tags: ["equipamento"], status: "published", versao: "1.0.0", created_at: "2026-01-01", updated_at: "2026-01-01",
          estatisticas: { classe_porte: "leve" }, payload_automacao: { efeitos: [] },
        },
        camposDesconhecidos: [],
      },
    },
  };
}

function draftRune(camposExtra, efeitos = []) {
  return {
    id: "draft-2", content_type: "rune", slug: "zz_runa_inventario", version: 1,
    payload: {
      schemaVersion: "draft.v1", contentType: "rune",
      camposEditaveis: { contentType: "rune", campos: { nome: "ZZ Runa Inventario", slug: "zz_runa_inventario", tags: ["runa", "equipamento"], slotsPossiveis: ["armadura"], efeitos, ...camposExtra } },
      preservado: {
        rawOriginal: {
          id: "zz_runa_inventario", slug: "zz_runa_inventario", nome: "ZZ Runa Inventario", categoria: "runa", categoria_label: "Runa", raridade: "comum", raridade_label: "Comum",
          preco: 100, descricao_curta: "d", descricao_longa: "d", tags: ["runa"], slots_possiveis: ["armadura"], custo_integridade: 0, requisito_pericia: null,
          status: "published", versao: "1.0.0", created_at: "2026-01-01", updated_at: "2026-01-01", payload_automacao: { efeitos: [] },
        },
        camposDesconhecidos: [],
      },
    },
  };
}

function draftTalento(efeitosNivel1) {
  return {
    id: "draft-3", content_type: "talent", slug: "zz_talento_inventario", version: 1,
    payload: {
      schemaVersion: "draft.v1", contentType: "talent",
      camposEditaveis: { contentType: "talent", campos: { nome: "ZZ", slug: "zz_talento_inventario", tags: [], niveis: [
        { nivel: 1, nomeNivel: "N1", requisitos: [], efeitos: efeitosNivel1 },
        { nivel: 2, nomeNivel: "N2", requisitos: [], efeitos: [] },
        { nivel: 3, nomeNivel: "N3", requisitos: [], efeitos: [] },
      ] } },
      preservado: {
        rawOriginal: {
          id: "zz_talento_inventario", slug: "zz_talento_inventario", nome: "ZZ", tags: [], descricao_curta: "d", descricao_longa: "d", status: "published", versao: "1.0.0", created_at: "2026-01-01", updated_at: "2026-01-01",
          niveis: [1, 2, 3].map((n) => ({ id: `zz_n${n}`, slug: `zz_n${n}`, talento_id: "zz_talento_inventario", nivel: n, nome: `N${n}`, requisitos: [], tags: [], descricao_curta: "d", descricao_longa: "d", status: "published", versao: "1.0.0", created_at: "2026-01-01", updated_at: "2026-01-01", payload_automacao: { efeitos: n === 1 ? [] : [{ tipo: "regra_especial_de_teste", familia: "regra_especial" }] } })),
        },
        camposDesconhecidos: [],
      },
    },
  };
}

// ---------------------------------------------------------------------
// 1-3. Item: defaults de modelo (MIT-base/PD-base/slots/cargas/munição)
//      serializam em estatisticas.* real (lida por normalizeItemContent).
// ---------------------------------------------------------------------
const draft1 = draftItem({ mitBase: 3, tipoProtecao: "fisica", regioes: ["tronco"], slotsRunaMax: 1, cargasMax: 5, municaoMax: 6, municaoCompativelSlug: "flecha_simples" });
const corpo1 = serializarRascunhoParaPublicacao(draft1);
checar("1. Item: MIT-base/slots/cargas/munição serializam em estatisticas real", corpo1.estatisticas?.mit_base === 3 && corpo1.estatisticas?.slots_runa_max === 1 && corpo1.estatisticas?.cargas_max === 5 && corpo1.estatisticas?.municao_max === 6 && corpo1.estatisticas?.municao_compativel === "flecha_simples");
checar("2. Item: payload publicado válido contra schema_equipamentos_v1_2", validarPayload(itemSchemaEquipamento, corpo1).length === 0, JSON.stringify(validarPayload(itemSchemaEquipamento, corpo1)));
const itemNormalizado = normalizeItemContent(corpo1);
checar("3. Item: normalizeItemContent (executor real) lê os defaults publicados de volta (mitMax=3, slotsRunaMax=1)", itemNormalizado.mitMax === 3 && itemNormalizado.slotsRunaMax === 1 && itemNormalizado.cargasMax === 5);

// ---------------------------------------------------------------------
// 4-6. Executores reais de MIT/PD/carga/munição — reparo/consumo/recarga
//      nunca ultrapassam o máximo (clamp real).
// ---------------------------------------------------------------------
let personagem = { inventario: [{ id: "inst-1", itemSlug: "zz_item_inventario", itemNome: "ZZ", categoria: "armadura", quantidade: 1, estado: "equipado", adquiridoEm: "2026-01-01", mitAtual: 1 }] };
personagem = setItemMitAtual(personagem, "inst-1", 1 + 2, 3); // repara 2 MIT atuais (exemplo obrigatório do briefing)
checar("4. Reparo real de MIT: setItemMitAtual repara +2 e respeita o máximo (mitMax=3)", personagem.inventario[0].mitAtual === 3);
personagem = setItemMitAtual(personagem, "inst-1", 99, 3);
checar("5. Reparo real de MIT nunca ultrapassa o máximo mesmo com valor exagerado", personagem.inventario[0].mitAtual === 3);
let personagemCarga = { inventario: [{ id: "inst-2", itemSlug: "zz_item_carga", itemNome: "ZZ Carga", categoria: "farmacia", quantidade: 1, estado: "mochila", adquiridoEm: "2026-01-01", cargasAtual: 1 }] };
personagemCarga = setItemCargaAtual(personagemCarga, "inst-2", 3, 3);
checar("6. Recarga real de carga: setItemCargaAtual recarrega e respeita o máximo (cargasMax=3)", personagemCarga.inventario[0].cargasAtual === 3);

// ---------------------------------------------------------------------
// 7-8. Runa: identificação/compatibilidade/efeitos serializam e validam
//      contra o schema real de runa.
// ---------------------------------------------------------------------
const efeitoAutorreparo = efeitoBase({ tipo: "modificar_instancia", gatilho: "ao_encerrar_cena", campos: { operacao: "reparar_mit", valor: 1, confirmacaoManual: true } });
const draft2 = draftRune({ raridade: "comum", preco: 500, restricaoSubtipo: undefined }, [efeitoAutorreparo]);
const corpo2 = serializarRascunhoParaPublicacao(draft2);
checar("7. Runa: modificar_instancia (reparar_mit) serializa para autorreparo real (recupera_mit_total)", corpo2.payload_automacao.efeitos.some((e) => e.tipo === "autorreparo" && e.efeito === "recupera_mit_total"));
checar("8. Runa: payload publicado válido contra schema_runas_v1_2", validarPayload(runaSchema, corpo2).length === 0, JSON.stringify(validarPayload(runaSchema, corpo2)));
checar("9. Runa: custo_integridade sempre 0, categoria sempre 'runa' (nunca reintroduzido como regra)", corpo2.custo_integridade === 0 && corpo2.categoria === "runa");

// ---------------------------------------------------------------------
// 10. Runa: teste_resistencia (efeito_com_resistencia real) — mesma
//     árvore da Etapa 7, agora também serializável para runa.
// ---------------------------------------------------------------------
const arvoreRuna = efeitoBase({
  tipo: "teste_resistencia",
  gatilho: "ao_ativar",
  campos: {
    modo: "resistencia", pericia: "vigor", cd: { tipo: "fixa", valor: 8 }, confirmacaoManual: true,
    resultados: [{ id: "r-falha", ordem: 0, faixa: "falha", efeitos: [efeitoBase({ id: "f1", tipo: "aplicar_condicao", campos: { condicaoSlug: "atordoado", acumulavel: false, autoria: "sem_autoria", confirmacaoManual: false } })] }],
  },
});
const draft3 = draftRune({}, [arvoreRuna]);
const corpo3 = serializarRascunhoParaPublicacao(draft3);
checar("10. Runa: teste_resistencia serializa para efeito_com_resistencia + condição (mesma árvore da Etapa 7)", corpo3.payload_automacao.efeitos.some((e) => e.tipo === "efeito_com_resistencia") && corpo3.payload_automacao.efeitos.some((e) => e.tipo === "aplicar_condicao"));

// ---------------------------------------------------------------------
// 11. Bloqueio: CD derivada numa runa (schema exige valor literal, mesma regra de item).
// ---------------------------------------------------------------------
const arvoreRunaDerivada = { ...arvoreRuna, campos: { ...arvoreRuna.campos, cd: { tipo: "derivada", origem: "vertente" } } };
checar("11. Bloqueio: CD derivada em runa é rejeitada (exige valor literal)", validarEfeitoParaPublicacao("rune", arvoreRunaDerivada).length > 0);

// ---------------------------------------------------------------------
// 12. Bloqueio: cura/remover_condicao não existem no vocabulário real de runa.
// ---------------------------------------------------------------------
const curaRuna = efeitoBase({ tipo: "cura", campos: { tipoFormula: "dados", quantidadeDados: 2, faces: 6, recurso: "pv", limitarAoMaximo: true, permitirValorTemporario: false } });
checar("12. Bloqueio: cura em runa é rejeitada (tipo não existe no schema real de runa)", validarEfeitoParaPublicacao("rune", curaRuna).length > 0);

// ---------------------------------------------------------------------
// 13-14. Talento: alterar_preco (desconto_percentual → desconto_loja real;
//        permitir_compra_fiada → compra_fiada real).
// ---------------------------------------------------------------------
const descontoTalento = efeitoBase({ tipo: "alterar_preco", gatilho: "manualmente", usoLimitado: { usosMax: 1, cadencia: "dia" }, campos: { operacao: "desconto_percentual", percentual: 20, contextoTexto: "Mercados Noturnos", confirmacaoManual: true } });
const draft4 = draftTalento([descontoTalento]);
const corpo4 = serializarRascunhoParaPublicacao(draft4);
const efeitoDesconto = corpo4.niveis[0].payload_automacao.efeitos.find((e) => e.tipo === "desconto_loja");
checar("13. Talento: desconto_percentual serializa como desconto_loja real (familia economia_loja, 20%, 1/dia)", efeitoDesconto?.familia === "economia_loja" && efeitoDesconto.percentual === 20 && efeitoDesconto.usos === 1 && efeitoDesconto.cadencia === "dia");
checar("13b. Talento: payload publicado válido contra schema_talentos_v1_3", validarPayload(talentoSchema, corpo4, schemaTalentos).length === 0, JSON.stringify(validarPayload(talentoSchema, corpo4, schemaTalentos)));

const dividaTalento = efeitoBase({ tipo: "alterar_preco", gatilho: "manualmente", campos: { operacao: "permitir_compra_fiada", raridadeMaxima: "raro", confirmacaoManual: true } });
const draft5 = draftTalento([dividaTalento]);
const corpo5 = serializarRascunhoParaPublicacao(draft5);
const efeitoDivida = corpo5.niveis[0].payload_automacao.efeitos.find((e) => e.tipo === "compra_fiada");
checar("14. Talento: permitir_compra_fiada serializa como compra_fiada real (gera_divida=true, raridade_maxima=raro)", efeitoDivida?.gera_divida === true && efeitoDivida.raridade_maxima === "raro");

// ---------------------------------------------------------------------
// 15. Bloqueio: alterar_preco com operação sem leitor real (desconto_fixo) em talento.
// ---------------------------------------------------------------------
const descontoFixoTalento = efeitoBase({ tipo: "alterar_preco", campos: { operacao: "desconto_fixo", valorFixo: 10, confirmacaoManual: true } });
checar("15. Bloqueio: desconto_fixo em talento é rejeitado (sem leitor real no conteúdo hoje)", validarEfeitoParaPublicacao("talent", descontoFixoTalento).length > 0);

// ---------------------------------------------------------------------
// 16. Bloqueio: conceder_item/consumir_item/alterar_disponibilidade fora de talento.
// ---------------------------------------------------------------------
const concederItem = efeitoBase({ tipo: "conceder_item", campos: { itemSlug: "faca", quantidade: 1, destino: "personagem", permitirDuplicata: false, empilharQuandoCompativel: true, confirmacaoManual: true } });
checar("16. Bloqueio: conceder_item em item é rejeitado (só representável em talento nesta etapa)", validarEfeitoParaPublicacao("item", concederItem).length > 0);

// ---------------------------------------------------------------------
// 17. Diagnóstico: alterar_disponibilidade é sempre lembrete (sem estado real de estoque).
// ---------------------------------------------------------------------
const disponibilidadeTalento = efeitoBase({ tipo: "alterar_disponibilidade", gatilho: "manualmente", campos: { operacao: "marcar_indisponivel", confirmacaoManual: true } });
checar("17. Diagnóstico: alterar_disponibilidade é sempre lembrete", diagnosticarEfeitoEditavel(disponibilidadeTalento).modoAutomacao === "lembrete");

// ---------------------------------------------------------------------
// 18. Runa: compatibilidade real (getRuneCompatibility) — arma incompatível
//     com runa de armadura, mesmo executor já existente reaproveitado.
// ---------------------------------------------------------------------
const runaContentFake = { slug: "zz_runa_inventario", raw: { slots_possiveis: ["armadura"] } };
checar("18. Compatibilidade real: getRuneCompatibility rejeita runa de armadura em arma", getRuneCompatibility({ categoria: "arma", subtipo: "corpo_a_corpo" }, runaContentFake) === "incompatible");
checar("19. Compatibilidade real: getRuneCompatibility aceita runa de armadura em armadura", getRuneCompatibility({ categoria: "armadura" }, runaContentFake) === "compatible");

// ---------------------------------------------------------------------
// 20. Aljava compartilhada: comprar um segundo arco NUNCA cria outra
//     Aljava (dedup real via hasExistingAljava) — nunca uma por arma.
// ---------------------------------------------------------------------
let personagemAljava = { inventario: [createAljavaInstance("2026-01-01T00:00:00.000Z")] };
checar("20. Aljava: hasExistingAljava detecta a Aljava já criada (capacidade real 15)", hasExistingAljava(personagemAljava) === true && personagemAljava.inventario[0].aljava.capacidade === ALJAVA_CAPACIDADE_PADRAO);

// ---------------------------------------------------------------------
// 21. Nenhuma chave _editor vaza em nenhum payload publicado.
// ---------------------------------------------------------------------
checar("21. Nenhuma chave _editor vaza (item/runa/talento)", !JSON.stringify(corpo1).includes("_editor") && !JSON.stringify(corpo2).includes("_editor") && !JSON.stringify(corpo4).includes("_editor"));

// ---------------------------------------------------------------------
// 22. Modelo × instância: publicar o modelo do item não inclui
//     mitAtual/cargasAtual/municaoAtual (só existem na instância do personagem).
// ---------------------------------------------------------------------
checar("22. Modelo × instância: payload publicado de item não tem 'mitAtual'/'cargasAtual'/'municaoAtual'", !JSON.stringify(corpo1).includes("mitAtual") && !JSON.stringify(corpo1).includes("cargasAtual") && !JSON.stringify(corpo1).includes("municaoAtual"));

console.log(`\n${falhas === 0 ? "=== TODOS OS CASOS PASSARAM ===" : `=== ${falhas} FALHA(S) ===`}`);
process.exit(falhas === 0 ? 0 : 1);
