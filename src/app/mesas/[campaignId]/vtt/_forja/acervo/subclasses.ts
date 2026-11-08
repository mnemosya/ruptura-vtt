/**
 * Arte das Subclasses na Forja: `/forja/subclasses/<slug>.webp` (puxada das
 * páginas de classe do Notion) e o enquadramento de cada uma, medido nas
 * pranchetas da Progressão. Sem arte, a tela usa a da classe.
 */

export interface EnquadramentoSubclasse {
  /** Retrato alto (painel da subclasse, "Você ganha"). */
  retrato: string;
  /** Faixa larga (cartas do roster). */
  faixa: string;
}

const PADRAO: EnquadramentoSubclasse = { retrato: "50% 30%", faixa: "50% 26%" };

const ENQUADRAMENTO: Record<string, EnquadramentoSubclasse> = {
  acrobata: { retrato: "46% 26%", faixa: "46% 20%" },
  brutalista: { retrato: "44% 42%", faixa: "42% 36%" },
  dissecador: { retrato: "70% 20%", faixa: "68% 16%" },
  mago_de_batalha: { retrato: "34% 32%", faixa: "34% 28%" },
  berserker: { retrato: "50% 40%", faixa: "50% 34%" },
  colosso: { retrato: "50% 30%", faixa: "50% 26%" },
  guardiao: { retrato: "50% 26%", faixa: "50% 22%" },
};

export const arteSubclasse = (slug: string) => `/forja/subclasses/${slug}.webp`;
export const enquadramentoSubclasse = (slug: string) => ENQUADRAMENTO[slug] ?? PADRAO;
