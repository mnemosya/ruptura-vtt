/**
 * Lê a página raiz "RUPTURA (1.2)" e decide quais subpáginas são
 * capítulos do Compêndio, em que seção e em que ordem.
 *
 * Na raiz, cada seção é um título (`###`) seguido das subpáginas.
 * Entram as seções do livro e os Patch Notes; "Versões anteriores" e
 * "Outros" ficam de fora (decisão de 02/10/2026, PLANO_COMPENDIO_NOTION §2).
 */

import { converterTexto, semHifens, type BlocoNotion } from "./converter";

export interface EntradaIndice {
  notionPageId: string;
  tituloPagina: string;
  secao: string;
  ordem: number;
}

/** Seções da raiz que NÃO entram. Comparação sem acento e sem caixa. */
const SECOES_EXCLUIDAS = ["versoes anteriores", "outros"];

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function lerIndice(blocosRaiz: BlocoNotion[]): EntradaIndice[] {
  const entradas: EntradaIndice[] = [];
  let secao: string | null = null;
  let incluir = false;
  for (const b of blocosRaiz) {
    if (b.type === "heading_1" || b.type === "heading_2" || b.type === "heading_3") {
      const rich = (b[b.type] as { rich_text?: Parameters<typeof converterTexto>[0] }).rich_text;
      secao = converterTexto(rich).map((t) => t.texto).join("").trim();
      incluir = !SECOES_EXCLUIDAS.includes(normalizar(secao));
      continue;
    }
    if (b.type !== "child_page" || !secao || !incluir) continue;
    entradas.push({
      notionPageId: semHifens(b.id),
      tituloPagina: (b.child_page as { title: string }).title,
      secao,
      ordem: entradas.length + 1,
    });
  }
  return entradas;
}
