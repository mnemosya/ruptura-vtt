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
 * A CAIXA DA GRADE, em metros euclidianos e com o centro em axial —
 * tudo o que um fundo precisa saber para cobrir a cena exatamente.
 *
 * Existe porque a grade NÃO é um retângulo de `largura × altura`
 * metros, e tratá-la como se fosse foi o defeito que punha o mapa
 * torto. Três coisas atrapalham, e todas são geometria de hexágono:
 *
 * 1. As FILEIRAS ÍMPARES são deslocadas meio hexágono para a direita
 *    (`MapaHex` monta a grade como `{q: coluna − ⌊r/2⌋, r}`). A caixa
 *    é, portanto, meio metro mais larga do que o número de colunas.
 * 2. Uma fileira avança `1,5·tam` px, mas um metro vale `√3·tam` px.
 *    A altura da caixa é `(1,5·altura + 0,5)/√3` metros, ≈ 87% do
 *    número de fileiras — e não o número de fileiras.
 * 3. O CENTRO em axial não é `((largura−1)/2, (altura−1)/2)`: como
 *    `x = √3·tam·(q + r/2)`, o `r` do centro empurra o `q` do centro.
 *    Era esse termo que faltava, e o erro crescia com a altura da cena.
 *
 * Medida nas pontas dos hexágonos das bordas, não nos centros: o mapa
 * tem que passar POR BAIXO da fileira inteira, não parar no meio dela.
 */
export interface CaixaDaGrade {
  larguraM: number;
  alturaM: number;
  /** Centro da caixa em axial CONTÍNUO — pronto para `centroQ`/`centroR`. */
  centroQ: number;
  centroR: number;
}

export function caixaDaGrade(largura: number, altura: number): CaixaDaGrade {
  const RAIZ3 = Math.sqrt(3);
  // Em px de mundo com `tam = 1`: meia largura do hexágono é √3/2, e
  // meia altura é 1 (ponta pra cima).
  const temFileiraImpar = altura >= 2;
  const xMaxCentro = RAIZ3 * (largura - 1) + (temFileiraImpar ? RAIZ3 / 2 : 0);
  const xMin = -RAIZ3 / 2;
  const xMax = xMaxCentro + RAIZ3 / 2;
  const yMin = -1;
  const yMax = 1.5 * (altura - 1) + 1;

  const centroR = ((yMin + yMax) / 2) / 1.5;
  const centroQ = ((xMin + xMax) / 2) / RAIZ3 - centroR / 2;
  return {
    larguraM: (xMax - xMin) / RAIZ3,
    alturaM: (yMax - yMin) / RAIZ3,
    centroQ,
    centroR,
  };
}

/**
 * O INVERSO: quantas células pede um mapa de tantos pixels, com tantos
 * pixels por metro.
 *
 * Serve à criação de cena a partir de um mapa, e é a mesma conta de
 * `caixaDaGrade` resolvida para `largura` e `altura`. Fazer as duas
 * pontas pela mesma geometria é o que faz o mapa nascer alinhado em vez
 * de nascer quase alinhado.
 */
export function gradeParaMapa(
  widthPx: number,
  heightPx: number,
  celulaPx: number,
  { min = 1, max = 200 }: { min?: number; max?: number } = {},
): { largura: number; altura: number } {
  const RAIZ3 = Math.sqrt(3);
  if (celulaPx <= 0) return { largura: min, altura: min };
  const prender = (n: number) => Math.max(min, Math.min(max, Math.round(n)));
  // `− 0,5` desconta o deslocamento das fileiras ímpares; a altura
  // desfaz o `(1,5·altura + 0,5)/√3` da caixa.
  return {
    largura: prender(widthPx / celulaPx - 0.5),
    altura: prender(((heightPx / celulaPx) * RAIZ3 - 0.5) / 1.5),
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

/* ── BIBLIOTECA DA CAMPANHA ─────────────────────────────────────────
   O que `read_vtt_campaign_images` devolve: todo asset `ready` da
   campanha, sem saber onde está em uso. É deliberadamente pouco — a
   biblioteca serve para RECOLOCAR um arquivo sem subir de novo, e para
   isso bastam miniatura, tamanho e data. */

export interface ImagemBiblioteca {
  id: string;
  widthPx: number;
  heightPx: number;
  bytes: number;
  criadaEm: string;
  /** Quantas colocações de cena usam este arquivo. */
  usosCena: number;
  /** Quantos tokens o usam como retrato próprio. */
  usosRetrato: number;
  /** Quantas fichas o usam como avatar. */
  usosAvatar: number;
}

/**
 * O que este arquivo É, pelo uso que tem. Um asset pode ser as três
 * coisas (a deduplicação por `sha256` é o que torna isso barato), e
 * por isso a resposta é o uso PREDOMINANTE, na ordem em que a pessoa
 * pensa quando está montando uma cena: se já está numa cena, é imagem
 * de cena; se só aparece como avatar de ficha ou retrato, é imagem de
 * TOKEN (é assim que ela aparece na mesa); sem uso nenhum, é só um
 * arquivo.
 */
export function usoDaImagem(img: ImagemBiblioteca): "cena" | "token" | "solta" {
  if (img.usosCena > 0) return "cena";
  if (img.usosAvatar > 0 || img.usosRetrato > 0) return "token";
  return "solta";
}

export function imagemBibliotecaDeJson(bruto: unknown): ImagemBiblioteca | null {
  if (!bruto || typeof bruto !== "object") return null;
  const j = bruto as Record<string, unknown>;
  const texto = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
  const numero = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const id = texto(j.id);
  const widthPx = numero(j.width_px);
  const heightPx = numero(j.height_px);
  if (id === null || widthPx === null || heightPx === null) return null;
  return {
    id,
    widthPx,
    heightPx,
    bytes: numero(j.bytes) ?? 0,
    criadaEm: texto(j.created_at) ?? "",
    usosCena: numero(j.usos_cena) ?? 0,
    usosRetrato: numero(j.usos_retrato) ?? 0,
    usosAvatar: numero(j.usos_avatar) ?? 0,
  };
}

/** "1,2 MB", "840 KB" — peso legível para a legenda da miniatura. */
export function pesoLegivel(bytes: number): string {
  const kb = bytes / 1024;
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(kb))} KB`;
}
