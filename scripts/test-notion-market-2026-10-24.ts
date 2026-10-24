import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeItemContent } from "../src/lib/character/inventory";
import { normalizeCompanionModel } from "../src/lib/character/companionModels";
import { itemCabeNoSlot } from "../src/app/ficha/_console/slots";
import type { ItemContent } from "../src/lib/character";

const items = JSON.parse(readFileSync("content/v12/db_mercado_itens_v1_2.json", "utf8")).itens;
assert.equal(items.length, 280);
const pharmacy = items.filter((item: Record<string, unknown>) => item.categoria === "farmacia").map(normalizeItemContent);
assert.equal(pharmacy.length, 11);
const item = (name: string) => {
  const found = pharmacy.find((value: { nome: string }) => value.nome === name);
  assert(found, name);
  return found;
};
assert.equal(item("Antídoto").preco, 150);
assert.equal(item("Antídoto").cargasMax, 3);
assert.equal(item("Selante Hemostático").cargasMax, 3);
assert.equal(item("Injetor nanocurativo").preco, 500);
assert.equal(item("Injetor nanocurativo").payloadAutomacao.efeitos[0].dado, "3d6");
const adrenalina = item("Injetor de adrenalina").payloadAutomacao.efeitos;
assert.equal(adrenalina[0].duracao, "3_turnos");
assert.equal(adrenalina[1].condicao, "lento");
assert.match(adrenalina[1].nota, /1d4.*ignora MIT/);

const defensivos: ItemContent[] = items.filter((item: { slug: string }) => item.slug.startsWith("armaduras_e_escudos_")).map(normalizeItemContent);
assert.equal(defensivos.length, 29);
assert(defensivos.every((item) =>
  item.categoria === "escudo"
    ? itemCabeNoSlot(item, "arma_secundaria")
    : ["cabeca", "tronco", "membro_superior", "membro_inferior"].some((slot) => itemCabeNoSlot(item, slot as "cabeca"))));
assert(!items.some((item: { slug: string }) => item.slug === "armaduras_e_escudos_capacete_integral"));

const runas = JSON.parse(readFileSync("content/v12/db_mercado_runas_v1_2.json", "utf8")).runas;
assert.equal(runas.length, 38);
assert(!runas.some((runa: { slug: string }) => ["armaduras_e_escudos_escudos_dissipacao", "armaduras_e_escudos_interceptacao"].includes(runa.slug)));
assert(!runas.some((runa: { slug: string }) => runa.slug === "armas_amplificacao"));
assert.match(runas.find((runa: { slug: string }) => runa.slug === "armaduras_e_escudos_blindagem").descricao_curta, /\+3 PD/);
assert.match(runas.find((runa: { slug: string }) => runa.slug === "armaduras_e_escudos_retratil").descricao_longa, /Interagir.*1 PA/);
assert.match(items.find((item: { slug: string }) => item.slug === "mobilidade_baia_de_unidades").descricao_longa, /2 Máquinas Autônomas/);
assert.equal(items.find((item: { slug: string }) => item.slug === "armas_rv_4_shiv_faca").estatisticas.rajada_x, 2);
const claws = items.find((item: { slug: string }) => item.slug === "armas_bb_6_claws_escopeta_curta");
assert.equal(claws.estatisticas.maos, 1);
assert(!claws.descricao_longa.includes("Padrão adaptativo"));

const rawModels = JSON.parse(readFileSync("content/v12/db_mercado_companheiros_v1_2.json", "utf8")).modelos_companheiros;
const models = rawModels.map(normalizeCompanionModel);
assert.equal(models.length, 17);
assert(models.every((model: { paMaximo?: number; acoes: unknown[] }) => model.paMaximo === 3 && model.acoes.length > 0));
assert(models.some((model: { nome: string; categoria: string }) => model.nome === "Ácaro" && model.categoria === "robo"));
assert(models.some((model: { nome: string; categoria: string }) => model.nome === "Harpia" && model.categoria === "drone"));
assert.equal(models.find((model: { nome: string }) => model.nome === "Mantis").acoes.find((acao: { nome: string }) => acao.nome === "APARAR").custoPA, undefined);

console.log("Mercado Notion 24/10: Farmácia, 29 defensivos e 17 Máquinas Autônomas válidos.");
