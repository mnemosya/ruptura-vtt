import { classificarFonte, notionId, ROOT_PAGE_ID } from "./config";
import { criarSnapshot, normalizarBloco, textoRich, tituloNotion } from "./snapshot";
import type { AgentBlock, AgentNotionReader, AgentSource, SourceRole } from "./types";

export interface CrawlResult {
  sources: AgentSource[];
  reused: number;
  requests: number;
  sections: string[];
}

function ehHeading(bloco: AgentBlock): boolean {
  return /^heading_[1-4]$/.test(bloco.type);
}

function tituloBloco(bloco: AgentBlock): string {
  const data = bloco.data as { rich_text?: unknown; title?: string };
  return textoRich(data?.rich_text) || data?.title?.trim() || "";
}

function referencias(blocos: AgentBlock[]): AgentBlock[] {
  const saida: AgentBlock[] = [];
  for (const bloco of blocos) {
    if (bloco.type === "child_page" || bloco.type === "child_database") saida.push(bloco);
    else saida.push(...referencias(bloco.children));
  }
  return saida;
}

/**
 * Descobre a topologia em páginas e databases, mas reutiliza snapshots de
 * páginas com revision idêntica. Databases e rows são enumeradas todo ciclo.
 * Uma exceção aborta o crawl; o chamador só persiste depois do sucesso total.
 */
