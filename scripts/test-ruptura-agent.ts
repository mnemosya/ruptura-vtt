import assert from "node:assert/strict";
import { criarClienteNotion } from "../src/lib/compendio/notion";
import { criarTransporteNotion } from "../src/lib/compendio/notionTransport";
import { classificarFonte } from "../src/lib/ruptura-agent/config";
import { rastrearCorpus } from "../src/lib/ruptura-agent/crawler";
import { criarLeitorNotionAgent } from "../src/lib/ruptura-agent/notion";
import { criarSnapshot, normalizarBloco } from "../src/lib/ruptura-agent/snapshot";
import type { AgentNotionReader, NotionBlock, NotionObject } from "../src/lib/ruptura-agent/types";

const rich = (plain_text: string, annotations: Record<string, unknown> = {}) => ({ type: "text", plain_text, text: { content: plain_text }, annotations });
const block = (id: string, type: string, data: Record<string, unknown> = {}, has_children = false): NotionBlock => ({ id, type, has_children, [type]: data });
const title = (name: string) => ({ Nome: { id: "title", type: "title", title: [rich(name)] } });
const page = (id: string, name: string, properties: Record<string, Record<string, unknown>> = title(name)): NotionObject => ({ id, last_edited_time: "2026-10-01T10:00:00.000Z", properties });

const pages = new Map<string, NotionObject>([
  ["root", page("root", "RUPTURA (1.2)")],
  ["cap17", page("cap17", "17. MAGIA E VERTENTES")],
  ["cap28", page("cap28", "28. AMEAÇAS E ANTAGONISTAS")],
  ["cpo", page("cpo", "CPO")],
  ["cap25", page("cap25", "25. MERCADO NOTURNO")],
  ["armor", page("armor", "ARMADURAS E ESCUDOS")],
  ["patch", page("patch", "PATCH 1.2")],
  ["old", page("old", "RUPTURA Alfa")],
  ["editorial", page("editorial", "GUIA EDITORIAL")],
  ["design", page("design", "GUIA DE DESIGN")],
  ["bio", page("bio", "BIÓTICA", {
    ...title("BIÓTICA"),
    Dificuldade: { id: "difficulty", type: "select", select: { id: "s1", name: "Média", color: "yellow" } },
    Temas: { id: "themes", type: "multi_select", multi_select: [{ id: "m1", name: "Cura", color: "green" }, { id: "m2", name: "Corpo", color: "blue" }] },
  })],
  ["alt", page("alt", "VERTENTE ALTERNATIVA")],
  ["patrol", page("patrol", "PACIFICADOR PATRULHEIRO")],
  ["spell", page("spell", "MAGIA EM BANCO")],
]);

const blocks = new Map<string, NotionBlock[]>([
  ["root", [
    block("h1", "heading_3", { rich_text: [rich("SOB A SOMBRA DO IMPÉRIO CENTRAL")] }),
    block("cap17", "child_page", { title: "17. MAGIA E VERTENTES" }),
    block("cap28", "child_page", { title: "28. AMEAÇAS E ANTAGONISTAS" }),
    block("h2", "heading_3", { rich_text: [rich("O JOGO EM MOVIMENTO")] }),
    block("cap25", "child_page", { title: "25. MERCADO NOTURNO" }),
    block("h3", "heading_3", { rich_text: [rich("PATCH NOTES")] }),
    block("patch", "child_page", { title: "PATCH 1.2" }),
    block("h4", "heading_3", { rich_text: [rich("VERSÕES ANTERIORES")] }),
    block("old", "child_page", { title: "RUPTURA Alfa" }),
    block("h5", "heading_3", { rich_text: [rich("OUTROS")] }),
    block("editorial", "child_page", { title: "GUIA EDITORIAL" }),
    block("design", "child_page", { title: "GUIA DE DESIGN" }),
    block("dbMagias", "child_database", { title: "MAGIAS" }),
  ]],
  ["cap17", [
    block("dbVert", "child_database", { title: "VERTENTES" }),
    block("t1", "toggle", { rich_text: [rich("SOBRECARGA")] }, true),
  ]],
  ["t1", [block("p1", "paragraph", { rich_text: [rich("Use "), rich("1 PA", { code: true, bold: true }), rich(" aqui.")] })]],
  ["cap28", [block("cpo", "child_page", { title: "CPO" })]],
  ["cpo", [block("dbThreat", "child_database", { title: "PACIFICADORES" })]],
  ["cap25", [block("armor", "child_page", { title: "ARMADURAS E ESCUDOS" })]],
  ["armor", [block("img", "image", { type: "file", file: { url: "https://s3.notion.example/img?expires=1", expiry_time: "2026-10-01" }, caption: [rich("Exotraje Mosaico")] })]],
  ["bio", [block("bio-p", "paragraph", { rich_text: [rich("Lista canônica de magias da BIÓTICA")] })]],
  ["patrol", [block("patrol-h", "heading_3", { rich_text: [rich("Abrir Ocorrência")] })]],
  ["spell", [block("spell-p", "paragraph", { rich_text: [rich("Referência não canônica")] })]],
]);

