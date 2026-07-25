#!/usr/bin/env node
/**
 * Verificação focada da Etapa 10 (companheiro/drone/robô/Trama). Mesmo
 * padrão das etapas anteriores: compila os módulos REAIS com `tsc`, roda
 * com `node` puro, valida contra o schema oficial de talento real.
 *
 * Uso: node scripts/dev/validate-companions-trama.mjs <dir-compilado>
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
  console.error("Uso: node validate-companions-trama.mjs <diretorio-compilado>");
  process.exit(1);
}

const { serializarRascunhoParaPublicacao } = require(path.join(compiledDir, "contentSchema/publishSerialization.js"));
const { validarEfeitoParaPublicacao } = require(path.join(compiledDir, "contentSchema/effectLegacySerialization.js"));
const { diagnosticarEfeitoEditavel } = require(path.join(compiledDir, "contentSchema/effectDiagnostics.js"));

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

const schemaTalentos = JSON.parse(readFileSync(path.join(REPO_ROOT, "content/schema_talentos_v1_3.json"), "utf8"));
const talentoSchema = schemaTalentos.properties.talentos.items;

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

function draftTalento(efeitosNivel1, efeitosOriginaisNivel1 = []) {
  return {
    id: "draft-1", content_type: "talent", slug: "zz_talento_companheiro", version: 1,
    payload: {
      schemaVersion: "draft.v1", contentType: "talent",
      camposEditaveis: { contentType: "talent", campos: { nome: "ZZ", slug: "zz_talento_companheiro", tags: [], niveis: [
        { nivel: 1, nomeNivel: "N1", requisitos: [], efeitos: efeitosNivel1 },
        { nivel: 2, nomeNivel: "N2", requisitos: [], efeitos: [] },
        { nivel: 3, nomeNivel: "N3", requisitos: [], efeitos: [] },
      ] } },
      preservado: {
        rawOriginal: {
          id: "zz_talento_companheiro", slug: "zz_talento_companheiro", nome: "ZZ", tags: [], descricao_curta: "d", descricao_longa: "d", status: "published", versao: "1.0.0", created_at: "2026-01-01", updated_at: "2026-01-01",
          niveis: [1, 2, 3].map((n) => ({ id: `zz_n${n}`, slug: `zz_n${n}`, talento_id: "zz_talento_companheiro", nivel: n, nome: `N${n}`, requisitos: [], tags: [], descricao_curta: "d", descricao_longa: "d", status: "published", versao: "1.0.0", created_at: "2026-01-01", updated_at: "2026-01-01", payload_automacao: { efeitos: n === 1 ? efeitosOriginaisNivel1 : [{ tipo: "regra_especial_de_teste", familia: "regra_especial" }] } })),
        },
        camposDesconhecidos: [],
      },
    },
  };
}

// ---------------------------------------------------------------------
// 1-2. Companheiro: conceder drone com 1 PA inicial, serializa em
//      familia:"companheiro" real (enum já reconhecido por
//      legacyConversion.ts::FAMILIAS_INCOMPATIVEIS para conteúdo legado).
// ---------------------------------------------------------------------
const concederCompanheiro = efeitoBase({ tipo: "companheiro", gatilho: "manualmente", campos: { tipo: "drone", destino: "personagem", quantidade: 1, paInicial: 1, persistente: true, confirmacaoManual: true } });
const draft1 = draftTalento([concederCompanheiro]);
const corpo1 = serializarRascunhoParaPublicacao(draft1);
const efeitoPublicado1 = corpo1.niveis[0].payload_automacao.efeitos.find((e) => e.familia === "companheiro");
checar("1. Talento: companheiro serializa com familia real 'companheiro' (enum já reconhecido pelo sistema)", efeitoPublicado1?.familia === "companheiro" && efeitoPublicado1.contexto === "drone" && efeitoPublicado1.pa_bonus === 1);
checar("2. Talento: payload publicado válido contra schema_talentos_v1_3", validarPayload(talentoSchema, corpo1, schemaTalentos).length === 0, JSON.stringify(validarPayload(talentoSchema, corpo1, schemaTalentos)));

// ---------------------------------------------------------------------
// 3. Diagnóstico: companheiro é sempre lembrete (nenhum executor real).
// ---------------------------------------------------------------------
checar("3. Diagnóstico: companheiro é sempre lembrete (Droneiro/Mecatrônico/Tecelão continuam bespoke)", diagnosticarEfeitoEditavel(concederCompanheiro).modoAutomacao === "lembrete");

// ---------------------------------------------------------------------
// 4-5. Bloqueio: companheiro/acao_trama fora de talento (spell/item/rune).
// ---------------------------------------------------------------------
checar("4. Bloqueio: companheiro em item é rejeitado (só representável em talento nesta etapa)", validarEfeitoParaPublicacao("item", concederCompanheiro).length > 0);
const acaoTramaAvancar = efeitoBase({ tipo: "acao_trama", gatilho: "manualmente", campos: { acao: "avancar", alcanceAvancarEspacos: 15, confirmacaoManual: true } });
checar("5. Bloqueio: acao_trama em runa é rejeitado (sem familia trama no schema de runa)", validarEfeitoParaPublicacao("rune", acaoTramaAvancar).length > 0);

// ---------------------------------------------------------------------
// 6-7. Ação de Trama "Avançar" — mesmo campo real (distancia_espacos)
//      já usado pelo Bypass do Tecelão (auditoria: alterar_protocolo,
//      protocolo:"avancar", distancia_espacos:15).
// ---------------------------------------------------------------------
const draft2 = draftTalento([acaoTramaAvancar]);
const corpo2 = serializarRascunhoParaPublicacao(draft2);
const efeitoTramaPublicado = corpo2.niveis[0].payload_automacao.efeitos.find((e) => e.familia === "trama");
checar("6. Talento: acao_trama serializa com familia real 'trama' e distancia_espacos (mesmo campo do Bypass real)", efeitoTramaPublicado?.familia === "trama" && efeitoTramaPublicado.distancia_espacos === 15);
checar("7. Talento: payload de acao_trama válido contra schema_talentos_v1_3", validarPayload(talentoSchema, corpo2, schemaTalentos).length === 0, JSON.stringify(validarPayload(talentoSchema, corpo2, schemaTalentos)));

// ---------------------------------------------------------------------
// 8. RAM reaproveita alterar_recurso (recurso "ram") sem nenhum tipo novo
//    — já suportado desde antes desta etapa (RECURSOS_ALTERAR).
// ---------------------------------------------------------------------
const ramEfeito = efeitoBase({ tipo: "alterar_recurso", gatilho: "manualmente", campos: { recurso: "ram", operacao: "reduzir", valorFixo: 1, bloquearPorInsuficiencia: true } });
const draft3 = draftTalento([ramEfeito]);
const corpo3 = serializarRascunhoParaPublicacao(draft3);
const efeitoRamPublicado = corpo3.niveis[0].payload_automacao.efeitos.find((e) => e.recurso === "ram");
checar("8. RAM: reaproveita alterar_recurso existente (recurso='ram') sem nenhum tipo novo", efeitoRamPublicado?.recurso === "ram" && efeitoRamPublicado.valor === 1);

// ---------------------------------------------------------------------
// 9-10. Ação de companheiro com consequências reaproveitando o catálogo
//       universal (dano como consequência) — nunca duplicado.
// ---------------------------------------------------------------------
const danoConsequencia = efeitoBase({ id: "f-dano", tipo: "dano", campos: { tipoFormula: "dados", quantidadeDados: 1, faces: 6, tipoDano: "fisico", danoPrincipalOuAdicional: "principal", ignoraMit: false, ignoraPd: false, metadeEmSucesso: false } });
const acaoCompanheiro = efeitoBase({ tipo: "acao_companheiro", gatilho: "manualmente", campos: { acaoReferencia: "Vigiar", exigeTeste: false, independente: false, efeitosConsequencia: [danoConsequencia], confirmacaoManual: true } });
const draft4 = draftTalento([acaoCompanheiro]);
const corpo4 = serializarRascunhoParaPublicacao(draft4);
const efeitoAcaoPublicado = corpo4.niveis[0].payload_automacao.efeitos.find((e) => e.acao === "Vigiar");
checar(
  "9. Ação de companheiro: resumo textual da consequência (dano) aparece no payload real (schema fechado de talento não tem chave para lista aninhada — árvore completa fica só na metadata)",
  typeof efeitoAcaoPublicado?.resultado === "string" && efeitoAcaoPublicado.resultado.includes("dano"),
);

// ---------------------------------------------------------------------
// 10. Bloqueio: acao_companheiro não pode conter outro acao_companheiro
//     como consequência (prevenção de ciclo/profundidade).
// ---------------------------------------------------------------------
const acaoCompanheiroAninhada = { ...acaoCompanheiro, campos: { ...acaoCompanheiro.campos, efeitosConsequencia: [{ ...acaoCompanheiro, id: "f-aninhado" }] } };
checar("10. Bloqueio: acao_companheiro não pode conter outro acao_companheiro como consequência", validarEfeitoParaPublicacao("talent", acaoCompanheiroAninhada).length > 0);

// ---------------------------------------------------------------------
// 11. Bloqueio: mais de MAX_EFEITOS_CONSEQUENCIA_ACAO_COMPANHEIRO consequências.
// ---------------------------------------------------------------------
const muitasConsequencias = { ...acaoCompanheiro, campos: { ...acaoCompanheiro.campos, efeitosConsequencia: [danoConsequencia, danoConsequencia, danoConsequencia, danoConsequencia] } };
checar("11. Bloqueio: mais de 3 consequências em ação de companheiro é rejeitado", validarEfeitoParaPublicacao("talent", muitasConsequencias).length > 0);

// ---------------------------------------------------------------------
// 12. Programação de gatilho reaproveita o campo comum `gatilho` (mesmo
//     vocabulário de GATILHOS_INICIAIS) — nunca um segundo conceito.
// ---------------------------------------------------------------------
const programarGatilho = efeitoBase({ tipo: "programar_gatilho", gatilho: "ao_sofrer_dano", campos: { acaoReferencia: "Contra-atacar", substituiProgramaAnterior: true, confirmacaoManual: true } });
checar("12. Diagnóstico: programar_gatilho sem gatilho/ação é sem_executor", diagnosticarEfeitoEditavel({ ...programarGatilho, gatilho: undefined }).modoAutomacao === "sem_executor");
checar("13. Diagnóstico: programar_gatilho com gatilho+ação é lembrete (reaproveita campo comum, sem executor genérico)", diagnosticarEfeitoEditavel(programarGatilho).modoAutomacao === "lembrete");

// ---------------------------------------------------------------------
// 14. Pareamento: bloqueio sem nenhum compartilhamento definido.
// ---------------------------------------------------------------------
const parearVazio = efeitoBase({ tipo: "parear", campos: { tiposCompativeis: [], compartilhamentos: [], confirmacaoManual: true } });
checar("14. Bloqueio: pareamento sem compartilhamento definido é rejeitado", validarEfeitoParaPublicacao("talent", parearVazio).length > 0);
const parearValido = efeitoBase({ tipo: "parear", campos: { tiposCompativeis: ["drone"], compartilhamentos: ["comando"], confirmacaoManual: true } });
checar("15. Pareamento válido (com compartilhamento) não é rejeitado", validarEfeitoParaPublicacao("talent", parearValido).length === 0);

// ---------------------------------------------------------------------
// 16. Nenhuma chave _editor vaza em nenhum payload publicado.
// ---------------------------------------------------------------------
checar("16. Nenhuma chave _editor vaza (companheiro/trama/ram/ação)", !JSON.stringify(corpo1).includes("_editor") && !JSON.stringify(corpo2).includes("_editor") && !JSON.stringify(corpo4).includes("_editor"));

// ---------------------------------------------------------------------
// 17. Modelo × instância: nenhuma chave de estado de instância real
//     (paAtual/ramAtual/deteccaoAtual/rastro/bloqueios/nos/presencasHostis)
//     aparece no payload de MODELO publicado.
// ---------------------------------------------------------------------
const chavesInstancia = ["paAtual", "ramAtual", "deteccaoAtual", "rastro", "presencasHostis", "detecaoAcionada"];
checar("17. Modelo × instância: payload publicado não contém nenhuma chave de estado de instância real", chavesInstancia.every((k) => !JSON.stringify(corpo1).includes(k) && !JSON.stringify(corpo2).includes(k)));

// ---------------------------------------------------------------------
// 18. Alterar disponibilidade / demais tipos de mercado (Etapa 9) e
//     runa (Etapa 8/9) continuam intactos após a extensão do catálogo
//     (regressão simples: teste_resistencia em item ainda serializa OK).
// ---------------------------------------------------------------------
const arvoreItem = efeitoBase({
  tipo: "teste_resistencia",
  gatilho: "ao_acertar",
  campos: { modo: "resistencia", pericia: "vigor", cd: { tipo: "fixa", valor: 8 }, confirmacaoManual: true, resultados: [] },
});
checar("18. Regressão: teste_resistencia sem resultados continua bloqueado (nenhuma quebra introduzida pela Etapa 10)", validarEfeitoParaPublicacao("item", arvoreItem).length > 0);

// ---------------------------------------------------------------------
// 19-23. Correção de bugs reais encontrados nesta etapa (Etapas 8/9): o
// schema de talento é FECHADO (additionalProperties:false, ~90 chaves) —
// vários tipos anteriores emitiam chaves que não existem nesse enum
// (ex.: "bonus_pericia", "operacao", "destino", "item_slug", "limite").
// Cada caso abaixo agora usa só chaves reais e valida contra o schema.
// ---------------------------------------------------------------------
const efeitoTemporarioTalento = efeitoBase({
  tipo: "efeito_temporario",
  gatilho: "manualmente",
  campos: { duracao: { tipo: "rounds", rodadas: 1 }, politicaReaplicacao: "substituir", acumulavel: false, modificadores: [efeitoBase({ id: "m1", tipo: "modificar_teste", campos: { modo: "bonus", valor: 1, tags: ["luta"], acumulavel: false, consumirNoProximoTeste: false, confirmacaoDeContexto: false } })], confirmacaoManual: true },
});
const draft5 = draftTalento([efeitoTemporarioTalento]);
const corpo5 = serializarRascunhoParaPublicacao(draft5);
checar("19. Correção: efeito_temporario em talento não usa mais 'bonus_pericia'/'nota' (chaves inexistentes) e valida contra o schema", validarPayload(talentoSchema, corpo5, schemaTalentos).length === 0, JSON.stringify(validarPayload(talentoSchema, corpo5, schemaTalentos)));

const modificarInstanciaTalento = efeitoBase({ tipo: "modificar_instancia", gatilho: "manualmente", campos: { operacao: "reparar_mit", valor: 2, confirmacaoManual: true } });
const draft6 = draftTalento([modificarInstanciaTalento]);
const corpo6 = serializarRascunhoParaPublicacao(draft6);
checar("20. Correção: modificar_instancia em talento não usa mais 'operacao'/'limite' (chaves inexistentes) e valida contra o schema", validarPayload(talentoSchema, corpo6, schemaTalentos).length === 0, JSON.stringify(validarPayload(talentoSchema, corpo6, schemaTalentos)));

const concederItemTalento = efeitoBase({ tipo: "conceder_item", gatilho: "manualmente", campos: { itemSlug: "faca", quantidade: 1, destino: "personagem", permitirDuplicata: false, empilharQuandoCompativel: true, confirmacaoManual: true } });
const draft7 = draftTalento([concederItemTalento]);
const corpo7 = serializarRascunhoParaPublicacao(draft7);
checar("21. Correção: conceder_item em talento não usa mais 'item_slug'/'destino' (chaves inexistentes) e valida contra o schema", validarPayload(talentoSchema, corpo7, schemaTalentos).length === 0, JSON.stringify(validarPayload(talentoSchema, corpo7, schemaTalentos)));

const alterarDisponibilidadeTalento = efeitoBase({ tipo: "alterar_disponibilidade", gatilho: "manualmente", campos: { operacao: "marcar_indisponivel", fornecedor: "Mercado Noturno", confirmacaoManual: true } });
const draft8 = draftTalento([alterarDisponibilidadeTalento]);
const corpo8 = serializarRascunhoParaPublicacao(draft8);
checar("22. Correção: alterar_disponibilidade em talento não usa mais 'operacao'/'fornecedor' soltos (chaves inexistentes/tipo errado) e valida contra o schema", validarPayload(talentoSchema, corpo8, schemaTalentos).length === 0, JSON.stringify(validarPayload(talentoSchema, corpo8, schemaTalentos)));

// ---------------------------------------------------------------------
// 23. Ação de companheiro/Trama com exigeTeste=true nunca emite um
//     boolean solto na chave "teste" (schema só aceita object/string/array).
// ---------------------------------------------------------------------
const acaoTramaComTeste = efeitoBase({ tipo: "acao_trama", gatilho: "manualmente", campos: { acao: "isolar", exigeTeste: true, pericia: "tecnomagia", confirmacaoManual: true } });
const draft9 = draftTalento([acaoTramaComTeste]);
const corpo9 = serializarRascunhoParaPublicacao(draft9);
checar("23. Correção: acao_trama com exigeTeste=true nunca emite boolean na chave 'teste' e valida contra o schema", validarPayload(talentoSchema, corpo9, schemaTalentos).length === 0, JSON.stringify(validarPayload(talentoSchema, corpo9, schemaTalentos)));

// ---------------------------------------------------------------------
// 24. REGRESSÃO (achado ao vivo na rodada de aceite das Etapas 8-10):
//     reeditar/republicar um talento cujos níveis já têm `companheiro`/
//     `modificar_companheiro`/`acao_companheiro`/`programar_gatilho`/
//     `parear`/`acao_trama` publicados (rawOriginal já contém a saída de
//     uma publicação anterior — mesmo cenário do caso #15 de
//     validate-composite-effects.mjs, mas para os 6 tipos desta etapa)
//     NÃO pode duplicar essas entradas. Causa raiz: `aliasesLegado.talent`
//     de cada tipo não incluía o próprio `tipo` legado real que ele
//     produz (TIPO_LEGADO.talent em effectLegacySerialization.ts) — sem
//     isso, `resolverTipoCanonico` nunca reconhecia a entrada antiga como
//     pertencente a um tipo editável, então ela nunca era substituída,
//     só somada a cada republicação (reproduzido ao vivo: 6 → 11 → ainda
//     mais entradas ao reeditar 2x um talento real).
// ---------------------------------------------------------------------
const efeitosJaPublicadosAntesNivel1 = [
  { tipo: "conceder_companheiro", familia: "companheiro", gatilho: "manualmente", alvo: "proprio", contexto: "drone", identifica: ["drone_teste"], max_unidades: 1, escopo: ["personagem"] },
  { tipo: "modificar_companheiro", familia: "companheiro", gatilho: "manualmente", acao: "conceder_pa" },
  { tipo: "acao_companheiro", familia: "companheiro", gatilho: "manualmente", acao: "Ataque do drone", resultado: "1 consequência(s): dano" },
  { tipo: "programar_gatilho", familia: "companheiro", gatilho: "ao_iniciar_rodada", alvo: "proprio", acao: "Ativar sensor" },
  { tipo: "parear", familia: "companheiro", gatilho: "manualmente", alvo: "proprio", comandos: ["comando"] },
  { tipo: "acao_trama", familia: "trama", gatilho: "manualmente", alvo: "proprio", acao: "avancar", distancia_espacos: 15 },
];
const modificarCompanheiroReparar = efeitoBase({ tipo: "modificar_companheiro", gatilho: "manualmente", campos: { operacao: "reparar", confirmacaoManual: true } });
const efeitosReedicaoNivel1 = [concederCompanheiro, modificarCompanheiroReparar, acaoCompanheiro, programarGatilho, acaoTramaAvancar];
const draftReedicao = draftTalento(efeitosReedicaoNivel1, efeitosJaPublicadosAntesNivel1);
const corpoReedicao = serializarRascunhoParaPublicacao(draftReedicao);
const efeitosNivel1Reedicao = corpoReedicao.niveis[0].payload_automacao.efeitos;
const contagemPorTipo = (tipo) => efeitosNivel1Reedicao.filter((e) => e.tipo === tipo).length;
checar(
  "24. Reedição: republicar um talento com companheiro/modificar_companheiro/acao_companheiro/programar_gatilho/acao_trama recuperados de metadata NÃO duplica nenhuma entrada (parear removido também não reaparece)",
  contagemPorTipo("conceder_companheiro") === 1 &&
    contagemPorTipo("modificar_companheiro") === 1 &&
    contagemPorTipo("acao_companheiro") === 1 &&
    contagemPorTipo("programar_gatilho") === 1 &&
    contagemPorTipo("acao_trama") === 1 &&
    contagemPorTipo("parear") === 0,
  `contagens: ${JSON.stringify({ conceder_companheiro: contagemPorTipo("conceder_companheiro"), modificar_companheiro: contagemPorTipo("modificar_companheiro"), acao_companheiro: contagemPorTipo("acao_companheiro"), programar_gatilho: contagemPorTipo("programar_gatilho"), acao_trama: contagemPorTipo("acao_trama"), parear: contagemPorTipo("parear") })}`,
);

console.log(`\n${falhas === 0 ? "=== TODOS OS CASOS PASSARAM ===" : `=== ${falhas} FALHA(S) ===`}`);
process.exit(falhas === 0 ? 0 : 1);