export async function rastrearCorpus(
  notion: AgentNotionReader,
  conhecidos: ReadonlyMap<string, AgentSource> = new Map(),
  rootId = ROOT_PAGE_ID,
): Promise<CrawlResult> {
  const sources: AgentSource[] = [];
  const vistos = new Set<string>();
  const sections = new Set<string>();
  let reused = 0;

  async function blocosDe(id: string): Promise<AgentBlock[]> {
    const filhos = await notion.blockChildren(id);
    return Promise.all(filhos.map(async (bloco) => {
      // child_page e child_database são fontes separadas, nunca filhos de bloco.
      const children = bloco.has_children && bloco.type !== "child_page" && bloco.type !== "child_database"
        ? await blocosDe(bloco.id) : [];
      return normalizarBloco(bloco, children);
    }));
  }

  async function pagina(
    id: string, fallbackTitle: string, pathPai: string[], parentId: string | null,
    section: string | null, rolePai: SourceRole, rowDataSourceId: string | null = null,
    forceRead = false, atRoot = false,
  ): Promise<void> {
    const key = notionId(id);
    if (vistos.has(key)) return;
    vistos.add(key);
    const anterior = conhecidos.get(key);
    const meta = await notion.page(id);
    const title = tituloNotion(meta.properties, fallbackTitle || "Sem título");
    const role = atRoot ? "reference" : classificarFonte(section, title, rowDataSourceId ? "database_row" : "page", rolePai, parentId === notionId(rootId));
    const path = atRoot ? [title] : [...pathPai, title];
    const usarCache = !!anterior && !forceRead && anterior.notion_last_edited_at === meta.last_edited_time && Array.isArray(anterior.structure.blocks);
    const blocks = usarCache ? anterior!.structure.blocks! : await blocosDe(id);
    if (usarCache) reused++;
    const source = criarSnapshot({
      notionId: id, sourceType: rowDataSourceId ? "database_row" : "page", role,
      title, path, rootSection: section, parentNotionId: parentId,
      dataSourceNotionId: rowDataSourceId, notionLastEditedAt: meta.last_edited_time,
      properties: usarCache ? anterior!.properties : { ...meta.properties, __icon: meta.icon, __cover: meta.cover },
      structure: { blocks },
    });
    sources.push(source);

    let currentSection = section;
    for (const bloco of blocks) {
      if (atRoot && ehHeading(bloco)) {
        currentSection = tituloBloco(bloco);
        if (currentSection) sections.add(currentSection);
      }
      for (const ref of referencias([bloco])) {
        const refTitle = tituloBloco(ref);
        const basePath = atRoot && currentSection ? [...path, currentSection] : path;
        if (ref.type === "child_page") {
          await pagina(ref.id, refTitle, basePath, key, currentSection, role);
        } else {
          await database(ref.id, refTitle, basePath, key, currentSection, role);
        }
      }
    }
  }

  async function database(id: string, fallbackTitle: string, pathPai: string[], parentId: string, section: string | null, rolePai: SourceRole): Promise<void> {
    const key = notionId(id);
    if (vistos.has(key)) return;
    vistos.add(key);
    const meta = await notion.database(id);
    const title = textoRich(meta.title) || fallbackTitle || "Database sem título";
    const path = [...pathPai, title];
    const role = classificarFonte(section, title, "database", rolePai);
    if (!Array.isArray(meta.data_sources)) throw new Error(`Database ${title} (${id}) sem data_sources na API do Notion.`);
    sources.push(criarSnapshot({
      notionId: id, sourceType: "database", role, title, path, rootSection: section,
      parentNotionId: parentId, notionLastEditedAt: meta.last_edited_time,
      properties: { description: meta.description, icon: meta.icon, cover: meta.cover },
      structure: { dataSources: meta.data_sources.map((item) => ({ id: notionId(item.id), name: item.name })).sort((a, b) => a.id.localeCompare(b.id)) },
    }));

    for (const ds of meta.data_sources) {
      const dsKey = notionId(ds.id);
      if (vistos.has(dsKey)) continue;
      vistos.add(dsKey);
      const schema = await notion.dataSource(ds.id);
      const dsTitle = ds.name || title;
      const dsPath = meta.data_sources.length > 1 && dsTitle !== title ? [...path, dsTitle] : path;
      const dsRole = classificarFonte(section, dsTitle, "data_source", role);
      sources.push(criarSnapshot({
        notionId: ds.id, sourceType: "data_source", role: dsRole, title: dsTitle, path: dsPath,
        rootSection: section, parentNotionId: key, dataSourceNotionId: ds.id,
        notionLastEditedAt: schema.last_edited_time, properties: schema.properties ?? {},
        structure: {},
      }));
      const rows = await notion.rows(ds.id);
      for (const row of rows) {
        const rowTitle = tituloNotion(row.properties, "Row sem título");
        await pagina(row.id, rowTitle, dsPath, dsKey, section, dsRole, ds.id);
      }
    }
  }

  await pagina(rootId, "RUPTURA (1.2)", [], null, null, "reference", null, true, true);
  return { sources, reused, requests: notion.requisicoes(), sections: [...sections] };
}

export function relatorioCobertura(result: CrawlResult): string {
  const counts = new Map<string, number>();
  for (const source of result.sources) {
    const key = `${source.role}/${source.source_type}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const linhas = [
    `Fontes: ${result.sources.length} · snapshots reaproveitados: ${result.reused} · requisições Notion: ${result.requests}`,
    `Seções: ${result.sections.join(" | ")}`,
    ...[...counts].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => `  ${key}: ${count}`),
    "Caminhos de amostra:",
  ];
  const amostras = ["AMEAÇAS", "MERCADO NOTURNO", "MAGIA", "GUIA EDITORIAL", "GUIA DE DESIGN"];
  for (const termo of amostras) {
    const source = result.sources
      .filter((s) => s.path.some((part) => part.toUpperCase().includes(termo)) && s.source_type !== "data_source")
      .sort((a, b) => b.path.length - a.path.length)[0];
    if (source) linhas.push(`  ${source.role}: ${source.path.join(" › ")}`);
  }
  const semRole = result.sources.filter((s) => s.role === "reference" && s.source_type === "page").slice(0, 10);
  if (semRole.length) linhas.push("Referências sem autoridade automática:", ...semRole.map((s) => `  ${s.path.join(" › ")}`));
  return linhas.join("\n");
}
