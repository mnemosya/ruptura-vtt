import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  advancementPackageV12,
  applyAdvancementV12,
  buildCharacterV2,
  validateCharacterV2,
  VERTENTES_V12,
  type AdvancementChoicesV12,
  type AdvancementContextV12,
  type CharacterV2,
  type RulesetContentBundleV12,
} from "../src/lib/rulesetV12";
import { characterDerivedFormulas, computeDerivedStats } from "../src/lib/character";

const dir = join(process.cwd(), "content");
const ancora = JSON.parse(readFileSync(join(dir, "v12", "db_classe_ancora_v1_2.json"), "utf8")) as RulesetContentBundleV12;
const traj = JSON.parse(readFileSync(join(dir, "v12", "db_trajetoria_v1_2.json"), "utf8")) as RulesetContentBundleV12;
const regras = JSON.parse(readFileSync(join(dir, "db_regras_personagem_normalizado_v1_4.json"), "utf8"));
const pericias = regras.pericias.map((p: { id: string }) => p.id);

const criado = buildCharacterV2({
  nome: "Progressão", classe_id: "ancora", perfil_atributos: "equilibrada", atributos: { corpo: 1, mente: 2, animo: 1 },
  perfil_pericias: "padrao",
  pericias: { valor_3: ["medicina", "psicologia"], valor_2: ["biologia", "percepcao", "vontade"], valor_1: ["arcanismo", "influencia", "logica", "mobilidade", "reflexos", "sociedade", "vigor"] },
  vertente_primaria: "biotica",
  trajetoria: {
    regiao_id: "vastra", local_origem: "Vosek", idiomas: ["vastrano"],
    antecedente: { antecedente_id: "academico", meio: "m", papel: "p", relacao_atual: "r" },
    transformacao_refratario: { estopim: "e", primeiros_passos: "p", consequencia: "c" },
    rpi_forjado: { nivel: 1, nome_registrado: "n", ocupacao_declarada: "o", origem: "o" },
    qualidades: [{ quality_id: "aliado", pontos: 2, detalhes: {} }, { quality_id: "contato", pontos: 1, detalhes: {} }],
    complicacoes: [{ complication_id: "desertor", pontos: 2, detalhes: {} }],
  },
  compras: [],
}, {
  classe: ancora.classes[0], pericias, vertentes: [...VERTENTES_V12], itens: new Map(),
  trajetoria: {
    antecedentes: new Map(traj.backgrounds.map((b) => [b.slug, b])),
    qualidades: new Map(traj.qualities.map((q) => [q.slug, q])),
    complicacoes: new Map(traj.complications.map((c) => [c.slug, c])),
  },
});
assert.ok(criado.ok);
let c: CharacterV2 = criado.character;

const ctx: AdvancementContextV12 = { classe: ancora.classes[0], subclasses: ancora.subclasses, pericias, agora: () => "2026-10-01T00:00:00.000Z" };
const avancar = (choices: AdvancementChoicesV12) => {
  const r = applyAdvancementV12(c, choices, ctx);
  assert.equal(r.ok, true, r.ok ? "" : r.errors.join(" | "));
  if (r.ok) c = r.character;
  const v = validateCharacterV2(c);
  assert.equal(v.ok, true, v.errors.join(" | "));
  return c;
};
const falha = (choices: AdvancementChoicesV12, trecho: string) => {
  const r = applyAdvancementV12(c, choices, ctx);
  assert.equal(r.ok, false, `esperava falha: ${trecho}`);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes(trecho)), r.errors.join(" | "));
};

// F → E: Subclasse obrigatória, +2 perícias, +1 Vertente.
const pacoteE = advancementPackageV12(c, ctx)!;
assert.equal(pacoteE.para, "E");
assert.deepEqual(pacoteE.subclasses_disponiveis.map((s) => s.slug).sort(), ["coordenador", "terapeuta", "vitalista"]);
falha({ pericias: { luta: 2 }, vertente: "cinetica" }, "exige escolher uma Subclasse");
falha({ subclasse_id: "berserker", pericias: { luta: 2 }, vertente: "cinetica" }, "não pertence à Classe");
falha({ subclasse_id: "vitalista", pericias: { luta: 1 }, vertente: "cinetica" }, "concede 2 ponto(s) de Perícia");
falha({ subclasse_id: "vitalista", pericias: { medicina: 1, luta: 1 }, vertente: "cinetica" }, "acima do limite 3");
falha({ subclasse_id: "vitalista", pericias: { luta: 2 }, vertente: "cinetica", atributo: "corpo" }, "não concede ponto de Atributo");
avancar({ subclasse_id: "vitalista", pericias: { luta: 2 }, vertente: "cinetica" });
assert.equal(c.progressao.ranking, "E");
assert.equal(c.progressao.subclasse_id, "vitalista");
assert.equal(c.pericias.luta, 2);
assert.deepEqual(c.magia.niveis_vertente, { biotica: 1, cinetica: 1 });
assert.deepEqual(c.niveis_vertente, { biotica: 1, cinetica: 1 });

