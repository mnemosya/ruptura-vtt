/**
 * Captura VISUAL das janelas de ferramenta do VTT, uma a uma, para
 * comparar com o estudo (`charge dice/src/components/tools.tsx`).
 *
 * Não afirma nada sozinho — abre cada ferramenta, tira o recorte da
 * janela e deixa o PNG em `.artefatos-visuais/`. É o script que fecha o
 * ciclo "apliquei o CSS" → "olhei o resultado".
 *
 * Uso: npx tsx scripts/dev/check-vtt-janelas-ferramenta.ts
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

/** Ferramenta → tecla de atalho e rótulo da janela (o `aria-label`). */
const JANELAS: { nome: string; tecla: string; rotulo: string; botao?: string; seletor?: string }[] = [
  { nome: "medir", tecla: "m", rotulo: "Ferramenta Medir" },
  { nome: "areas", tecla: "a", rotulo: "Ferramenta Áreas" },
  { nome: "terreno", tecla: "t", rotulo: "Ferramenta Terreno" },
  { nome: "objetos", tecla: "o", rotulo: "Ferramenta Objetos" },
  { nome: "rodadas", tecla: "r", rotulo: "Ferramenta Rodadas" },
  { nome: "marcar", tecla: "d", rotulo: "Ferramenta Marcar" },
  { nome: "camadas", tecla: "", rotulo: "Camadas do mapa", botao: "Camadas do mapa" },
  { nome: "cena", tecla: "", rotulo: "Configurações da cena", botao: "Configurações da cena" },
  { nome: "token", tecla: "", rotulo: "", botao: "Adicionar token", seletor: '.rv-janela-token' },
];

async function capturar(page: Page, j: { nome: string; tecla: string; rotulo: string; botao?: string; seletor?: string }) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  // Nem toda janela é ferramenta: Camadas, Adicionar token e
  // Configurações da Cena abrem por botão da barra, não por atalho.
  if (j.botao) await page.locator(`button[aria-label="${j.botao}"]`).click();
  else await page.keyboard.press(j.tecla);
  const janela = j.seletor ? page.locator(j.seletor) : page.locator(`section[aria-label="${j.rotulo}"]`);
  try {
    await janela.waitFor({ timeout: 4000 });
  } catch {
    console.log(`— ${j.nome}: janela não abriu com "${j.tecla}"`);
    return;
  }
  await page.waitForTimeout(350);
  await janela.screenshot({ path: `scripts/dev/.artefatos-visuais/janela-${j.nome}.png` });
  // As janelas de BOTÃO são alternadas, não trocadas: sem fechar aqui,
  // a próxima abre por cima e a captura pega a de baixo.
  if (j.botao && !j.seletor) {
    await page.locator(`button[aria-label="${j.botao}"]`).click();
    await page.waitForTimeout(200);
  }
  console.log(`ok - ${j.nome}`);
}


/**
 * Rodadas tem DOIS desenhos, e o da configuração não prova nada sobre o
 * outro: com combate aberto a janela troca de título, de acento e de
 * conteúdo inteiro. Aqui ela é iniciada de verdade pra que a captura
 * mostre o estado em vigor.
 */
async function capturarRodadasAtivo(page: Page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await page.keyboard.press("r");
  const janela = page.locator('section[aria-label="Ferramenta Rodadas"]');
  await janela.waitFor({ timeout: 4000 });
  await janela.locator(".rv-rodadas-iniciar").click();
  // `.rv-fp-placas` existe nos DOIS estados — esperar por ela pegava a
  // janela ainda em "Iniciando…". A nota da janela aberta só existe com
  // combate em vigor.
  await janela.locator(".rv-rodadas-regra").waitFor({ timeout: 10000 });
  // O cursor fica em cima do botão que acabou de ser clicado e o anel
  // de carga dele aparece na captura como se fosse parte da janela.
  await page.mouse.move(20, 20);
  await page.waitForTimeout(600);
  await janela.screenshot({ path: "scripts/dev/.artefatos-visuais/janela-rodadas-ativo.png" });

  // As ações da linha são ÍCONE: a captura da janela em repouso não
  // mostra o que elas dizem. Esta segunda passada pega a dica aberta —
  // e como ela é `position: fixed` (o corpo da janela rola), o recorte
  // tem que ser da PÁGINA, não do elemento.
  await janela.locator(".rv-rodadas-linha").first().locator(".rv-rodadas-mini").first().hover();
  await page.locator(".rv-rodadas-dica").waitFor({ timeout: 3000 });
  const caixa = await janela.boundingBox();
  if (caixa) {
    await page.screenshot({
      path: "scripts/dev/.artefatos-visuais/janela-rodadas-ativo-dica.png",
      clip: { x: caixa.x, y: caixa.y, width: caixa.width, height: caixa.height },
    });
  }
  console.log("ok - rodadas (combate ativo)");
}

async function main() {
  const email = `check-janelas-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data: userData, error: userErr } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true, user_metadata: { display_name: "Narradora Teste" },
  });
  if (userErr || !userData.user) throw new Error(`criar conta: ${userErr?.message}`);
  const narradorId = userData.user.id;
  const campaignId = randomUUID();
  const { error: e1 } = await admin.from("campaigns").insert({ id: campaignId, name: "Janelas de ferramenta", owner_id: narradorId });
  if (e1) throw new Error(`criar campanha: ${e1.message}`);

  // Cena com elenco: sem token nenhum, Rodadas mostra só o aviso de
  // cena vazia e a captura não prova nada sobre o desenho da janela.
  const { data: cena, error: eCena } = await admin.from("vtt_scenes")
    .insert({ campaign_id: campaignId, nome: "Cena das janelas", largura: 20, altura: 20 })
    .select("id").single();
  if (eCena) throw new Error(`criar cena: ${eCena.message}`);
  const { error: eTokens } = await admin.from("vtt_tokens").insert([
    { scene_id: cena!.id, campaign_id: campaignId, nome: "Mara Venn", sigla: "MV", lado: "pj", tamanho: "medio", orientacao: 0, q: 5, r: 5, visivel: true },
    { scene_id: cena!.id, campaign_id: campaignId, nome: "Sentinela da Doca", sigla: "#2", lado: "pn", tamanho: "medio", orientacao: 0, q: 8, r: 6, visivel: true },
    { scene_id: cena!.id, campaign_id: campaignId, nome: "Contrabandista", sigla: "#3", lado: "pn", tamanho: "medio", orientacao: 0, q: 11, r: 7, visivel: true },
  ]);
  if (eTokens) throw new Error(`criar tokens: ${eTokens.message}`);

  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sessao, error: e2 } = await anon.auth.signInWithPassword({ email, password: senha });
  if (e2 || !sessao.session) throw new Error(`login: ${e2?.message}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 });
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
    for (const j of JANELAS) await capturar(page, j);
    await capturarRodadasAtivo(page);
  } finally {
    await browser.close();
    await admin.from("table_logs").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_tokens").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_scenes").delete().eq("campaign_id", campaignId);
    await admin.from("campaigns").delete().eq("id", campaignId);
    await admin.auth.admin.deleteUser(narradorId);
    console.log("limpeza ok");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
