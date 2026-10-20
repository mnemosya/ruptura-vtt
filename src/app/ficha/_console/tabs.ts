/**
 * Definição única das seis abas de NAVEGAÇÃO do Console — usada pelo
 * trilho vertical (`TabRail`) e por `CharacterConsole` (que decide o
 * conteúdo de cada uma). Um só lugar evita a lista duplicada em dois
 * componentes.
 *
 * Ícones escolhidos por relação semântica com cada aba (não genéricos):
 * Backpack para Inventário, Wand2 para Magias, BrainCircuit para Escalpos
 * (implantes cibernéticos), IdCard para Identidade (antigo nome
 * "Características" — traços/identidade do personagem).
 *
 * "personagem" NÃO entra em `ABAS` — é uma aba especial, renderizada num grupo
 * próprio do trilho (`TabRail`), com paleta e ícone customizados, não
 * genéricos como as demais.
 */

import { Shirt, Swords, Wand2, Backpack, BrainCircuit, IdCard, Zap, Shield, HeartPulse, Crosshair, Handshake, HatGlasses, Cpu, type LucideIcon } from "lucide-react";

export type AbaId = "personagem" | "equipamentos" | "mochila" | "magias" | "escalpos" | "caracteristicas" | "classe" | "acoes";

export interface ConsoleTabDef {
  id: AbaId;
  label: string;
  Icon: LucideIcon;
}

export const ABAS: ConsoleTabDef[] = [
  { id: "equipamentos", label: "Equipamentos", Icon: Shirt },
  // O id continua `mochila` (é o que o estado e os testes usam) e o
  // ícone continua a mochila; o que muda é o NOME: a aba mostra o
  // inventário inteiro — mochila, equipado e abrigo —, e chamá-la de
  // "Mochila" nomeava uma das três abas de dentro dela.
  { id: "mochila", label: "Inventário", Icon: Backpack },
  { id: "magias", label: "Magias", Icon: Wand2 },
  { id: "escalpos", label: "Escalpos", Icon: BrainCircuit },
  { id: "caracteristicas", label: "Identidade", Icon: IdCard },
  { id: "classe", label: "Classe", Icon: Shield },
  { id: "acoes", label: "Ações", Icon: Zap },
];

/** Símbolo de cada Classe (slug), usado na aba Classe, no painel e no Códex. */
export const ICONES_CLASSE: Record<string, LucideIcon> = { ancora: HeartPulse, cacador: Crosshair, combatente: Swords, face: Handshake, infiltrador: HatGlasses, tecnico: Cpu, vanguarda: Shield };
