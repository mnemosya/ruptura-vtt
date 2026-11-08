/**
 * Compara uma prancheta do board (`.dc.html`) com a tela do app, lado a
 * lado e no mesmo tamanho, medindo cada texto: posição, tamanho, fonte,
 * peso, espaçamento e cor. Gera também os dois screenshots.
 *
 *   node scripts/dev/compare-board.mjs <prancheta.dc.html> "<url do app>" [saida-dir]
 *
 * A prancheta é renderizada sem o runtime do canvas: um mini-runtime
 * expande `sc-for` e `{{...}}` com o `renderVals()` dela. A tela do app
 * deve vir no quadro da prancheta (ex.: `/dev/forja/progressao?quadro=1`);
 * a raiz medida é `[data-testid=progressao]`.
 *
 * Pranchetas sobre o palco ("Console · …"): mede só o console dos dois lados
 * e abre na tela do palco:
 *   RAIZ_BOARD=.console RAIZ_APP=.fj-pg TELA=1440x900 node scripts/dev/compare-board.mjs \
 *     PgVertente.dc.html "http://localhost:3000/dev/forja/progressao?palco=1440&tela=E:vertente"
 */
import { readFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { chromium } from "playwright";

const [, , arquivo, url, saida = "/tmp/compare-board"] = process.argv;
if (!arquivo || !url) { console.error("uso: compare-board.mjs <prancheta.dc.html> <url> [saida]"); process.exit(1); }
mkdirSync(saida, { recursive: true });

const RUNTIME = `
(() => {
  const s = document.querySelector('script[type="text/x-dc"]');
  class DCLogic { constructor() { this.props = {}; this.state = {}; } setState(x) { Object.assign(this.state, x); } }
  let vals = {};
  try { const C = new Function('DCLogic', s.textContent + '; return Component;')(DCLogic); vals = new C().renderVals() || {}; } catch (e) { console.error(e); }
  const get = (p, sc) => p.trim().split('.').reduce((o, k) => (o == null ? undefined : o[k]), sc);
  const interp = (str, sc) => str.replace(/\\{\\{\\s*([^}]+?)\\s*\\}\\}/g, (_, p) => { const v = get(p, sc); return typeof v === 'function' ? '' : (v ?? ''); });
  const walk = (node, sc) => {
    for (const ch of [...node.childNodes]) {
      if (ch.nodeType === 3) { if (ch.textContent.includes('{{')) ch.textContent = interp(ch.textContent, sc); continue; }
      if (ch.nodeType !== 1) continue;
      if (ch.tagName === 'SC-FOR') {
        const list = get(ch.getAttribute('list').replace(/[{}]/g, ''), sc) || [];
        const as = ch.getAttribute('as');
        const frag = document.createDocumentFragment();
        list.forEach((item, i) => {
          const wrap = document.createElement('div');
          for (const t of ch.childNodes) wrap.appendChild(t.cloneNode(true));
          walk(wrap, { ...sc, [as]: item, $index: i });
          while (wrap.firstChild) frag.appendChild(wrap.firstChild);
        });
        ch.replaceWith(frag);
        continue;
      }
      if (ch.tagName === 'SC-IF') { const v = get(ch.getAttribute('value').replace(/[{}]/g, ''), sc); if (!v) { ch.remove(); continue; } }
      for (const a of [...ch.attributes]) {
        if (!a.value.includes('{{')) continue;
        if (/^on/i.test(a.name)) ch.removeAttribute(a.name); else ch.setAttribute(a.name, interp(a.value, sc));
      }
      walk(ch, sc);
    }
  };
  walk(document.querySelector('x-dc'), vals);
  document.documentElement.dataset.pronto = '1';
})();`;

/** Cada elemento com texto próprio: chave = o texto como aparece na tela. */
const MEDIR = (raizSel) => {
  const raiz = document.querySelector(raizSel);
  const r0 = raiz.getBoundingClientRect();
  const itens = [];
  for (const el of raiz.querySelectorAll("*")) {
    const proprio = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").replace(/\s+/g, " ").trim();
    if (!proprio) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const texto = (cs.textTransform === "uppercase" ? proprio.toUpperCase() : proprio).replace(/ /g, " ");
    itens.push({
      texto,
      x: Math.round(r.left - r0.left), y: Math.round(r.top - r0.top), w: Math.round(r.width), h: Math.round(r.height),
      fonte: cs.fontSize, peso: cs.fontWeight, espaco: cs.letterSpacing, linha: cs.lineHeight, cor: cs.color,
      familia: cs.fontFamily.split(",")[0].replace(/["']/g, "").trim(),
    });
  }
  return { w: Math.round(r0.width), h: Math.round(r0.height), itens };
};

/** "rgb(…)" ou "color(srgb …)" → [r, g, b] 0–255, para comparar cor com tolerância. */
const rgb = (c) => {
  const n = (c.match(/[\d.]+/g) ?? []).map(Number);
  return c.startsWith("color(") ? n.slice(0, 3).map((v) => v * 255) : n.slice(0, 3);
};
const corIgual = (a, b) => { const x = rgb(a), y = rgb(b); return x.length === 3 && y.length === 3 && x.every((v, i) => Math.abs(v - y[i]) <= 2.5); };

const browser = await chromium.launch({ headless: true });
try {
  const [tw, th] = (process.env.TELA ?? "1200x800").split("x").map(Number);
  const ctx = await browser.newContext({ viewport: { width: tw, height: th }, deviceScaleFactor: 1, reducedMotion: "reduce" });

  const board = await ctx.newPage();
  const html = readFileSync(arquivo, "utf8").replace(/<script src="\.\/support\.js"><\/script>/, "").replace("</body>", `<script>${RUNTIME}</script></body>`);
  await board.setContent(html, { waitUntil: "networkidle" });
  await board.evaluate(() => document.fonts.ready);
  const raizBoard = process.env.RAIZ_BOARD ?? "x-dc > div";
  const b = await board.evaluate(MEDIR, raizBoard);
  await board.locator(raizBoard).screenshot({ path: join(saida, `${basename(arquivo, ".dc.html")}-prancheta.png`) });

  const app = await ctx.newPage();
  const erros = [];
  app.on("pageerror", (e) => erros.push(e.message));
  await app.goto(url, { waitUntil: "networkidle" });
  await app.evaluate(() => document.fonts.ready);
  const raizApp = process.env.RAIZ_APP ?? "[data-testid=progressao]";
  const a = await app.evaluate(MEDIR, raizApp);
  await app.locator(raizApp).screenshot({ path: join(saida, `${basename(arquivo, ".dc.html")}-app.png`) });

  console.log(`quadro  prancheta ${b.w}×${b.h}   app ${a.w}×${a.h}`);
  if (erros.length) console.log("ERROS NA PÁGINA:", erros);
  const usados = new Set();
  let diferencas = 0, iguais = 0;
  const faltam = [];
  for (const it of b.itens) {
    const k = a.itens.findIndex((o, i) => !usados.has(i) && o.texto === it.texto);
    if (k < 0) { faltam.push(it.texto); continue; }
    usados.add(k);
    const o = a.itens[k];
    const dif = [];
    for (const c of ["x", "y", "w", "h"]) if (Math.abs(it[c] - o[c]) > 1) dif.push(`${c} ${it[c]}→${o[c]}`);
    for (const c of ["fonte", "peso", "espaco", "linha"]) if (it[c] !== o[c]) dif.push(`${c} ${it[c]}→${o[c]}`);
    if (!corIgual(it.cor, o.cor)) dif.push(`cor ${it.cor}→${o.cor}`);
    if (dif.length) { diferencas++; console.log(`✗ "${it.texto.slice(0, 40)}"  ${dif.join(" · ")}`); } else iguais++;
  }
  const sobram = a.itens.filter((_, i) => !usados.has(i)).map((o) => o.texto);
  console.log(`\n${iguais} iguais · ${diferencas} com diferença · ${faltam.length} só na prancheta · ${sobram.length} só no app`);
  if (faltam.length) console.log("só na prancheta:", faltam.map((t) => `"${t.slice(0, 30)}"`).join(", "));
  if (sobram.length) console.log("só no app:", sobram.map((t) => `"${t.slice(0, 30)}"`).join(", "));
  console.log(`\nscreenshots em ${saida}`);
} finally {
  await browser.close();
}
