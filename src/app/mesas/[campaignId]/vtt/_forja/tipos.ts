import type { RegiaoIdV12 } from "../../../../../lib/rulesetV12/contracts";
import type { VertenteId } from "./acervo/vertentes";

/**
 * O personagem em construção dentro da Forja. Só ESCOLHAS: recursos,
 * perícias zeradas e inventário são montados no servidor.
 *
 * Fase 1 do plano: a mecânica ainda é a do protótipo (atributos livres
 * de 1 a 4 somando 9, magias escolhidas na Vertente). A Fase 3 troca por
 * perfis da Classe, passo de Perícias e magias pendentes.
 */
export interface Build {
  /** URL de prévia local (`blob:`) ou da arte padrão. */
  avatar: string;
  nome: string;
  codinome: string;
  conceito: string;
  aparencia: string;
  regiao: RegiaoIdV12 | "";
  /** Cidade, distrito ou comunidade de origem. */
  local: string;
  /** Slug do Antecedente publicado. */
  antecedente: string;
  /** Texto livre "Como se tornou refratário". */
  origem: string;
  /** Slug → pontos. */
  qualidades: Record<string, number>;
  complicacoes: Record<string, number>;
  /** Slug da Classe publicada. */
  classe: string;
  /** Corpo, Mente, Ânimo. */
  atributos: [number, number, number];
  vertente: VertenteId | "";
  magias: string[];
}

export type SetBuild = (p: Partial<Build>) => void;

export const PASSOS = [
  { key: "conceito", label: "Conceito", group: "CONCEITO" },
  { key: "regiao", label: "Região", group: "TRAJETÓRIA" },
  { key: "antecedente", label: "Antecedente", group: "TRAJETÓRIA" },
  { key: "tracos", label: "Traços", group: "TRAJETÓRIA" },
  { key: "classe", label: "Classe", group: "CLASSE" },
  { key: "atributos", label: "Atributos", group: "MECÂNICA" },
  { key: "vertente", label: "Vertente", group: "MECÂNICA" },
  { key: "revisao", label: "Revisão", group: "SELAGEM" },
] as const;

/** Rótulos das categorias de Qualidades e Complicações, na ordem de exibição. */
export const CATEGORIAS_TRACO: Array<{ id: string; nome: string }> = [
  { id: "relacoes", nome: "Relações" },
  { id: "acesso_e_identidade", nome: "Acesso e Identidade" },
  { id: "recursos_e_infraestrutura", nome: "Recursos e Infraestrutura" },
  { id: "caracteristicas_pessoais", nome: "Características Pessoais" },
];

/** Arte provisória do avatar até o jogador enviar o dele (Unsplash; em espera no plano). */
export const AVATAR_PADRAO = "https://images.unsplash.com/photo-1660514163811-cc993ac5ff1f?w=700&h=900&fit=crop&auto=format&q=80";
