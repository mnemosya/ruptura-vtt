import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateRulesetContentBundleV12, type RulesetContentBundleV12 } from "../src/lib/rulesetV12";

const root = join(process.cwd(), "content");
const bundle = JSON.parse(readFileSync(join(root, "v12", "db_classe_ancora_v1_2.json"), "utf8")) as RulesetContentBundleV12;
const rules = JSON.parse(readFileSync(join(root, "db_regras_personagem_normalizado_v1_4.json"), "utf8")) as {
  pericias: Array<{ id: string }> | Record<string, unknown>;
};

const validation = validateRulesetContentBundleV12(bundle);
assert.equal(validation.ok, true, validation.errors.join("\n"));

const ancora = bundle.classes.find((entry) => entry.slug === "ancora");
assert.ok(ancora, "Classe Âncora ausente");

// Perícias citadas precisam existir no catálogo (inclui Medicina).
const skillIds = new Set(Array.isArray(rules.pericias) ? rules.pericias.map((entry) => entry.id) : Object.keys(rules.pericias));
assert.ok(skillIds.has("medicina"), "Medicina precisa estar no catálogo de perícias");
for (const slug of [...ancora.criacao.pericias_valor_3, ...ancora.criacao.pericias_valor_2]) {
  assert.ok(skillIds.has(slug), `Perícia desconhecida no perfil da Âncora: ${slug}`);
}

// Cada perfil precisa ser preenchível: as listas comportam as escolhas e o total cabe no catálogo.
for (const profile of ancora.criacao.perfis_pericias) {
  const { valor_1, valor_2, valor_3 } = profile.quantidades;
  assert.ok(valor_3 <= ancora.criacao.pericias_valor_3.length, `${profile.slug}: opções de valor 3 insuficientes`);
  const valor2Pool = new Set([...ancora.criacao.pericias_valor_2]);
  assert.ok(valor_2 <= valor2Pool.size - Math.min(valor_3, valor2Pool.size), `${profile.slug}: opções de valor 2 insuficientes`);
  assert.ok(valor_1 + valor_2 + valor_3 <= skillIds.size, `${profile.slug}: perfil excede o catálogo`);
}
const totals = Object.fromEntries(ancora.criacao.perfis_pericias.map((p) => [p.slug, p.quantidades.valor_1 + p.quantidades.valor_2 * 2 + p.quantidades.valor_3 * 3]));
assert.deepEqual(totals, { abrangente: 21, padrao: 19, especializado: 17 }, "Totais editoriais dos perfis de perícia");

// Fórmulas de recursos reproduzem o texto editorial.
const resolve = (key: string, attrs: Record<"corpo" | "mente" | "animo", number>) => {
  const formula = ancora.criacao.recursos[key];
  assert.ok(formula, `Recurso ausente: ${key}`);
  return formula.constante + (formula.atributo ? attrs[formula.atributo] * (formula.multiplicador_atributo ?? 1) : 0);
};
const attrs = { corpo: 2, mente: 1, animo: 0 };
assert.equal(resolve("pv", attrs), 12);
assert.equal(resolve("pe", attrs), 14);
assert.equal(resolve("mana", attrs), 12);
assert.equal(resolve("andar", attrs), 12);
assert.equal(resolve("correr", attrs), 24);
assert.equal(resolve("reacoes", attrs), 2);
assert.equal(resolve("integridade", { corpo: 0, mente: 1, animo: 3 }), 16);

// Vertentes usam o ID canônico v1.2 (biotica), nunca o legado somatica.
assert.deepEqual(Object.keys(ancora.criacao.sinergia_vertentes ?? {}).sort(), ["biotica", "cinetica", "cognitiva", "energetica", "material", "sinaptica"]);

// Focos e Intervenções por Ranking seguem a tabela da Classe.
assert.deepEqual(
  Object.values(ancora.progressao).map((p) => [p.ranking, p.mudancas_recursos_classe?.focos, p.mudancas_recursos_classe?.intervencoes_por_rodada]),
  [["F", 1, 1], ["E", 1, 1], ["D", 2, 1], ["C", 2, 1], ["B", 3, 2], ["A", 3, 2], ["S", "todos_aliados_proximos", 3], ["S+", "todos_aliados_proximos", 3]],
);

assert.equal(ancora.criacao.equipamento_inicial.aretz, 3000);
assert.equal(ancora.criacao.equipamento_inicial.espacos_mochila, 10);

console.log("test-ruleset-v12-ancora — conteúdo canônico da Âncora válido.");
