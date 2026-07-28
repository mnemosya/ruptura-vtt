/**
 * Testes puros de `deriveActiveEffectsFromConditions` — checkpoint
 * v0.51 (achado A1 da auditoria v0.50). Lê o DB real de condições (sem
 * Supabase) e confirma que os modificadores/avisos são derivados de
 * `payload_automacao.efeitos`, não de uma tabela hardcoded por condição.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  deriveActiveEffectsFromConditions,
  getAutoFailReason,
  normalizeConditionContent,
  createInitialCharacter,
  type ActiveCondition,
  type ConditionContent,
} from "../src/lib/character";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

console.log("=== test-active-effects ===\n");

const db = readJson<{ condicoes: Record<string, unknown>[] }>("content/db_condicoes_normalizado_v1_5.json");
const conditions: ConditionContent[] = db.condicoes.map(normalizeConditionContent);
assert.ok(conditions.length >= 17, "Catálogo real deve ter pelo menos 17 condições.");

function condition(slug: string, overrides: Partial<ActiveCondition> = {}): ActiveCondition {
  return {
    id: `cond-${slug}`,
    conditionId: slug,
    nome: slug.charAt(0).toUpperCase() + slug.slice(1),
    aplicadaEm: "2026-07-03T10:00:00.000Z",
    removidaEm: null,
    ativa: true,
    ...overrides,
  };
}

const base = createInitialCharacter(null, "Testador de Condições");

// -------------------------------------------------------------
// 1. Condição com modificador simples (Sufocando: -1 em Corpo).
// -------------------------------------------------------------
const comSufocando = { ...base, condicoes_ativas: [condition("sufocando")] };
const efeitosSufocando = deriveActiveEffectsFromConditions(comSufocando, conditions);
const modCorpo = efeitosSufocando.find((e) => e.kind === "modifier" && e.affectedTags.includes("corpo"));
assert.ok(modCorpo, "Sufocando deve gerar modificador em 'corpo'.");
assert.equal(modCorpo!.modifier, -1);
assert.equal(modCorpo!.sourceType, "condition");
console.log("1. Condição com modificador simples (Sufocando -1 Corpo) — OK");

// -------------------------------------------------------------
// 2. Condição com múltiplos efeitos (Agarrado: modificador + deslocamento).
// -------------------------------------------------------------
const comAgarrado = { ...base, condicoes_ativas: [condition("agarrado")] };
const efeitosAgarrado = deriveActiveEffectsFromConditions(comAgarrado, conditions);
const modOfensivaDefensiva = efeitosAgarrado.find(
  (e) => e.kind === "modifier" && e.affectedTags.includes("ofensiva") && e.affectedTags.includes("defensiva"),
);
assert.ok(modOfensivaDefensiva, "Agarrado deve gerar um modificador -1 cobrindo ofensiva e defensiva.");
assert.equal(modOfensivaDefensiva!.modifier, -1);
const avisoDeslocamento = efeitosAgarrado.find((e) => e.kind === "warning" && e.affectedTags.includes("deslocamento"));
assert.ok(avisoDeslocamento, "Agarrado deve gerar aviso de deslocamento 0, sem virar modificador numérico.");
assert.equal(avisoDeslocamento!.modifier, 0);
console.log("2. Condição com múltiplos efeitos (Agarrado: modificador + aviso de deslocamento) — OK");

// -------------------------------------------------------------
// 3. Condição sem payload válido (slug desconhecido / manual) cai no aviso genérico.
// -------------------------------------------------------------
const comManual = {
  ...base,
  condicoes_ativas: [condition("condicao-totalmente-manual", { conditionId: null, nome: "Amaldiçoado" })],
};
const efeitosManual = deriveActiveEffectsFromConditions(comManual, conditions);
assert.equal(efeitosManual.length, 1);
assert.equal(efeitosManual[0].kind, "warning");
assert.equal(efeitosManual[0].modifier, 0);
assert.ok(efeitosManual[0].explanation.includes("automação de modificador ainda não implementada"));
console.log("3. Condição sem payload válido (manual/desconhecida) — aviso genérico, sem inventar número — OK");

// -------------------------------------------------------------
// 3b. Mesmo aviso genérico quando o catálogo não foi carregado (conditions=[]).
// -------------------------------------------------------------
const semCatalogo = deriveActiveEffectsFromConditions({ condicoes_ativas: [condition("sufocando")] }, []);
assert.equal(semCatalogo.length, 1);
assert.equal(semCatalogo[0].kind, "warning");
console.log("3b. Catálogo vazio/ausente não inventa modificador — OK");

// -------------------------------------------------------------
// 4. Efeito condicional ("quando" depende de contexto/visão) não vira número indevido.
//    Ofuscado: modificador -1 em visão (incondicional, aplicado) +
//    modificador -1 em ofensiva/defensiva "quando dependem_de_visao" (NÃO aplicado como número).
// -------------------------------------------------------------
const comOfuscado = { ...base, condicoes_ativas: [condition("ofuscado")] };
const efeitosOfuscado = deriveActiveEffectsFromConditions(comOfuscado, conditions);
const modVisao = efeitosOfuscado.find((e) => e.kind === "modifier" && e.affectedTags.includes("visao"));
assert.ok(modVisao, "Ofuscado deve aplicar -1 incondicional em 'visao'.");
assert.equal(modVisao!.modifier, -1);
const modOfensivaIncondicional = efeitosOfuscado.find(
  (e) => e.kind === "modifier" && (e.affectedTags.includes("ofensiva") || e.affectedTags.includes("defensiva")),
);
assert.equal(modOfensivaIncondicional, undefined, "Ofuscado NÃO deve aplicar -1 incondicional em ofensiva/defensiva (é condicional).");
const avisoCondicional = efeitosOfuscado.find(
  (e) => e.kind === "warning" && e.affectedTags.includes("ofensiva") && e.affectedTags.includes("defensiva"),
);
assert.ok(avisoCondicional, "O efeito condicional de Ofuscado deve aparecer como aviso preservado.");
assert.equal(avisoCondicional!.modifier, 0);
console.log("4. Efeito condicional ('quando dependem_de_visao') preservado como aviso, sem número indevido — OK");

// -------------------------------------------------------------
// 5. Cego não gera automação falsa: falha automática em visão (auto_fail) +
//    -2 incondicional em ofensiva, mas NUNCA aplica o bônus de quem ataca
//    o alvo cego (modificador_recebido é sobre OUTRO personagem, não este).
// -------------------------------------------------------------
const comCego = { ...base, condicoes_ativas: [condition("cego")] };
const efeitosCego = deriveActiveEffectsFromConditions(comCego, conditions);
const autoFailVisao = efeitosCego.find((e) => e.kind === "auto_fail" && e.affectedTags.includes("visao"));
assert.ok(autoFailVisao, "Cego deve gerar falha automática em testes de visão.");
const modOfensivaCego = efeitosCego.find((e) => e.kind === "modifier" && e.affectedTags.includes("ofensiva"));
assert.ok(modOfensivaCego, "Cego deve gerar -2 incondicional em ofensiva (próprias ações).");
assert.equal(modOfensivaCego!.modifier, -2);
const recebidoIndevido = efeitosCego.find((e) => e.modifier === 2);
assert.equal(recebidoIndevido, undefined, "Cego não deve gerar um modificador +2 (isso é 'modificador_recebido', sobre quem ataca o alvo).");
console.log("5. Cego: falha automática + modificador próprio, sem vazar modificador_recebido (alvo) — OK");

// -------------------------------------------------------------
// 5b. getAutoFailReason (checkpoint falha_automatica bloqueia rolagem,
//     RollsTab.tsx) — tags cruzando com um efeito auto_fail devolvem o
//     motivo (explanation); sem cruzamento, ou sem nenhum efeito
//     auto_fail, devolvem undefined (liberado).
// -------------------------------------------------------------
const motivoComVisao = getAutoFailReason(["visao"], efeitosCego);
assert.ok(motivoComVisao, "Tag 'visao' com Cego ativo deve devolver motivo de bloqueio.");
assert.equal(motivoComVisao, autoFailVisao!.explanation, "Motivo devolvido deve ser a MESMA explanation do efeito, não uma mensagem inventada.");
const motivoSemCruzamento = getAutoFailReason(["ofensiva"], efeitosCego);
assert.equal(motivoSemCruzamento, undefined, "Tag 'ofensiva' (sem cruzar com o auto_fail de visão) não deve bloquear — só o modifier -2 se aplica.");
const motivoSemEfeitos = getAutoFailReason(["visao"], []);
assert.equal(motivoSemEfeitos, undefined, "Sem nenhum ActiveEffect, nunca deve bloquear.");
console.log("5b. getAutoFailReason: bloqueia só com tag cruzando um auto_fail real, libera nos demais casos — OK");

// -------------------------------------------------------------
// 6. Valores já aplicados hoje não regridem (paridade com a tabela hardcoded anterior).
// -------------------------------------------------------------
const casosConhecidos: { slug: string; tag: string; modifierEsperado: number }[] = [
  { slug: "caido", tag: "ofensiva", modifierEsperado: -1 },
  { slug: "contundido", tag: "luta", modifierEsperado: -1 },
  { slug: "contundido", tag: "mobilidade", modifierEsperado: -1 },
  { slug: "contundido", tag: "reflexos", modifierEsperado: -1 },
  { slug: "lento", tag: "reflexos", modifierEsperado: -1 },
  { slug: "lento", tag: "mobilidade", modifierEsperado: -1 },
  { slug: "agarrando", tag: "ofensiva", modifierEsperado: -1 },
  { slug: "agarrando", tag: "defensiva", modifierEsperado: -1 },
];
for (const caso of casosConhecidos) {
  const personagem = { ...base, condicoes_ativas: [condition(caso.slug)] };
  const efeitos = deriveActiveEffectsFromConditions(personagem, conditions);
  const encontrado = efeitos.find((e) => e.kind === "modifier" && e.affectedTags.includes(caso.tag));
  assert.ok(encontrado, `${caso.slug} deveria gerar modificador em '${caso.tag}' (paridade com comportamento anterior).`);
  assert.equal(encontrado!.modifier, caso.modifierEsperado, `${caso.slug}/${caso.tag} deveria valer ${caso.modifierEsperado}.`);
}
console.log("6. Nenhum valor de modificador já aplicado hoje regrediu (paridade com a tabela anterior) — OK");

// -------------------------------------------------------------
// 7. Sem condição ativa nenhuma -> nenhum efeito.
// -------------------------------------------------------------
assert.equal(deriveActiveEffectsFromConditions(base, conditions).length, 0);
console.log("7. Sem condição ativa — nenhum efeito ativo — OK");

console.log("\ntest-active-effects — todos os cenários passaram.");
