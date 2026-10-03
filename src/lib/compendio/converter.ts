/**
 * Converte blocos da API oficial do Notion para o formato do Compêndio.
 *
 * Função pura: recebe os blocos já com os filhos carregados (campo
 * `filhos`, preenchido pelo leitor em `notion.ts`) e não faz rede.
 * Ver docs/prd/PLANO_COMPENDIO_NOTION.md §4.
 */

import type { BlocoCompendio, TrechoCompendio } from "./tipos";

/** Bloco como vem da API do Notion, mais os filhos já carregados. */
/** Linha de um banco de dados do Notion (página), como o leitor entrega. */
export interface LinhaBancoNotion {
  id: string;
  titulo: string;
  /** Propriedades de texto, por nome. */
  textos: Record<string, string>;
  /** Propriedades de seleção, por nome. */
  selecoes: Record<string, string>;
  icone: string | null;
  editadoEm: string;
}

export interface BlocoNotion {
  id: string;
  type: string;
  has_children?: boolean;
  filhos?: BlocoNotion[];
  /** Só em `child_database`: as linhas do banco, já carregadas. */
  linhas?: LinhaBancoNotion[];
  [chave: string]: unknown;
}

interface RichTextNotion {
  type: "text" | "mention" | "equation";
  plain_text: string;
  href?: string | null;
  annotations?: { bold?: boolean; italic?: boolean; code?: boolean };
  mention?: { type: string; page?: { id: string } };
}

export interface ResultadoConversao {
  blocos: BlocoCompendio[];
  verbetes: { titulo: string; ancora: string }[];
  /** Tipos do Notion sem equivalente, para o relatório da sincronização. */
  naoSuportados: string[];
}

export function semHifens(id: string): string {
  return id.replace(/-/g, "");
}

