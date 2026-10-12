/** Mede o SVG do MapaHex real, com a CamadaIluminacao real, no Chromium. */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { performance } from "node:perf_hooks";
import { chromium } from "playwright";
import { MapaHex, type CenaMapa, type EstadoVisualToken } from "../../src/app/mesas/[campaignId]/vtt/_mapa/MapaHex";
import type { TokenApresentacao } from "../../src/app/mesas/[campaignId]/vtt/_dominio/tokenApresentacao";
import type { IluminacaoCena, ParedeLuz, FonteLuz } from "../../src/lib/vtt/lightStorage";

function token(i: number, largura: number, altura: number): TokenApresentacao {
  const r = Math.floor((i + 1) * altura / 5), q = Math.floor((i + 1) * largura / 5) - Math.floor(r / 2);
  return { id: `t-${i}`, nome: `Jogador ${i + 1}`, sigla: `J${i + 1}`, lado: "pj", vertente: "nenhuma",
    tamanho: "medio", pos: { q, r }, offset: { q: 0, r: 0 }, orientacao: 0, direcao: 0,
    visaoNoturna: i === 0, pegadaPersonalizada: null, retrato: null, retratoImageId: null,
    origemRetrato: "nenhum", pv: null, pvMax: null, pe: null, peMax: null, mana: null, manaMax: null,
    condicoes: [], visivel: true, bloqueado: false, characterId: null, pvPublico: null,
    pePublico: null, manaPublica: null, podeControlar: true, revision: 1 };
}
function cena(largura: number, altura: number, nParedes: number, nFontes: number): { mapa: CenaMapa; luz: IluminacaoCena } {
  const tokens = Array.from({ length: 4 }, (_, i) => token(i, largura, altura));
  const paredes: ParedeLuz[] = Array.from({ length: nParedes }, (_, i) => {
    const r = 1 + (i * 37) % (altura - 3), q = 1 + (i * 53) % (largura - 3) - Math.floor(r / 2);
    return { id: `w-${i}`, sceneId: "bench", a: { q, r }, b: { q: q + 1, r },
      bloqueiaLuz: true, bloqueiaVisao: true, porta: false, aberta: false, visivel: true, revision: 1 };
  });
  const fontes: FonteLuz[] = Array.from({ length: nFontes }, (_, i) => {
    const r = 1 + (i * 17) % (altura - 2), q = 1 + (i * 19) % (largura - 2) - Math.floor(r / 2);
    return { id: `l-${i}`, sceneId: "bench", tokenId: null, origem: { q, r }, raioM: 12,
      formato: "radial", aberturaGraus: null, direcaoGraus: 0, intensidade: "forte",
      cor: "#ffffff", ativa: true, visivel: true, revision: 1 };
  });
  return { mapa: { nome: "Benchmark LIGHT-02", largura, altura, tokens, objetos: [] },
    luz: { modo: "escuro", revision: 1, paredes, fontes } };
}
const estado = (_t: TokenApresentacao): EstadoVisualToken => ({ selecionado: false, sobCursor: false,
  turnoAtual: false, podeAgir: false, jaAgiu: false, fragmentado: false, alvo: false, origemDeAura: false });
function p95(a: number[]) { const s = [...a].sort((x, y) => x - y); return Number(s[Math.ceil(s.length * .95) - 1].toFixed(2)); }

const browser = await chromium.launch({ headless: true });
const semLuz = process.env.LIGHT_BENCH_CLEAR === "1";
try {
  const resultados = [];
  for (const c of [{ nome: "pequena", largura: 32, altura: 24, paredes: 40, fontes: 4 },
    { nome: "grande", largura: 120, altura: 100, paredes: 600, fontes: 16 }]) {
    const { mapa, luz } = cena(c.largura, c.altura, c.paredes, c.fontes);
    const inicio = performance.now();
    const svg = renderToStaticMarkup(<MapaHex cena={mapa} zoom={1} pan={{ x: 0, y: 0 }}
      selecionadoId={null} hoverId={null} alvoIds={[]} estadoPorToken={estado}
      celulasRealce={[]} tipoRealce={null} onSelecionarToken={() => {}} onHoverToken={() => {}}
      onAtivarCartaoToken={() => {}} onFecharCartaoToken={() => {}}
      iluminacao={semLuz ? undefined : luz} verCamadasOcultas={false} />);
    const renderNodeMs = performance.now() - inicio;
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:#08111c}.rv-mapa{display:block;width:100%;height:100%}</style>${svg}`);
    const medicao = await page.evaluate(async () => {
      const mapa = document.querySelector("svg")!;
      const mundo = mapa.querySelector('g[transform^="translate("]')!;
      const intervalos: number[] = [], mutacoes: number[] = [];
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      let anterior = performance.now();
      for (let i = 0; i < 40; i++) {
        const inicio = performance.now();
        mundo.setAttribute("transform", `translate(${i % 2 ? 8 : 0} 0) scale(1)`);
        mutacoes.push(performance.now() - inicio);
        const frame = await new Promise<number>(requestAnimationFrame);
        intervalos.push(frame - anterior); anterior = frame;
      }
      return { nos: document.querySelectorAll("svg *").length, intervalos: intervalos.slice(1), mutacoes };
    });
    const metricas = await cdp.send("Performance.getMetrics");
    const heap = metricas.metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? 0;
    resultados.push({ ...c, iluminacao: semLuz ? "desligada" : "escuro", nosSvg: medicao.nos,
      renderNodeMs: Number(renderNodeMs.toFixed(2)), frameMsP95: p95(medicao.intervalos),
      mutacaoMsP95: p95(medicao.mutacoes), heapJsMiB: Number((heap / 1048576).toFixed(1)) });
    await page.close();
  }
  console.log(JSON.stringify({ chromium: browser.version(), escopo: "MapaHex/CamadaIluminacao reais via renderização React no servidor; pan pelo transform do grupo SVG no Chromium, sem hidratação, rede ou Realtime.", resultados }, null, 2));
} finally { await browser.close(); }
