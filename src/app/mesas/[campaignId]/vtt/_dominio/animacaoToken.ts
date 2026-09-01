/**
 * Matemática PURA da animação de movimento de token — duração
 * ponderada por terreno, easing e interpolação ao longo da rota
 * expandida. Nada aqui toca DOM, `requestAnimationFrame` ou React: é o
 * que permite testar a velocidade/trajetória sem browser
 * (`scripts/test-vtt-animacao.ts`), e é a MESMA lógica que tanto o
 * autor do movimento quanto quem recebe o broadcast usam — a rota e o
 * relógio são os únicos insumos que variam entre eles.
 *
 * Fonte do pedido: "anime o token real percorrendo a rota, passando
 * pelos centros dos hexágonos intermediários" — nunca um salto reto
 * origem→destino, nunca um teleporte, nunca uma pausa perceptível em
 * cada célula.
 */

import { type Hex, hexParaPixel } from "../_mapa/hex";
import { type MapaTerreno, terrenoEm } from "./movimento";

/** Ponto de partida sugerido pelo pedido — ajustável após inspeção visual, não uma regra do sistema de jogo. */
export const MS_POR_HEX = 110;
export const DURACAO_MINIMA = 140;
export const DURACAO_MAXIMA = 900;

/** Peso de duração visual por célula ENTRADA — não é o custo mecânico de deslocamento (esse continua vindo de `custoDeEntrada`, inalterado). */
export const PESO_NORMAL = 1;
export const PESO_DIFICIL = 1.5;

/** Curta transição de reconciliação — retração por rejeição, ou troca de rota em pleno voo (concorrência). Fora da faixa normal de propósito: nunca deveria competir com MS_POR_HEX por parecer "um movimento a mais". */
export const DURACAO_RECONCILIACAO = 200;
/** Fallback de eco do banco sem broadcast recebido — reta curta, nunca a duração cheia de uma rota desconhecida. */
export const DURACAO_FALLBACK_SEM_BROADCAST = 180;
/** Acima desta distância, um eco sem rota conhecida prefere snap discreto a uma reta longa demais pra ser lida como "movimento", ver `VttClient.tsx`. */
export const DISTANCIA_MAXIMA_FALLBACK_RETO = 6;

/**
 * Um peso por SEGMENTO da rota expandida (`rota.length - 1` pesos) —
 * o peso de entrar em `rota[i+1]`. Célula normal pesa `PESO_NORMAL`,
 * terreno difícil pesa `PESO_DIFICIL`. Puramente visual: não altera o
 * custo de deslocamento mecânico, que continua vindo só de
 * `custoDeEntrada`/`montarRota`.
 */
export function pesosDaRota(rota: Hex[], terreno: MapaTerreno): number[] {
  const pesos: number[] = [];
  for (let i = 1; i < rota.length; i++) {
    pesos.push(terrenoEm(terreno, rota[i]) === "dificil" ? PESO_DIFICIL : PESO_NORMAL);
  }
  return pesos;
}

/**
 * Duração total em ms a partir dos pesos por segmento — proporcional
 * ao comprimento PONDERADO da rota (não à contagem crua de células),
 * clampada entre `DURACAO_MINIMA` e `DURACAO_MAXIMA`. Uma rota de 0
 * segmentos (origem === destino) não deveria ser chamada — quem chama
 * já filtra esse caso antes de iniciar uma animação.
 */
export function calcularDuracao(pesos: number[]): number {
  const soma = pesos.reduce((a, p) => a + p, 0);
  return Math.max(DURACAO_MINIMA, Math.min(DURACAO_MAXIMA, soma * MS_POR_HEX));
}

/**
 * `rawT` (0..1, tempo decorrido / duração) → progresso visual (0..1).
 * Linear até 85% do percurso, `easeOutCubic` só nos últimos 15% — a
 * velocidade quase não varia ao longo da rota, com uma desaceleração
 * curta perceptível só na chegada. Aplicar easing em CADA segmento
 * (em vez de uma vez só sobre o percurso inteiro) é exatamente o que o
 * pedido pede pra evitar: o token acelerando/freando a cada hexágono.
 */
