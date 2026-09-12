/**
 * Captura VISUAL do resultado de rolagem do Console, que passou a ser a
 * ferramenta "Rolar Dados" em versão de leitura
 * (`_console/panels/AuxModals.tsx` → `_dados3d/ResultadoRolagem.tsx`).
 *
 * Cobre os TRÊS caminhos que chegam no mesmo modal — perícia, atributo
 * puro e defesa (esta com o aviso de Reação) — porque cada um monta a
 * faixa com um conjunto diferente de dados: perícia tem bônus, atributo
 * não tem, e defesa entra com modificador negativo.
 *
 * Não afirma nada sozinho: deixa os PNGs em `.artefatos-visuais/`.
 *
 * Uso: npx tsx scripts/dev/check-console-rolagem-visual.ts
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright";
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

/**
    * Fecha pelo X. A ferramenta NÃO tem backdrop — é janela flutuante,
    * não modal: clicar fora dela é clicar no Console, e isso continua
    * funcionando em vez de fechar.
    */
async function fechar(page: Page) {
  await page.locator('button[aria-label="Fechar rolagem"]').click();
  await page.waitForSelector('[data-testid="console-painel-rolagem"]', { state: "detached", timeout: 5000 }).catch(() => {});
}

async function capturar(page: Page, nome: string) {
  const painel = page.locator('[data-testid="console-painel-rolagem"]');
  await painel.waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  await painel.screenshot({ path: `scripts/dev/.artefatos-visuais/console-rolagem-${nome}.png` });
  console.log(`ok - ${nome}`);
}

/** Aperta "Rolar" e espera a faixa de resultado aparecer. */
async function rolar(page: Page) {
  await page.locator('[data-testid="console-painel-rolagem"] button', { hasText: /Rolar/ }).first().click();
  // Retrato da TELA INTEIRA no meio do voo — é onde se vê se os d8
  // estão caindo sobre a mesa ou presos numa caixinha do painel.
  await page.waitForTimeout(700);
  await page.screenshot({ path: "scripts/dev/.artefatos-visuais/console-rolagem-na-mesa.png" });
  await page.locator('[data-testid="console-roll-total"]').waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);
}

async function main() {
  const email = `check-rolvis-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true, user_metadata: { display_name: "Narradora Teste" },
  });
  if (error || !data.user) throw new Error(`criar conta: ${error?.message}`);
  const narradorId = data.user.id;
  const campaignId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: "Rolagem visual", owner_id: narradorId });

  const p1 = randomUUID();
  await admin.from("characters").insert({
    id: p1, name: "Mara Venn", status: "draft", campaign_id: campaignId, owner_id: narradorId,
    payload: {
      nome: "Mara Venn",
      atributos: { corpo: 3, mente: 2, animo: 3 },
      pericias: { balistica: 2, reflexos: 1 },
      metadados: { schema_version: 1 },
    },
  });

  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sess, error: eLogin } = await anon.auth.signInWithPassword({ email, password: senha });
  if (eLogin || !sess.session) throw new Error(`login: ${eLogin?.message}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 980 }, deviceScaleFactor: 2 });
  await context.addCookies([{
    name: "ruptura_auth",
    value: JSON.stringify({ access_token: sess.session.access_token, refresh_token: sess.session.refresh_token }),
    domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  }]);
  const page = await context.newPage();

  try {
    // `domcontentloaded` + espera pelo alvo: a mesa mantém conexões de
    // Realtime abertas, e `networkidle` nunca chega.
    await page.goto(`${BASE_URL}/mesas/${campaignId}/personagens`, { waitUntil: "domcontentloaded" });
    await page.locator(`[data-testid="personagens-abrir-ficha-${p1}"]`).click({ timeout: 60000 });
    await page.waitForSelector('[data-testid="console-window"]', { timeout: 60000 });
    await page.waitForTimeout(600);

    // Retrato da tela inteira com a ferramenta aberta: é onde se vê se
    // o Console nasceu encostado no trilho e se a ferramenta abriu no
    // centro DELE, não no da tela.
    await page.locator('[data-testid="console-pericia-balistica"]').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: "scripts/dev/.artefatos-visuais/console-rolagem-posicao.png" });
    await capturar(page, "pericia-aberto");
    await rolar(page);
    await capturar(page, "pericia-rolado");
    await fechar(page);

    await page.locator('[data-testid="console-attr-corpo"]').first().click();
    await capturar(page, "atributo-aberto");
    await fechar(page);

    // Defesa: o botão vive no trilho de Reações do Console.
    const botaoDefesa = page.locator('button[aria-label="Rolar defesa"]').first();
    if (await botaoDefesa.count()) {
      await botaoDefesa.click();
      await page.locator(".rc-aux-item", { hasText: "Esquivar" }).first().click();
      await capturar(page, "defesa");
      await fechar(page);
    } else {
      console.log("— defesa: botão não encontrado no Console");
    }
  } finally {
    await browser.close();
    await admin.from("table_logs").delete().eq("campaign_id", campaignId);
    await admin.from("characters").delete().eq("campaign_id", campaignId);
    await admin.from("campaigns").delete().eq("id", campaignId);
    await admin.auth.admin.deleteUser(narradorId);
    console.log("limpeza ok");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
