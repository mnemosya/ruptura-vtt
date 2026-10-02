import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildCharacterV2,
  VERTENTES_V12,
  type CreationChoicesV12,
  type CreationContextV12,
  type RulesetContentBundleV12,
} from "../src/lib/rulesetV12";
import { characterDerivedFormulas, computeDerivedStats, normalizeCharacter } from "../src/lib/character";

const root = join(process.cwd(), "content");
const bundle = JSON.parse(readFileSync(join(root, "v12", "db_classe_ancora_v1_2.json"), "utf8")) as RulesetContentBundleV12;
const traj = JSON.parse(readFileSync(join(root, "v12", "db_trajetoria_v1_2.json"), "utf8")) as RulesetContentBundleV12;
const rules = JSON.parse(readFileSync(join(root, "db_regras_personagem_normalizado_v1_4.json"), "utf8")) as { pericias: Array<{ id: string }> };

let seq = 0;
const ctx: CreationContextV12 = {
  classe: bundle.classes[0],
  pericias: rules.pericias.map((p) => p.id),
  vertentes: [...VERTENTES_V12],
  itens: new Map([["medkit", { slug: "medkit", nome: "Medkit", categoria: "farmacia", preco: 200 }]]),
  trajetoria: {
    antecedentes: new Map(traj.backgrounds.map((b) => [b.slug, b])),
    qualidades: new Map(traj.qualities.map((q) => [q.slug, q])),
    complicacoes: new Map(traj.complications.map((c) => [c.slug, c])),
  },
  agora: () => "2026-10-01T00:00:00.000Z",
  novoId: () => `inst-${++seq}`,
};

const base: CreationChoicesV12 = {
  nome: "  Ilsa Varn ",
  classe_id: "ancora",
  perfil_atributos: "equilibrada",
  atributos: { corpo: 1, mente: 2, animo: 1 },
  perfil_pericias: "padrao",
  pericias: {
    valor_3: ["medicina", "psicologia"],
    valor_2: ["biologia", "percepcao", "vontade", "arcanismo"],
    valor_1: ["influencia", "logica", "mobilidade", "reflexos", "vigor"],
  },
  vertente_primaria: "biotica",
  trajetoria: {
    regiao_id: "vastra",
    local_origem: "Vosek",
    idiomas: ["vastrano"],
    antecedente: { antecedente_id: "academico", meio: "Universidade", papel: "Pesquisadora", relacao_atual: "Afastada" },
    transformacao_refratario: { estopim: "Fuga", primeiros_passos: "Contato", consequencia: "Perdeu o cargo" },
    rpi_forjado: { nivel: 1, nome_registrado: "Ilse Varnek", ocupacao_declarada: "Técnica", origem: "Mercado Noturno" },
    qualidades: [{ quality_id: "aliado", pontos: 2, detalhes: {} }, { quality_id: "contato", pontos: 1, detalhes: {} }],
    complicacoes: [{ complication_id: "desertor", pontos: 2, detalhes: {} }],
  },
  compras: [{ itemSlug: "medkit", quantidade: 2 }],
};

// Caso válido: payload v2 montado inteiramente no servidor.
const ok = buildCharacterV2(base, ctx);
assert.equal(ok.ok, true, ok.ok ? "" : ok.errors.join("\n"));
if (ok.ok) {
  const c = ok.character;
  assert.equal(c.schema_version, 2);
  assert.equal(c.ruleset_version, "1.2");
  assert.equal(c.nome, "Ilsa Varn");
  assert.deepEqual(c.recursos_atuais, { pv: 11, pe: 15, mana: 14, integridade: 12 }, "fórmulas da Âncora");
  assert.equal(c.pericias.medicina, 3);
  assert.equal(c.pericias.biologia, 2);
  assert.equal(c.pericias.vigor, 1);
  assert.equal(c.pericias.luta, 0, "perícias não escolhidas ficam em 0");
  assert.equal(Object.keys(c.pericias).length, rules.pericias.length);
  assert.deepEqual(c.carteira, { aretz_informal: 2600, cdi: 0, cdi_craqueada: 0 });
  assert.equal(c.inventario?.[0].precoPago, 400);
  assert.deepEqual(c.magia, {
    vertente_primaria: "biotica",
    niveis_vertente: { biotica: 1 },
    magias_aprendidas: [],
    escolhas_pendentes: [{ tipo: "magias_nivel_vertente", vertente: "biotica", nivel: 1, origem: "Criação" }],
  });
  assert.deepEqual(c.niveis_vertente, { biotica: 1 });
  assert.equal(c.progressao.classe_id, "ancora");
  assert.equal(c.progressao.ranking, "F");
  assert.deepEqual(c.progressao.escolhas_por_ranking, { F: { perfil_atributos: "equilibrada", perfil_pericias: "padrao" } });
  assert.equal(c.progressao.formulas_derivados_texto?.pe_max, "13 + Mente");

  // A ficha calcula os máximos pela Classe, não pelas regras genéricas (PE 10 + Mente).
  const regrasGerais = JSON.parse(readFileSync(join(root, "db_regras_personagem_normalizado_v1_4.json"), "utf8"));
  const genericos = computeDerivedStats(c.atributos, regrasGerais);
  const daClasse = computeDerivedStats(c.atributos, regrasGerais, 0, characterDerivedFormulas(c));
  assert.equal(genericos.pe_max, 12, "regra genérica: 10 + Mente");
  assert.deepEqual(
    { pv: daClasse.pv_max, pe: daClasse.pe_max, mana: daClasse.mana_max, integridade: daClasse.integridade_max },
    c.recursos_atuais,
    "personagem novo nasce com recursos cheios pela Classe",
  );
  assert.deepEqual(
    { reacoes: daClasse.reacoes_por_rodada, andar: daClasse.andar_m, correr: daClasse.correr_m, pa: daClasse.pa_max },
    { reacoes: 3, andar: 11, correr: 22, pa: 3 },
  );
  // A normalização preserva as fórmulas e não rebaixa recursos ao máximo genérico.
  const normalizado = normalizeCharacter(structuredClone(c));
  assert.equal(normalizado.recursos_atuais?.pe, 15);
  assert.deepEqual(characterDerivedFormulas(normalizado), characterDerivedFormulas(c));
  // Fórmula malformada ou com referência a outro derivado é ignorada.
  assert.equal(characterDerivedFormulas({ progressao: { formulas_derivados: { pv_max: { ref: "derivado", id: "pv_max" } } } }), undefined);
}