// E → D: +1 Atributo, +1 magia (pendente).
assert.deepEqual(advancementPackageV12(c, ctx)!.caracteristicas_classe.map((f) => f.slug), ["atencao_dividida"]);
falha({ subclasse_id: "terapeuta", atributo: "mente" }, "só é escolhida no Ranking E");
avancar({ atributo: "mente" });
assert.equal(c.atributos.mente, 3);
const derivadosD = computeDerivedStats(c.atributos, regras, 0, characterDerivedFormulas(c));
assert.equal(derivadosD.pe_max, 16, "PE máximo recalculado pela Classe (13 + Mente 3)");
assert.equal(c.recursos_atuais?.pe, 15, "o avanço não cura: PE atual permanece");

// D → C: limite 4, PA 4, Característica de Subclasse II.
assert.deepEqual(advancementPackageV12(c, ctx)!.caracteristicas_subclasse.map((f) => f.slug), ["triagem_de_combate", "protocolo_de_urgencia"]);
avancar({ pericias: { medicina: 1, luta: 1 }, vertente: "biotica" });
assert.equal(c.pericias.medicina, 4);
assert.equal(computeDerivedStats(c.atributos, regras, 0, characterDerivedFormulas(c)).pa_max, 4);
assert.equal(c.progressao.formulas_derivados_texto?.pa_max, "4 (Ranking C)");

// C → B → A → S → S+.
avancar({ atributo: "mente" });
falha({ pericias: { medicina: 2 }, vertente: "biotica" }, "acima do limite 5"); // 4 + 2 = 6 > 5 no A
avancar({ pericias: { medicina: 1, psicologia: 1 }, vertente: "biotica" });

// A → S: limite de Atributo 5 (Mente está em 4; um personagem já em 5 não pode subir).
const travado = structuredClone(c);
travado.atributos.mente = 5;
const r = applyAdvancementV12(travado, { atributo: "mente" }, ctx);
assert.ok(!r.ok && r.errors.some((e) => e.includes("limite de 5")));
avancar({ atributo: "mente" });
assert.equal(c.atributos.mente, 5);
assert.equal(computeDerivedStats(c.atributos, regras, 0, characterDerivedFormulas(c)).pa_max, 5, "PA 5 no Ranking S");

// S → S+ e fim da progressão regular.
avancar({ pericias: { vigor: 2 }, vertente: "biotica" });
assert.equal(c.progressao.ranking, "S+");
assert.equal(advancementPackageV12(c, ctx), null);
assert.ok(!applyAdvancementV12(c, {}, ctx).ok);

// Biótica: criação (1), C, A e S+ → 4; o ponto do E foi para Cinética.
assert.equal(c.magia.niveis_vertente.biotica, 4);
// Vertente no nível máximo não recebe ponto.
const noMaximo = structuredClone(c);
noMaximo.progressao.ranking = "A";
noMaximo.magia.niveis_vertente.biotica = 5;
const rMax = applyAdvancementV12(noMaximo, { atributo: "corpo" }, ctx);
assert.ok(rMax.ok, "S não concede Vertente; serve de controle");
noMaximo.progressao.ranking = "S";
const rMax2 = applyAdvancementV12(noMaximo, { pericias: { vigor: 1, luta: 1 }, vertente: "biotica" }, ctx);
assert.ok(!rMax2.ok && rMax2.errors.some((e) => e.includes("nível máximo")));

// Escolhas de magia pendentes acumuladas: nível 1 da criação, níveis de Vertente (E, C, A, S+) e magias adicionais (D, B, S).
const pendentes = c.magia.escolhas_pendentes ?? [];
assert.equal(pendentes.filter((p) => p.tipo === "magias_nivel_vertente").length, 5);
assert.equal(pendentes.filter((p) => p.tipo === "magia_adicional").length, 3);
assert.deepEqual(Object.keys(c.progressao.escolhas_por_ranking), ["F", "E", "D", "C", "B", "A", "S", "S+"]);

console.log("test-ruleset-v12-progressao — Âncora de F a S+ validada.");
