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
  ESPACOS_MOCHILA_BASICA,
  capacidadeDeEspacos,
  espacosDoItem,
  ocupaEspaco,
  resumoDeCarga,
} from "../src/lib/character/carga";
import { separarTermos } from "../src/app/ficha/_console/termosDeRegra";
import type { TermoDeRegra } from "../src/app/ficha/_console/types";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

console.log("=== test-inventario-console ===\n");

const db = readJson<{ itens: Record<string, unknown>[] }>("content/db_equipamentos_normalizado_v1_2.json");
const items: ItemContent[] = db.itens.map(normalizeItemContent);
const porSlug = new Map(items.map((i) => [i.slug, i]));

// ── 1-2. espaços por item: hoje, 1 pra todo mundo ─────────────────
/* `classe_porte` continua sendo lido do payload (é dado real e
   vocabulário canônico M46), mas NÃO é a fonte do custo em espaços:
   porte diz como a arma se maneja, não quanto ela ocupa de mochila.
   Enquanto a regra não existir, todo item conta 1 — e este teste
   existe justamente pra travar isso, pra ninguém reintroduzir uma
   derivação inventada sem perceber. */
const comPorte = items.filter((i) => i.classePorte != null);
assert.ok(comPorte.length >= 50, `classe_porte deve vir do payload real (achados: ${comPorte.length}).`);

for (const slug of ["espada_longa", "espada_curta", "adaga"]) {
  const m = porSlug.get(slug);
  assert.ok(m, `Item '${slug}' deve existir no DB real.`);
  assert.equal(espacosDoItem(m), 1, `Sem regra de espaços publicada, ${slug} conta 1.`);
}
assert.equal(espacosDoItem(undefined), 1, "Item sem modelo também conta 1.");
console.log(`✓ espaços por item: 1 pra todos (classe_porte lido em ${comPorte.length} itens, mas não é a fonte)`);

// ── 3. capacidade: é da MOCHILA, não do personagem ────────────────
/* A básica tem 10. Nenhum item de mochila existe publicado ainda, e o
   único item de armazenamento (Aljava) guarda flecha, não carga geral
   — então hoje todo personagem carrega o básico, independente de
   atributo. Este teste trava isso: se alguém voltar a derivar
   capacidade de Corpo, ele cai. */
{
  const forte = createInitialCharacter(null, "Forte");
  const fraco = createInitialCharacter(null, "Fraco");
  const comCorpo = (c: typeof forte, n: number) => ({ ...c, atributos: { ...c.atributos, corpo: n } });
  assert.equal(capacidadeDeEspacos(comCorpo(forte, 8), porSlug), ESPACOS_MOCHILA_BASICA);
  assert.equal(capacidadeDeEspacos(comCorpo(fraco, 1), porSlug), ESPACOS_MOCHILA_BASICA);
  assert.equal(ESPACOS_MOCHILA_BASICA, 10, "A mochila básica tem 10 espaços.");
}
console.log("✓ capacidade: 10 da mochila básica, e não muda com atributo");

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

let carga = resumoDeCarga(personagem, porSlug);
assert.equal(carga.capacidade, 10, "Mochila básica: 10 espaços.");
assert.equal(carga.ocupados, 3, "Três itens, 1 espaço cada.");
assert.equal(carga.excedido, false);

// Mandar a espada longa pro abrigo tira os 3 espaços da conta.
const longa = personagem.inventario!.find((i) => i.itemSlug === "espada_longa")!;
personagem = setItemLoadoutState(personagem, longa.id, "abrigo");
carga = resumoDeCarga(personagem, porSlug);
assert.equal(carga.ocupados, 2, "No abrigo, a espada longa não pesa mais.");
console.log("✓ carga: soma por porte, e o abrigo não entra na conta");

// Quantidade multiplica.
const adagaInst = personagem.inventario!.find((i) => i.itemSlug === "adaga")!;
personagem = {
  ...personagem,
  inventario: personagem.inventario!.map((i) => (i.id === adagaInst.id ? { ...i, quantidade: 4 } : i)),
};
carga = resumoDeCarga(personagem, porSlug);
assert.equal(carga.ocupados, 1 + 4 * 1, "4 adagas = 4 espaços.");
console.log("✓ carga: quantidade multiplica o custo do item");

// Excedido é reportado, não impedido — a regra de penalidade não existe.
personagem = {
  ...personagem,
  inventario: personagem.inventario!.map((i) => (i.id === adagaInst.id ? { ...i, quantidade: 40 } : i)),
};
assert.equal(resumoDeCarga(personagem, porSlug).excedido, true);
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
