/**
 * Extrai as fontes canônicas de magias e mercadorias do livro v1.2 no Notion.
 * Gera snapshots de revisão; não publica conteúdo nem infere efeitos de regras.
 *
 *   npx tsx scripts/notion/extrair-catalogos-v12.ts --magias
 *   npx tsx scripts/notion/extrair-catalogos-v12.ts --mercadorias
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "dotenv";
import { criarTransporteNotion } from "../../src/lib/compendio/notionTransport";
import { PAGINA_RAIZ_RUPTURA_V12 } from "../../src/lib/compendio/notion";

config({ path: ".env.local" });

const token = process.env.NOTION_TOKEN;
if (!token) throw new Error("NOTION_TOKEN ausente em .env.local");
const notion = criarTransporteNotion(token, "2022-06-28");
const indiceSaida = process.argv.indexOf("--saida");
if (indiceSaida >= 0 && !process.argv[indiceSaida + 1]) throw new Error("Informe uma pasta depois de --saida.");
const saida = resolve(indiceSaida >= 0 ? process.argv[indiceSaida + 1] : "content/v12/fontes_notion");
const somenteMagias = process.argv.includes("--magias");
const somenteMercadorias = process.argv.includes("--mercadorias");
if (somenteMagias && somenteMercadorias) throw new Error("Escolha apenas uma opção, ou nenhuma para ambas.");

type Rich = { plain_text?: string; href?: string | null; annotations?: Record<string, unknown> };
type Block = {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
};
type FonteBloco = {
  id: string;
  tipo: string;
  texto?: string;
  trechos?: { texto: string; negrito?: true; italico?: true; codigo?: true; link?: string }[];
  celulas?: FonteBloco["trechos"][];
  filhos?: FonteBloco[];
};

const idLimpo = (id: string) => id.replaceAll("-", "");
const texto = (rich: Rich[] | undefined) => (rich ?? []).map((r) => r.plain_text ?? "").join("");
function richFonte(rich: Rich[] | undefined): NonNullable<FonteBloco["trechos"]> {
  return (rich ?? []).filter((r) => r.plain_text).map((r) => ({
    texto: r.plain_text!,
    ...(r.annotations?.bold ? { negrito: true as const } : {}),
    ...(r.annotations?.italic ? { italico: true as const } : {}),
    ...(r.annotations?.code ? { codigo: true as const } : {}),
    ...(r.href ? { link: r.href } : {}),
  }));
}
function titulo(block: Block): string {
  const dados = block[block.type] as { title?: string; rich_text?: Rich[] } | undefined;
  return dados?.title ?? texto(dados?.rich_text);
}
async function blocos(id: string): Promise<Block[]> {
  return notion.listar<Block>(`/blocks/${id}/children`);
}
async function converter(block: Block): Promise<FonteBloco> {
  const dados = block[block.type] as { rich_text?: Rich[]; cells?: Rich[][]; title?: string; caption?: Rich[] } | undefined;
  const trechos = richFonte(dados?.rich_text ?? dados?.caption);
  const valor: FonteBloco = { id: idLimpo(block.id), tipo: block.type };
  if (trechos.length) {
    valor.texto = texto(dados?.rich_text ?? dados?.caption);
    valor.trechos = trechos;
  } else if (dados?.title) valor.texto = dados.title;
  if (dados?.cells) valor.celulas = dados.cells.map(richFonte);
  if (block.has_children && block.type !== "child_page" && block.type !== "child_database") {
    valor.filhos = await Promise.all((await blocos(block.id)).map(converter));
  }
  return valor;
}
async function pagina(id: string): Promise<{ id: string; editadoEm: string; titulo: string }> {
  const p = await notion.chamar<{ id: string; last_edited_time: string; properties: Record<string, { type: string; title?: Rich[] }> }>(`/pages/${id}`);
  const prop = Object.values(p.properties).find((v) => v.type === "title");
  return { id: idLimpo(p.id), editadoEm: p.last_edited_time, titulo: texto(prop?.title) };
}
async function raizCapitulos(): Promise<{ magias: Block; mercadorias: Block }> {
  const raiz = await blocos(PAGINA_RAIZ_RUPTURA_V12);
  const encontrar = (nome: string) => raiz.find((b) => b.type === "child_page" && titulo(b).toUpperCase().includes(nome));
  const magias = encontrar("MAGIA E VERTENTES");
  const mercadorias = encontrar("MERCADO NOTURNO");
  if (!magias || !mercadorias) throw new Error("Capítulos de magia ou Mercado Noturno não encontrados na raiz.");
  return { magias, mercadorias };
}
async function extrairMagias(capitulo: Block) {
  const capituloInfo = await pagina(capitulo.id);
  const topo = await blocos(capitulo.id);
  const banco = topo.find((b) => b.type === "child_database" && titulo(b).toUpperCase() === "VERTENTES");
  if (!banco) throw new Error("Galeria VERTENTES ausente do capítulo canônico.");
  const linhas = await notion.listar<{ id: string; properties: Record<string, { type: string; title?: Rich[] }> }>(`/databases/${banco.id}/query`, {});
  const vertentes = [];
  let total = 0;
  for (const linha of linhas) {
    const info = await pagina(linha.id);
    const blocosPagina = await blocos(linha.id);
    const inicio = blocosPagina.findIndex((b) => b.type === "heading_2" && titulo(b).trim().toUpperCase() === "LISTA DE MAGIAS");
    if (inicio < 0) throw new Error(`LISTA DE MAGIAS ausente em ${info.titulo}`);
    const niveis = [];
    for (const bloco of blocosPagina.slice(inicio + 1)) {
      if (bloco.type === "heading_2") break;
      if (bloco.type !== "heading_3") continue;
      const match = titulo(bloco).match(/^MAGIAS DE N[IÍ]VEL\s+([1-5])$/i);
      if (!match) continue;
      const nivel = Number(match[1]);
      const filhos = await blocos(bloco.id);
      const magias = [];
      const outros = [];
      for (const filho of filhos) {
        if (filho.type === "toggle") magias.push({ id: idLimpo(filho.id), titulo: titulo(filho), blocos: await Promise.all((await blocos(filho.id)).map(converter)) });
        else if (filho.type !== "divider") outros.push(await converter(filho));
      }
      total += magias.length;
      niveis.push({ nivel, blocoId: idLimpo(bloco.id), magias, outros });
      console.log(`  ${info.titulo} nível ${nivel}: ${magias.length} magias`);
    }
    if (niveis.length !== 5) throw new Error(`${info.titulo}: esperados 5 níveis, recebidos ${niveis.length}`);
    vertentes.push({ ...info, niveis });
  }
  if (vertentes.length !== 6) throw new Error(`Esperadas 6 Vertentes, recebidas ${vertentes.length}`);
  const resultado = { origem: "Notion › RUPTURA (1.2) › MAGIA E VERTENTES › VERTENTES › LISTA DE MAGIAS", extraidoEm: new Date().toISOString(), capitulo: capituloInfo, totalMagias: total, requisicoesNotion: notion.requisicoes(), vertentes };
  await writeFile(resolve(saida, "magias.json"), `${JSON.stringify(resultado, null, 2)}\n`);
  console.log(`Magias: ${total} verbetes, ${notion.requisicoes()} requisições.`);
}
async function extrairMercadorias(capitulo: Block) {
  const capituloInfo = await pagina(capitulo.id);
  const topo = await blocos(capitulo.id);
  const inicio = topo.findIndex((b) => b.type === "heading_2" && titulo(b).trim().toUpperCase() === "LISTA DE MERCADORIAS");
  if (inicio < 0) throw new Error("LISTA DE MERCADORIAS ausente do capítulo canônico.");
  const categorias = [];
  for (const b of topo.slice(inicio + 1)) {
    if (b.type === "heading_2") break;
    if (b.type !== "child_page") continue;
    const info = await pagina(b.id);
    const conteudo = await Promise.all((await blocos(b.id)).map(converter));
    categorias.push({ ...info, blocos: conteudo });
    console.log(`  ${info.titulo}: ${conteudo.length} blocos principais`);
  }
  if (categorias.length !== 12) throw new Error(`Esperadas 12 categorias de mercadorias, recebidas ${categorias.length}`);
  const resultado = { origem: "Notion › RUPTURA (1.2) › MERCADO NOTURNO › LISTA DE MERCADORIAS", extraidoEm: new Date().toISOString(), capitulo: capituloInfo, requisicoesNotion: notion.requisicoes(), categorias };
  await writeFile(resolve(saida, "mercadorias.json"), `${JSON.stringify(resultado, null, 2)}\n`);
  console.log(`Mercadorias: ${categorias.length} categorias, ${notion.requisicoes()} requisições.`);
}

await mkdir(saida, { recursive: true });
const capitulos = await raizCapitulos();
if (!somenteMercadorias) await extrairMagias(capitulos.magias);
if (!somenteMagias) await extrairMercadorias(capitulos.mercadorias);
