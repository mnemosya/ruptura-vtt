/** Ensaio de renderização SVG sintética para LIGHT-01.
 * Execute: node scripts/dev/prototipo-light-01-browser.mjs
 * Requer Chromium do Playwright. Não usa a aplicação ou uma sessão real.
 */
import { chromium } from "playwright";
import { gerarCena, poligonoVisivel } from "./prototipo-light-01.mjs";

function caminho(poligono, escala, deslocamento = 0) {
  const pontos = poligono.pontos;
  return pontos.length ? `M${(pontos[0].x + deslocamento) * escala},${pontos[0].y * escala} `
    + pontos.slice(1).map((p) => `L${(p.x + deslocamento) * escala},${p.y * escala}`).join(" ") + " Z" : "";
}

function percentil(valores, p) {
  const ordenados = [...valores].sort((a, b) => a - b);
  return Number(ordenados[Math.min(ordenados.length - 1, Math.ceil(p * ordenados.length) - 1)].toFixed(2));
}

async function medir(browser, config) {
  const { nome, largura, altura, paredes, fontes, raio } = config;
  const escala = 8;
  const cena = gerarCena(largura, altura, paredes, fontes, 20261008);
  const poligonos = cena.fontes.map((fonte) => poligonoVisivel(fonte, cena.paredes, raio));
  const caminhosA = poligonos.map((p) => caminho(p, escala, 0));
  const caminhosB = poligonos.map((p) => caminho(p, escala, 0.3));
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const client = await page.context().newCDPSession(page);
  await client.send("Performance.enable");
  const resultado = await page.evaluate(async ({ largura, altura, escala, caminhosA, caminhosB }) => {
    const ns = "http://www.w3.org/2000/svg";
    const el = (tag, attrs = {}) => {
      const node = document.createElementNS(ns, tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
      return node;
    };
    const svg = el("svg", { width: largura * escala, height: altura * escala, viewBox: `0 0 ${largura * escala} ${altura * escala}` });
    const defs = el("defs");
    const mask = el("mask", { id: "escuridao", maskUnits: "userSpaceOnUse", x: 0, y: 0, width: largura * escala, height: altura * escala });
    mask.append(el("rect", { x: 0, y: 0, width: largura * escala, height: altura * escala, fill: "white" }));
    const aberturas = caminhosA.map((d) => {
      const p = el("path", { d, fill: "black" });
      mask.append(p);
      return p;
    });
    defs.append(mask);
    svg.append(defs);
    const mapa = el("g");
    const bloco = document.createDocumentFragment();
    const forma = `M0,${-escala / 2} L${escala / 2},${-escala / 4} L${escala / 2},${escala / 4} L0,${escala / 2} L${-escala / 2},${escala / 4} L${-escala / 2},${-escala / 4} Z`;
    for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) {
      bloco.append(el("path", { d: forma, transform: `translate(${x * escala} ${y * escala})`, fill: "#263345", stroke: "#394c61", "stroke-width": 0.4 }));
    }
    mapa.append(bloco);
    svg.append(mapa);
    svg.append(el("rect", { x: 0, y: 0, width: largura * escala, height: altura * escala, fill: "#020407", opacity: 0.87, mask: "url(#escuridao)", "pointer-events": "none" }));
    document.body.style.margin = "0";
    document.body.append(svg);
    const raf = () => new Promise((resolve) => requestAnimationFrame(resolve));
    await raf(); await raf(); await raf();
    const atualizacoes = [];
    const intervalos = [];
    let ultimoFrame = performance.now();
    for (let i = 0; i < 30; i++) {
      const inicio = performance.now();
      const caminhos = i % 2 ? caminhosA : caminhosB;
      for (let j = 0; j < aberturas.length; j++) aberturas[j].setAttribute("d", caminhos[j]);
      mapa.setAttribute("transform", `translate(${i % 2 ? 0 : 2} 0)`);
      atualizacoes.push(performance.now() - inicio);
      const instante = await raf();
      intervalos.push(instante - ultimoFrame);
      ultimoFrame = instante;
    }
    return { nosGrade: largura * altura, nosMascara: aberturas.length, atualizacoes, intervalos };
  }, { largura, altura, escala, caminhosA, caminhosB });
  const metricas = await client.send("Performance.getMetrics");
  const heap = metricas.metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? null;
  await page.close();
  return {
    nome, dimensoes: `${largura}x${altura}`, paredes, fontes, raio,
    nosGrade: resultado.nosGrade, nosMascara: resultado.nosMascara,
    atualizacaoDomMsP50: percentil(resultado.atualizacoes, 0.5),
    atualizacaoDomMsP95: percentil(resultado.atualizacoes, 0.95),
    intervaloFrameMsP50: percentil(resultado.intervalos.slice(1), 0.5),
    intervaloFrameMsP95: percentil(resultado.intervalos.slice(1), 0.95),
    heapJsMiB: heap === null ? null : Number((heap / 1048576).toFixed(1)),
  };
}

const browser = await chromium.launch({ headless: true });
try {
  const cenarios = [
    { nome: "pequena", largura: 32, altura: 24, paredes: 40, fontes: 4, raio: 12 },
    { nome: "grande", largura: 120, altura: 100, paredes: 600, fontes: 16, raio: 12 },
  ];
  const resultados = [];
  for (const c of cenarios) resultados.push(await medir(browser, c));
  console.log(JSON.stringify({
    chromiumVersion: browser.version(),
    escopo: "SVG sintético: células hexagonais, máscara e pan; geometria pré-calculada em Node. Não mede VttClient, Realtime ou dispositivos móveis.",
    resultados,
  }, null, 2));
} finally {
  await browser.close();
}
