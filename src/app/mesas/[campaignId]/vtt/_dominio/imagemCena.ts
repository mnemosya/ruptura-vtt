/**
 * Geometria de imagem sobre o mapa — puro, sem React e sem DOM, para
 * ser testável direto (`scripts/test-vtt-imagens.ts`).
 *
 * ── POR QUE METRO, E NÃO "CÉLULA" ───────────────────────────────────
 * `hexParaPixel` (`_mapa/hex.ts`) é pointy-top:
 *
 *     x = tam · √3 · (q + r/2)          y = tam · (3/2) · r
 *
 * O passo horizontal vale `√3·tam`; o avanço de uma fileira vale
 * `1,5·tam`. São grandezas DIFERENTES. Se as dimensões da imagem
 * fossem "largura em células" e "altura em células", cada eixo estaria
 * medindo uma coisa distinta — e derivar a altura pela proporção em
 * pixels (`altura = largura · h/w`) distorceria a imagem de um fator
 * `√3/1,5 ≈ 1,155`, que é justamente o tipo de erro que ninguém vê no
 * mapa mas todo mundo sente.
 *
 * Por isso o retângulo é medido em METROS EUCLIDIANOS, com uma escala
 * ÚNICA nos dois eixos: `PX_POR_METRO = √3 · tam`, a largura do
 * hexágono entre faces opostas. É a mesma unidade em x e em y, então a
 * proporção do arquivo se preserva sozinha.
 *
 * A grade continua com a geometria dela; quem passa a ter escala
 * uniforme é só a imagem colada por cima.
 */

import { type Hex, hexParaPixel } from "../_mapa/hex";

/** Pixels de mundo por metro. `tamanho` é o raio do hexágono, como em `hexParaPixel`. */
export function pxPorMetro(tamanhoCelula: number): number {
  return Math.sqrt(3) * tamanhoCelula;
}

/** Lado máximo aceito — espelha `vtt_imagem_lado_max_px()` (0099). */
export const LADO_MAXIMO_PX = 4096;

export interface ImagemCena {
  id: string;
  imageId: string;
  papel: "fundo" | "tile";
  /** Âncora no CENTRO, axial e CONTÍNUA — um fundo raramente cai sobre o centro de um hexágono. */
  centroQ: number;
  centroR: number;
  larguraM: number;
  /** Nula = derivada da proporção do arquivo. Preenchida só quando alguém destravou a distorção de propósito. */
  alturaM: number | null;
  rotacaoGraus: number;
  opacidade: number;
  camada: "abaixo_grade" | "acima_grade";
  z: number;
  visivel: boolean;
  travado: boolean;
  revision: number;
  widthPx: number;
  heightPx: number;
}

/**
 * Altura efetiva: a explícita quando existe, senão a proporção real do
 * arquivo. Como os dois eixos usam a mesma escala, isto é uma regra de
 * três e nada mais.
 */
export function alturaEfetivaM(img: Pick<ImagemCena, "larguraM" | "alturaM" | "widthPx" | "heightPx">): number {
  if (img.alturaM !== null) return img.alturaM;
  if (img.widthPx <= 0) return img.larguraM;
  return (img.larguraM * img.heightPx) / img.widthPx;
}

export interface RetanguloMundo {
  x: number;
  y: number;
  largura: number;
  altura: number;
  /** Centro em pixels de mundo — é o pivô da rotação. */
  centroX: number;
  centroY: number;
}

/**
 * Retângulo em pixels de mundo, pronto para virar `<image>`. O centro é
 * a âncora, então o canto sai de `centro − metade`.
 */
export function retanguloDaImagem(img: ImagemCena, tamanhoCelula: number): RetanguloMundo {
  const escala = pxPorMetro(tamanhoCelula);
  // `hexParaPixel` aceita coordenadas contínuas sem arredondar — é
  // aritmética, não busca de célula.
  const centro = hexParaPixel({ q: img.centroQ, r: img.centroR } as Hex, tamanhoCelula);
  const largura = img.larguraM * escala;
  const altura = alturaEfetivaM(img) * escala;
  return {
    x: centro.x - largura / 2,
    y: centro.y - altura / 2,
    largura,
    altura,
    centroX: centro.x,
    centroY: centro.y,
  };
}

/**
 * Tamanho de destino do downscale, preservando proporção. Devolve o
 * original quando ele já cabe — reescalar para cima só perderia
 * nitidez e ganharia bytes.
 */
