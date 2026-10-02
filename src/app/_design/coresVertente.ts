/**
 * A PALETA DAS VERTENTES — fonte única para quem pinta em TypeScript
 * (o anel do token no mapa, o holograma e as cartas da Forja).
 *
 * As folhas de estilo repetem estes valores em `--rv-vertente-cor`
 * (`vtt.css`, `console.css`) porque CSS não importa TS; se mudar aqui,
 * mude lá também.
 *
 * Energética é laranja e o ciano é da Sináptica: o ciano é a cor
 * estrutural do chassi inteiro, e uma Vertente vestida com ela não se
 * lia como Vertente, se lia como "selecionado".
 */
export const CORES_VERTENTE = {
  biotica: "#2f9e56",
  cognitiva: "#8b5cf6",
  material: "#f5a200",
  energetica: "#f07a1f",
  cinetica: "#e0455f",
  sinaptica: "#35c7d8",
  nenhuma: "#6b7f8c",
} as const;

export type VertenteComCor = keyof typeof CORES_VERTENTE;

/**
 * Cor do BRILHO (glow, feixe, luz do projetor). Biótica e Cognitiva são
 * escuras demais para brilhar sobre fundo escuro: o brilho delas sobe um
 * pouco para o branco, sem mudar a cor base usada em bordas e marcas.
 */
export function brilhoVertente(v: VertenteComCor): string {
  const base = CORES_VERTENTE[v];
  return v === "biotica" || v === "cognitiva" ? `color-mix(in srgb, ${base} 72%, #ffffff)` : base;
}