const LIMIAR_EASING = 0.85;
export function progressoComEasing(rawT: number): number {
  const t = Math.max(0, Math.min(1, rawT));
  if (t >= 1) return 1;
  if (t < LIMIAR_EASING) return t;
  const local = (t - LIMIAR_EASING) / (1 - LIMIAR_EASING);
  const eased = 1 - Math.pow(1 - local, 3); // easeOutCubic
  return LIMIAR_EASING + eased * (1 - LIMIAR_EASING);
}

/**
 * Posição em pixels do MUNDO (antes de zoom/pan — o mesmo espaço que
 * `hexParaPixel` já usa em todo o resto do mapa) pra um progresso 0..1
 * JÁ COM EASING aplicado. Encontra o segmento onde o progresso cai
 * (por comprimento PONDERADO acumulado, não por índice cru — é o que
 * faz terreno difícil "pesar" na velocidade) e interpola linearmente
 * entre os centros dos dois hexágonos daquele segmento.
 *
 * `rota.length === 1` (origem === destino, sem segmento nenhum) sempre
 * devolve o centro dessa única célula — chamar isto faz sentido só
 * como caso de borda defensivo; quem inicia uma animação já filtra
 * rotas de comprimento 1 antes de chegar aqui.
 */
export function posicaoNaRota(rota: Hex[], pesos: number[], progresso01: number, tamanhoCelula: number): { x: number; y: number } {
  if (rota.length <= 1) {
    const unica = rota[0] ?? { q: 0, r: 0 };
    return hexParaPixel(unica, tamanhoCelula);
  }
  const somaPesos = pesos.reduce((a, p) => a + p, 0);
  if (somaPesos <= 0) return hexParaPixel(rota[rota.length - 1], tamanhoCelula);

  const alvo = Math.max(0, Math.min(1, progresso01)) * somaPesos;
  let acumulado = 0;
  for (let i = 0; i < pesos.length; i++) {
    const proximoAcumulado = acumulado + pesos[i];
    // Último segmento recebe `<=` pra fechar em progresso===1 mesmo com arredondamento de ponto flutuante.
    if (alvo <= proximoAcumulado || i === pesos.length - 1) {
      const fracaoLocal = pesos[i] > 0 ? (alvo - acumulado) / pesos[i] : 1;
      const a = hexParaPixel(rota[i], tamanhoCelula);
      const b = hexParaPixel(rota[i + 1], tamanhoCelula);
      const f = Math.max(0, Math.min(1, fracaoLocal));
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    acumulado = proximoAcumulado;
  }
  return hexParaPixel(rota[rota.length - 1], tamanhoCelula);
}

/**
 * Descreve UMA animação de movimento ativa pra um token — a peça de
 * estado central desta feature. `tokenId` é o id PERSISTIDO (UUID real
 * de `vtt_tokens`), usado pra correlacionar com o eco do banco e o
 * broadcast entre clientes; a chave do mapa que guarda isto em
 * `VttClient`/`MapaHex` é o id DEMO (`cena.tokens[].id`), o mesmo que
 * já indexa seleção/hover/estado visual em todo o resto do mapa.
 */
export interface MovimentoVisualToken {
  /** Identifica ESTE movimento especificamente — usado pra dedupe entre broadcast local, eco do próprio autor, eco do banco e retry. */
  movementId: string;
  /** Id PERSISTIDO do token (`vtt_tokens.id`), não o id demo. */
  tokenId: string;
  /** Rota expandida, célula a célula, adjacente — a mesma mandada a `move_vtt_token`. */
  rota: Hex[];
  /** Um peso por segmento — `rota.length - 1` entradas. */
  pesos: number[];
  /** `performance.now()` de quando a animação começou (ou deveria ter começado, pra quem recebeu via broadcast com atraso de rede). */
  inicio: number;
  /** Duração total em ms. */
  duracao: number;
  origem: Hex;
  destino: Hex;
}

/** `agora` (mesmo relógio de `inicio`, ou seja `performance.now()`) → posição interpolada + se já terminou. */
export function interpolarMovimento(mov: MovimentoVisualToken, agora: number, tamanhoCelula: number): { x: number; y: number; concluido: boolean } {
  const elapsed = agora - mov.inicio;
  const rawT = mov.duracao <= 0 ? 1 : elapsed / mov.duracao;
  const progresso = progressoComEasing(rawT);
  const pos = posicaoNaRota(mov.rota, mov.pesos, progresso, tamanhoCelula);
  return { x: pos.x, y: pos.y, concluido: rawT >= 1 };
}
