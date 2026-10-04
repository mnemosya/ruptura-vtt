/**
 * Enquadramentos (object-position) lidos direto de content/v12/compendio_ajustes.json na hora de mostrar,
 * sem passar pela sincronização: editar o arquivo e recarregar já basta.
 */
import type React from "react";
import ajustes from "../../../../../../content/v12/compendio_ajustes.json";

type Ajuste = { capa?: { posicao?: string }; card?: { posicao?: string; zoom?: number } };
const paginas = (ajustes as { paginas: Record<string, Ajuste> }).paginas;

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
