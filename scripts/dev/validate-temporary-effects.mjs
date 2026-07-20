#!/usr/bin/env node
/**
 * Verificação focada da Etapa 8 (efeito temporário, uso/cadência,
 * consumo, ação/reação adicional). Mesmo padrão de
 * `validate-composite-effects.mjs` (Etapa 7): roda o código REAL
 * compilado por `tsc` contra fixtures de RASCUNHO, valida o payload
 * produzido contra os schemas oficiais reais, e roda o executor REAL de
 * efeitos temporários (`temporaryEffects.ts`) contra o payload legado
 * REALMENTE serializado (nunca um payload escrito à mão para o teste).
 *
 * Uso: node scripts/dev/validate-temporary-effects.mjs <dir-compilado>
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
  console.error("Uso: node validate-temporary-effects.mjs <diretorio-compilado>");
  process.exit(1);
}

const { serializarRascunhoParaPublicacao } = require(path.join(compiledDir, "contentSchema/publishSerialization.js"));
const { validarEfeitoParaPublicacao } = require(path.join(compiledDir, "contentSchema/effectLegacySerialization.js"));
const { diagnosticarEfeitoEditavel } = require(path.join(compiledDir, "contentSchema/effectDiagnostics.js"));
const {
  buildTemporaryEffectFromStructuredPayload,
  canApplyTemporaryEffect,
  addTemporaryEffect,
  tickRoundTemporaryEffects,
  expireSceneTemporaryEffects,
} = require(path.join(compiledDir, "character/temporaryEffects.js"));

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
const itemSchemaEquipamento = schemaEquipamentos.properties.itens.items;
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
function rawItemBase(slug) {
  return {
    id: slug, nome: "ZZ Item Temporario", slug, categoria: "farmacia", categoria_label: "Farmácia", raridade: "comum", raridade_label: "Comum",
    preco: 10, descricao_curta: "d", descricao_longa: "d", tags: ["cura"], status: "published", versao: "1.0.0", created_at: "2026-01-01", updated_at: "2026-01-01",
    estatisticas: {}, payload_automacao: { efeitos: [] },
  };
}
function draftItem(efeitos) {
  return {
    id: "draft-1", content_type: "item", slug: "zz_item_temporario", version: 1,
    payload: {
      schemaVersion: "draft.v1", contentType: "item",
      camposEditaveis: { contentType: "item", campos: { nome: "ZZ Item Temporario", slug: "zz_item_temporario", categoria: "farmacia", tags: ["cura"], propriedades: [], efeitos } },
      preservado: { rawOriginal: rawItemBase("zz_item_temporario"), camposDesconhecidos: [] },
    },
  };
}
function draftTalento(efeitosNivel1) {
  return {
    id: "draft-2", content_type: "talent", slug: "zz_talento_temporario", version: 1,
    payload: {
      schemaVersion: "draft.v1", contentType: "talent",
      camposEditaveis: { contentType: "talent", campos: { nome: "ZZ", slug: "zz_talento_temporario", tags: [], niveis: [
        { nivel: 1, nomeNivel: "N1", requisitos: [], efeitos: efeitosNivel1 },
        { nivel: 2, nomeNivel: "N2", requisitos: [], efeitos: [] },
        { nivel: 3, nomeNivel: "N3", requisitos: [], efeitos: [] },
      ] } },
      preservado: {
        rawOriginal: {
          id: "zz_talento_temporario", slug: "zz_talento_temporario", nome: "ZZ", tags: [], descricao_curta: "d", descricao_longa: "d", status: "published", versao: "1.0.0", created_at: "2026-01-01", updated_at: "2026-01-01",
          niveis: [1, 2, 3].map((n) => ({ id: `zz_n${n}`, slug: `zz_n${n}`, talento_id: "zz_talento_temporario", nivel: n, nome: `N${n}`, requisitos: [], tags: [], descricao_curta: "d", descricao_longa: "d", status: "published", versao: "1.0.0", created_at: "2026-01-01", updated_at: "2026-01-01", payload_automacao: { efeitos: n === 1 ? [] : [{ tipo: "regra_especial_de_teste", familia: "regra_especial" }] } })),
        },
        camposDesconhecidos: [],
      },
    },
  };
}
function modificadorSimples(overrides) {
  return efeitoBase({ tipo: "modificar_teste", campos: { modo: "bonus", tags: [], acumulavel: false, consumirNoProximoTeste: false, confirmacaoDeContexto: false }, ...overrides });
}

// ---------------------------------------------------------------------
// 1-3. Item: efeito_temporario ("+1 em Luta por pilha, máx. 3, 1 rodada")
//      serializa para buff_temporario REAL e o executor REAL consegue
//      construir um TemporaryEffect a partir do payload publicado.
// ---------------------------------------------------------------------
const efeitoTemporarioItem = efeitoBase({
  tipo: "efeito_temporario",
  gatilho: "ao_usar",
  campos: {
    duracao: { tipo: "rounds", rodadas: 1 },
    politicaReaplicacao: "acumular_pilha",
    acumulavel: true,
    maximoPilhas: 3,
    pilhasIniciais: 1,
    modificadores: [modificadorSimples({ id: "m1", campos: { modo: "bonus", valor: 1, tags: ["luta"], acumulavel: false, consumirNoProximoTeste: false, confirmacaoDeContexto: false } })],
    confirmacaoManual: true,
  },
});
const draft1 = draftItem([efeitoTemporarioItem]);
const corpo1 = serializarRascunhoParaPublicacao(draft1);
const efeitoPublicado1 = corpo1.payload_automacao.efeitos.find((e) => e.tipo === "buff_temporario");
checar("1. Item: efeito temporário serializa para buff_temporario real (duracao/valor/alvo_tags/max_pilhas)", efeitoPublicado1?.duracao === "1_rodadas" && efeitoPublicado1.valor === 1 && Array.isArray(efeitoPublicado1.alvo_tags) && efeitoPublicado1.alvo_tags.includes("luta") && efeitoPublicado1.max_pilhas === 3);
checar("2. Item: payload publicado válido contra schema_equipamentos_v1_2", validarPayload(itemSchemaEquipamento, corpo1).length === 0, JSON.stringify(validarPayload(itemSchemaEquipamento, corpo1)));

const podeAplicar = canApplyTemporaryEffect(efeitoPublicado1);
checar("3. Executor real reconhece o payload publicado como aplicável (canApplyTemporaryEffect)", podeAplicar === true);
const construido = buildTemporaryEffectFromStructuredPayload({ sourceType: "item", sourceId: "zz_item_temporario", sourceName: "ZZ Item Temporario" }, efeitoPublicado1, "2026-01-01T00:00:00.000Z", () => "uuid-1");
checar("4. Executor real constrói TemporaryEffect a partir do payload publicado (round-trip completo)", construido?.durationType === "rounds" && construido.remainingRounds === 1 && construido.modifiers?.some((m) => m.target === "roll" && m.value === 1 && m.appliesTo?.includes("luta")));

// ---------------------------------------------------------------------
// 5. Expiração real: tickRoundTemporaryEffects expira ao chegar a 0.
// ---------------------------------------------------------------------
let personagem = { efeitos_temporarios: [construido] };
const tick1 = tickRoundTemporaryEffects(personagem, "2026-01-01T00:01:00.000Z");
checar("5. Expiração real: efeito de 1 rodada expira no primeiro tick (tickRoundTemporaryEffects)", tick1.expired.length === 1 && tick1.expired[0].active === false);

// ---------------------------------------------------------------------
// 6. Pilhas: addTemporaryEffect com stackingMode "stack" incrementa pilhas
//    até maxStacks (nunca ultrapassa).
// ---------------------------------------------------------------------
const efeitoStackBase = { ...construido, stackingMode: "stack", stacks: 1, maxStacks: 3 };
let personagemStack = { efeitos_temporarios: [efeitoStackBase] };
personagemStack = addTemporaryEffect(personagemStack, { ...efeitoStackBase, id: "novo-id" });
personagemStack = addTemporaryEffect(personagemStack, { ...efeitoStackBase, id: "novo-id-2" });
personagemStack = addTemporaryEffect(personagemStack, { ...efeitoStackBase, id: "novo-id-3" });
const pilhasFinais = personagemStack.efeitos_temporarios.find((e) => e.active).stacks;
checar("6. Pilhas: acumula até o máximo (3) e nunca ultrapassa mesmo com aplicações extras", pilhasFinais === 3);

// ---------------------------------------------------------------------
// 7. Bloqueio: efeito_temporario numa MAGIA (schema fechado, sem duração/buff).
// ---------------------------------------------------------------------
checar("7. Bloqueio: efeito temporário em magia é rejeitado", validarEfeitoParaPublicacao("spell", efeitoTemporarioItem).length > 0);

// ---------------------------------------------------------------------
// 8. Bloqueio: mais de 1 modificador por-tags (o executor real só lê 1).
// ---------------------------------------------------------------------
const efeitoTemporarioExcedente = {
  ...efeitoTemporarioItem,
  campos: {
    ...efeitoTemporarioItem.campos,
    modificadores: [
      modificadorSimples({ id: "m1", campos: { modo: "bonus", valor: 1, tags: ["luta"], acumulavel: false, consumirNoProximoTeste: false, confirmacaoDeContexto: false } }),
      modificadorSimples({ id: "m2", campos: { modo: "bonus", valor: 2, tags: ["furtividade"], acumulavel: false, consumirNoProximoTeste: false, confirmacaoDeContexto: false } }),
    ],
  },
};
checar("8. Bloqueio: 2 modificadores por-tags no mesmo efeito temporário é rejeitado (executor real só lê 1)", validarEfeitoParaPublicacao("item", efeitoTemporarioExcedente).length > 0);

// ---------------------------------------------------------------------
// 9. Diagnóstico: efeito temporário sem conteúdo é bloqueado (sem_executor).
// ---------------------------------------------------------------------
const efeitoTemporarioVazio = { ...efeitoTemporarioItem, campos: { ...efeitoTemporarioItem.campos, modificadores: [] } };
checar("9. Diagnóstico: efeito temporário sem modificador nem lembrete vira sem_executor", diagnosticarEfeitoEditavel(efeitoTemporarioVazio).modoAutomacao === "sem_executor");

// ---------------------------------------------------------------------
// 10-11. Talento: uso/cadência (1 uso por cena) serializa no formato REAL
//        já lido por getTalentUsageState/TALENT_CADENCES (usos/cadencia
//        na raiz do efeito, não um tipo à parte).
// ---------------------------------------------------------------------
const efeitoComUso = efeitoBase({
  id: "efeito-uso-1",
  tipo: "alterar_recurso",
  gatilho: "ao_usar",
  usoLimitado: { usosMax: 1, cadencia: "cena", chaveUso: "efeito-uso-1", compartilhado: false },
  campos: { recurso: "pa", operacao: "somar", valorFixo: 1, bloquearPorInsuficiencia: false },
});
const draft2 = draftTalento([efeitoComUso]);
const corpo2 = serializarRascunhoParaPublicacao(draft2);
const efeitoUsoPublicado = corpo2.niveis[0].payload_automacao.efeitos.find((e) => e.usos != null);
checar("10. Talento: uso/cadência serializa usos/cadencia reais (1 uso por cena)", efeitoUsoPublicado?.usos === 1 && efeitoUsoPublicado.cadencia === "cena");
checar("11. Talento: payload publicado válido contra schema_talentos_v1_3", validarPayload(talentoSchema, corpo2, schemaTalentos).length === 0, JSON.stringify(validarPayload(talentoSchema, corpo2, schemaTalentos)));

// ---------------------------------------------------------------------
// 12. Bloqueio: uso/cadência numa MAGIA/ITEM (sem leitor genérico real).
// ---------------------------------------------------------------------
checar("12. Bloqueio: uso/cadência em item é rejeitado (sem leitor genérico real)", validarEfeitoParaPublicacao("item", efeitoComUso).length > 0);

// ---------------------------------------------------------------------
// 13. Talento: ação/reação adicional serializa em ataque_adicional/reacao
//     reais (familia real do enum, nunca inventada).
// ---------------------------------------------------------------------
const acaoAdicionalTalento = efeitoBase({
  tipo: "acao_reacao_adicional",
  gatilho: "ao_acertar",
  campos: { tipo: "ataque", quantidade: 1, gratuito: false, consomeReacao: false, consomePa: 2, penalidade: "-2 no ataque adicional", confirmacaoManual: true },
});
const draft3 = draftTalento([acaoAdicionalTalento]);
const corpo3 = serializarRascunhoParaPublicacao(draft3);
const efeitoAcaoPublicado = corpo3.niveis[0].payload_automacao.efeitos.find((e) => e.familia === "ataque_adicional");
checar("13. Talento: ação adicional serializa com família ataque_adicional (enum real)", efeitoAcaoPublicado?.custo_pa_extra === 2 && efeitoAcaoPublicado.penalidade === "-2 no ataque adicional");
checar("14. Diagnóstico: ação/reação adicional é sempre classificada como lembrete (sem executor real)", diagnosticarEfeitoEditavel(acaoAdicionalTalento).modoAutomacao === "lembrete");

// ---------------------------------------------------------------------
// 15. Bloqueio: ação/reação adicional numa MAGIA.
// ---------------------------------------------------------------------
checar("15. Bloqueio: ação/reação adicional em magia é rejeitado", validarEfeitoParaPublicacao("spell", acaoAdicionalTalento).length > 0);

// ---------------------------------------------------------------------
// 16. Nenhuma chave _editor vaza em nenhum dos 3 payloads publicados.
// ---------------------------------------------------------------------
checar("16. Nenhuma chave _editor vaza nos payloads publicados (item/talento)", !JSON.stringify(corpo1).includes("_editor") && !JSON.stringify(corpo2).includes("_editor") && !JSON.stringify(corpo3).includes("_editor"));

// ---------------------------------------------------------------------
// 17. Modelo × instância: publicar o MODELO não inclui pilhas/duração
//     restante/usos consumidos (esses só existem em `efeitos_temporarios`
//     do PERSONAGEM/instância, nunca no payload de conteúdo publicado).
// ---------------------------------------------------------------------
checar("17. Modelo × instância: payload publicado não tem 'stacks'/'remainingRounds'/'usosGastos' (só existem na instância do personagem)", !("stacks" in efeitoPublicado1) && !("remainingRounds" in efeitoPublicado1) && !JSON.stringify(corpo2).includes("usosGastos"));

console.log(`\n${falhas === 0 ? "=== TODOS OS CASOS PASSARAM ===" : `=== ${falhas} FALHA(S) ===`}`);
process.exit(falhas === 0 ? 0 : 1);
