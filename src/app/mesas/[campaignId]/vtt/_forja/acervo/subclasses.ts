/**
 * Arte das Subclasses na Forja: `/forja/subclasses/<slug>.webp` (puxada das
 * páginas de classe do Notion) e o foco de cada uma — o ponto da imagem que
 * tem de ficar no centro do recorte (rosto, gesto, figura principal), em
 * frações da largura e da altura. Sem arte, a tela usa a da classe.
 */

/** [x, y] em frações da imagem (0 = esquerda/topo, 1 = direita/base). */
export type FocoArte = readonly [number, number];

const PADRAO: FocoArte = [0.5, 0.35];

const FOCO: Record<string, FocoArte> = {
  // Combatente
  acrobata: [0.46, 0.3],
  berserker: [0.54, 0.25],
  brutalista: [0.5, 0.5],
  mago_de_batalha: [0.4, 0.45],
  // Âncora
  colosso: [0.58, 0.4],
  guardiao: [0.5, 0.3],
  terapeuta: [0.47, 0.4],
  vitalista: [0.57, 0.35],
  // Caçador
  atirador_de_elite: [0.64, 0.4],
  batedor: [0.3, 0.5],
  dissecador: [0.62, 0.3],
  domador: [0.47, 0.35],
  // Face
  coordenador: [0.45, 0.4],
  icone: [0.5, 0.3],
  mercador: [0.72, 0.35],
  // Infiltrador
  assassino: [0.36, 0.3],
  perito: [0.34, 0.4],
  rato_de_rua: [0.55, 0.4],
  sorrateiro: [0.24, 0.65],
  // Técnico
  artifice: [0.4, 0.5],
  biomecanico: [0.55, 0.45],
  roboticista: [0.24, 0.55],
  tecelao: [0.3, 0.55],
};

export const arteSubclasse = (slug: string) => `/forja/subclasses/${slug}.webp`;
export const focoSubclasse = (slug: string): FocoArte => FOCO[slug] ?? PADRAO;

/**
 * `object-position` (em %) que põe o foco no centro do recorte de um
 * `object-fit: cover`, sem deixar a imagem descolar da borda. `caixa` é o
 * tamanho do elemento e `natural` o da imagem.
 */
export function posicaoDoFoco(foco: FocoArte, caixa: { w: number; h: number }, natural: { w: number; h: number }): string {
  const escala = Math.max(caixa.w / natural.w, caixa.h / natural.h);
  const eixo = (f: number, c: number, n: number) => {
    const visivel = c / (n * escala);
    if (visivel >= 0.995) return 50;
    return Math.round(Math.min(1, Math.max(0, (f - visivel / 2) / (1 - visivel))) * 1000) / 10;
  };
  return `${eixo(foco[0], caixa.w, natural.w)}% ${eixo(foco[1], caixa.h, natural.h)}%`;
}
