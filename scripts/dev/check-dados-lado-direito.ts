/**
 * Verificação PONTUAL: dados rolando na mesa real não ficam atrás da
 * janela flutuante "Rolar Dados" (que abre encostada na barra de
 * ferramentas, à esquerda). Roda 1x, sem manter no CI — é um script
 * de verificação manual desta sessão.
 *
 * Uso: npx tsx scripts/dev/check-dados-lado-direito.ts
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

async function main() {
  const email = `check-dados-lado-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data: userData, error: userErr } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true, user_metadata: { display_name: "Narradora Teste" },
  });
  if (userErr || !userData.user) throw new Error(`criar conta: ${userErr?.message}`);
  const narradorId = userData.user.id;
  const campaignId = randomUUID();
  const { error: e1 } = await admin.from("campaigns").insert({ id: campaignId, name: "Teste lado direito", owner_id: narradorId });
  if (e1) throw new Error(`criar campanha: ${e1.message}`);

  // Personagem de verdade. A ferramenta deixou de inventar atributos:
  // sem ficha ela mostra "Sem personagem" e NÃO tem botão de rolar —
  // e este script, que só quer ver o dado cair, ficava esperando um
  // botão que não existia. Uma identidade rolável basta (o rolador cai
  // nela sozinho quando não há token selecionado).
  const { error: e1b } = await admin.from("characters").insert({
    id: randomUUID(), name: "Mara Venn", status: "draft", campaign_id: campaignId, owner_id: narradorId,
    payload: {
      nome: "Mara Venn",
      atributos: { corpo: 3, mente: 2, animo: 2 },
      pericias: { balistica: 2 },
      metadados: { schema_version: 1 },
    },
  });
  if (e1b) throw new Error(`criar personagem: ${e1b.message}`);

  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sessao, error: e2 } = await anon.auth.signInWithPassword({ email, password: senha });
  if (e2 || !sessao.session) throw new Error(`login: ${e2?.message}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await context.addCookies([{
    name: "ruptura_auth",
    value: JSON.stringify({ access_token: sessao.session.access_token, refresh_token: sessao.session.refresh_token }),
    domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  }]);
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="painel-vtt"]', { timeout: 20000 });

    // Abre a ferramenta "Rolar Dados" (L) — abre encostada na barra,
    // à esquerda, que é EXATAMENTE o cenário do bug relatado.
    await page.keyboard.press("l");
    const janela = page.locator('[data-testid="painel-dados"]');
    await janela.waitFor({ timeout: 5000 });
    const retJanela = await janela.boundingBox();
    console.log("janela Rolar Dados:", retJanela);

    // Rolar (clique rápido — força mínima é o suficiente pro teste de posição).
    const botao = janela.locator('button:has-text("Rolar")').first();
    await botao.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: "scripts/dev/.artefatos-visuais/dados-lado-direito-tumble.png" });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: "scripts/dev/.artefatos-visuais/dados-lado-direito-final.png" });

    // Zoom no MÁXIMO do mapa (2.4, +0.15 por clique a partir de 1.0) —
    // o dado da PRÓXIMA rolagem deve nascer visivelmente maior.
    const aproximar = page.locator('button[aria-label="Aproximar"]');
    for (let i = 0; i < 10; i++) await aproximar.click();
    await page.waitForTimeout(300);
    await botao.click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: "scripts/dev/.artefatos-visuais/dados-lado-direito-zoom-max.png" });

    // Confere no DOM: o canvas dos dados (`.rv-mesa-dados-overlay`)
    // não pode começar ANTES do fim da janela.
    const overlay = page.locator(".rv-mesa-dados-overlay");
    const retOverlay = await overlay.boundingBox();
    console.log("overlay de dados:", retOverlay);
    if (retJanela && retOverlay) {
      const semSobreposicao = retOverlay.x >= retJanela.x + retJanela.width - 1;
      console.log(semSobreposicao ? "ok - overlay começa depois do fim da janela" : "FALHA - overlay começa dentro da janela");
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