export function dimensoesAposDownscale(
  larguraPx: number,
  alturaPx: number,
  ladoMaximo = LADO_MAXIMO_PX,
): { largura: number; altura: number } {
  if (larguraPx <= 0 || alturaPx <= 0) {
    throw new Error("Dimensões inválidas.");
  }
  const maior = Math.max(larguraPx, alturaPx);
  if (maior <= ladoMaximo) return { largura: larguraPx, altura: alturaPx };

  const fator = ladoMaximo / maior;
  // `max(1, …)`: uma imagem muito alongada poderia arredondar o lado
  // curto para zero, e um `<canvas>` de largura 0 não decodifica.
  return {
    largura: Math.max(1, Math.round(larguraPx * fator)),
    altura: Math.max(1, Math.round(alturaPx * fator)),
  };
}

/**
 * Largura inicial sugerida ao colocar uma imagem. Um fundo nasce
 * cobrindo a cena inteira (é o que se espera de um mapa); um tile nasce
 * na proporção do arquivo a 1 px : 1 cm, com teto para não entrar
 * ocupando o mapa todo.
 */
export function larguraInicialM(
  papel: "fundo" | "tile",
  widthPx: number,
  larguraCena: number,
): number {
  if (papel === "fundo") return larguraCena;
  const porPixels = widthPx / 100;
  return Math.min(Math.max(porPixels, 1), Math.max(1, larguraCena / 2));
}

/** Teto da 0100: sangrar além da grade, sim; cobrir dezesseis mapas, não. */
export function dimensaoDentroDoTeto(
  valorM: number,
  larguraCena: number,
  alturaCena: number,
): boolean {
  return valorM > 0 && valorM <= 4 * Math.max(larguraCena, alturaCena);
}

/**
 * Projeção do servidor (`read_vtt_scene_images` / `vtt_scene_image_json`,
 * 0100) para o tipo do cliente.
 *
 * TOLERANTE como `camadasDeJson`: o que não bate a forma vira `null` e é
 * descartado pela lista, em vez de derrubar o mapa inteiro. Vale para a
 * leitura persistida e para qualquer payload futuro — um evento ao vivo
 * não é mais confiável que uma linha lida, e duas validações diferentes
 * é como estados impossíveis nascem.
 *
 * `numeric` do Postgres chega como STRING no JSON quando passa da
 * precisão de `double` (é o comportamento do driver, não um acidente):
 * por isso cada número passa por `Number(...)` e por um teste de
 * finitude, nunca por um cast.
 */
export function imagemCenaDeJson(bruto: unknown): ImagemCena | null {
  if (!bruto || typeof bruto !== "object") return null;
  const j = bruto as Record<string, unknown>;

  const texto = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
  const numero = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  };

  const id = texto(j.id);
  const imageId = texto(j.image_id);
  const papel = j.papel === "fundo" || j.papel === "tile" ? j.papel : null;
  const camada = j.camada === "abaixo_grade" || j.camada === "acima_grade" ? j.camada : null;
  const centroQ = numero(j.centro_q);
  const centroR = numero(j.centro_r);
  const larguraM = numero(j.largura_m);
  const widthPx = numero(j.width_px);
  const heightPx = numero(j.height_px);
  if (id === null || imageId === null || papel === null || camada === null) return null;
  if (centroQ === null || centroR === null || larguraM === null) return null;
  if (widthPx === null || heightPx === null) return null;

  return {
    id, imageId, papel, camada, centroQ, centroR, larguraM, widthPx, heightPx,
    // `altura_m` nulo é significativo: quer dizer "derive da proporção".
    // Só um número de verdade destrava a distorção.
    alturaM: j.altura_m === null || j.altura_m === undefined ? null : numero(j.altura_m),
    rotacaoGraus: numero(j.rotacao_graus) ?? 0,
    opacidade: numero(j.opacidade) ?? 1,
    z: numero(j.z) ?? 0,
    visivel: j.visivel !== false,
    travado: j.travado === true,
    revision: numero(j.revision) ?? 1,
  };
}

/** A lista inteira, descartando em silêncio o que não valida. */
export function imagensCenaDeJson(bruto: unknown): ImagemCena[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.map(imagemCenaDeJson).filter((i): i is ImagemCena => i !== null);
}
