/**
 * Testes PUROS da geometria de imagem no mapa.
 *
 * O invariante que importa: a imagem colada sobre a grade nunca sai
 * distorcida por causa da grade. O mapa é pointy-top, então o passo
 * horizontal (√3·tam) e o avanço de fileira (1,5·tam) são diferentes —
 * medir a imagem "em células" faria cada eixo usar uma unidade
 * distinta e esticaria tudo num fator ≈1,155. Por isso a imagem é
 * medida em METROS EUCLIDIANOS, com escala uniforme nos dois eixos.
 *
 * Nada aqui toca `<canvas>`: o pipeline real de decode/WebP/EXIF é
 * verificado em Playwright, porque só um browser de verdade prova
 * decode de verdade.
 *
 * Uso: npx tsx scripts/test-vtt-imagens.ts
 */

import {
  LADO_MAXIMO_PX,
  alturaEfetivaM,
  caixaDaGrade,
  dimensaoDentroDoTeto,
  dimensoesAposDownscale,
  gradeParaMapa,
  larguraInicialM,
  pxPorMetro,
  retanguloDaImagem,
  type ImagemCena,
} from "../src/app/mesas/[campaignId]/vtt/_dominio/imagemCena";
import { hexParaPixel, type Hex } from "../src/app/mesas/[campaignId]/vtt/_mapa/hex";

let passou = 0, falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}
const perto = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;

const TAM = 24;

function imagem(over: Partial<ImagemCena> = {}): ImagemCena {
  return {
    id: "i1", imageId: "a1", papel: "tile",
    centroQ: 0, centroR: 0, larguraM: 10, alturaM: null,
    rotacaoGraus: 0, opacidade: 1, camada: "abaixo_grade", z: 0,
    visivel: true, travado: false, revision: 1,
    widthPx: 800, heightPx: 400, ...over,
  };
}

// ── Escala uniforme ───────────────────────────────────────────────
ok("1 (PX_POR_METRO é √3·tam — a largura do hex entre faces, não o passo de fileira)",
  perto(pxPorMetro(TAM), Math.sqrt(3) * TAM), `${pxPorMetro(TAM).toFixed(4)}`);

{
  // O erro que a decisão evita: se o eixo y usasse o avanço de fileira
  // (1,5·tam), o mesmo metro valeria coisas diferentes em x e em y.
  const avancoFileira = 1.5 * TAM;
  const razao = pxPorMetro(TAM) / avancoFileira;
  ok("2 (usar o avanço de fileira no eixo y distorceria ≈1,155× — por isso NÃO se usa)",
    perto(razao, Math.sqrt(3) / 1.5, 1e-12) && razao > 1.15 && razao < 1.16, `razão ${razao.toFixed(4)}`);
}

{
  const r = retanguloDaImagem(imagem({ larguraM: 10 }), TAM);
  const razaoRet = r.largura / r.altura;
  ok("3 (proporção do retângulo é EXATAMENTE a do arquivo — os dois eixos usam a mesma escala)",
    perto(razaoRet, 800 / 400, 1e-9), `${razaoRet.toFixed(6)} vs 2`);
}

// ── Altura derivada ───────────────────────────────────────────────
ok("4 (altura nula = proporção do arquivo)",
  perto(alturaEfetivaM(imagem({ larguraM: 10, alturaM: null })), 5), "10 m de largura, 800×400 → 5 m");
ok("5 (altura explícita vence — é o único caminho para distorcer, e é deliberado)",
  perto(alturaEfetivaM(imagem({ larguraM: 10, alturaM: 9 })), 9), "9 m");

// ── Âncora no centro ──────────────────────────────────────────────
{
  const img = imagem({ centroQ: 3, centroR: 2, larguraM: 10 });
  const r = retanguloDaImagem(img, TAM);
  const centro = hexParaPixel({ q: 3, r: 2 }, TAM);
  ok("6 (o canto sai de centro − metade: a âncora é o CENTRO)",
    perto(r.x, centro.x - r.largura / 2) && perto(r.y, centro.y - r.altura / 2),
    `canto (${r.x.toFixed(2)}, ${r.y.toFixed(2)})`);
  ok("7 (o pivô de rotação é o mesmo centro)",
    perto(r.centroX, centro.x) && perto(r.centroY, centro.y), "coincide");
}

{
  // Coordenada contínua é requisito, não detalhe: um fundo raramente
  // cai sobre o centro exato de um hexágono.
  const a = retanguloDaImagem(imagem({ centroQ: 0, centroR: 0 }), TAM);
  const b = retanguloDaImagem(imagem({ centroQ: 0.5, centroR: 0 }), TAM);
  ok("8 (âncora contínua desloca de verdade — nada é arredondado para célula)",
    !perto(a.centroX, b.centroX) && perto(b.centroX - a.centroX, pxPorMetro(TAM) * 0.5, 1e-9),
    `Δx = ${(b.centroX - a.centroX).toFixed(4)}`);
}

