/**
 * Conversão de FORÇA (0–1, "quanto tempo o botão foi segurado") para
 * parâmetros FÍSICOS do lançamento — a única ponte entre a UI de
 * carregar força (`RollButton`) e o `cannon-es` (`ArenaDados`).
 *
 * Módulo PURO: sem `three`, sem `cannon-es`, sem DOM. Só números —
 * testável sem navegador, em `scripts/test-vtt-controlador.ts`.
 *
 * A força NUNCA escolhe a face: ela só entra como módulo de impulso,
 * componente vertical, teto de giro e (opcionalmente) uma variação a
 * mais na posição de largada. Qual número sai continua sendo lido
 * depois que o corpo físico dorme (`topFaceValue`, em `ArenaDados`),
 * exatamente como antes desta mecânica existir.
 */

/**
 * Piso da força EFETIVA — mesmo um toque instantâneo (força bruta ≈ 0)
 * ainda lança os dados com este mínimo, pra nunca produzir uma
 * "rolagem" que não rola.
 */
export const FORCA_MINIMA = 0.25;

/**
 * Quanto tempo de pressão, em ms, leva pra ir de 0% a 100% de carga.
 * 2000ms — o mesmo tempo do estudo `charge dice` (`CHARGE_DURATION`),
 * de onde vieram os efeitos visuais de carregar força.
 */
export const CARGA_MAX_MS = 2000;

export interface ParametrosLancamento {
  /** Módulo do impulso horizontal (eixos X/Z), em unidades/s. */
  velocidadeHorizontal: number;
  /** Impulso vertical (eixo Y), em unidades/s. */
  velocidadeVertical: number;
  /** Teto do giro inicial em cada eixo, em rad/s. */
  velocidadeAngularMax: number;
  /** Variação extra de posição inicial (jitter), em unidades — some cedo, é só textura. */
  jitterPosicao: number;
}

/**
 * `forca` chega como o quanto do tempo de carga (0–1) foi acumulado —
 * SEMPRE clampada aqui, então um valor fora de faixa (NaN, negativo,
 * >1 por um `Math.max` de fila) nunca vaza pra física. A força
 * EFETIVA aplica o piso `FORCA_MINIMA` por cima do valor já clampado.
 */
export function parametrosDeLancamento(forca: number): ParametrosLancamento {
  const bruta = Number.isFinite(forca) ? forca : 0;
  const clampada = Math.max(0, Math.min(1, bruta));
  const efetiva = Math.max(FORCA_MINIMA, clampada);
  // Faixa alargada de propósito: o piso (força mínima) e o teto (carga
  // máxima) precisam se LER como coisas diferentes na mesa, não só no
  // botão — um toque rápido mal move o dado, carga máxima manda ele
  // longe e girando rápido.
  return {
    velocidadeHorizontal: 2 + efetiva * 10,
    velocidadeVertical: 1.5 + efetiva * 7,
    velocidadeAngularMax: 6 + efetiva * 26,
    jitterPosicao: 0.12 + efetiva * 0.18,
  };
}
