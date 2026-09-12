/**
 * Browser check do MODO EVOLUÇÃO no Console do Personagem dentro do VTT.
 *
 * O modo já existia (`sheetMode` em `CharacterSheetClient`, com clamp,
 * recálculo de derivados e histórico de evolução), mas a única porta
 * pra ele era o `ModeToggle` da aba Geral — que o Console do produto
 * não mostra. Sem esta porta, não dava para evoluir uma ficha de
 * dentro da Mesa. Cada critério abaixo trava um pedaço dessa porta.
 *
 * Uso: npx tsx scripts/dev/check-console-modo-evolucao.ts
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { BASE_URL } from "./authSession";

loadDotenv({ path: ".env.local" });

function requireEnv(nome: string): string {
  const v = process.env[nome];
  if (!v) { console.error(`Variável de ambiente ausente: ${nome}`); process.exit(1); }
  return v;
}
const supabaseUrl = requireEnv("SUPABASE_URL");
const anonKey = requireEnv("SUPABASE_ANON_KEY");
const admin = createClient(supabaseUrl, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

let passou = 0;
let falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

async function main() {
  const email = `check-evolucao-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true, user_metadata: { display_name: "Narradora Gabs" },
  });
  if (error || !data.user) throw new Error(`criar conta: ${error?.message}`);
  const narradorId = data.user.id;

  const campaignId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: "Modo evolucao", owner_id: narradorId });

  const p1 = randomUUID();
  await admin.from("characters").insert({
    id: p1, name: "Mara Venn", status: "draft", campaign_id: campaignId, owner_id: narradorId,
    payload: {
      nome: "Mara Venn",
      atributos: { corpo: 3, mente: 2, animo: 3 },
      pericias: { balistica: 2 },
      pm_total: 6, pm_disponivel: 4,
      metadados: { schema_version: 1 },
    },
  });

  try {
    const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: sess, error: eLogin } = await anon.auth.signInWithPassword({ email, password: senha });
    if (eLogin || !sess.session) throw new Error(`login: ${eLogin?.message}`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 980 } });
    await context.addCookies([{
      name: "ruptura_auth",
      value: JSON.stringify({ access_token: sess.session.access_token, refresh_token: sess.session.refresh_token }),
      domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    }]);
    const page = await context.newPage();
    const erros: string[] = [];
    page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) erros.push(m.text()); });

    await page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="painel-vtt"]', { timeout: 20000 });

    // Abre o Console pelo diretório.
    await page.locator('[data-testid="painel-aba-personagens"]').click();
    await page.waitForTimeout(600);
    await page.locator('[data-testid="painel-personagens-linha"]').first().click();
    await page.waitForSelector('[data-testid="console-window"]', { timeout: 30000 });
    await page.waitForTimeout(1200);

    // 1 — chip existe na barra de título e começa em Modo Jogo.
    const chip = page.locator('[data-testid="console-modo-chip"]');
    const chipVisivel = await chip.isVisible();
    const pressedAntes = await chip.getAttribute("aria-pressed");
    ok("1 (chip de modo aparece na barra de título, começando em Modo Jogo)", chipVisivel && pressedAntes === "false", `visivel=${chipVisivel}, aria-pressed=${pressedAntes}`);

    // 2 — em Modo Jogo o atributo é botão de ROLAR, sem passo de edição.
    const passoAntes = await page.locator('[data-testid="console-attr-passo-corpo"]').count();
    ok("2 (Modo Jogo não oferece edição de atributo)", passoAntes === 0, `passos=${passoAntes}`);

    // 3 — liga o Modo Evolução.
    await chip.click();
    await page.waitForTimeout(400);
    const faixa = await page.locator('[data-testid="console-modo-faixa"]').isVisible();
    const pressedDepois = await chip.getAttribute("aria-pressed");
    ok("3 (chip liga o Modo Evolução e a faixa de aviso aparece)", faixa && pressedDepois === "true", `faixa=${faixa}, aria-pressed=${pressedDepois}`);

    // 4 — PM real na faixa (a ficha tem 4/6).
    const textoFaixa = (await page.locator('[data-testid="console-modo-faixa"]').textContent()) ?? "";
    ok("4 (a faixa mostra o PM REAL da ficha, não um valor inventado)", textoFaixa.includes("4") && textoFaixa.includes("6"), textoFaixa.replace(/\s+/g, " ").trim().slice(0, 90));

    // 5 — passo aparece e sobe o atributo de verdade.
    const passo = page.locator('[data-testid="console-attr-passo-corpo"]');
    const apareceu = await passo.isVisible();
    await passo.locator("button").last().click();
    await page.waitForTimeout(500);
    const valorDepois = (await passo.locator(".rc-passo-val").textContent()) ?? "";
    ok("5 (o passo + sobe Corpo de 3 para 4 na tela)", apareceu && valorDepois.trim() === "4", `visivel=${apareceu}, valor=${valorDepois.trim()}`);

    // 6 — perícia também ganha passo e sobe.
    const passoPericia = page.locator('[data-testid="console-pericia-passo-balistica"]');
    const temPericia = await passoPericia.count();
    if (temPericia > 0) {
      await passoPericia.locator("button").last().click();
      await page.waitForTimeout(400);
      const vp = (await passoPericia.locator(".rc-passo-val").textContent()) ?? "";
      ok("6 (perícia também é editável no Modo Evolução)", vp.trim() === "3", `valor=${vp.trim()}`);
    } else {
      ok("6 (perícia também é editável no Modo Evolução)", false, "passo de perícia não encontrado");
    }

    await page.screenshot({ path: "scripts/dev/.artefatos-visuais/modo-evolucao.png" });

    // 7 — voltar pro Modo Jogo retranca a edição.
    await chip.click();
    await page.waitForTimeout(400);
    const passoFinal = await page.locator('[data-testid="console-attr-passo-corpo"]').count();
    const faixaFinal = await page.locator('[data-testid="console-modo-faixa"]').count();
    ok("7 (voltar ao Modo Jogo retranca a edição e some a faixa)", passoFinal === 0 && faixaFinal === 0, `passos=${passoFinal}, faixa=${faixaFinal}`);

    // 8 — A MUDANÇA SOBREVIVE AO FECHAR. Este é o critério que faltava:
    // o Console vive dentro do VTT, onde não existe botão "Salvar
    // personagem" nenhum, então subir um atributo precisa gravar
    // sozinho. Antes disso a alteração ficava só no estado do React e
    // sumia — enquanto o log de evolução em `table_logs` seguia
    // registrando uma mudança que o personagem não tinha.
    const { data: gravado } = await admin
      .from("characters").select("payload").eq("id", p1).maybeSingle();
    const payload = (gravado?.payload ?? {}) as { atributos?: Record<string, number>; pericias?: Record<string, number> };
    ok(
      "8 (a evolução foi GRAVADA no banco, não só na tela)",
      payload.atributos?.corpo === 4 && payload.pericias?.balistica === 3,
      `corpo=${payload.atributos?.corpo}, balistica=${payload.pericias?.balistica}`,
    );

    // 9 — recarregar a página traz o valor gravado de volta.
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="painel-vtt"]', { timeout: 20000 });
    await page.locator('[data-testid="painel-aba-personagens"]').click();
    await page.locator('[data-testid="painel-personagens-linha"]').first().click();
    await page.waitForSelector('[data-testid="console-window"]', { timeout: 30000 });
    await page.waitForTimeout(600);
    const corpoRecarregado = (await page.locator('[data-testid="console-attr-corpo"]').first().textContent()) ?? "";
    ok(
      "9 (depois de recarregar, o Console mostra o valor evoluído)",
      corpoRecarregado.includes("4"),
      corpoRecarregado.replace(/\s+/g, " ").trim().slice(0, 60),
    );

    ok("10 (console sem erro novo)", erros.length === 0, erros.slice(0, 2).join(" || ") || "sem erros");

    await browser.close();
  } finally {
    await admin.from("table_logs").delete().eq("campaign_id", campaignId);
    await admin.from("characters").delete().eq("campaign_id", campaignId);
    await admin.from("campaigns").delete().eq("id", campaignId);
    await admin.auth.admin.deleteUser(narradorId);
  }
  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  if (falhou > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
