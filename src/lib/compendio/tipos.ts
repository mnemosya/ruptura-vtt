/**
 * Formato do Compêndio — o que fica guardado em `content_documents`
 * (`content_type = "capitulo"`) e o que a janela do Compêndio desenha.
 *
 * É um formato PRÓPRIO, não o JSON do Notion: só os tipos de bloco que
 * o Compêndio sabe desenhar. Um bloco do Notion que não tem equivalente
 * vira `nao_suportado` (visível, nunca some em silêncio).
 * Ver docs/prd/PLANO_COMPENDIO_NOTION.md §4.1.
 */

/** Trecho de texto com marcas. `termo` é o código inline do Notion (`Lento`, `1 PA`). */
export interface TrechoCompendio {
  texto: string;
  negrito?: boolean;
  italico?: boolean;
  termo?: boolean;
  /** Link para outro capítulo do livro (ID da página no Notion, sem hífens). */
  paginaNotionId?: string;
  /** Link externo. */
  url?: string;
}

export type BlocoCompendio =
  | { tipo: "titulo"; nivel: 1 | 2 | 3 | 4; texto: TrechoCompendio[]; ancora: string }
  | { tipo: "paragrafo"; texto: TrechoCompendio[] }
  | { tipo: "lista"; ordenada: boolean; itens: { texto: TrechoCompendio[]; filhos: BlocoCompendio[] }[] }
  | { tipo: "citacao"; texto: TrechoCompendio[]; filhos: BlocoCompendio[] }
  | { tipo: "verbete"; titulo: TrechoCompendio[]; ancora: string; filhos: BlocoCompendio[] }
  | { tipo: "destaque"; icone: string | null; texto: TrechoCompendio[]; filhos: BlocoCompendio[] }
  | { tipo: "tabela"; cabecalhoLinha: boolean; cabecalhoColuna: boolean; linhas: TrechoCompendio[][][] }
  | { tipo: "imagem"; url: string; legenda: TrechoCompendio[]; largura?: number; altura?: number }
  | { tipo: "link_pagina"; paginaNotionId: string; titulo?: string }
  /** Banco de dados do Notion em galeria (Classes, Vertentes): cada card abre a página da linha. */
  | { tipo: "galeria"; titulo: string; itens: CardGaleria[] }
  | { tipo: "divisor" }
  | { tipo: "nao_suportado"; tipoNotion: string };

export interface CardGaleria {
  /** ID da página da linha no Notion, sem hífens — também é a subpágina no livro. */
  pageId: string;
  titulo: string;
  descricao: string;
  /** Propriedades de seleção (ex.: "Dificuldade: Média"), como etiquetas. */
  etiquetas: string[];
  /** Primeira imagem da página da linha (preenchida pelo sincronizador). */
  imagem: string | null;
  /** Emoji ou URL de ícone da página. */
  icone: string | null;
}

/** Payload de um documento `capitulo`. */
export interface CapituloCompendio {
  notionPageId: string;
  notionEditadoEm: string;
  numero: number | null;
  titulo: string;
  secao: string;
  ordem: number;
  blocos: BlocoCompendio[];
  /** Verbetes (toggles com título) — alimentam o índice de termos e a busca. */
  verbetes: { titulo: string; ancora: string }[];
  /** Subpágina (linha de uma galeria): ID do capítulo onde a galeria está. */
  paiPageId?: string | null;
  /** Imagem do herói (topo da página). Sai do corpo quando veio da primeira imagem do capítulo. */
  capa?: { url: string; largura: number; altura: number; posicao?: string } | null;
  /** Abertura do herói escolhida à mão (ajuste aberturaDaSecao): substitui a abertura automática. */
  abertura?: BlocoCompendio[] | null;
  /** Subpáginas das galerias deste capítulo e a data de edição de cada uma. */
  subpaginas?: Record<string, string>;
}
