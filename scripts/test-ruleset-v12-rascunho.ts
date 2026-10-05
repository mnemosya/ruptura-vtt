import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDraftV12, sanitizeDraftV12, REGIOES_V12, VERTENTES_V12, type DraftV12, type RulesetContentBundleV12 } from "../src/lib/rulesetV12";

const root = join(process.cwd(), "content");
const ancora = JSON.parse(readFileSync(join(root, "v12", "db_classe_ancora_v1_2.json"), "utf8")) as RulesetContentBundleV12;
const traj = JSON.parse(readFileSync(join(root, "v12", "db_trajetoria_v1_2.json"), "utf8")) as RulesetContentBundleV12;
const rules = JSON.parse(readFileSync(join(root, "db_regras_personagem_normalizado_v1_4.json"), "utf8")) as { pericias: Array<{ id: string }> };

const catalogos = {
  regioes: Object.entries(REGIOES_V12).map(([id, r]) => ({ id, idioma: r.idioma })),
  antecedentes: traj.backgrounds,
  qualidades: traj.qualities.map((q) => ({ slug: q.slug, custos: q.custos_permitidos, repetivel: q.repetivel === true })),
  complicacoes: traj.complications.map((c) => ({ slug: c.slug, custos: c.custos_permitidos, repetivel: c.repetivel === true })),
  classes: ancora.classes,
  vertentes: [...VERTENTES_V12],
  pericias: rules.pericias,
  itens: [{ slug: "medkit" }],
};

const rascunho: DraftV12 = {
  schema_version: 2,
  ruleset_version: "1.2",
  step: 3,
  nome: "Hilda",
  codinome: "",
  regiaoId: "kravus",
  localOrigem: "Kylahosa",
  idiomaCampanha: "",
  antecedenteId: "trabalhador_industrial",
  antecedente: { meio: "Mina", papel: "Socorrista", relacao_atual: "Afastada" },
  refratario: { estopim: "", primeiros_passos: "", consequencia: "" },
  rpi: { nome_registrado: "", ocupacao_declarada: "", origem: "" },
  qualidades: [{ id: "contato", pontos: 1 }, { id: "contato", pontos: 1 }],
  complicacoes: [{ id: "divida", pontos: 1 }],
  classeSlug: "ancora",
  perfilAtributos: "equilibrada",
  atributos: { corpo: 1, mente: 2, animo: null },
  perfilPericias: "especializado",
  pericias: { medicina: 3, vigor: 2, luta: 1 },
  vertente: "biotica",
  compras: { medkit: 3 },
};

// Formato: round-trip, rejeição de lixo e separação dos formatos v1/v2.
assert.deepEqual(parseDraftV12(JSON.parse(JSON.stringify(rascunho))), rascunho);
assert.equal(parseDraftV12({ ...rascunho, schema_version: 1 }), null);
assert.equal(parseDraftV12({ ...rascunho, step: 9 }), null);
assert.equal(parseDraftV12({ ...rascunho, nome: "x".repeat(5000) }), null);
assert.equal(parseDraftV12({ ...rascunho, pericias: { medicina: 5 } }), null);
assert.equal(parseDraftV12({ ...rascunho, qualidades: [{ id: "aliado", pontos: 3 }] }), null);
assert.equal(parseDraftV12({ ...rascunho, compras: { medkit: -1 } }), null);
assert.equal(parseDraftV12({ ...rascunho, atributos: { corpo: 1, mente: 2 } }), null);
assert.equal(parseDraftV12({ ...rascunho, rankingInicial: "S+" })?.rankingInicial, "S+");
assert.equal(parseDraftV12({ ...rascunho, rankingInicial: "Z" }), null);

// Restauração sem mudanças no conteúdo: nada descartado.
const limpo = sanitizeDraftV12(rascunho, catalogos);
assert.equal(limpo.descartados, 0);
assert.deepEqual(limpo.draft, rascunho);
assert.equal(sanitizeDraftV12({ ...rascunho, rankingInicial: "C" }, catalogos).draft.rankingInicial, "C");

// Conteúdo mudou: opções que sumiram ou ficaram inválidas são removidas e contadas.
const sujo = sanitizeDraftV12({
  ...rascunho,
  antecedenteId: "astronauta",
  qualidades: [{ id: "arquivo", pontos: 1 }, { id: "arquivo", pontos: 1 }, { id: "aliado", pontos: 1 }, { id: "sumiu", pontos: 1 }],
  pericias: { medicina: 3, luta: 3, inventada: 1 },
  vertente: "somatica",
  compras: { medkit: 2, lanca_relampago: 1 },
}, catalogos);
assert.equal(sujo.draft.antecedenteId, "");
assert.deepEqual(sujo.draft.qualidades, [{ id: "arquivo", pontos: 1 }], "Arquivo não é repetível; Aliado não custa 1; 'sumiu' não existe");
assert.deepEqual(sujo.draft.pericias, { medicina: 3 }, "Luta não pode ter valor 3 na Âncora");
assert.equal(sujo.draft.vertente, "");
assert.deepEqual(sujo.draft.compras, { medkit: 2 });
assert.equal(sujo.descartados, 8);

// Perfil de Atributos inexistente zera a distribuição.
const semPerfil = sanitizeDraftV12({ ...rascunho, perfilAtributos: "point_buy" }, catalogos);
assert.deepEqual(semPerfil.draft.atributos, { corpo: null, mente: null, animo: null });

// Classe removida fica "não escolhida" (conta como descartada) e limpa as escolhas dela.
const semClasse = sanitizeDraftV12({ ...rascunho, classeSlug: "classe_removida" }, catalogos);
assert.equal(semClasse.draft.classeSlug, "");
assert.deepEqual(semClasse.draft.pericias, {});
assert.ok(semClasse.descartados >= 1);

// Classe ainda não escolhida continua não escolhida, sem contar como descarte.
const nenhuma = sanitizeDraftV12({ ...rascunho, classeSlug: "", perfilAtributos: "", perfilPericias: "", pericias: {}, atributos: { corpo: null, mente: null, animo: null }, vertente: "" }, catalogos);
assert.equal(nenhuma.draft.classeSlug, "");
assert.equal(nenhuma.descartados, 0);

// Dados da Forja: aceitos quando bem formados, recusados quando não.
assert.deepEqual(parseDraftV12({ ...rascunho, forja: { passo: 6, conceito: "c", aparencia: "a", relato: "r" } })?.forja, { passo: 6, conceito: "c", aparencia: "a", relato: "r" });
assert.equal(parseDraftV12({ ...rascunho, forja: { passo: 99, conceito: "", aparencia: "", relato: "" } }), null);
assert.equal(parseDraftV12({ ...rascunho })?.forja, undefined);

console.log("test-ruleset-v12-rascunho — formato e restauração do rascunho validados.");