const databases = new Map<string, NotionObject>([
  ["dbVert", { id: "dbVert", title: [rich("VERTENTES")], data_sources: [{ id: "dsVert", name: "VERTENTES" }, { id: "dsAlt", name: "ALTERNATIVAS" }] }],
  ["dbThreat", { id: "dbThreat", title: [rich("PACIFICADORES")], data_sources: [{ id: "dsThreat", name: "PACIFICADORES" }] }],
  ["dbMagias", { id: "dbMagias", title: [rich("MAGIAS")], data_sources: [{ id: "dsMagias", name: "MAGIAS" }] }],
]);

const rows = new Map<string, NotionObject[]>([
  ["dsVert", [pages.get("bio")!]], ["dsAlt", [pages.get("alt")!]], ["dsThreat", [pages.get("patrol")!]], ["dsMagias", [pages.get("spell")!]],
]);

function fixture() {
  const calls = { blocks: new Map<string, number>(), rows: new Map<string, number>() };
  const reader: AgentNotionReader = {
    async page(id) { const p = pages.get(id); if (!p) throw new Error(`page ${id}`); return p; },
    async database(id) { const db = [...databases].find(([key]) => key.toLowerCase() === id.toLowerCase())?.[1]; if (!db) throw new Error(`database ${id}`); return db; },
    async dataSource(id) { return { id, properties: { Nome: { type: "title" }, Temas: { type: "multi_select" } } }; },
    async blockChildren(id) { calls.blocks.set(id, (calls.blocks.get(id) ?? 0) + 1); return [...blocks].find(([key]) => key.toLowerCase() === id.toLowerCase())?.[1] ?? []; },
    async rows(id) { calls.rows.set(id, (calls.rows.get(id) ?? 0) + 1); return rows.get(id) ?? []; },
    requisicoes: () => [...calls.blocks.values()].reduce((a, b) => a + b, 0) + [...calls.rows.values()].reduce((a, b) => a + b, 0),
  };
  return { calls, reader };
}

const { calls, reader } = fixture();
const first = await rastrearCorpus(reader, new Map(), "root");
const byId = new Map(first.sources.map((s) => [s.notion_id, s]));
assert.equal(first.sources.length, 21, "raiz, páginas, databases, múltiplos data sources e rows são fontes separadas");
assert.equal(byId.get("bio")?.source_type, "database_row");
assert.equal(byId.get("bio")?.role, "book");
assert.deepEqual(byId.get("alt")?.path.slice(-3), ["VERTENTES", "ALTERNATIVAS", "VERTENTE ALTERNATIVA"], "múltiplos data sources mantêm paths distintos");
assert.equal(byId.get("spell")?.role, "reference", "database MAGIAS não substitui a Vertente");
assert.equal(byId.get("old")?.role, "historical_version");
assert.equal(byId.get("patch")?.role, "patch_notes");
assert.equal(byId.get("editorial")?.role, "editorial_guide");
assert.equal(byId.get("design")?.role, "design_guide");
assert.deepEqual(byId.get("patrol")?.path, ["RUPTURA (1.2)", "SOB A SOMBRA DO IMPÉRIO CENTRAL", "28. AMEAÇAS E ANTAGONISTAS", "CPO", "PACIFICADORES", "PACIFICADOR PATRULHEIRO"]);
assert.deepEqual((byId.get("bio")?.properties as Record<string, unknown>).Temas, pages.get("bio")!.properties!.Temas, "multi_select é preservado");
assert.match(byId.get("cap17")!.plain_text, /Use 1 PA aqui\./, "rich text conserva frases entre segmentos");
const toggle = byId.get("cap17")!.structure.blocks![1];
assert.equal(((toggle.children[0].data as { rich_text: { annotations: { code: boolean; bold: boolean } }[] }).rich_text[1]).annotations.code, true);

