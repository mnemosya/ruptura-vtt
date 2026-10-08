/**
 * Leitura da API oficial do Notion (só leitura), sem SDK: `fetch` puro.
 *
 * Respeita o limite da API (≈3 requisições/s) com um intervalo mínimo
 * entre chamadas e tenta de novo em 429/5xx com espera crescente.
 * Ver docs/prd/PLANO_COMPENDIO_NOTION.md §5 (Fase 1) e §6.
 */

import type { BlocoNotion, LinhaBancoNotion } from "./converter";
import { criarTransporteNotion } from "./notionTransport";

const VERSAO_API = "2022-06-28";

/** ID da página "RUPTURA (1.2)" no Notion. */
export const PAGINA_RAIZ_RUPTURA_V12 = "17f0a1363552827fab1601753924fb3a";

export interface ClienteNotion {
  pagina(id: string): Promise<{ id: string; titulo: string; editadoEm: string }>;
  /** Todos os blocos da página, com os filhos carregados recursivamente. */
  blocos(id: string): Promise<BlocoNotion[]>;
  /** Quantas requisições foram feitas (para o relatório). */
  requisicoes(): number;
}

interface PaginaNotion {
  id: string;
  last_edited_time: string;
  archived?: boolean;
  in_trash?: boolean;
  icon?: IconeNotion | null;
  properties: Record<string, { type: string; title?: { plain_text: string }[]; rich_text?: { plain_text: string }[]; select?: { name: string } | null }>;
}

type IconeNotion = { type: string; emoji?: string; external?: { url: string }; file?: { url: string }; custom_emoji?: { url: string } };

/** Emoji como caractere; ícone de arquivo/externo/emoji personalizado como URL. Ícones nativos do Notion não têm URL na API. */
export function iconeDe(icone: IconeNotion | null | undefined): string | null {
  if (!icone) return null;
  if (icone.type === "emoji") return icone.emoji ?? null;
  return icone.custom_emoji?.url ?? icone.external?.url ?? icone.file?.url ?? null;
}

export interface OpcoesClienteNotion {
  /**
   * Filhos já conhecidos de um bloco (ex.: guardados da última sincronização). Quando devolve uma
   * lista, os filhos do bloco não são lidos do Notion. Ver scripts/notion/cacheBlocos.ts (--rapido).
   */
  reaproveitar?: (bloco: BlocoNotion) => BlocoNotion[] | undefined;
}

export function criarClienteNotion(token: string | undefined = process.env.NOTION_TOKEN, opcoes: OpcoesClienteNotion = {}): ClienteNotion {
  if (!token) throw new Error("NOTION_TOKEN não configurado (.env.local). Ver PLANO_COMPENDIO_NOTION.md, Fase 0.");
  const { chamar, listar, requisicoes } = criarTransporteNotion(token, VERSAO_API);

  async function filhosDe(id: string): Promise<BlocoNotion[]> {
    const todos = await listar<BlocoNotion>(`/blocks/${id}/children`);
    // Subpáginas não são abertas aqui: cada capítulo é lido por conta própria.
    // Banco embutido (galeria): só as linhas; o conteúdo de cada uma é lido pelo sincronizador.
    for (const b of todos) {
      if (b.type === "child_database") b.linhas = await linhasDoBanco(b.id);
      else if (b.has_children && b.type !== "child_page") b.filhos = opcoes.reaproveitar?.(b) ?? (await filhosDe(b.id));
    }
    return todos;
  }

  async function linhasDoBanco(id: string): Promise<LinhaBancoNotion[]> {
    const linhas: LinhaBancoNotion[] = [];
    for (const p of await listar<PaginaNotion>(`/databases/${id}/query`, {})) {
      if (p.archived || p.in_trash) continue;
      const textos: Record<string, string> = {};
      const selecoes: Record<string, string> = {};
      let titulo = "";
      for (const [nome, v] of Object.entries(p.properties)) {
        if (v.type === "title") titulo = (v.title ?? []).map((t) => t.plain_text).join("").trim();
        else if (v.type === "rich_text") textos[nome] = (v.rich_text ?? []).map((t) => t.plain_text).join("").trim();
        else if (v.type === "select" && v.select?.name) selecoes[nome] = v.select.name;
      }
      linhas.push({ id: p.id, titulo, textos, selecoes, icone: iconeDe(p.icon), editadoEm: p.last_edited_time });
    }
    // A API não devolve a ordem da visualização; a galeria do livro é alfabética.
    return linhas.sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
  }

  return {
    async pagina(id) {
      const p = await chamar<{ id: string; last_edited_time: string; properties: Record<string, { type: string; title?: { plain_text: string }[] }> }>(`/pages/${id}`);
      const prop = Object.values(p.properties).find((v) => v.type === "title");
      return { id: p.id, titulo: (prop?.title ?? []).map((t) => t.plain_text).join(""), editadoEm: p.last_edited_time };
    },
    blocos: filhosDe,
    requisicoes,
  };
}
