/**
 * Modelo puro do Compêndio (livro sincronizado do Notion).
 * Sem React e sem rede: agrupar o índice, buscar e resolver termos.
 * Ver docs/prd/PLANO_COMPENDIO_NOTION.md, Fase 2.
 */

import { ancoraDe } from "../../../../../lib/compendio/converter";
import type { BlocoCompendio, TrechoCompendio } from "../../../../../lib/compendio/tipos";

/** Linha leve de um capítulo: o que a aba e o índice precisam, sem os blocos. */
export interface LinhaCapitulo {
  pageId: string;
  numero: number | null;
  titulo: string;
  secao: string;
  ordem: number;
  verbetes: { titulo: string; ancora: string }[];
  /** Última edição no Notion. */
  editadoEm?: string;
  /** Subpágina de galeria (uma Vertente, uma Classe): o capítulo onde ela está. */
  paiPageId?: string | null;
}

/** Capítulo do livro onde uma página está, subindo pelas subpáginas (página dentro de página). */
export function capituloRaiz(linhas: LinhaCapitulo[], pageId: string): string {
  const porId = new Map(linhas.map((c) => [c.pageId, c]));
  let atual = pageId;
  for (let i = 0; i < 10; i++) {
    const pai = porId.get(atual)?.paiPageId;
    if (!pai) return atual;
    atual = pai;
  }
  return atual;
}

/** Só os capítulos do livro (sem as subpáginas das galerias). */
export function soCapitulos(linhas: LinhaCapitulo[]): LinhaCapitulo[] {
  return linhas.filter((c) => !c.paiPageId);
}

/** Evento de janela que pede ao painel para abrir o livro num destino (`detail: DestinoLivro`). */
export const EVENTO_ABRIR_COMPENDIO = "ruptura:abrir-compendio";

/** Destino de navegação dentro do livro. */
export interface DestinoLivro {
  pageId: string;
  ancora?: string;
}

export function rotuloCapitulo(c: Pick<LinhaCapitulo, "numero" | "titulo">): string {
  return c.numero != null ? `${c.numero}. ${c.titulo}` : c.titulo;
}

/** Seções na ordem em que aparecem no livro. */
export function agruparPorSecao(linhas: LinhaCapitulo[]): { secao: string; capitulos: LinhaCapitulo[] }[] {
  const grupos: { secao: string; capitulos: LinhaCapitulo[] }[] = [];
  for (const c of soCapitulos(linhas).sort((a, b) => a.ordem - b.ordem)) {
    const g = grupos.find((x) => x.secao === c.secao);
    if (g) g.capitulos.push(c);
    else grupos.push({ secao: c.secao, capitulos: [c] });
  }
  return grupos;
}

export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function textoDe(trechos: TrechoCompendio[]): string {
  return trechos.map((t) => t.texto).join("");
}

/** Texto corrido de um capítulo, para a busca no conteúdo. */
export function textoPlanoDosBlocos(blocos: BlocoCompendio[]): string {
  const partes: string[] = [];
  const andar = (lista: BlocoCompendio[]) => {
    for (const b of lista) {
      switch (b.tipo) {
        case "titulo":
        case "paragrafo":
        case "citacao":
        case "destaque":
          partes.push(textoDe(b.texto));
          break;
        case "verbete":
          partes.push(textoDe(b.titulo));
          break;
        case "lista":
          for (const i of b.itens) {
            partes.push(textoDe(i.texto));
            andar(i.filhos);
          }
          break;
        case "tabela":
          for (const linha of b.linhas) partes.push(linha.map(textoDe).join(" · "));
          break;
        case "imagem":
          partes.push(textoDe(b.legenda));
          break;
      }
      if ("filhos" in b) andar(b.filhos);
    }
  };
  andar(blocos);
  return partes.filter(Boolean).join("\n");
}

export type ResultadoBusca =
  | { tipo: "capitulo"; capitulo: LinhaCapitulo }
  | { tipo: "verbete"; capitulo: LinhaCapitulo; titulo: string; ancora: string }
  | { tipo: "texto"; capitulo: LinhaCapitulo; trecho: string };

const MAX_TEXTO_POR_CAPITULO = 3;
const MAX_RESULTADOS_TEXTO = 30;

