/**
 * Leitura da API oficial do Notion (só leitura), sem SDK: `fetch` puro.
 *
 * Respeita o limite da API (≈3 requisições/s) com um intervalo mínimo
 * entre chamadas e tenta de novo em 429/5xx com espera crescente.
 * Ver docs/prd/PLANO_COMPENDIO_NOTION.md §5 (Fase 1) e §6.
 */

import type { BlocoNotion } from "./converter";

const API = "https://api.notion.com/v1";
const VERSAO_API = "2022-06-28";
const INTERVALO_MS = 350;

/** ID da página "RUPTURA (1.2)" no Notion. */
export const PAGINA_RAIZ_RUPTURA_V12 = "17f0a1363552827fab1601753924fb3a";

export interface ClienteNotion {
  pagina(id: string): Promise<{ id: string; titulo: string; editadoEm: string }>;
  /** Todos os blocos da página, com os filhos carregados recursivamente. */
  blocos(id: string): Promise<BlocoNotion[]>;
  /** Quantas requisições foram feitas (para o relatório). */
  requisicoes(): number;
}

export function criarClienteNotion(token: string | undefined = process.env.NOTION_TOKEN): ClienteNotion {
  if (!token) throw new Error("NOTION_TOKEN não configurado (.env.local). Ver PLANO_COMPENDIO_NOTION.md, Fase 0.");
  let ultima = 0;
  let total = 0;

  async function chamar<T>(caminho: string): Promise<T> {
    for (let tentativa = 0; ; tentativa++) {
      const espera = ultima + INTERVALO_MS - Date.now();
      if (espera > 0) await new Promise((r) => setTimeout(r, espera));
      ultima = Date.now();
      total++;
      const resp = await fetch(`${API}${caminho}`, {
        headers: { Authorization: `Bearer ${token}`, "Notion-Version": VERSAO_API },
      });
      if (resp.ok) return (await resp.json()) as T;
      const temporario = resp.status === 429 || resp.status >= 500;
      if (!temporario || tentativa >= 4) {
        const corpo = await resp.text().catch(() => "");
        throw new Error(`Notion ${resp.status} em ${caminho}: ${corpo.slice(0, 300)}`);
      }
      const retry = Number(resp.headers.get("retry-after"));
      await new Promise((r) => setTimeout(r, Number.isFinite(retry) && retry > 0 ? retry * 1000 : 1000 * 2 ** tentativa));
    }
  }

  async function filhosDe(id: string): Promise<BlocoNotion[]> {
    const todos: BlocoNotion[] = [];
    let cursor: string | undefined;
    do {
      const q = `?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`;
      const r = await chamar<{ results: BlocoNotion[]; has_more: boolean; next_cursor: string | null }>(`/blocks/${id}/children${q}`);
      todos.push(...r.results);
      cursor = r.has_more && r.next_cursor ? r.next_cursor : undefined;
    } while (cursor);
    // Subpáginas não são abertas aqui: cada capítulo é lido por conta própria.
    for (const b of todos) {
      if (b.has_children && b.type !== "child_page" && b.type !== "child_database") b.filhos = await filhosDe(b.id);
    }
    return todos;
  }

  return {
    async pagina(id) {
      const p = await chamar<{ id: string; last_edited_time: string; properties: Record<string, { type: string; title?: { plain_text: string }[] }> }>(`/pages/${id}`);
      const prop = Object.values(p.properties).find((v) => v.type === "title");
      return { id: p.id, titulo: (prop?.title ?? []).map((t) => t.plain_text).join(""), editadoEm: p.last_edited_time };
    },
    blocos: filhosDe,
    requisicoes: () => total,
  };
}
