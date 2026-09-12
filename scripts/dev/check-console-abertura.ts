/**
 * MEDIÇÃO da abertura do Console do Personagem dentro do VTT.
 *
 * Não conserta nada — mede. Três marcos, do clique até a ficha usável:
 * quando a JANELA aparece, quando o CONTEÚDO real substitui o
 * esqueleto, e quanto disso é servidor (as duas server actions) contra
 * bundle/render. Sem isso, "abrir a ficha devia ser rápido" não tem
 * número nenhum pra perseguir.
 *
 * Também verifica se a janela BLOQUEIA o que está embaixo — o mapa
 * precisa continuar recebendo o mouse com o Console aberto.
 *
 * Uso: npx tsx scripts/dev/check-console-abertura.ts
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
  const email = `check-abertura-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true, user_metadata: { display_name: "Narradora Teste" },
  });
  if (error || !data.user) throw new Error(`criar conta: ${error?.message}`);
  const narradorId = data.user.id;
  const campaignId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: "Abertura do console", owner_id: narradorId });
  const p1 = randomUUID();
  await admin.from("characters").insert({
    id: p1, name: "Mara Venn", status: "draft", campaign_id: campaignId, owner_id: narradorId,
    payload: {
      nome: "Mara Venn",
      atributos: { corpo: 3, mente: 2, animo: 3 },
      pericias: { balistica: 2 },
      metadados: { schema_version: 1 },
    },
  });

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

  try {
    await page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="painel-vtt"]', { timeout: 20000 });
    await page.locator('[data-testid="painel-aba-personagens"]').click();
    await page.waitForSelector('[data-testid="painel-personagens-linha"]', { timeout: 15000 });
    // O aquecimento em ocioso dispara na montagem da mesa; dá o tempo
    // dele antes de medir, que é o que a pessoa real também dá (ela
    // ainda vai procurar o personagem na lista).
    await page.waitForTimeout(3500);

    // As server actions todas fazem POST pra mesma URL; o que as separa
    // é o corpo enviado (o `Next-Action` id) e o tamanho da resposta.
    const acoes: { id: string; ms: number; kb: number }[] = [];
    page.on("response", async (res) => {
      const req = res.request();
      if (req.method() !== "POST") return;
      const t = res.request().timing();
      const id = (await req.allHeaders())["next-action"] ?? "?";
      let kb = 0;
      try { kb = Math.round((await res.body()).length / 1024); } catch { /* corpo já consumido */ }
      acoes.push({ id: id.slice(0, 10), ms: Math.round(t.responseEnd - t.requestStart), kb });
    });

    const linha = page.locator('[data-testid="painel-personagens-linha"]').first();
    // Clique SEM hover deliberado: é o pior caso, sem o aquecimento.
    const t0 = Date.now();
    await linha.click({ force: true });
    await page.waitForSelector('[data-testid="painel-console-shell"], [data-testid="console-window"]', { timeout: 20000 });
    const tJanela = Date.now() - t0;
    await page.waitForSelector('[data-testid="console-window"]', { timeout: 60000 });
    const tPronto = Date.now() - t0;

    console.log(`janela visível:  ${tJanela} ms`);
    console.log(`ficha pronta:    ${tPronto} ms`);

    // Onde foi o tempo de servidor: as duas server actions do caminho.
    const req = await page.evaluate(() =>
      performance.getEntriesByType("resource")
        .filter((e) => e.duration > 60)
        .map((e) => ({ n: e.name.split("/").slice(3).join("/").slice(0, 70), ms: Math.round(e.duration) }))
        .sort((a, b) => b.ms - a.ms)
        .slice(0, 12));
    // CAMINHO AQUECIDO: fecha, espera o aquecimento e reabre — é o
    // melhor caso possível, e a diferença pro frio diz exatamente
    // quanto do tempo é bundle+catálogos e quanto é irredutível.
    await page.locator('[aria-label="Fechar console"]').click();
    await page.waitForTimeout(1200);
    const t1 = Date.now();
    await linha.click({ force: true });
    await page.waitForSelector('[data-testid="console-window"]', { timeout: 60000 });
    console.log(`ficha pronta (2a vez, tudo aquecido): ${Date.now() - t1} ms`);

    console.log("\nserver actions do caminho:");
    for (const a of acoes) console.log(`  ${String(a.ms).padStart(6)} ms  ${String(a.kb).padStart(5)} kB  action ${a.id}`);
    console.log("\nmais lentos na rede:");
    for (const r of req) console.log(`  ${String(r.ms).padStart(6)} ms  ${r.n}`);

    // A janela bloqueia o que está embaixo?
    const bloqueio = await page.evaluate(() => {
      const backdrop = document.querySelector(".rc-backdrop");
      const wrap = document.querySelector(".rc-window-wrap");
      // Ponto bem longe da janela, sobre o mapa.
      const alvo = document.elementFromPoint(60, window.innerHeight - 60);
      return {
        temBackdrop: !!backdrop,
        ariaModal: wrap?.getAttribute("aria-modal") ?? null,
        oQueRecebeOMouse: alvo ? `${alvo.tagName.toLowerCase()}.${(alvo.className || "").toString().split(" ")[0]}` : "nada",
      };
    });
    console.log("\nbloqueio:", JSON.stringify(bloqueio));

    // O modo de abertura é FOCO (a ficha do personagem), não Painel.
    const modo = await page.evaluate(() => {
      const trilho = document.querySelector('.rc-window-wrap [data-view-mode], .rc-window-wrap [aria-pressed="true"]');
      const foco = document.querySelector(".rc-foco-content, .rc-foco");
      return { temFoco: !!foco, trilho: trilho?.getAttribute("aria-label") ?? null };
    });
    console.log("modo de abertura:", JSON.stringify(modo));

    // O mapa continua REAGINDO com a ficha aberta? Zoom por atalho é o
    // teste mais barato: muda um estado visível do palco sem depender
    // de acertar um token.
    const zoomAntes = await page.locator('[data-testid="painel-vtt"]').count();
    await page.mouse.move(60, 700);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(300);
    const janelaSegueAberta = await page.locator('[data-testid="console-window"]').count();
    console.log(`mapa recebeu a roda com a ficha aberta: painel=${zoomAntes}, ficha continua aberta=${janelaSegueAberta === 1}`);
    await page.screenshot({ path: "scripts/dev/.artefatos-visuais/console-ancorado.png" });
    // ─── A ficha aberta a partir de Personagens é a MESMA janela da
    // mesa: não navega, não troca a URL, não traz barra própria.
    await page.goto(`${BASE_URL}/mesas/${campaignId}/personagens`, { waitUntil: "networkidle" });
    await page.waitForSelector(`[data-testid="personagens-abrir-ficha-${p1}"]`, { timeout: 20000 });
    await page.waitForTimeout(3500); // aquecimento em ocioso
    const urlAntes = page.url();
    const t2 = Date.now();
    await page.locator(`[data-testid="personagens-abrir-ficha-${p1}"]`).click();
    await page.waitForSelector('[data-testid="console-window"]', { timeout: 60000 });
    const dePersonagens = await page.evaluate(() => ({
      mudouAUrl: false,
      temTopbarDaFicha: !!document.querySelector(".rc-fichaheader, [data-testid='fichaheader']"),
      temBackdrop: !!document.querySelector(".rc-backdrop"),
      temPainelSessao: !!document.querySelector(".rm-shell-sessao, [data-testid='campshell-painel-sessao']"),
    }));
    console.log(`\nabrindo por Personagens: ${Date.now() - t2} ms`);
    console.log("  url mudou:", page.url() !== urlAntes, "|", JSON.stringify(dePersonagens));
    await page.screenshot({ path: "scripts/dev/.artefatos-visuais/console-por-personagens.png" });
  } finally {
    await browser.close();
    await admin.from("table_logs").delete().eq("campaign_id", campaignId);
    await admin.from("characters").delete().eq("campaign_id", campaignId);
    await admin.from("campaigns").delete().eq("id", campaignId);
    await admin.auth.admin.deleteUser(narradorId);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
