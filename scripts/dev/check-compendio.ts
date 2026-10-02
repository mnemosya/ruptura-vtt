/**
 * Compêndio no navegador (PLANO_COMPENDIO_NOTION, Fase 2).
 *
 * Usa a sessão salva (`npm run auth:save-session`) e uma mesa da conta.
 * Abre a aba Compêndio, confere o índice, abre o capítulo 22, segue a
 * etiqueta de um termo até o verbete, volta, busca no livro e fecha.
 *
 *   npx tsx scripts/dev/check-compendio.ts <campaignId>
 */

import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { BASE_URL, SESSION_FILE, requireSessaoSalva } from "./authSession";

const campaignId = process.argv[2];
if (!campaignId) {
  console.error("Uso: npx tsx scripts/dev/check-compendio.ts <campaignId>");
  process.exit(1);
}
const SAIDA = "scripts/dev/.artefatos-visuais";
mkdirSync(SAIDA, { recursive: true });

let passou = 0;
let falhou = 0;
function ok(nome: string, cond: boolean, detalhe = "") {
  if (cond) passou++;
  else falhou++;
  console.log(`${cond ? "ok" : "FALHA"} - ${nome}${detalhe ? `: ${detalhe}` : ""}`);
}

async function main() {
  requireSessaoSalva();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: SESSION_FILE, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
  try {
    await page.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="painel-vtt"]', { timeout: 30000 });

    await page.locator('[data-testid="painel-aba-compendio"]').click();
    await page.waitForSelector('[data-testid="painel-compendio-capitulo"]', { timeout: 30000 });
    const capitulos = await page.locator('[data-testid="painel-compendio-capitulo"]').count();
    ok("C1 aba lista os capítulos", capitulos >= 28, `${capitulos}`);
    await page.screenshot({ path: `${SAIDA}/compendio-aba.png` });

    await page.locator('[data-testid="painel-compendio-busca"]').fill("sangr");
    const resultadoAba = page.locator('[data-testid="painel-compendio-resultado"]').first();
    await resultadoAba.waitFor({ timeout: 5000 });
    ok("C2 busca da aba acha o verbete", ((await resultadoAba.textContent()) ?? "").toUpperCase().includes("SANGRANDO"));
    await page.locator('[data-testid="painel-compendio-busca"]').fill("");

    await page.locator('[data-testid="painel-compendio-capitulo"]', { hasText: "CONDIÇÕES" }).click();
    await page.waitForSelector('[data-testid="compendio-livro"] .fj-livro-verbete', { timeout: 30000 });
    const verbetes = await page.locator(".fj-livro-verbete").count();
    ok("C3 capítulo 22 abre com os 18 verbetes", verbetes === 18, `${verbetes}`);
    await page.screenshot({ path: `${SAIDA}/compendio-cap22.png` });

    await page.locator(".fj-livro-verbete__titulo", { hasText: "QUEIMANDO" }).click();
    const link = page.locator(".fj-livro-verbete--aberto .fj-livro-termo--link").first();
    await link.waitFor({ timeout: 5000 });
    const termo = ((await link.textContent()) ?? "").trim();
    ok("C4 verbete aberto mostra etiqueta de termo com link", termo.length > 0, termo);
    await page.screenshot({ path: `${SAIDA}/compendio-verbete.png` });

    await page.locator('[data-testid="compendio-busca"]').fill("antídoto");
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="compendio-resultado"]').length > 0, null, { timeout: 30000 });
    const resultados = await page.locator('[data-testid="compendio-resultado"]').count();
    ok("C5 busca no texto do livro", resultados > 0, `${resultados}`);
    await page.locator('[data-testid="compendio-resultado"]').first().click();
    await page.waitForSelector('[data-testid="compendio-voltar"]', { timeout: 10000 });
    ok("C6 navegar cria histórico (Voltar)", await page.locator('[data-testid="compendio-voltar"]').isVisible());

    await page.locator('[data-testid="compendio-indice-capitulo"]', { hasText: "VOSEK" }).click();
    await page.waitForFunction(() => document.querySelector(".fj-codex__heroi-titulo")?.textContent?.includes("VOSEK"), null, { timeout: 30000 });
    const imagens = await page.locator(".fj-livro-figura img").count();
    await page.screenshot({ path: `${SAIDA}/compendio-vosek.png` });
    ok("C7 índice troca de capítulo (Vosek)", true, `${imagens} imagem(ns)`);

    await page.keyboard.press("Escape");
    await page.waitForSelector('[data-testid="compendio-livro"]', { state: "detached", timeout: 5000 });
    ok("C8 Esc fecha o livro", true);

    ok("C9 sem erros no console", erros.length === 0, erros.slice(0, 3).join(" | "));
  } finally {
    await browser.close();
  }
  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  if (falhou > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
