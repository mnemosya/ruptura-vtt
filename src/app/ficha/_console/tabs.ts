/**
 * Definição única das seis abas do Console — usada pelo trilho vertical
 * (`TabRail`) e por `CharacterConsole` (que decide o conteúdo de cada
 * uma). Um só lugar evita a lista duplicada em dois componentes.
 *
 * Ícones escolhidos por relação semântica com cada aba (não genéricos):
 * Backpack para Mochila, Wand2 para Magias, BrainCircuit para Escalpos
 * (implantes cibernéticos), IdCard para Características (identidade/
 * traços do personagem).
 */

import { LayoutGrid, Wand2, Backpack, BrainCircuit, IdCard, Zap, type LucideIcon } from "lucide-react";

export type AbaId = "visao_geral" | "magias" | "mochila" | "escalpos" | "caracteristicas" | "acoes";

export interface ConsoleTabDef {
  id: AbaId;
  label: string;
  Icon: LucideIcon;
}

export const ABAS: ConsoleTabDef[] = [
  { id: "visao_geral", label: "Visão Geral", Icon: LayoutGrid },
  { id: "magias", label: "Magias", Icon: Wand2 },
  { id: "mochila", label: "Mochila", Icon: Backpack },
  { id: "escalpos", label: "Escalpos", Icon: BrainCircuit },
  { id: "caracteristicas", label: "Características", Icon: IdCard },
  { id: "acoes", label: "Ações", Icon: Zap },
];