/**
 * Busca no livro: títulos de capítulo, verbetes e, se o texto corrido já
 * foi carregado, o conteúdo. Ordem: capítulos, verbetes, trechos.
 */
export function buscarNoLivro(linhas: LinhaCapitulo[], consulta: string, textos?: Map<string, string>): ResultadoBusca[] {
  const q = normalizar(consulta);
  if (q.length < 2) return [];
  const ordenadas = [...linhas].sort((a, b) => a.ordem - b.ordem);
  const capitulos: ResultadoBusca[] = ordenadas
    .filter((c) => normalizar(rotuloCapitulo(c)).includes(q))
    .map((capitulo) => ({ tipo: "capitulo", capitulo }));
  const verbetes: ResultadoBusca[] = ordenadas.flatMap((capitulo) =>
    capitulo.verbetes.filter((v) => normalizar(v.titulo).includes(q)).map((v) => ({ tipo: "verbete" as const, capitulo, titulo: v.titulo, ancora: v.ancora })),
  );
  const trechos: ResultadoBusca[] = [];
  if (textos) {
    for (const capitulo of ordenadas) {
      const texto = textos.get(capitulo.pageId);
      if (!texto) continue;
      let achados = 0;
      for (const linha of texto.split("\n")) {
        if (achados >= MAX_TEXTO_POR_CAPITULO || trechos.length >= MAX_RESULTADOS_TEXTO) break;
        const pos = normalizar(linha).indexOf(q);
        if (pos < 0) continue;
        trechos.push({ tipo: "texto", capitulo, trecho: recortar(linha, pos, q.length) });
        achados++;
      }
    }
  }
  return [...capitulos, ...verbetes, ...trechos];
}

/** Trecho de até ~140 caracteres em volta do achado. `normalizar` preserva o tamanho em texto comum. */
function recortar(linha: string, pos: number, tam: number): string {
  const ini = Math.max(0, pos - 60);
  const fim = Math.min(linha.length, pos + tam + 80);
  return `${ini > 0 ? "…" : ""}${linha.slice(ini, fim).trim()}${fim < linha.length ? "…" : ""}`;
}

/**
 * Índice de termos: o nome de cada verbete aponta para ele. É o que faz a
 * etiqueta `Lento` virar link para o verbete LENTO do capítulo 22.
 * Termos repetidos em mais de um capítulo ficam com o primeiro do livro.
 */
export function indiceDeTermos(linhas: LinhaCapitulo[]): Map<string, DestinoLivro> {
  const mapa = new Map<string, DestinoLivro>();
  for (const c of [...linhas].sort((a, b) => a.ordem - b.ordem)) {
    // Subpágina (BIÓTICA, VANGUARDA): o próprio nome também é termo.
    if (c.paiPageId) {
      const chave = normalizar(c.titulo);
      if (!mapa.has(chave)) mapa.set(chave, { pageId: c.pageId });
    }
    for (const v of c.verbetes) {
      const chave = normalizar(v.titulo);
      if (!mapa.has(chave)) mapa.set(chave, { pageId: c.pageId, ancora: v.ancora });
    }
  }
  return mapa;
}

/**
 * Resolve uma etiqueta de termo: "Lento", "Envenenado 1" ou "Sangrando"
 * apontam para o verbete; custos como "1 PA" ficam só etiqueta.
 */
export function resolverTermo(termo: string, indice: Map<string, DestinoLivro>): DestinoLivro | null {
  const chave = normalizar(termo);
  return indice.get(chave) ?? indice.get(chave.replace(/\s+\d+$/, "")) ?? null;
}

/** Âncora usada nos títulos do capítulo (mesma regra do conversor). */
export { ancoraDe };

/** Capítulo anterior e seguinte na ordem do livro. */
export function vizinhos(linhas: LinhaCapitulo[], pageId: string): { anterior: LinhaCapitulo | null; proximo: LinhaCapitulo | null } {
  const ordenadas = soCapitulos(linhas).sort((a, b) => a.ordem - b.ordem);
  // Numa subpágina, os vizinhos são os do capítulo onde ela está.
  const alvo = capituloRaiz(linhas, pageId);
  const i = ordenadas.findIndex((c) => c.pageId === alvo);
  return { anterior: i > 0 ? ordenadas[i - 1] : null, proximo: i >= 0 && i < ordenadas.length - 1 ? ordenadas[i + 1] : null };
}