const before = calls.blocks.get("bio") ?? 0;
const novaRow = page("newBio", "NOVA VERTENTE");
pages.set("newBio", novaRow);
rows.get("dsVert")!.push(novaRow);
const second = await rastrearCorpus(reader, byId, "root");
assert.ok(second.reused > 0, "páginas sem nova revision reaproveitam snapshot");
assert.equal(calls.blocks.get("bio") ?? 0, before, "row inalterada não relê blocos");
assert.equal(calls.rows.get("dsVert"), 2, "data source é enumerado em toda rodada");
assert.ok(second.sources.some((source) => source.notion_id === "newbio"), "row nova é descoberta mesmo com database inalterada");

const original = normalizarBloco(block("image", "image", { type: "file", file: { url: "https://s3/img?expires=1", expiry_time: "1" }, caption: [rich("Imagem")] }));
const renovado = normalizarBloco(block("image", "image", { type: "file", file: { url: "https://s3/img?expires=2", expiry_time: "2" }, caption: [rich("Imagem")] }));
const trocado = normalizarBloco(block("image", "image", { type: "file", file: { url: "https://s3/other-img?expires=2", expiry_time: "2" }, caption: [rich("Imagem")] }));
const make = (b: typeof original) => criarSnapshot({ notionId: "x", sourceType: "page", role: "book", title: "X", path: ["X"], rootSection: null, parentNotionId: null, structure: { blocks: [b] } });
assert.equal(make(original).snapshot_hash, make(renovado).snapshot_hash, "URL assinada não altera hash");
assert.notEqual(make(original).snapshot_hash, make(trocado).snapshot_hash, "trocar o arquivo altera o snapshot sem guardar URL assinada");
const plain = normalizarBloco(block("p", "paragraph", { rich_text: [rich("Percepção")] }));
const coded = normalizarBloco(block("p", "paragraph", { rich_text: [rich("Percepção", { code: true })] }));
assert.equal(make(plain).content_hash, make(coded).content_hash);
assert.notEqual(make(plain).structure_hash, make(coded).structure_hash, "code inline altera hash estrutural");
const schemaSnapshot = (name: string) => criarSnapshot({ notionId: "db", sourceType: "database", role: "book", title: "DB", path: ["DB"], rootSection: null, parentNotionId: null, structure: { dataSources: [{ id: "ds", name }] } });
assert.notEqual(schemaSnapshot("A").snapshot_hash, schemaSnapshot("B").snapshot_hash, "renomear data source altera snapshot do database");
const mention = normalizarBloco(block("m", "paragraph", { rich_text: [{ type: "mention", plain_text: "BIÓTICA", href: "https://notion.so/bio", mention: { type: "page", page: { id: "bio" } }, annotations: { color: "red_background" } }] }));
assert.equal(((mention.data as { rich_text: { mention: { page: { id: string } }; annotations: { color: string }; href: string }[] }).rich_text[0]).mention.page.id, "bio");
assert.equal(((mention.data as { rich_text: { annotations: { color: string } }[] }).rich_text[0]).annotations.color, "red_background");
assert.equal(classificarFonte("O JOGO EM MOVIMENTO", "Magia", "page", "reference", true), "book");
assert.equal(classificarFonte("OUTROS", "GUIA EDITORIAL — RUPTURA v1.2", "page"), "editorial_guide");
assert.equal(classificarFonte("OUTROS", "GUIA DE DESIGN — RUPTURA v1.2", "page"), "design_guide");
assert.equal(classificarFonte("OUTROS", "RUPTURA v1.2 — DECISÕES DE DESIGN: BANDOS REFRATÁRIOS E NPCs HUMANOS", "page"), "working_reference");
assert.equal(classificarFonte("VERSÕES ANTERIORES", "GUIA EDITORIAL", "page", "historical_version"), "historical_version", "versão antiga nunca herda autoridade atual");

