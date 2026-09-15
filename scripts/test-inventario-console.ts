/**
 * Teste puro (sem Supabase) da aba Inventário do Console: a regra de
 * CARGA (porte → espaços, capacidade, o que pesa) e o casamento de
 * TERMOS DE REGRA dentro de um texto.
 *
 * Os itens vêm do DB real, não de fixture inventada — o mesmo acordo
 * de `test-inventory.ts`. O glossário do segundo bloco é montado à mão
 * de propósito: ali o que se testa é o ALGORITMO de casamento, e um
 * glossário pequeno e explícito torna cada asserção legível.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeItemContent,
  createInitialCharacter,
  purchaseItem,
  setItemLoadoutState,
  type ItemContent,
} from "../src/lib/character";
import {
  ESPACOS_POR_PORTE,
  capacidadeDeEspacos,
  espacosDoItem,
  ocupaEspaco,
  resumoDeCarga,
} from "../src/lib/character/carga";
import { separarTermos } from "../src/app/ficha/_console/termosDeRegra";
import type { TermoDeRegra } from "../src/app/ficha/_console/types";
import type { CharacterRulesPayload } from "../src/lib/character/types";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

console.log("=== test-inventario-console ===\n");

const db = readJson<{ itens: Record<string, unknown>[] }>("content/db_equipamentos_normalizado_v1_2.json");
const items: ItemContent[] = db.itens.map(normalizeItemContent);
const porSlug = new Map(items.map((i) => [i.slug, i]));

// ── 1. classe_porte é lido do payload real ────────────────────────
const comPorte = items.filter((i) => i.classePorte != null);
assert.ok(comPorte.length >= 50, `classe_porte deve vir do payload real (achados: ${comPorte.length}).`);
const portesVistos = new Set(comPorte.map((i) => i.classePorte));
for (const p of portesVistos) {
  assert.ok(p! in ESPACOS_POR_PORTE, `Porte "${p}" do DB real não tem conversão em ESPACOS_POR_PORTE.`);
}
console.log(`✓ classe_porte lido em ${comPorte.length} itens; portes: ${[...portesVistos].sort().join(", ")}`);

// ── 2. porte → espaços, incluindo o item sem porte ────────────────
const espadaLonga = porSlug.get("espada_longa");
assert.ok(espadaLonga, "Item 'espada_longa' deve existir no DB real.");
assert.equal(espadaLonga!.classePorte, "pesada");
assert.equal(espacosDoItem(espadaLonga), 3);

const espadaCurta = porSlug.get("espada_curta");
assert.equal(espadaCurta!.classePorte, "media");
assert.equal(espacosDoItem(espadaCurta), 2);

const adaga = porSlug.get("adaga");
assert.equal(adaga!.classePorte, "leve");
assert.equal(espacosDoItem(adaga), 1);

// Sem classe_porte declarada o item conta 1 — nunca 0, senão ele seria
// de graça, e nunca um chute maior, que puniria sem regra.
const semPorte = items.find((i) => i.classePorte == null);
assert.ok(semPorte, "O DB real deve ter itens sem classe_porte.");
assert.equal(espacosDoItem(semPorte), 1);
assert.equal(espacosDoItem(undefined), 1);
console.log("✓ porte → espaços: pesada=3, media=2, leve=1, ausente=1");

// ── 3. capacidade: padrão e derivado publicado ────────────────────
const atributos = { corpo: 4, mente: 2, animo: 2 };
assert.equal(capacidadeDeEspacos(atributos, null), 14, "Padrão documentado é 10 + Corpo.");

/* Quando a regra EXISTIR publicada, ela manda — é o ponto todo de
   procurar antes de cair no padrão. Aqui um payload com `espacos_max`
   próprio prova que o padrão sai de cena sozinho. */
const regrasComEspacos = {
  atributos: [],
  pericias: [],
  derivados: [
    { id: "espacos_max", nome: "Espaços", formula: { op: "*", args: [{ ref: "atributo", id: "corpo" }, { const: 5 }] } },
  ],
} as unknown as CharacterRulesPayload;
assert.equal(
  capacidadeDeEspacos(atributos, regrasComEspacos),
  20,
  "Com `espacos_max` publicado, a fórmula do conteúdo deve vencer o padrão.",
);
console.log("✓ capacidade: padrão 10+Corpo, e o derivado publicado vence quando existe");

// ── 4. o que pesa e o que não pesa ────────────────────────────────
assert.equal(ocupaEspaco("mochila"), true);
assert.equal(ocupaEspaco("equipado"), true);
assert.equal(ocupaEspaco("empunhado"), true);
assert.equal(ocupaEspaco("acesso_rapido"), true);
assert.equal(ocupaEspaco("abrigo"), false, "Guardar no abrigo existe justamente para não carregar.");

