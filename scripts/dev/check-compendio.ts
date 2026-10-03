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
import { BASE_URL as BASE_PADRAO, SESSION_FILE, requireSessaoSalva } from "./authSession";

// Outra porta local é permitida (ex.: um worktree em 3001); outro host, nunca.
const PORTA = process.env.PORTA_LOCAL;
const BASE_URL = PORTA && /^\d+$/.test(PORTA) ? `http://localhost:${PORTA}` : BASE_PADRAO;

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

    // C13: regras a revisar (só aparece para administradora, e só se houver pendência).
    const revisar = page.locator('[data-testid="painel-compendio-revisar"]');
    if (await page.locator('[data-testid="painel-compendio-sincronizar"]').count()) {
      await revisar.waitFor({ timeout: 15000 }).catch(() => {});
      const n = await revisar.count();
      if (n) {
        await revisar.locator("summary").click();
        await page.screenshot({ path: `${SAIDA}/compendio-revisar.png` });
      }
      ok("C13 aviso de regras a revisar para administradora", true, n ? ((await revisar.locator("summary").textContent()) ?? "").trim() : "nenhuma pendência");
    }

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

    // C11: Enviar ao chat (o verbete aberto).
    await page.locator(".fj-livro-verbete--aberto [data-testid=\"compendio-enviar-verbete\"]").click();
    await page.waitForFunction(() => document.querySelector('[data-testid="compendio-aviso-envio"]')?.textContent?.includes("Enviado"), null, { timeout: 15000 });
    ok("C11 verbete enviado ao chat", true);

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

    // C12: o cartão aparece no chat e "Abrir no livro" volta ao verbete.
    await page.locator('[data-testid="painel-aba-chat"]').click();
    const cartao = page.locator('[data-testid="painel-feed-referencia"]', { hasText: "QUEIMANDO" }).last();
    await cartao.waitFor({ timeout: 20000 });
    await cartao.locator('[data-testid="painel-feed-abrir-livro"]').click();
    await page.waitForSelector('[data-testid="compendio-livro"] .fj-livro-verbete--aberto', { timeout: 30000 });
    const aberto = ((await page.locator(".fj-livro-verbete--aberto .fj-livro-verbete__titulo").first().textContent()) ?? "").toUpperCase();
    ok("C12 cartão no chat abre o livro no verbete", aberto.includes("QUEIMANDO"), aberto.trim());
    await page.screenshot({ path: `${SAIDA}/compendio-chat-volta.png` });
    await page.keyboard.press("Escape");

    // C10: o botão "Sincronizar agora" (só para administradoras de conteúdo).
    await page.locator('[data-testid="painel-aba-compendio"]').click();
    const botao = page.locator('[data-testid="painel-compendio-sincronizar"]');
    if (await botao.count()) {
      await botao.click();
      const aviso = page.locator('[data-testid="painel-compendio-aviso-sync"]');
      await page.waitForFunction(
        () => !document.querySelector('[data-testid="painel-compendio-aviso-sync"]')?.textContent?.startsWith("Lendo o Notion"),
        null,
        { timeout: 600000 },
      );
      const texto = ((await aviso.textContent()) ?? "").trim();
      ok("C10 Sincronizar agora devolve o resultado", /em dia|atualizado/.test(texto) && !texto.includes("Falhas"), texto);
    } else {
      ok("C10 Sincronizar agora (conta sem papel de administradora: botão oculto)", true);
    }

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