// ── Downscale ─────────────────────────────────────────────────────
{
  const d = dimensoesAposDownscale(8000, 6000);
  ok("9 (downscale põe o MAIOR lado no teto)", d.largura === LADO_MAXIMO_PX, `${d.largura}×${d.altura}`);
  ok("10 (downscale preserva a proporção)",
    Math.abs(d.largura / d.altura - 8000 / 6000) < 1e-3, `${(d.largura / d.altura).toFixed(4)} vs 1.3333`);
}
{
  const d = dimensoesAposDownscale(1024, 768);
  ok("11 (imagem que já cabe não é reescalada — subir resolução só perde nitidez e ganha bytes)",
    d.largura === 1024 && d.altura === 768, "1024×768 intacta");
}
{
  const d = dimensoesAposDownscale(40000, 3);
  ok("12 (lado curto nunca arredonda para zero — canvas de largura 0 não decodifica)",
    d.altura >= 1 && d.largura === LADO_MAXIMO_PX, `${d.largura}×${d.altura}`);
}
{
  let lancou = false;
  try { dimensoesAposDownscale(0, 100); } catch { lancou = true; }
  ok("13 (dimensão inválida é recusada, não corrigida em silêncio)", lancou, "0 px lança");
}

// ── Largura inicial e teto ────────────────────────────────────────
ok("14 (fundo nasce cobrindo a cena inteira)",
  perto(larguraInicialM("fundo", 4000, 26), 26), "26 m numa cena de 26");
{
  const l = larguraInicialM("tile", 800, 26);
  ok("15 (tile nasce proporcional ao arquivo, com teto de meia cena)",
    l > 0 && l <= 13, `${l} m`);
}
ok("16 (teto de 4× a maior dimensão da cena: sangrar sim, cobrir dezesseis mapas não)",
  dimensaoDentroDoTeto(104, 26, 18) && !dimensaoDentroDoTeto(105, 26, 18), "104 passa, 105 não");
ok("17 (dimensão não-positiva nunca passa no teto)",
  !dimensaoDentroDoTeto(0, 26, 18) && !dimensaoDentroDoTeto(-1, 26, 18), "0 e -1 recusados");

// ── A caixa da grade ──────────────────────────────────────────────
// Verificada contra a grade DE VERDADE: as mesmas células que
// `MapaHex` monta, medidas pelos mesmos `hexParaPixel`. Uma fórmula
// conferida contra si mesma não prova nada.
function caixaMedida(largura: number, altura: number, tam = 40) {
  const RAIZ3 = Math.sqrt(3);
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (let r = 0; r < altura; r++) {
    for (let q = 0; q < largura; q++) {
      const c: Hex = { q: q - Math.floor(r / 2), r };
      const { x, y } = hexParaPixel(c, tam);
      xMin = Math.min(xMin, x - (RAIZ3 * tam) / 2);
      xMax = Math.max(xMax, x + (RAIZ3 * tam) / 2);
      yMin = Math.min(yMin, y - tam);
      yMax = Math.max(yMax, y + tam);
    }
  }
  return { xMin, xMax, yMin, yMax, tam };
}

for (const [largura, altura] of [[1, 1], [29, 29], [26, 18], [200, 1], [3, 2]]) {
  const tam = 40;
  const escala = pxPorMetro(tam);
  const c = caixaDaGrade(largura, altura);
  const m = caixaMedida(largura, altura, tam);
  const centro = hexParaPixel({ q: c.centroQ, r: c.centroR } as Hex, tam);
  const bate =
    perto(c.larguraM * escala, m.xMax - m.xMin)
    && perto(c.alturaM * escala, m.yMax - m.yMin)
    && perto(centro.x, (m.xMin + m.xMax) / 2)
    && perto(centro.y, (m.yMin + m.yMax) / 2);
  ok(`18 (a caixa de ${largura}×${altura} bate com a grade que MapaHex monta)`, bate,
    `${(c.larguraM * escala).toFixed(2)}×${(c.alturaM * escala).toFixed(2)} px`);
}

ok("19 (uma cena de 1×1 é um hexágono: √3·tam de largura, 2·tam de altura)",
  perto(caixaDaGrade(1, 1).larguraM, 1) && perto(caixaDaGrade(1, 1).alturaM, 2 / Math.sqrt(3)),
  `${caixaDaGrade(1, 1).larguraM} × ${caixaDaGrade(1, 1).alturaM} m`);

ok("20 (as fileiras ímpares alargam a caixa em meio metro)",
  perto(caixaDaGrade(10, 2).larguraM, 10.5) && perto(caixaDaGrade(10, 1).larguraM, 10),
  "10,5 m com duas fileiras; 10 m com uma");

// ── A volta: mapa → células → caixa ───────────────────────────────
// O que a folha "Nova cena" faz. Se a ida e a volta não fecharem, o
// mapa nasce torto — que é exatamente o defeito que isto corrige.
for (const [w, h, px] of [[2048, 2048, 70], [2000, 1400, 50], [3000, 1000, 100]]) {
  const { largura, altura } = gradeParaMapa(w, h, px);
  const c = caixaDaGrade(largura, altura);
  // A caixa, em pixels do arquivo, tem que bater com o arquivo a menos
  // do arredondamento para células inteiras — meia célula em cada eixo.
  const folgaX = Math.abs(c.larguraM * px - w);
  const folgaY = Math.abs(c.alturaM * px - h);
  ok(`21 (${w}×${h} px a ${px} px/m vira ${largura}×${altura} células sem sobrar mais que meia)`,
    folgaX <= px / 2 + 0.001 && folgaY <= px / 2 + 0.001,
    `sobra ${folgaX.toFixed(1)} × ${folgaY.toFixed(1)} px`);
}

ok("22 (a grade nunca sai da faixa do banco, por maior que seja o mapa)",
  (() => {
    const g = gradeParaMapa(40000, 40000, 8);
    return g.largura === 200 && g.altura === 200;
  })(), "presa em 200×200");

console.log(`\n${passou} ok, ${falhou} falha(s)`);
process.exit(falhou === 0 ? 0 : 1);