let personagem = createInitialCharacter(null, "Carregador de Teste");
personagem = {
  ...personagem,
  atributos: { ...personagem.atributos, corpo: 5 },
  carteira: { aretz_informal: 99999, cdi: 0, cdi_craqueada: 0 },
};

for (const slug of ["espada_longa", "espada_curta", "adaga"]) {
  const compra = purchaseItem({
    character: personagem,
    item: porSlug.get(slug)!,
    quantidade: 1,
    walletId: "aretz_informal",
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  assert.ok(compra.character, `Compra de ${slug} deve funcionar.`);
  personagem = compra.character;
}

let carga = resumoDeCarga(personagem, porSlug, null);
assert.equal(carga.capacidade, 15, "Corpo 5 → 15 espaços pelo padrão.");
assert.equal(carga.ocupados, 3 + 2 + 1, "Espada longa + curta + adaga = 6 espaços.");
assert.equal(carga.excedido, false);

// Mandar a espada longa pro abrigo tira os 3 espaços da conta.
const longa = personagem.inventario!.find((i) => i.itemSlug === "espada_longa")!;
personagem = setItemLoadoutState(personagem, longa.id, "abrigo");
carga = resumoDeCarga(personagem, porSlug, null);
assert.equal(carga.ocupados, 3, "No abrigo, a espada longa não pesa mais.");
console.log("✓ carga: soma por porte, e o abrigo não entra na conta");

// Quantidade multiplica.
const adagaInst = personagem.inventario!.find((i) => i.itemSlug === "adaga")!;
personagem = {
  ...personagem,
  inventario: personagem.inventario!.map((i) => (i.id === adagaInst.id ? { ...i, quantidade: 4 } : i)),
};
carga = resumoDeCarga(personagem, porSlug, null);
assert.equal(carga.ocupados, 2 + 4 * 1, "4 adagas leves = 4 espaços.");
console.log("✓ carga: quantidade multiplica o custo do item");

// Excedido é reportado, não impedido — a regra de penalidade não existe.
personagem = {
  ...personagem,
  inventario: personagem.inventario!.map((i) => (i.id === adagaInst.id ? { ...i, quantidade: 40 } : i)),
};
assert.equal(resumoDeCarga(personagem, porSlug, null).excedido, true);
console.log("✓ carga: excedido é reportado");

// ── 5. termos de regra dentro de um texto ─────────────────────────
const glossario: TermoDeRegra[] = [
  { tipo: "acao", slug: "resistir", nome: "Resistir", descricao: "Teste de defesa." },
  { tipo: "condicao", slug: "atordoado", nome: "Atordoado", descricao: "Perde a ação." },
  { tipo: "condicao", slug: "atordoado_em_massa", nome: "Atordoado em massa", descricao: "Vários alvos." },
  { tipo: "acao", slug: "recarregar", nome: "Recarregar", descricao: "Repõe munição." },
];

function grifados(texto: string): string[] {
  return separarTermos(texto, glossario).filter((p) => p.termo).map((p) => p.texto);
}

// O caso do desenho.
assert.deepEqual(
  grifados("Todos em um raio de 3 m fazem teste de Resistir CD 8; em falha, ficam Atordoados."),
  ["Resistir", "Atordoados"],
  "Deve grifar a ação e a condição, inclusive a condição no plural.",
);

// O texto é preservado inteiro, na ordem.
const pedacos = separarTermos("fazem teste de Resistir CD 8", glossario);
assert.equal(pedacos.map((p) => p.texto).join(""), "fazem teste de Resistir CD 8");

// O verbo comum NÃO é a ação — este é o caso real do Colete balístico.
assert.deepEqual(
  grifados("Versão moderna e rígida para resistir a lâminas e disparos."),
  [],
  '"resistir" minúsculo é verbo, não a ação Resistir.',
);
assert.deepEqual(grifados("Serve para recarregar dispositivos leves."), []);

// O termo mais longo ganha do mais curto que é prefixo dele.
assert.deepEqual(
  grifados("Aplica Atordoado em massa aos alvos."),
  ["Atordoado em massa"],
  "O termo maior não pode ser engolido pelo menor.",
);

// Borda com acento: `\\b` quebraria aqui.
assert.deepEqual(grifados("ficam Atordoados até o fim."), ["Atordoados"]);
// E não casa dentro de outra palavra.
assert.deepEqual(grifados("um Resistirnaufrágio qualquer"), []);

// Glossário vazio devolve o texto intacto, sem explodir.
assert.deepEqual(separarTermos("qualquer coisa", []), [{ texto: "qualquer coisa" }]);
console.log("✓ termos: grifa entidade, ignora o verbo comum, respeita acento e o termo mais longo");

console.log("\n=== test-inventario-console OK ===");
