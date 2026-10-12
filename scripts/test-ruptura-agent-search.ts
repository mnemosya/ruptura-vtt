import assert from "node:assert/strict";
import { SourceGraph } from "../src/lib/ruptura-agent/graph";
import { SourceSearch, normalizarBusca } from "../src/lib/ruptura-agent/search";
import { criarSnapshot, normalizarBloco } from "../src/lib/ruptura-agent/snapshot";
import type { SourceRole } from "../src/lib/ruptura-agent/types";

const ids = {
  patrulheiro: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  inquisidor: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  exotraje: "cccccccccccccccccccccccccccccccc",
  combate: "dddddddddddddddddddddddddddddddd",
  inventario: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  historico: "ffffffffffffffffffffffffffffffff",
  editorial: "11111111111111111111111111111111",
  design: "22222222222222222222222222222222",
  magias: "33333333333333333333333333333333",
};
let blockIndex = 1;
function block(type: string, text: string, code = false) {
  const id = blockIndex.toString(16).padStart(32, "0"); blockIndex++;
  return normalizarBloco({ id, type, [type]: { rich_text: [{ type: "text", plain_text: text,
    text: { content: text }, annotations: { code } }] } });
}
function make(id: string, title: string, role: SourceRole, path: string[], blocks: ReturnType<typeof block>[]) {
  return criarSnapshot({ notionId: id, sourceType: "page", role, title, path, rootSection: path[0],
    parentNotionId: null, structure: { blocks } });
}

const sources = [
  make(ids.patrulheiro, "PACIFICADOR PATRULHEIRO", "book", ["AMEAÇAS", "CPO", "PACIFICADORES", "PACIFICADOR PATRULHEIRO"],
    [block("heading_3", "AÇÕES CARACTERÍSTICAS"), block("heading_4", "Abrir Ocorrência")]),
  make(ids.inquisidor, "INQUISIDOR BIÓTICO", "book", ["AMEAÇAS", "INQUISIDOR BIÓTICO"],
    [block("heading_3", "AÇÕES CARACTERÍSTICAS: BIÓTICA"), block("heading_4", "Tumor Reativo")]),
  make(ids.exotraje, "EXOTRAJE MOSAICO", "book", ["MERCADO NOTURNO", "EXOTRAJE MOSAICO"],
    [block("paragraph", "Migrar Placas", true)]),
  make(ids.combate, "CENAS DE COMBATE", "book", ["O JOGO EM MOVIMENTO", "CENAS DE COMBATE"],
    [block("heading_3", "Ataque Secundário"), block("paragraph", "Sacar uma arma da mochila requer Interagir.")]),
  make(ids.inventario, "INVENTÁRIO", "book", ["O JOGO EM MOVIMENTO", "INVENTÁRIO"],
    [block("paragraph", "A arma fica equipada ou na mochila."), normalizarBloco({ id: "99999999999999999999999999999999",
      type: "paragraph", paragraph: { rich_text: [{ type: "mention", plain_text: "CENAS DE COMBATE",
        mention: { type: "page", page: { id: ids.combate } } }] } })]),
  make(ids.historico, "CENAS DE COMBATE ALFA", "historical_version", ["VERSÕES ANTERIORES", "ALFA"],
    [block("heading_3", "Ataque Secundário")]),
  make(ids.editorial, "GUIA EDITORIAL", "editorial_guide", ["OUTROS", "GUIA EDITORIAL"],
    [block("paragraph", "Ataque Secundário deve usar code inline.")]),
  make(ids.design, "GUIA DE DESIGN", "design_guide", ["OUTROS", "GUIA DE DESIGN"],
    [block("paragraph", "Ataque Secundário deve manter decisões significativas.")]),
  make(ids.magias, "MAGIAS", "reference", ["OUTROS", "MAGIAS"],
    [block("heading_3", "Tumor Reativo")]),
];

const search = new SourceSearch(sources);
assert.equal(normalizarBusca("Ação Secundária"), "acao secundaria");
for (const [query, expected] of [
  ["Abrir Ocorrência", ids.patrulheiro], ["Tumor Reativo", ids.inquisidor],
  ["Migrar Placas", ids.exotraje], ["Ataque Secundário", ids.combate],
] as const) assert.equal(search.search(query)[0]?.sourceId, expected, query);
assert.deepEqual(search.search("Tumor Reativo")[0]?.headingPath, ["AÇÕES CARACTERÍSTICAS: BIÓTICA", "Tumor Reativo"]);
assert.equal(search.search("tirar arma da mochila").some((hit) => hit.sourceId === ids.combate), true);
assert.equal(search.search("Ataque Secundário").some((hit) => hit.sourceId === ids.historico), false);
assert.equal(search.search("Tumor Reativo").some((hit) => hit.sourceId === ids.magias), false);
assert.equal(search.search("Tumor Reativo", { domain: "all" }).some((hit) => hit.sourceId === ids.magias), true);
assert.equal(search.search("Ataque Secundário", { domain: "historical" })[0]?.sourceId, ids.historico);
assert.equal(search.search("code inline", { domain: "editorial" })[0]?.sourceId, ids.editorial);
assert.equal(search.search("decisões significativas", { domain: "design" })[0]?.sourceId, ids.design);
const graph = new SourceGraph(sources);
assert.deepEqual(graph.outgoingLinks(ids.inventario), [ids.combate]);
assert.deepEqual(graph.incomingLinks(ids.combate), [ids.inventario]);
assert.deepEqual(graph.incomingLinks(ids.inventario), []);
assert.deepEqual(new SourceGraph(sources.map((source) => source.notion_id === ids.combate ? { ...source, active: false } : source))
  .incomingLinks(ids.combate), [ids.inventario]);

console.log("test-ruptura-agent-search — ranking, roles, headings e grafo: OK");
