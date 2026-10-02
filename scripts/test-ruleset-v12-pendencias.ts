import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildCharacterV2,
  escolhasCriacaoV12,
  niveisPericiaV12,
  pendenciasCriacaoV12,
  REGIOES_V12,
  VERTENTES_V12,
  DRAFT_V12_SCHEMA_VERSION,
  type CreationContextV12,
  type DraftV12,
  type RulesetContentBundleV12,
} from "../src/lib/rulesetV12";

/*
 * Pendências da criação calculadas do rascunho (a fonte da Sincronia, do
 * menu e do Selar da Forja) e criação com os campos narrativos vazios.
 */

const root = join(process.cwd(), "content");
const bundle = JSON.parse(readFileSync(join(root, "v12", "db_classe_ancora_v1_2.json"), "utf8")) as RulesetContentBundleV12;
const traj = JSON.parse(readFileSync(join(root, "v12", "db_trajetoria_v1_2.json"), "utf8")) as RulesetContentBundleV12;
const rules = JSON.parse(readFileSync(join(root, "db_regras_personagem_normalizado_v1_4.json"), "utf8")) as { pericias: Array<{ id: string }> };
const classe = bundle.classes[0];
const regioes = Object.entries(REGIOES_V12).map(([id, r]) => ({ id, idioma: r.idioma }));
const cat = { classes: [classe], qualidades: traj.qualities.map((q) => ({ slug: q.slug })), itens: [] };

const vazio: DraftV12 = {
  schema_version: DRAFT_V12_SCHEMA_VERSION,
  ruleset_version: "1.2",
  step: 1,
  nome: "",
  codinome: "",
  regiaoId: "beldran",
  localOrigem: "",
  idiomaCampanha: "beldrano",
  antecedenteId: "",
  antecedente: { meio: "", papel: "", relacao_atual: "" },
  refratario: { estopim: "", primeiros_passos: "", consequencia: "" },
  rpi: { nome_registrado: "", ocupacao_declarada: "", origem: "" },
  qualidades: [],
  complicacoes: [],
  classeSlug: "",
  perfilAtributos: "",
  atributos: { corpo: null, mente: null, animo: null },
  perfilPericias: "",
  pericias: {},
  vertente: "",
  compras: {},
};

// Rascunho vazio: uma pendência por campo, nenhuma sobre texto narrativo.
const campos = new Set(pendenciasCriacaoV12(vazio, cat).map((p) => p.campo));
assert.deepEqual([...campos].sort(), ["antecedente", "atributos", "classe", "complicacoes", "local", "nome", "pericias", "qualidades", "vertente"]);

const completo: DraftV12 = {
  ...vazio,
  nome: "Ilsa Varn",
  localOrigem: "Lonich",
  antecedenteId: "academico",
  qualidades: [{ id: "aliado", pontos: 2 }, { id: "contato", pontos: 1 }],
  complicacoes: [{ id: "desertor", pontos: 2 }, { id: "fobia", pontos: 1 }],
  classeSlug: "ancora",
  perfilAtributos: "equilibrada",
  atributos: { corpo: 1, mente: 2, animo: 1 },
  perfilPericias: "padrao",
  pericias: {
    medicina: 3, psicologia: 3,
    biologia: 2, percepcao: 2, vontade: 2,
    arcanismo: 2, influencia: 1, logica: 1, mobilidade: 1, reflexos: 1, vigor: 1,
  },
  vertente: "biotica",
};
assert.deepEqual(pendenciasCriacaoV12(completo, cat), [], "rascunho completo sem pendências (narrativa vazia, 3 pontos de Complicação)");

// Regras de Traços: Qualidades exatamente 3; Complicações ao menos 2, sem teto.
assert.ok(pendenciasCriacaoV12({ ...completo, qualidades: [{ id: "aliado", pontos: 2 }] }, cat).some((p) => p.campo === "qualidades"));
assert.ok(pendenciasCriacaoV12({ ...completo, complicacoes: [{ id: "fobia", pontos: 1 }] }, cat).some((p) => p.campo === "complicacoes"));

// Perícias: quantidades do perfil.
assert.ok(pendenciasCriacaoV12({ ...completo, pericias: { medicina: 3 } }, cat).some((p) => p.campo === "pericias"));
assert.deepEqual(niveisPericiaV12(classe, "medicina"), [0, 1, 2, 3]);
assert.deepEqual(niveisPericiaV12(classe, "luta"), [0, 1]);
assert.deepEqual(niveisPericiaV12(undefined, "luta"), [0]);

// Idiomas: o da origem e o da campanha, sem repetir.
const escolhas = escolhasCriacaoV12({ ...completo, regiaoId: "vastra", idiomaCampanha: "beldrano" }, regioes);
assert.deepEqual(escolhas.trajetoria.idiomas, ["vastrano", "beldrano"]);
assert.deepEqual(escolhasCriacaoV12(completo, regioes).trajetoria.idiomas, ["beldrano"]);

// O servidor aceita a criação com Meio, Estopim e RPI vazios.
let seq = 0;
const ctx: CreationContextV12 = {
  classe,
  pericias: rules.pericias.map((p) => p.id),
  vertentes: [...VERTENTES_V12],
  itens: new Map(),
  trajetoria: {
    antecedentes: new Map(traj.backgrounds.map((b) => [b.slug, b])),
    qualidades: new Map(traj.qualities.map((q) => [q.slug, q])),
    complicacoes: new Map(traj.complications.map((c) => [c.slug, c])),
  },
  agora: () => "2026-10-01T00:00:00.000Z",
  novoId: () => `inst-${++seq}`,
};
const criado = buildCharacterV2(escolhasCriacaoV12(completo, regioes), ctx);
assert.equal(criado.ok, true, criado.ok ? "" : criado.errors.join("\n"));

console.log("test-ruleset-v12-pendencias — pendências da criação e narrativa opcional validadas.");
