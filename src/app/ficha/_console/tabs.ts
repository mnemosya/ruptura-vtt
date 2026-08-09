/**
 * Definição única das seis abas de NAVEGAÇÃO do Console — usada pelo
 * trilho vertical (`TabRail`) e por `CharacterConsole` (que decide o
 * conteúdo de cada uma). Um só lugar evita a lista duplicada em dois
 * componentes.
 *
 * Ícones escolhidos por relação semântica com cada aba (não genéricos):
 * Backpack para Mochila, Wand2 para Magias, BrainCircuit para Escalpos
 * (implantes cibernéticos), IdCard para Identidade (antigo nome
 * "Características" — traços/identidade do personagem).
 *
 * "personagem" NÃO entra em `ABAS` — é uma aba especial que só existe
 * no modo Foco (spec "modos Painel e Foco"), renderizada num grupo
 * próprio do trilho (`TabRail`), com paleta e ícone customizados, não
 * genéricos como as demais.
 */

import { LayoutGrid, Wand2, Backpack, BrainCircuit, IdCard, Zap, type LucideIcon } from "lucide-react";

export type AbaId = "personagem" | "equipamentos" | "mochila" | "magias" | "escalpos" | "caracteristicas" | "acoes";

export interface ConsoleTabDef {
  id: AbaId;
  label: string;
  Icon: LucideIcon;
}

export const ABAS: ConsoleTabDef[] = [
  { id: "equipamentos", label: "Equipamentos", Icon: LayoutGrid },
  { id: "mochila", label: "Mochila", Icon: Backpack },
  { id: "magias", label: "Magias", Icon: Wand2 },
  { id: "escalpos", label: "Escalpos", Icon: BrainCircuit },
  { id: "caracteristicas", label: "Identidade", Icon: IdCard },
  { id: "acoes", label: "Ações", Icon: Zap },
];
