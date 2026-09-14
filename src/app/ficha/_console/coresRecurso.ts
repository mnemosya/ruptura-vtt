/**
 * As cores canônicas de PV, PE e Mana.
 *
 * Moravam dentro do dock minimizado do Console, que era o único lugar
 * que desenhava barra de recurso. Quando a aba Personagens do VTT
 * passou a desenhar as mesmas barras, copiar os três hexadecimais
 * criaria duas verdades sobre "qual é o vermelho do PV" — e a segunda
 * envelheceria calada.
 *
 * Ficam em TypeScript, e não em CSS, porque quem as consome passa a cor
 * como valor (estilo inline por recurso, num laço), não como classe.
 */
export type RecursoComBarra = "pv" | "pe" | "mana";

export const COR_RECURSO: Record<RecursoComBarra, string> = {
  pv: "#e0455e",
  pe: "#9a6cff",
  mana: "#3aa6f0",
};

export const ROTULO_RECURSO: Record<RecursoComBarra, string> = {
  pv: "PV",
  pe: "PE",
  mana: "MANA",
};
