/**
 * Ponto único de despacho de adapters por `content_type`. Nenhum
 * consumidor deve importar um adapter específico diretamente nem
 * reimplementar este switch em outro lugar — é o único lugar do
 * código que decide "qual adapter usar para qual content_type".
 *
 * `talent` é despachado à parte por `adaptTalentLevels` porque opera
 * sobre `niveis[]`, não sobre o documento inteiro — ver `talent.ts`.
 */

import type { ContentTypeId, ResultadoAdaptacao } from "../types";
import { adaptCondition } from "./condition";
import { adaptGenerico } from "./generic";
import { adaptItem } from "./item";
import { adaptSpell } from "./spell";
import { adaptTalentLevel } from "./talent";

export { adaptCondition, adaptGenerico, adaptItem, adaptSpell, adaptTalentLevel };

export function adaptarDocumento(contentType: ContentTypeId, raw: Record<string, unknown>): ResultadoAdaptacao {
  switch (contentType) {
    case "spell":
      return adaptSpell(raw);
    case "item":
      return adaptItem(raw);
    case "condition":
      return adaptCondition(raw);
    case "talent":
      throw new Error('content_type "talent" usa adaptTalentLevel(talentoSlug, talentoNome, nivelRaw) — ele opera por nível, não pelo documento inteiro.');
    default:
      return adaptGenerico(contentType, raw);
  }
}

/** Adapta todos os níveis de um talento de uma vez, um ConteudoCanonico por nível. */
export function adaptarNiveisDeTalento(talentoRaw: Record<string, unknown>): ResultadoAdaptacao[] {
  const slug = String(talentoRaw.slug ?? talentoRaw.id ?? "");
  const nome = String(talentoRaw.nome ?? slug);
  const niveis = Array.isArray(talentoRaw.niveis) ? talentoRaw.niveis : [];
  return niveis
    .map((nivel) => (typeof nivel === "object" && nivel !== null ? (nivel as Record<string, unknown>) : undefined))
    .filter((nivel): nivel is Record<string, unknown> => nivel !== undefined)
    .map((nivel) => adaptTalentLevel(slug, nome, nivel));
}
