/**
 * Lógica pura de classificação/filtro da página Personagens do
 * narrador (Fase 4, aditivo §9.1) — extraída para fora do componente
 * React só para poder ser testada diretamente (scripts/dev/validate-
 * personagens-fase4.mjs) sem reimplementar a regra em duplicata.
 *
 * Classificação (decisão de implementação registrada no checkpoint da
 * Fase 4 — não é autorização, só apresentação):
 *   - "Jogadores": tem ao menos um controlador ativo.
 *   - "PNs": `payload.metadados.tipo_personagem === "pn"` (campo
 *     aditivo, sem migration).
 *   - "Sem jogador": nenhum controlador E não marcado como PN.
 *   - "Arquivados": `archived_at` preenchido — exclui dos demais
 *     filtros (aparece só aqui).
 */
import type { CharacterRecord } from "./types";

export type PersonagemFiltro = "todos" | "jogadores" | "sem_jogador" | "pns" | "arquivados";

export function isPersonagemPn(c: CharacterRecord): boolean {
  return c.payload?.metadados?.tipo_personagem === "pn";
}

export function personagemMatchesFiltro(c: CharacterRecord, filtro: PersonagemFiltro, controllerCount: number): boolean {
  const arquivado = !!c.archived_at;
  switch (filtro) {
    case "arquivados":
      return arquivado;
    case "todos":
      return !arquivado;
    case "jogadores":
      return !arquivado && controllerCount > 0;
    case "sem_jogador":
      return !arquivado && controllerCount === 0 && !isPersonagemPn(c);
    case "pns":
      return !arquivado && isPersonagemPn(c);
    default:
      return true;
  }
}
