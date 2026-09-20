/**
 * Vocabulário do organizador, num lugar só (CONT-03).
 *
 * Os cinco tipos vêm da taxonomia aprovada em CONT-01 — não existe
 * "outros": o que não se encaixa é anotação com etiqueta.
 */
import type { NarrativeTipo, NarrativeEstado } from "../../../../../../../lib/campaign/narrativeActions";

export const TIPOS: { id: NarrativeTipo; rotulo: string; plural: string }[] = [
  { id: "sessao", rotulo: "Sessão", plural: "Sessões" },
  { id: "anotacao", rotulo: "Anotação", plural: "Anotações" },
  { id: "handout", rotulo: "Handout", plural: "Handouts" },
  { id: "npc", rotulo: "NPC", plural: "NPCs" },
  { id: "lugar", rotulo: "Lugar", plural: "Lugares" },
];

export const ESTADOS: { id: NarrativeEstado; rotulo: string }[] = [
  { id: "rascunho", rotulo: "Rascunho" },
  { id: "publicado", rotulo: "Publicado" },
  { id: "arquivado", rotulo: "Arquivado" },
];

export const rotuloDoTipo = (t: NarrativeTipo) => TIPOS.find((x) => x.id === t)?.rotulo ?? t;

/** Handout pode não ter título — é o tipo cujo sentido é o anexo. */
export function tituloVisivel(e: { tipo: NarrativeTipo; titulo: string | null }): string {
  return e.titulo?.trim() || (e.tipo === "handout" ? "Handout sem título" : "Sem título");
}
