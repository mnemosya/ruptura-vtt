import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VERTENTES_V12 } from "../src/lib/rulesetV12";
import { canonicalVertenteId, checkSpellVertenteLevel, getVertenteLevel, normalizeSpellContent } from "../src/lib/character";

/**
 * Catálogo de metadados das magias v1.2 e crosswalk preliminar (Fase 6).
 * Nada aqui é publicado: o teste só garante que os arquivos gerados por
 * `scripts/dev/v12/gerar_magias.py` são consistentes entre si.
 */

const dir = join(process.cwd(), "content");
const ler = (f: string) => JSON.parse(readFileSync(join(dir, f), "utf8"));

type Magia = {
  slug: string; nome: string; vertente: string; nivel: number;
  custo_mana: { tipo: string; valor?: number; min?: number; max?: number };
  conjuracao: { tipo: string; pa?: number };
  prerequisito: { pericia?: string; valor?: number; texto: string };
  status_editorial: string;
};
const { magias } = ler("v12/db_magias_v1_2_metadados.json") as { magias: Magia[] };
const legado = ler("db_magias_normalizado_v1_3.json").magias as Array<{ slug: string }>;
const crosswalk = ler("v12/crosswalk_magias_v1_3_para_v1_2.json") as {
  legado: Array<{ legacy_slug: string; canonical_slug: string | null; status: string }>;
  sem_antecessor: Array<{ canonical_slug: string }>;
};
const pericias = new Set((ler("db_regras_personagem_normalizado_v1_4.json").pericias as Array<{ id: string }>).map((p) => p.id));

assert.equal(magias.length, 211);
const slugs = new Set(magias.map((m) => m.slug));
assert.equal(slugs.size, magias.length, "slugs únicos");
for (const m of magias) {
  assert.ok((VERTENTES_V12 as readonly string[]).includes(m.vertente), `${m.slug}: Vertente`);
  assert.ok(m.slug.startsWith(`${m.vertente}_`), `${m.slug}: prefixo da Vertente`);
  assert.ok(Number.isInteger(m.nivel) && m.nivel >= 1 && m.nivel <= 5, `${m.slug}: nível`);
  if (m.custo_mana.tipo === "fixo") assert.ok(m.custo_mana.valor! >= 1, `${m.slug}: Mana`);
  if (m.conjuracao.tipo === "pa") assert.ok(m.conjuracao.pa! >= 1 && m.conjuracao.pa! <= 4, `${m.slug}: PA`);
  if (m.prerequisito.pericia) assert.ok(pericias.has(m.prerequisito.pericia), `${m.slug}: perícia do pré-requisito`);
  assert.notEqual(m.status_editorial, "Aprovado", "nenhuma magia aprovada era esperada; revisar o gerador se mudou");
}
for (const v of VERTENTES_V12) {
  assert.ok(magias.filter((m) => m.vertente === v && m.nivel === 1).length >= 4, `${v}: ao menos quatro magias de nível 1 para a criação`);
}

// Crosswalk: cada magia legada aparece uma vez; tudo ambíguo até revisão.
assert.equal(crosswalk.legado.length, legado.length);
assert.deepEqual(new Set(crosswalk.legado.map((l) => l.legacy_slug)), new Set(legado.map((l) => l.slug)));
for (const l of crosswalk.legado) {
  assert.equal(l.status, "ambiguous", `${l.legacy_slug}: igualdade de nome não basta (§7.2)`);
  if (l.canonical_slug) assert.ok(slugs.has(l.canonical_slug), `${l.legacy_slug}: candidato existe`);
}
const cobertas = new Set([...crosswalk.legado.map((l) => l.canonical_slug).filter(Boolean), ...crosswalk.sem_antecessor.map((s) => s.canonical_slug)]);
assert.equal(cobertas.size, magias.length, "toda magia v1.2 aparece no crosswalk");

// Alias temporário somatica → biotica: ficha v1.2 (biotica) lê magia legada (somatica) e vice-versa.
assert.equal(canonicalVertenteId("somatica"), "biotica");
assert.equal(canonicalVertenteId("cinetica"), "cinetica");
assert.equal(getVertenteLevel({ niveis_vertente: { biotica: 2 } }, "somatica"), 2, "v2 lê magia legada de Somática.");
assert.equal(getVertenteLevel({ niveis_vertente: { somatica: 3 } }, "biotica"), 3, "ficha antiga continua lida.");
assert.equal(getVertenteLevel({ niveis_vertente: {} }, "somatica"), null, "sem nível continua desconhecido.");
const legadaSomatica = legado.find((m) => (m as unknown as { vertente: string }).vertente === "somatica") as unknown as Record<string, unknown>;
const spellLegada = normalizeSpellContent(legadaSomatica);
assert.equal(checkSpellVertenteLevel(spellLegada, { niveis_vertente: { biotica: 5 } }).vertenteLevel, 5);

console.log(`test-ruleset-v12-magias — ${magias.length} magias v1.2; crosswalk com ${crosswalk.legado.length} legadas.`);
