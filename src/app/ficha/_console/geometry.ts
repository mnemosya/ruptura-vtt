/**
 * Geometria da janela do Console — helpers puros, sem React e sem DOM,
 * para poderem ser testados isoladamente (`scripts/test-console.ts`).
 *
 * A janela é posicionada em coordenadas de viewport (x/y = canto
 * superior esquerdo). O arraste nunca pode jogá-la inteiramente para
 * fora da tela: a topbar precisa continuar alcançável, então o clamp é
 * feito sobre uma faixa mínima visível, não sobre o retângulo todo.
 */

export interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Viewport {
  w: number;
  h: number;
}

/** Tamanho mínimo da janela (spec §1): abaixo disso o conteúdo rola. */
export const MIN_W = 1120;
export const MIN_H = 660;

/** Faixa da janela que precisa continuar dentro da viewport ao arrastar. */
const MARGEM_VISIVEL_X = 180;
const MARGEM_VISIVEL_Y = 44;

/** Recuo da janela maximizada em relação às bordas da área útil. */
export const INSET_MAXIMIZADO = 12;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Geometria inicial: próxima da proporção do wireframe (~86vw × 84vh),
 * respeitando os mínimos e centralizada. Em viewports menores que o
 * mínimo a janela fica no tamanho mínimo — o conteúdo é que rola.
 */
export function geometriaInicial(vp: Viewport): Geometry {
  const w = Math.max(MIN_W, Math.round(vp.w * 0.86));
  const h = Math.max(MIN_H, Math.round(vp.h * 0.84));
  return {
    w,
    h,
    x: Math.round((vp.w - w) / 2),
    y: Math.round((vp.h - h) / 2),
  };
}

/**
 * Mantém a janela alcançável depois de arrastar ou de a viewport mudar
 * de tamanho. Permite que ela saia parcialmente da tela (comportamento
 * normal de janela), mas nunca por completo.
 */
export function limitarPosicao(geo: Geometry, vp: Viewport): Geometry {
  const minX = -(geo.w - MARGEM_VISIVEL_X);
  const maxX = vp.w - MARGEM_VISIVEL_X;
  // A topbar nunca pode subir acima do topo da viewport.
  const minY = 0;
  const maxY = vp.h - MARGEM_VISIVEL_Y;
  return { ...geo, x: clamp(geo.x, minX, maxX), y: clamp(geo.y, minY, maxY) };
}

/**
 * Redimensionamento pelo canto inferior direito: respeita os mínimos e
 * não deixa a janela crescer além da viewport a partir da posição atual.
 */
export function redimensionar(geo: Geometry, larguraAlvo: number, alturaAlvo: number, vp: Viewport): Geometry {
  const maxW = Math.max(MIN_W, vp.w - geo.x);
  const maxH = Math.max(MIN_H, vp.h - geo.y);
  return {
    ...geo,
    w: clamp(Math.round(larguraAlvo), MIN_W, maxW),
    h: clamp(Math.round(alturaAlvo), MIN_H, maxH),
  };
}

/** Área útil ocupada ao maximizar (com o inset visual da spec §1). */
export function geometriaMaximizada(vp: Viewport): Geometry {
  return {
    x: INSET_MAXIMIZADO,
    y: INSET_MAXIMIZADO,
    w: Math.max(MIN_W, vp.w - INSET_MAXIMIZADO * 2),
    h: Math.max(MIN_H, vp.h - INSET_MAXIMIZADO * 2),
  };
}
