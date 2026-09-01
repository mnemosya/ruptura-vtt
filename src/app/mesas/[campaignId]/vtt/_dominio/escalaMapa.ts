/**
 * Escala do mapa — ÚNICO lugar que converte metros ↔ unidades do mundo
 * ↔ coordenada axial. Nenhum outro módulo pode conter fator de escala,
 * `Math.sqrt(3)` solto ou número mágico de célula: quem precisa
 * converter importa daqui.
 *
 * A REGRA (docs/fontes/16 COMBATE → "ESPAÇOS E MEDIDAS"): "cada célula
 * equivale a 1 metro", e toda medida de alcance/área é convertida 1:1
 * entre metros e células de DISTÂNCIA.
 *
 * A GEOMETRIA REAL do mapa (`_mapa/hex.ts`): hexágono pointy-top de
 * raio (centro→vértice) `tamanhoCelula`, posicionado por
 * `hexParaPixel`. Nessa disposição, os 6 vizinhos de uma célula ficam
 * TODOS a `tamanhoCelula · √3` unidades do mundo do centro dela —
 * conferido nos dois eixos:
 *
 *     hexParaPixel({q:1,r:0}) = (T√3, 0)           → |·| = T√3
 *     hexParaPixel({q:0,r:1}) = (T√3/2, 1,5·T)     → |·| = T√3
 *
 * Logo **1 metro de distância = `tamanhoCelula · √3` unidades do
 * mundo** — e é ISSO que este módulo chama de metro. Note o que isso
 * NÃO significa: o hexágono não mede 1 m em todo eixo geométrico (de
 * vértice a vértice, na vertical, ele mede 2·T ≈ 1,1547 m). A regra do
 * sistema é sobre distância entre células, não sobre a largura do
 * desenho em cada direção — e a regra dos 50% é uma RAZÃO de áreas,
 * então a unidade se cancela e nada disso a afeta.
 *
 * Coordenada axial FRACIONÁRIA (`PontoAxial`) é a forma canônica de
 * PERSISTIR um ponto contínuo da área: independe de zoom, de pan e do
 * valor de `tamanhoCelula` escolhido pela renderização. `hexParaPixel`
 * é uma transformação LINEAR de (q, r) — funciona igual para valores
 * não-inteiros (é o mesmo motivo pelo qual `_dominio/pegada.ts` já
 * devolve `HexFracionario` em `origemMecanica`).
 */

import { type Hex, hexParaPixel } from "../_mapa/hex";

/** Ponto contínuo em coordenada axial — mesma semântica de `Hex`, só que `q`/`r` podem ser fracionários. */
export interface PontoAxial {
  q: number;
  r: number;
}

/** Ponto em unidades do MUNDO (antes de zoom/pan) — o espaço em que toda a geometria de área é resolvida. */
export interface PontoMundo {
  x: number;
  y: number;
}

/**
 * Quantas unidades do mundo vale 1 metro, dado o raio do hexágono.
 * Deriva da própria `hexParaPixel` (ver cabeçalho) — nunca uma
 * constante digitada em paralelo com ela.
 */
export function metrosParaMundo(metros: number, tamanhoCelula: number): number {
  return metros * tamanhoCelula * Math.sqrt(3);
}

/** Inverso de `metrosParaMundo`. */
export function mundoParaMetros(unidades: number, tamanhoCelula: number): number {
  return unidades / (tamanhoCelula * Math.sqrt(3));
}

/** Axial (inteiro OU fracionário) → unidades do mundo. Mesma fórmula de `hexParaPixel`, reusada, nunca reescrita. */
export function axialParaMundo(p: PontoAxial, tamanhoCelula: number): PontoMundo {
  return hexParaPixel(p as Hex, tamanhoCelula);
}

/**
 * Unidades do mundo → axial FRACIONÁRIO (sem arredondar pra célula).
 * `pixelParaHex` de `_mapa/hex.ts` faz a mesma conta mas ARREDONDA no
 * fim (é o que ela precisa fazer: descobrir em qual célula o cursor
 * está). Aqui o ponto contínuo é o resultado desejado — arredondar
 * destruiria justamente a informação que uma área precisa guardar.
 */
export function mundoParaAxial(x: number, y: number, tamanhoCelula: number): PontoAxial {
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / tamanhoCelula;
  const r = ((2 / 3) * y) / tamanhoCelula;
  return { q, r };
}

/**
 * Área de UMA célula em unidades do mundo ao quadrado — hexágono
 * regular de raio `tamanhoCelula`: `(3√3/2)·T²`. É o denominador da
 * regra dos 50%.
 */
export function areaDaCelula(tamanhoCelula: number): number {
  return (3 * Math.sqrt(3) / 2) * tamanhoCelula * tamanhoCelula;
}

/**
 * Os 6 vértices do polígono REAL de uma célula, já em coordenadas
 * absolutas do mundo. É este polígono — não o centro, não a distância
 * entre centros, não uma caixa retangular — que a regra dos 50% mede.
 */
export function poligonoDaCelula(celula: Hex, tamanhoCelula: number): PontoMundo[] {
  const centro = hexParaPixel(celula, tamanhoCelula);
  const pts: PontoMundo[] = [];
  for (let i = 0; i < 6; i++) {
    // -90° deixa a ponta pra cima (pointy-top) — mesma convenção de `hexVertices`.
    const ang = (Math.PI / 180) * (60 * i - 90);
    pts.push({ x: centro.x + tamanhoCelula * Math.cos(ang), y: centro.y + tamanhoCelula * Math.sin(ang) });
  }
  return pts;
}
