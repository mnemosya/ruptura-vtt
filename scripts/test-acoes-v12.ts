import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Catálogo da aba Ações (content/v12/db_acoes_v1_2.json), gerado por
 * scripts/dev/v12/gerar_acoes_v12.mjs. Trava as decisões de produto:
 * ações compostas viram uma só, "1/2 PA" é 1 OU 2, requisitos só avisam.
 */

type Custo = { pa?: number; pa_max?: number; reacao?: number; ram?: number; livre?: boolean; proprio?: boolean };
type Acao = {
  slug: string; nome: string; cena: string; grupo: string; tipo: string; custo: Custo; funcao: string;
  teste: { pericias?: string[] | "qualquer"; contra?: string | null } | null;
  requisitos: { tipo: string; aviso: string }[];
  opcoes?: { slug: string; custo: Custo }[];
  rastro?: number; descricao: string;
};

const db = JSON.parse(readFileSync("content/v12/db_acoes_v1_2.json", "utf8")) as { grupos: Record<string, { slug: string }[]>; acoes: Acao[] };
const pericias = new Set((JSON.parse(readFileSync("content/db_regras_personagem_normalizado_v1_4.json", "utf8")).pericias as { id: string }[]).map((p) => p.id));
const acao = (cena: string, slug: string) => {
  const a = db.acoes.find((x) => x.cena === cena && x.slug === slug);
  assert.ok(a, `${cena}:${slug} existe`);
  return a;
};
const slugs = (cena: string, grupo: string) => db.acoes.filter((a) => a.cena === cena && a.grupo === grupo).map((a) => a.slug);

// Grupos com os nomes e a ordem do livro.
assert.deepEqual(slugs("combate", "movimento"), ["deslocar", "levantar", "escapar", "esconder_se", "interagir", "sacar_guardar_trocar", "recarregar"]);
assert.deepEqual(slugs("combate", "ofensiva"), ["atacar", "agarrar", "estrangular", "derrubar", "empurrar", "desarmar", "fintar"]);
assert.deepEqual(slugs("combate", "defensiva"), ["aparar", "bloquear", "esquivar", "resistir"]);
assert.deepEqual(slugs("combate", "diversa"), ["mirar", "acessar_trama", "preparar_turno", "usar_pericia"]);
assert.deepEqual(slugs("combate", "postura"), ["postura_defensiva", "postura_ofensiva"]);
assert.deepEqual(slugs("combate", "livre"), ["falar", "gestos_rapidos"]);
assert.equal(slugs("investigacao", "investigacao").length, 8);
assert.equal(slugs("trama", "protocolo_trilha").length, 9);
assert.equal(slugs("trama", "protocolo_ofensiva").length, 4);
assert.equal(slugs("trama", "comando").length, 10);
for (const [cena, grupos] of Object.entries(db.grupos)) {
  for (const a of db.acoes.filter((x) => x.cena === cena)) assert.ok(grupos.some((g) => g.slug === a.grupo), `${a.slug}: grupo ${a.grupo} declarado em ${cena}`);
}

// Ações compostas: um cartão só, formas em `opcoes`.
assert.deepEqual(acao("combate", "atacar").opcoes!.map((o) => [o.slug, o.custo.pa]), [["corpo_a_corpo", 2], ["distancia", 2], ["secundario", 1]]);
assert.deepEqual(acao("combate", "deslocar").opcoes!.map((o) => o.slug), ["andar", "correr", "manobrar", "saltar_horizontal", "saltar_vertical"]);
assert.ok(!db.acoes.some((a) => ["ataque_corpo_a_corpo", "ataque_distancia", "ataque_secundario", "sacar_rapido", "sacar_dificil"].includes(a.slug)), "sem ações separadas que viraram opções");

// "1/2 PA" no livro = 1 OU 2 PA, escolhido pela opção.
for (const slug of ["sacar_guardar_trocar", "recarregar"]) {
  const a = acao("combate", slug);
  assert.deepEqual([a.custo.pa, a.custo.pa_max], [1, 2], `${slug}: 1 ou 2 PA`);
  assert.deepEqual(a.opcoes!.map((o) => o.custo.pa), [1, 2], `${slug}: uma opção para cada custo`);
}

// Reações custam Reação, não PA.
for (const slug of ["aparar", "bloquear", "esquivar", "resistir"]) assert.deepEqual(acao("combate", slug).custo, { reacao: 1 });

// Trama: PA + RAM; só comandos geram Rastro.
assert.deepEqual(acao("trama", "forcar_rota").custo, { pa: 2, ram: 3 });
assert.deepEqual(acao("trama", "desplugar").custo, { livre: true, ram: 0 });
for (const a of db.acoes.filter((x) => x.cena === "trama")) {
  assert.equal(a.rastro, a.grupo === "comando" ? 1 : 0, `${a.slug}: Rastro`);
  assert.ok(typeof a.custo.ram === "number", `${a.slug}: custo de RAM`);
}
assert.deepEqual(acao("trama", "controlar_unidade").teste?.pericias, ["robotica"]);

// Requisitos só avisam: todo requisito traz a frase do aviso.
for (const a of db.acoes) {
  for (const r of a.requisitos) assert.ok(r.aviso && r.aviso.length > 5, `${a.slug}: requisito ${r.tipo} sem aviso`);
}
assert.equal(acao("combate", "levantar").requisitos[0].aviso, "Você não está Caído");

// Perícias citadas existem; descrições vieram do livro.
for (const a of db.acoes) {
  const lista = [a.teste?.pericias, ...(a.opcoes ?? []).map((o) => (o as { teste?: { pericias?: string[] } }).teste?.pericias)];
  for (const p of lista) if (Array.isArray(p)) for (const id of p) assert.ok(pericias.has(id), `${a.slug}: perícia ${id}`);
  assert.ok(a.descricao.length > 40, `${a.slug}: descrição`);
  assert.ok(!/<\/?(details|summary|span|callout|mention-page|table)/.test(a.descricao), `${a.slug}: marcação do Notion na descrição`);
}

console.log(`acoes v1.2 ok: ${db.acoes.length} ações`);