/** Âncora estável a partir do texto: "SANGRANDO" → "sangrando". */
export function ancoraDe(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function converterTexto(rich: RichTextNotion[] | undefined): TrechoCompendio[] {
  const saida: TrechoCompendio[] = [];
  for (const r of rich ?? []) {
    if (!r.plain_text) continue;
    const t: TrechoCompendio = { texto: r.plain_text };
    if (r.annotations?.bold) t.negrito = true;
    if (r.annotations?.italic) t.italico = true;
    if (r.annotations?.code) t.termo = true;
    if (r.type === "mention" && r.mention?.type === "page" && r.mention.page) t.paginaNotionId = semHifens(r.mention.page.id);
    else if (r.href) {
      const ehNotion = /^\/|notion\.(?:so|com|site)\//i.test(r.href);
      const interno = ehNotion ? r.href.split(/[?#]/)[0].match(/([0-9a-f]{32})(?!.*[0-9a-f]{32})/i) : null;
      if (interno) t.paginaNotionId = interno[1];
      else t.url = r.href;
    }
    // Trechos vizinhos com as mesmas marcas viram um só (o Notion quebra muito).
    const ant = saida[saida.length - 1];
    if (ant && !ant.paginaNotionId && !t.paginaNotionId && !ant.url && !t.url
      && !!ant.negrito === !!t.negrito && !!ant.italico === !!t.italico && !!ant.termo === !!t.termo) {
      ant.texto += t.texto;
    } else saida.push(t);
  }
  return saida;
}

function textoPlano(trechos: TrechoCompendio[]): string {
  return trechos.map((t) => t.texto).join("").trim();
}

/** Callout de navegação "Anterior / Próximo" do fim de cada capítulo: a janela tem a sua própria. */
function ehNavegacao(bloco: BlocoNotion): boolean {
  if (bloco.type !== "callout") return false;
  const texto = textoPlano(converterTexto((bloco.callout as { rich_text?: RichTextNotion[] }).rich_text));
  return /^(anterior|próximo|proximo)\s*:/i.test(texto);
}

export function converterBlocos(blocos: BlocoNotion[]): ResultadoConversao {
  const verbetes: ResultadoConversao["verbetes"] = [];
  const naoSuportados: string[] = [];
  const usadas = new Map<string, number>();
  const ancoraUnica = (texto: string) => {
    const base = ancoraDe(texto) || "secao";
    const n = (usadas.get(base) ?? 0) + 1;
    usadas.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };

  function converter(lista: BlocoNotion[]): BlocoCompendio[] {
    const saida: BlocoCompendio[] = [];
    for (const b of lista) {
      const dados = (b[b.type] ?? {}) as Record<string, unknown>;
      const rich = dados.rich_text as RichTextNotion[] | undefined;
      const filhos = () => converter(b.filhos ?? []);
      switch (b.type) {
        case "paragraph": {
          const texto = converterTexto(rich);
          if (texto.length) saida.push({ tipo: "paragrafo", texto });
          // Parágrafo com filhos (indentação) — os filhos seguem logo abaixo.
          if (b.filhos?.length) saida.push(...filhos());
          break;
        }
        case "heading_1":
        case "heading_2":
        case "heading_3":
        case "heading_4": {
          const texto = converterTexto(rich);
          const nivel = Number(b.type.slice(-1)) as 1 | 2 | 3 | 4;
          // Título recolhível do Notion é um verbete (ex.: cada condição no capítulo 22).
          if (dados.is_toggleable) {
            const ancora = ancoraUnica(textoPlano(texto));
            verbetes.push({ titulo: textoPlano(texto), ancora });
            saida.push({ tipo: "verbete", titulo: texto, ancora, filhos: filhos() });
          } else {
            saida.push({ tipo: "titulo", nivel, texto, ancora: ancoraUnica(textoPlano(texto)) });
          }
          break;
        }
        case "toggle": {
          const titulo = converterTexto(rich);
          const ancora = ancoraUnica(textoPlano(titulo));
          verbetes.push({ titulo: textoPlano(titulo), ancora });
          saida.push({ tipo: "verbete", titulo, ancora, filhos: filhos() });
          break;
        }
        case "bulleted_list_item":
        case "numbered_list_item": {
          const ordenada = b.type === "numbered_list_item";
          const item = { texto: converterTexto(rich), filhos: filhos() };
          const ant = saida[saida.length - 1];
          if (ant?.tipo === "lista" && ant.ordenada === ordenada) ant.itens.push(item);
          else saida.push({ tipo: "lista", ordenada, itens: [item] });
          break;
        }
        case "quote":
          saida.push({ tipo: "citacao", texto: converterTexto(rich), filhos: filhos() });
          break;
        case "callout": {
          if (ehNavegacao(b)) break;
          const icone = (dados.icon as { emoji?: string } | null)?.emoji ?? null;
          saida.push({ tipo: "destaque", icone, texto: converterTexto(rich), filhos: filhos() });
          break;
        }
        case "table": {
          const linhas = (b.filhos ?? [])
            .filter((l) => l.type === "table_row")
            .map((l) => ((l.table_row as { cells?: RichTextNotion[][] }).cells ?? []).map(converterTexto));
          saida.push({
            tipo: "tabela",
            cabecalhoLinha: !!dados.has_column_header,
            cabecalhoColuna: !!dados.has_row_header,
            linhas,
          });
          break;
        }
        case "image": {
          const arquivo = dados as { type?: string; file?: { url: string }; external?: { url: string }; caption?: RichTextNotion[] };
          const url = arquivo.type === "external" ? arquivo.external?.url : arquivo.file?.url;
          if (url) saida.push({ tipo: "imagem", url, legenda: converterTexto(arquivo.caption) });
          break;
        }
        case "link_to_page": {
          const alvo = dados as { type?: string; page_id?: string };
          if (alvo.type === "page_id" && alvo.page_id) saida.push({ tipo: "link_pagina", paginaNotionId: semHifens(alvo.page_id) });
          break;
        }
        case "divider":
          saida.push({ tipo: "divisor" });
          break;
        // Contêineres sem significado visual próprio: o conteúdo segue no fluxo.
        case "column_list":
        case "column":
        case "synced_block":
          saida.push(...filhos());
          break;
        case "child_database": {
          const linhas = b.linhas ?? [];
          if (!linhas.length) break;
          saida.push({
            tipo: "galeria",
            titulo: (dados as { title?: string }).title ?? "",
            itens: linhas.map((l) => ({
              pageId: semHifens(l.id),
              titulo: l.titulo,
              // "Descrição" quando existe; senão o primeiro texto preenchido (ex.: "Papel" nas Classes).
              descricao: l.textos["Descrição"] ?? Object.values(l.textos).find((t) => t.trim()) ?? "",
              etiquetas: Object.values(l.selecoes).filter(Boolean),
              imagem: null,
              icone: l.icone,
            })),
          });
          break;
        }
        // Subpáginas e índices não fazem parte do texto do capítulo.
        case "child_page":
        case "table_of_contents":
        case "breadcrumb":
          break;
        default:
          naoSuportados.push(b.type);
          saida.push({ tipo: "nao_suportado", tipoNotion: b.type });
      }
    }
    return saida;
  }

  return { blocos: converter(blocos), verbetes, naoSuportados };
}

/** "22. CONDIÇÕES" → { numero: 22, titulo: "CONDIÇÕES" }. */
export function separarNumero(tituloPagina: string): { numero: number | null; titulo: string } {
  const m = tituloPagina.trim().match(/^(\d+)\.\s*(.+)$/);
  return m ? { numero: Number(m[1]), titulo: m[2].trim() } : { numero: null, titulo: tituloPagina.trim() };
}
