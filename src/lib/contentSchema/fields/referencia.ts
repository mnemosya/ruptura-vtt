/**
 * Normalização de referências entre conteúdos — a auditoria confirmou
 * que hoje são quase sempre strings soltas (bare slug/id), nunca um
 * objeto tipado, exceto em `requisitos[]` de escalpos/talentos (que já
 * usam um objeto próprio, tratado à parte pelos adapters específicos).
 */

import type { ContentTypeId, Referencia } from "../types";

export function normalizarReferencia(slugBruto: unknown, tipoConteudo: ContentTypeId | "desconhecido", papel?: string): Referencia | undefined {
  if (typeof slugBruto !== "string" || slugBruto.trim() === "") return undefined;
  return { tipoConteudo, slug: slugBruto.trim(), papel };
}

export function normalizarReferenciasArray(
  valoresBrutos: unknown,
  tipoConteudo: ContentTypeId | "desconhecido",
  papel?: string,
): Referencia[] {
  if (!Array.isArray(valoresBrutos)) return [];
  return valoresBrutos
    .map((v) => normalizarReferencia(v, tipoConteudo, papel))
    .filter((ref): ref is Referencia => ref !== undefined);
}
