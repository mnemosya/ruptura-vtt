#!/usr/bin/env node
/**
 * AUTH-02 (parte estática) — a área autenticada não recorta controles,
 * e o raio vem de token.
 *
 * ── Por que `clip-path` em controle é defeito, não estilo ────────────
 *
 * `clip-path` recorta TODA a pintura do elemento, inclusive o contorno
 * de foco. Os controles da área autenticada desenham o foco com
 * `outline-offset` positivo — isto é, FORA da região recortada. O canto
 * chanfrado apagava o único sinal de onde o teclado está.
 *
 * Recorte DECORATIVO — selo da marca, card, modal, moldura — continua
 * onde está: ali o chanfro é a identidade visual e não há foco para
 * comer.
 *
 * Comentários são removidos antes de contar. Contar menções em
 * comentário já produziu falso positivo duas vezes neste repositório:
 * um texto que explica por que a cor saiu não é a cor voltando.
 *
 * Uso: node scripts/dev/check-auth-tokens-visuais.mjs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let passou = 0, falhou = 0;
function registrar(c, ok, d) {
  if (ok) { passou++; console.log(`ok - ${c}: ${d}`); } else { falhou++; console.error(`FALHA - ${c}: ${d}`); }
}

const bruto = readFileSync("src/app/_design/app.css", "utf8");
const css = bruto.replace(/\/\*[\s\S]*?\*\//g, "");

/** Quebra a folha em regras {seletor, corpo}. */
function regras(texto) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of texto.matchAll(re)) out.push({ seletor: m[1].trim(), corpo: m[2] });
  return out;
}
const todas = regras(css);

/** Controles: o que a pessoa clica, foca ou digita. */
const CONTROLES = [".ra-btn", ".ra-iconbtn", ".ra-switch", ".ra-input", ".ra-textarea", ".ra-select", ".ra-linkbtn"];

// --- 1. Nenhum controle recorta a si mesmo ---
{
  const ruins = todas
    .filter((r) => /clip-path\s*:/.test(r.corpo))
    .filter((r) => CONTROLES.some((c) => r.seletor.split(",").some((s) => s.trim().startsWith(c))))
    .map((r) => r.seletor);
  registrar("1 (nenhum controle da área autenticada usa clip-path)",
    ruins.length === 0, ruins.length ? ruins.join(" | ") : "nenhum");
}

// --- 2. Nenhum CHANFRO sobrou, em nenhuma superfície ---
//     Chanfro é o polígono que começa em `0 0` e corta cantos. FORMA é
//     outra coisa: o glifo hexagonal do estado vazio não tem canto
//     cortado, ele É um hexágono, e removê-lo o transformaria num
//     quadrado. Por isso o critério mede chanfro, não `clip-path`.
{
  const chanfros = todas
    .filter((r) => /clip-path:\s*polygon\(0 0,/.test(r.corpo))
    .map((r) => r.seletor);
  registrar("2 (nenhum canto chanfrado sobrou na área autenticada)",
    chanfros.length === 0, chanfros.length ? chanfros.join(", ") : "nenhum");
}

// --- 2b. As FORMAS continuam ---
{
  const formas = todas.filter((r) => /clip-path:\s*polygon\((?!0 0,)/.test(r.corpo)).map((r) => r.seletor);
  registrar("2b (as formas, que não são cantos, foram preservadas)",
    formas.length > 0, formas.join(", ") || "nenhuma");
}

// --- 3. Todo controle que perdeu o recorte ganhou raio por TOKEN ---
{
  const semRaio = [];
  for (const c of CONTROLES) {
    const regra = todas.find((r) => r.seletor.split(",").some((s) => s.trim() === c));
    if (!regra) continue;
    // `.ra-linkbtn` é texto sublinhado, não tem superfície para arredondar.
    if (c === ".ra-linkbtn") continue;
    if (!/border-radius:\s*var\(--ra-r/.test(regra.corpo)) semRaio.push(c);
  }
  registrar("3 (os controles usam o raio em token, não um número solto)",
    semRaio.length === 0, semRaio.length ? semRaio.join(", ") : "todos com var(--ra-r)");
}

// --- 4. O token existe e diz de onde veio ---
{
  const declara = /--ra-r:\s*4px/.test(css) && /--ra-r-sm:/.test(css);
  const explica = /--rv-r/.test(bruto);
  registrar("4 (o raio é token e o comentário aponta a origem no chassi do VTT)",
    declara && explica, `declara=${declara}, cita --rv-r=${explica}`);
}

// --- 5. Nenhum controle voltou a ter raio em número solto ---
{
  const soltos = todas
    .filter((r) => CONTROLES.some((c) => r.seletor.split(",").some((s) => s.trim() === c)))
    .filter((r) => /border-radius:\s*\d/.test(r.corpo))
    .map((r) => r.seletor);
  registrar("5 (nenhum controle traz raio em número cru)",
    soltos.length === 0, soltos.length ? soltos.join(", ") : "nenhum");
}

// --- 6. Nem no TSX: chanfro inline escapa de quem só varre CSS ---
//     Foi o que aconteceu com o avatar de Conta e Preferências — a
//     folha estava limpa e a tela continuava chanfrada.
{
  const arquivos = [];
  (function andar(dir) {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome);
      if (statSync(p).isDirectory()) { if (nome !== "node_modules") andar(p); }
      else if (nome.endsWith(".tsx")) arquivos.push(p);
    }
  })("src/app/mesas");

  const ruins = [];
  for (const f of arquivos) {
    const texto = readFileSync(f, "utf8");
    // Chanfro = polígono cujos vértices são só cantos do retângulo com
    // recorte. Forma (hexágono, círculo) e `inset()` de progresso ficam.
    for (const m of texto.matchAll(/clipPath:\s*[`"']polygon\(([^`"']*)\)[`"']/g)) {
      const pontos = m[1];
      const ehChanfro = /calc\(100% - \d+px\)/.test(pontos) && !/%\s+\d|\d+%\s*,/.test(pontos.replace(/calc\([^)]*\)/g, ""));
      if (ehChanfro) ruins.push(`${f.replace("src/app/", "")}: ${pontos.slice(0, 50)}…`);
    }
  }
  registrar("6 (nenhum chanfro inline no TSX da área autenticada)",
    ruins.length === 0, ruins.length ? ruins.join(" | ") : "nenhum");
}

console.log(`\n${passou} ok, ${falhou} falha(s)`);
process.exit(falhou > 0 ? 1 : 0);