// O transporte da versão nova consulta data sources e pagina resultados.
const oldFetch = globalThis.fetch;
const requests: { url: string; version: string; body?: string }[] = [];
globalThis.fetch = async (input, init) => {
  const url = String(input);
  requests.push({ url, version: String((init?.headers as Record<string, string>)["Notion-Version"]), body: init?.body?.toString() });
  if (url.includes("/blocks/legacyRoot/children")) {
    return new Response(JSON.stringify({ results: [block("legacyDb", "child_database", { title: "LEGADO" })], has_more: false, next_cursor: null }), { status: 200 });
  }
  if (url.includes("/databases/legacyDb/query")) {
    return new Response(JSON.stringify({ results: [page("legacyRow", "LEGADO")], has_more: false, next_cursor: null }), { status: 200 });
  }
  if (url.includes("/query")) {
    const cursor = JSON.parse(String(init?.body)).start_cursor;
    return new Response(JSON.stringify(cursor ? { results: [page("r2", "B")], has_more: false, next_cursor: null } : { results: [page("r1", "A")], has_more: true, next_cursor: "cursor 2" }), { status: 200 });
  }
  if (url.includes("/properties/")) {
    return new Response(JSON.stringify({ results: [{ type: "title", title: rich("A") }, { type: "title", title: rich("B") }], has_more: false, next_cursor: null }), { status: 200 });
  }
  if (url.includes("/pages/")) {
    return new Response(JSON.stringify(page("long", "A", { Nome: { id: "f%5C%5C%3Ap", type: "title", title: Array.from({ length: 25 }, () => rich("A")) } })), { status: 200 });
  }
  return new Response(JSON.stringify({ id: "db", data_sources: [] }), { status: 200 });
};
try {
  const liveReader = criarLeitorNotionAgent("test-token");
  await liveReader.database("db");
  assert.equal((await liveReader.rows("ds")).length, 2);
  assert.ok(requests.every((r) => r.version === "2025-09-03"));
  assert.match(requests[1].url, /\/data_sources\/ds\/query$/);
  assert.equal(JSON.parse(requests[2].body!).start_cursor, "cursor 2");
  const fullPage = await liveReader.page("long");
  assert.equal((fullPage.properties!.Nome.title as { plain_text: string }[]).map((item) => item.plain_text).join(""), "AB", "propriedade paginada é lida por inteiro");
  assert.ok(requests.some((r) => r.url.includes("/properties/f%5C%5C%3Ap?")), "ID de propriedade já codificado não é codificado novamente");
  const legacy = criarClienteNotion("test-token");
  const legacyBlocks = await legacy.blocos("legacyRoot");
  assert.equal(legacyBlocks[0].linhas?.[0].titulo, "LEGADO", "leitor do Compêndio mantém query de database");
  assert.deepEqual(requests.slice(-2).map((r) => r.version), ["2022-06-28", "2022-06-28"]);
} finally {
  globalThis.fetch = oldFetch;
}

let attempts = 0;
globalThis.fetch = async () => {
  attempts++;
  if (attempts === 1) throw new Error("rede temporária");
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
try {
  assert.deepEqual(await criarTransporteNotion("test-token", "2025-09-03").chamar("/users/me"), { ok: true });
  assert.equal(attempts, 2, "falha de rede transitória recebe retry");
} finally {
  globalThis.fetch = oldFetch;
}

console.log("test-ruptura-agent — topologia, roles, rows, snapshot, incremental e API: OK");
