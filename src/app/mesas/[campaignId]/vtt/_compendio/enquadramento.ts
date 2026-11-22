/**
 * Ajustes visuais aplicados na leitura, sem depender da sincronização do Notion:
 * enquadramentos de content/v12/compendio_ajustes.json e mapas locais de Braxus.
 */
import type React from "react";
import type { CapituloCompendio } from "../../../../../lib/compendio/tipos";
import { MAPA_DO_IMPERIO } from "../_forja/acervo/regioes";
import ajustes from "../../../../../../content/v12/compendio_ajustes.json";

type Ajuste = { capa?: { posicao?: string }; card?: { posicao?: string; zoom?: number } };
const paginas = (ajustes as { paginas: Record<string, Ajuste> }).paginas;

/** O atlas e a capa de Braxus acompanham os arquivos locais, mesmo antes de sincronizar o Notion. */
export function imagensDoCapitulo(capitulo: CapituloCompendio): CapituloCompendio {
  if (capitulo.notionPageId !== "d1d0a13635528315a0980176a3020e19") return capitulo;
  const mapa = capitulo.blocos.findIndex((b) => b.tipo === "imagem");
  return {
    ...capitulo,
    capa: { ...capitulo.capa, url: "/forja/regioes/mapa-sem-labels.webp", largura: 2005, altura: 784 },
    blocos: capitulo.blocos.map((b, i) => i === mapa && b.tipo === "imagem"
      ? { ...b, url: MAPA_DO_IMPERIO, largura: 2005, altura: 784 }
      : b),
  };
}

/** Enquadramento da capa (herói) da página. */
export const posicaoDaCapa = (pageId: string): string | undefined => paginas[pageId]?.capa?.posicao;

/** Enquadramento da imagem do card desta página na galeria do capítulo pai; `zoom` amplia a partir do ponto de `posicao`. */
export function estiloDoCard(pageId: string): React.CSSProperties | undefined {
  const card = paginas[pageId]?.card;
  if (!card?.posicao && !card?.zoom) return undefined;
  return {
    ...(card.posicao ? { objectPosition: card.posicao, transformOrigin: card.posicao } : {}),
    ...(card.zoom ? { transform: `scale(${card.zoom})` } : {}),
  };
}
