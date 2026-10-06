/**
 * O personagem em construção é um `DraftV12` (o mesmo formato do rascunho
 * do servidor), dentro do motor `useCriacao`. Aqui ficam só constantes de
 * apresentação da Forja.
 */
import type { DraftV12 } from "../../../../../lib/rulesetV12";

export type SetDraft = (p: Partial<DraftV12>) => void;

export const PASSOS = [
  { key: "conceito", label: "Conceito", group: "CONCEITO" },
  { key: "regiao", label: "Região", group: "TRAJETÓRIA" },
  { key: "antecedente", label: "Antecedente", group: "TRAJETÓRIA" },
  { key: "tracos", label: "Traços", group: "TRAJETÓRIA" },
  { key: "classe", label: "Classe", group: "CLASSE" },
  { key: "atributos", label: "Atributos", group: "MECÂNICA" },
  { key: "pericias", label: "Perícias", group: "MECÂNICA" },
  { key: "vertente", label: "Vertente", group: "MECÂNICA" },
  /** Só aparece com rank inicial acima de F (escolhas de cada avanço). */
  { key: "progressao", label: "Progressão", group: "MECÂNICA" },
  { key: "revisao", label: "Revisão", group: "SELAGEM" },
] as const;

/** Rótulos das categorias de Qualidades e Complicações, na ordem de exibição. */
export const CATEGORIAS_TRACO: Array<{ id: string; nome: string }> = [
  { id: "relacoes", nome: "Relações" },
  { id: "acesso_e_identidade", nome: "Acesso e Identidade" },
  { id: "recursos_e_infraestrutura", nome: "Recursos e Infraestrutura" },
  { id: "caracteristicas_pessoais", nome: "Características Pessoais" },
];

/** Ranking em que todo personagem novo começa (até existir o Ranking inicial da campanha). */
export const RANKING_INICIAL = "F";

/** Arte provisória do avatar até o jogador enviar o dele (Unsplash; em espera no plano). */
export const AVATAR_PADRAO = "https://images.unsplash.com/photo-1660514163811-cc993ac5ff1f?w=700&h=900&fit=crop&auto=format&q=80";
