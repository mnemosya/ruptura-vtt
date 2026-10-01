import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildCharacterV2,
  validateRulesetContentBundleV12,
  VERTENTES_V12,
  type ClassContentV12,
  type CreationContextV12,
  type RulesetContentBundleV12,
} from "../src/lib/rulesetV12";
import { characterDerivedFormulas, computeDerivedStats } from "../src/lib/character";

/**
 * Valida todos os pacotes de Classe v1.2 (content/v12/db_classe_*.json):
 * contrato, perícias do catálogo, perfis preenchíveis, sinergia nas seis
 * Vertentes e unicidade de slugs entre pacotes (o seed publica todos
 * juntos, então Subclasses e características não podem colidir).
 */
const dir = join(process.cwd(), "content", "v12");
const rules = JSON.parse(readFileSync(join(process.cwd(), "content", "db_regras_personagem_normalizado_v1_4.json"), "utf8")) as { pericias: Array<{ id: string }> };
const catalogo = new Set(rules.pericias.map((p) => p.id));
const arquivos = readdirSync(dir).filter((f) => /^db_classe_.*_v1_2\.json$/.test(f)).sort();
assert.ok(arquivos.length > 0, "nenhum pacote de Classe encontrado");

const slugsClasse = new Set<string>();
const slugsSubclasse = new Set<string>();
let totalSubclasses = 0;

for (const arquivo of arquivos) {
  const bundle = JSON.parse(readFileSync(join(dir, arquivo), "utf8")) as RulesetContentBundleV12;
  const v = validateRulesetContentBundleV12(bundle);
  assert.equal(v.ok, true, `${arquivo}:\n${v.errors.join("\n")}`);

  for (const classe of bundle.classes) {
    assert.ok(!slugsClasse.has(classe.slug), `Classe duplicada entre pacotes: ${classe.slug}`);
    slugsClasse.add(classe.slug);
    const c = classe.criacao;
    for (const slug of [...c.pericias_valor_3, ...c.pericias_valor_2]) assert.ok(catalogo.has(slug), `${classe.slug}: perícia desconhecida "${slug}"`);
    for (const p of c.perfis_pericias) {
      const { valor_1, valor_2, valor_3 } = p.quantidades;
      assert.ok(valor_3 <= c.pericias_valor_3.length, `${classe.slug}/${p.slug}: opções de valor 3 insuficientes`);
      assert.ok(valor_2 <= c.pericias_valor_2.length, `${classe.slug}/${p.slug}: opções de valor 2 insuficientes`);
      assert.ok(valor_1 + valor_2 + valor_3 <= catalogo.size, `${classe.slug}/${p.slug}: perfil excede o catálogo`);
    }
    assert.deepEqual(Object.keys(c.sinergia_vertentes ?? {}).sort(), [...VERTENTES_V12].sort(), `${classe.slug}: sinergia precisa cobrir as seis Vertentes`);
    for (const id of ["pv", "pe", "mana", "integridade", "reacoes", "andar", "correr"]) assert.ok(c.recursos[id], `${classe.slug}: recurso "${id}" ausente`);
  }
  for (const sub of bundle.subclasses) {
    assert.ok(!slugsSubclasse.has(sub.slug), `Subclasse duplicada entre pacotes: ${sub.slug}`);
    slugsSubclasse.add(sub.slug);
    totalSubclasses++;
  }
  console.log(`ok ${arquivo}: ${bundle.classes.map((c) => c.nome).join(", ")} + ${bundle.subclasses.length} Subclasses`);
}

// Cada Classe precisa ser criável no Ranking F com cada perfil de perícias.
const traj = JSON.parse(readFileSync(join(dir, "db_trajetoria_v1_2.json"), "utf8")) as RulesetContentBundleV12;
const regrasGerais = JSON.parse(readFileSync(join(process.cwd(), "content", "db_regras_personagem_normalizado_v1_4.json"), "utf8"));
const classes: ClassContentV12[] = arquivos.flatMap((a) => (JSON.parse(readFileSync(join(dir, a), "utf8")) as RulesetContentBundleV12).classes);
for (const classe of classes) {
  const ctx: CreationContextV12 = {
    classe,
    pericias: [...catalogo],
    vertentes: [...VERTENTES_V12],
    itens: new Map(),
    trajetoria: {
      antecedentes: new Map(traj.backgrounds.map((b) => [b.slug, b])),
      qualidades: new Map(traj.qualities.map((q) => [q.slug, q])),
      complicacoes: new Map(traj.complications.map((c) => [c.slug, c])),
    },
  };
  for (const perfil of classe.criacao.perfis_pericias) {
    const usados = new Set<string>();
    const pegar = (lista: string[], n: number) => lista.filter((s) => !usados.has(s)).slice(0, n).map((s) => (usados.add(s), s));
    const valor_3 = pegar(classe.criacao.pericias_valor_3, perfil.quantidades.valor_3);
    const valor_2 = pegar(classe.criacao.pericias_valor_2, perfil.quantidades.valor_2);
    const valor_1 = pegar([...catalogo], perfil.quantidades.valor_1);
    const r = buildCharacterV2({
      nome: `Teste ${classe.nome}`, classe_id: classe.slug, perfil_atributos: "especializada", atributos: { corpo: 3, mente: 1, animo: 0 },
      perfil_pericias: perfil.slug, pericias: { valor_3, valor_2, valor_1 }, vertente_primaria: "material",
      trajetoria: {
        regiao_id: "vastra", local_origem: "Vosek", idiomas: ["vastrano"],
        antecedente: { antecedente_id: "academico", meio: "m", papel: "p", relacao_atual: "r" },
        transformacao_refratario: { estopim: "e", primeiros_passos: "p", consequencia: "c" },
        rpi_forjado: { nivel: 1, nome_registrado: "n", ocupacao_declarada: "o", origem: "o" },
        qualidades: [{ quality_id: "aliado", pontos: 2, detalhes: {} }, { quality_id: "contato", pontos: 1, detalhes: {} }],
        complicacoes: [{ complication_id: "desertor", pontos: 2, detalhes: {} }],
      },
      compras: [],
    }, ctx);
    assert.equal(r.ok, true, `${classe.slug}/${perfil.slug}: ${r.ok ? "" : r.errors.join(" | ")}`);
    if (r.ok) {
      const d = computeDerivedStats(r.character.atributos, regrasGerais, 0, characterDerivedFormulas(r.character));
      assert.equal(d.pv_max, r.character.recursos_atuais?.pv, `${classe.slug}: PV máximo da ficha difere do inicial`);
      assert.equal(d.pa_max, 3, `${classe.slug}: PA no Ranking F`);
    }
  }
  console.log(`ok criação de ${classe.nome} (${classe.criacao.perfis_pericias.length} perfis)`);
}

console.log(`test-ruleset-v12-classes — ${slugsClasse.size} Classe(s), ${totalSubclasses} Subclasse(s) válidas e criáveis.`);
