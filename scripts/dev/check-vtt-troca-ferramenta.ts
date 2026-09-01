/**
 * Troca de ferramenta durante o posicionamento de token — cobre:
 *
 *  - lógica PURA (`decidirTrocaFerramenta`, `_ferramentas/controlador.ts`),
 *    sem navegador: "enviando" sempre bloqueada; "posicionando"/"erro"
 *    cancela-e-troca, exceto pra mesma ferramenta já ativa (não
 *    cancela à toa); qualquer outra fase troca direto.
 *  - navegador real: botão da barra E atalho de teclado, durante
 *    "posicionando", cancelam o posicionamento e trocam de ferramenta;
 *    o atalho da ferramenta JÁ ativa não cancela nada; Esc continua
 *    cancelando; nenhuma RPC de criação é disparada por uma troca de
 *    ferramenta.
 *
 * "enviando bloqueia" tem prova determinística só no nível da função
 * pura acima — o nível de navegador tentaria pegar uma janela de rede
 * real (não determinística sem um gancho de atraso artificial, que
 * este pedido não autoriza a introduzir); documentado, não fingido.
 *
 * Uso: npx tsx scripts/dev/check-vtt-troca-ferramenta.ts (servidor dev
 * já rodando em localhost:3000).
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright";
import { BASE_URL } from "./authSession";
import { decidirTrocaFerramenta } from "../../src/app/mesas/[campaignId]/vtt/_ferramentas/controlador";

loadDotenv({ path: ".env.local" });
function requireEnv(nome: string): string {
  const v = process.env[nome];
  if (!v) { console.error(`Variável de ambiente ausente: ${nome}`); process.exit(1); }
  return v;
}
const admin = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anonKey = requireEnv("SUPABASE_ANON_KEY");
const supabaseUrl = requireEnv("SUPABASE_URL");

let passou = 0;
let falhou = 0;
function registrar(criterio: string, ok: boolean, detalhe: string) {
  if (ok) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

// ── Lógica pura ──────────────────────────────────────────────────
function testarLogicaPura() {
  registrar("pura-1 (fluxo fechado → troca direta)", decidirTrocaFerramenta(null, "medir", "interagir") === "trocar", "ok");
  registrar("pura-2 (posicionando, ferramenta diferente → cancela e troca)", decidirTrocaFerramenta("posicionando", "medir", "interagir") === "cancelar-e-trocar", "ok");
  registrar("pura-3 (posicionando, MESMA ferramenta → troca direta, sem cancelar)", decidirTrocaFerramenta("posicionando", "interagir", "interagir") === "trocar", "ok");
  registrar("pura-4 (erro, ferramenta diferente → cancela e troca)", decidirTrocaFerramenta("erro", "terreno", "interagir") === "cancelar-e-trocar", "ok");
  registrar("pura-5 (erro, MESMA ferramenta → troca direta)", decidirTrocaFerramenta("erro", "interagir", "interagir") === "trocar", "ok");
  registrar("pura-6 (enviando, ferramenta diferente → bloqueada)", decidirTrocaFerramenta("enviando", "medir", "interagir") === "bloqueada", "ok");
  registrar("pura-7 (enviando, MESMA ferramenta → ainda bloqueada)", decidirTrocaFerramenta("enviando", "interagir", "interagir") === "bloqueada", "ok");
}

let campaignId: string | null = null;
let narradorEmail: string | null = null;
let narradorSenha: string | null = null;
const criados = { usuarios: [] as string[], campanhas: [] as string[] };

async function configurarFixture(): Promise<void> {
  campaignId = randomUUID();
  const email = `check-vtt-troca-ferramenta-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { display_name: "Narrador Troca" } });
  if (error) throw new Error(`Falha ao criar narrador fixture: ${error.message}`);
  narradorEmail = email; narradorSenha = senha;
  criados.usuarios.push(data.user.id);
  const { error: e1 } = await admin.from("campaigns").insert({ id: campaignId, name: "VTT Troca Ferramenta", owner_id: data.user.id });
  if (e1) throw new Error(`Falha ao criar campanha: ${e1.message}`);
  criados.campanhas.push(campaignId);
}

async function limpar() {
  for (const cid of criados.campanhas) {
    await admin.from("vtt_marks").delete().eq("campaign_id", cid);
    await admin.from("vtt_terrain").delete().eq("campaign_id", cid);
    await admin.from("vtt_tokens").delete().eq("campaign_id", cid);
    await admin.from("vtt_scenes").delete().eq("campaign_id", cid);
    await admin.from("campaigns").delete().eq("id", cid);
  }
  for (const uid of criados.usuarios) await admin.auth.admin.deleteUser(uid);
  registrar("L (limpeza de fixtures)", true, `${criados.usuarios.length} usuário(s), ${criados.campanhas.length} campanha(s)`);
}

async function abrirCriarConfigurando(page: Page, indiceCelula: number) {
  await page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
  const box = await page.locator(".rv-camada-grade path").nth(indiceCelula).boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2, { button: "right" });
  await page.locator(".rv-menu-item", { hasText: "Adicionar token" }).click();
  await page.waitForSelector(".rv-gerenciador-token", { timeout: 5000 });
}
async function continuarParaPosicionar(page: Page, nome: string) {
  await page.locator(".rv-gerenciador-token input[type=text]").first().fill(nome);
  await page.locator(".rv-gerenciador-token .rv-btn--pri", { hasText: "Continuar para posicionar" }).click();
  await page.waitForSelector(".rv-escolha-posicao", { timeout: 5000 });
  await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 });
}

async function main() {
  testarLogicaPura();

  await configurarFixture();
  registrar("0 (fixture)", true, `campanha=${campaignId}`);

  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sess } = await anon.auth.signInWithPassword({ email: narradorEmail!, password: narradorSenha! });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  await context.addCookies([{
    name: "ruptura_auth",
    value: JSON.stringify({ access_token: sess!.session!.access_token, refresh_token: sess!.session!.refresh_token }),
    domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  }]);
  const page = await context.newPage();
  const erros: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) erros.push(m.text().slice(0, 400)); });
  await page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
  await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });

  // --- 1: clicar noutra ferramenta durante o posicionamento cancela e troca ---
  {
    await abrirCriarConfigurando(page, 40);
    await continuarParaPosicionar(page, "Troca Botão");
    await page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Medir"]').click();
    const aindaPosicionando = await page.locator(".rv-escolha-posicao").count();
    const ferramentaAtiva = await page.locator('.rv-ferramentas .rv-ferr-btn[aria-pressed="true"]').getAttribute("aria-label");
    const { data: naoCriado } = await admin.from("vtt_tokens").select("id").eq("campaign_id", campaignId).eq("nome", "Troca Botão");
    registrar(
      "1 (clicar noutra ferramenta durante o posicionamento cancela e troca, sem RPC de criação)",
      aindaPosicionando === 0 && !!ferramentaAtiva?.startsWith("Medir") && (naoCriado ?? []).length === 0,
      `aindaPosicionando=${aindaPosicionando === 0 ? "não" : "sim"}, ferramentaAtiva="${ferramentaAtiva}", criados=${(naoCriado ?? []).length}`,
    );
    await page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
  }

  // --- 2: atalho de teclado durante o posicionamento cancela e troca ---
  {
    await abrirCriarConfigurando(page, 55);
    await continuarParaPosicionar(page, "Troca Teclado");
    await page.keyboard.press("d"); // atalho de Marcar
    const aindaPosicionando = await page.locator(".rv-escolha-posicao").count();
    const ferramentaAtiva = await page.locator('.rv-ferramentas .rv-ferr-btn[aria-pressed="true"]').getAttribute("aria-label");
    const { data: naoCriado } = await admin.from("vtt_tokens").select("id").eq("campaign_id", campaignId).eq("nome", "Troca Teclado");
    registrar(
      "2 (atalho de teclado durante o posicionamento cancela e troca, sem RPC de criação)",
      aindaPosicionando === 0 && !!ferramentaAtiva?.startsWith("Marcar") && (naoCriado ?? []).length === 0,
      `aindaPosicionando=${aindaPosicionando === 0 ? "não" : "sim"}, ferramentaAtiva="${ferramentaAtiva}", criados=${(naoCriado ?? []).length}`,
    );
    await page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
  }

  // --- 3: atalho da ferramenta JÁ ativa não cancela nada ---
  {
    await abrirCriarConfigurando(page, 70);
    await continuarParaPosicionar(page, "Mesma Ferramenta");
    // "Interagir" já é a ferramenta ativa (setada logo acima) — pressionar "v" de novo não deve cancelar.
    await page.keyboard.press("v");
    await page.waitForTimeout(200);
    const aindaPosicionando = await page.locator(".rv-escolha-posicao").count();
    const ferramentaAtiva = await page.locator('.rv-ferramentas .rv-ferr-btn[aria-pressed="true"]').getAttribute("aria-label");
    registrar(
      "3 (atalho da ferramenta já ativa não cancela o posicionamento)",
      aindaPosicionando === 1 && !!ferramentaAtiva?.startsWith("Interagir"),
      `aindaPosicionando=${aindaPosicionando === 1 ? "sim" : "não"}, ferramentaAtiva="${ferramentaAtiva}"`,
    );
    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-escolha-posicao", { state: "detached", timeout: 3000 });
  }

  // --- 4: Esc continua cancelando (regressão) ---
  {
    await abrirCriarConfigurando(page, 85);
    await continuarParaPosicionar(page, "Esc Continua");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-escolha-posicao", { state: "detached", timeout: 3000 });
    const { data: naoCriado } = await admin.from("vtt_tokens").select("id").eq("campaign_id", campaignId).eq("nome", "Esc Continua");
    registrar("4 (Esc continua cancelando o posicionamento, sem persistir nada)", (naoCriado ?? []).length === 0, `criados=${(naoCriado ?? []).length}`);
  }

  // --- 5: Q/E continuam reservados à rotação (não trocam de ferramenta) ---
  {
    await abrirCriarConfigurando(page, 95);
    await page.selectOption("#rv-campo-tamanho", "grande");
    await continuarParaPosicionar(page, "Q E Rotacao");
    const box = await page.locator(".rv-camada-grade path").nth(95).boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 3 });
    await page.waitForTimeout(150);
    const orientacaoAntes = await page.locator(".rv-camada-posicionamento-token").getAttribute("data-orientacao");
    await page.keyboard.press("e");
    await page.waitForTimeout(150);
    const orientacaoDepois = await page.locator(".rv-camada-posicionamento-token").getAttribute("data-orientacao");
    const aindaPosicionando = await page.locator(".rv-escolha-posicao").count();
    registrar(
      "5 (Q/E rotaciona o fantasma sem trocar de ferramenta nem cancelar)",
      orientacaoAntes !== orientacaoDepois && aindaPosicionando === 1,
      `orientação ${orientacaoAntes}→${orientacaoDepois}, aindaPosicionando=${aindaPosicionando === 1}`,
    );
    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-escolha-posicao", { state: "detached", timeout: 3000 });
  }

  registrar("6 (nenhum warning/erro novo no console durante toda a sessão)", erros.length === 0, JSON.stringify(erros));

  await browser.close();
  await limpar();

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  process.exit(falhou > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("Erro fatal:", e);
  await limpar().catch(() => {});
  process.exit(1);
});