const falha = (choices: Partial<CreationChoicesV12>, trecho: string, msg: string) => {
  const r = buildCharacterV2({ ...base, ...choices }, ctx);
  assert.equal(r.ok, false, msg);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes(trecho)), `${msg}: ${r.errors.join(" | ")}`);
};

falha({ atributos: { corpo: 2, mente: 2, animo: 1 } }, "atributos", "distribuição fora do perfil");
falha({ perfil_atributos: "point_buy" }, "perfil_atributos", "perfil inexistente");
falha({ pericias: { ...base.pericias, valor_3: ["medicina", "luta"] } }, "valor_3", "luta não é opção de valor 3");
falha({ pericias: { ...base.pericias, valor_1: base.pericias.valor_1.slice(1) } }, "valor_1", "quantidade do perfil");
falha({ pericias: { ...base.pericias, valor_1: [...base.pericias.valor_1.slice(1), "medicina"] } }, "única seleção", "perícia repetida");
falha({ pericias: { ...base.pericias, valor_1: [...base.pericias.valor_1.slice(1), "hacking"] } }, "desconhecida", "perícia forjada");
falha({ vertente_primaria: "somatica" }, "vertente_primaria", "ID legado não é aceito");
falha({ compras: [{ itemSlug: "medkit", quantidade: 16 }] }, "orçamento", "Ⱥ 3.200 excede Ⱥ 3.000");
falha({ compras: [{ itemSlug: "lanca_relampago", quantidade: 1 }] }, "inexistente", "item não publicado");
falha({ classe_id: "vanguarda" }, "classe_id", "Classe diferente do documento");
falha({ trajetoria: { ...base.trajetoria, complicacoes: [] } }, "complicacoes", "orçamento de Complicações");
falha({ trajetoria: { ...base.trajetoria, regiao_id: "atlantida" } }, "regiao_id", "região fora do Império");
falha({ trajetoria: { ...base.trajetoria, antecedente: { ...base.trajetoria.antecedente, antecedente_id: "astronauta" } } }, "Antecedente inexistente", "Antecedente não publicado");
falha({ trajetoria: { ...base.trajetoria, qualidades: [{ quality_id: "aliado", pontos: 1, detalhes: {} }, { quality_id: "contato", pontos: 1, detalhes: {} }, { quality_id: "arquivo", pontos: 1, detalhes: {} }] } }, "custa 2", "Aliado só custa 2");

// Repetição: Contato é repetível; Arquivo não.
const repete = (quality_id: string) => buildCharacterV2({ ...base, trajetoria: { ...base.trajetoria, qualidades: [1, 2, 3].map(() => ({ quality_id, pontos: 1 as const, detalhes: {} })) } }, ctx);
assert.equal(repete("contato").ok, true, "Contato pode ser escolhido três vezes");
assert.equal(repete("arquivo").ok, false, "Arquivo não é repetível");

// Complicações adicionais (acordo do grupo) são aceitas acima de 2 pontos.
assert.equal(buildCharacterV2({ ...base, trajetoria: { ...base.trajetoria, complicacoes: [{ complication_id: "desertor", pontos: 2, detalhes: {} }, { complication_id: "fobia", pontos: 1, detalhes: {} }] } }, ctx).ok, true);

// Recursos (2 pontos) eleva o Ⱥ inicial para 6.000.
const rico = buildCharacterV2({
  ...base,
  trajetoria: { ...base.trajetoria, qualidades: [{ quality_id: "recursos", pontos: 2, detalhes: {} }, { quality_id: "contato", pontos: 1, detalhes: {} }] },
  compras: [{ itemSlug: "medkit", quantidade: 16 }],
}, ctx);
assert.equal(rico.ok, true, rico.ok ? "" : rico.errors.join(" | "));
if (rico.ok) assert.equal(rico.character.carteira?.aretz_informal, 6000 - 3200);

console.log("test-ruleset-v12-criacao — criação da Âncora validada.");
