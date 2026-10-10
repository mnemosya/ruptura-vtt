/** Leitor read-only do corpus. Nunca expõe chamadas de escrita do Notion. */
import { criarTransporteNotion } from "../compendio/notionTransport";
import type { AgentNotionReader, NotionBlock, NotionObject } from "./types";

export const AGENT_NOTION_VERSION = "2025-09-03";

export function criarLeitorNotionAgent(token: string | undefined = process.env.NOTION_TOKEN): AgentNotionReader {
  if (!token) throw new Error("NOTION_TOKEN não configurado.");
  const transporte = criarTransporteNotion(token, AGENT_NOTION_VERSION);

  async function completarPagina(pagina: NotionObject): Promise<NotionObject> {
    if (!pagina.properties) return pagina;
    const propriedades = { ...pagina.properties };
    for (const [nome, prop] of Object.entries(propriedades)) {
      const tipo = String(prop.type);
      const paginavel = ["title", "rich_text", "people", "relation"].includes(tipo);
      const talvezTruncada = paginavel && Array.isArray(prop[tipo]) && prop[tipo].length >= 25;
      if ((prop.has_more !== true && !talvezTruncada) || typeof prop.id !== "string") continue;
      // A API já devolve IDs de propriedade codificados para URL; não codificar duas vezes.
      const itens = await transporte.listar<Record<string, unknown>>(`/pages/${pagina.id}/properties/${prop.id}`);
      const valores = ["title", "rich_text", "people", "relation"].includes(tipo)
        ? itens.map((item) => item[tipo]) : itens;
      propriedades[nome] = { ...prop, [tipo]: valores, has_more: false };
    }
    return { ...pagina, properties: propriedades };
  }

  return {
    async page(id) {
      return completarPagina(await transporte.chamar<NotionObject>(`/pages/${id}`));
    },
    database: (id) => transporte.chamar<NotionObject>(`/databases/${id}`),
    dataSource: (id) => transporte.chamar<NotionObject>(`/data_sources/${id}`),
    blockChildren: (id) => transporte.listar<NotionBlock>(`/blocks/${id}/children`),
    async rows(id) {
      const rows = await transporte.listar<NotionObject>(`/data_sources/${id}/query`, {});
      return rows.filter((row) => !row.archived && !row.in_trash);
    },
    requisicoes: transporte.requisicoes,
  };
}
