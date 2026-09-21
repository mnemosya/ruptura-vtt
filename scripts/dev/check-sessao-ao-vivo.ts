/**
 * A SESSÃO AO VIVO — iniciar e encerrar, visto dos dois lados.
 *
 * SESS-01, SESS-02 e PRES-02 foram implementados e não tinham cobertura
 * ao vivo: os checks existentes olham o banco e a própria tela de quem
 * age. Isso não responde a pergunta que importa na mesa — **a outra
 * pessoa fica sabendo?**
 *
 * É a mesma lacuna que deixou o RT-01 passar por meses: o estado chegava
 * ao banco, a tela de quem agia mostrava certo, e ninguém verificava a
 * segunda sessão sem recarregar.
 *
 * Regra do arquivo, igual à de `check-mesa-ao-vivo.ts`: NENHUM reload
 * depois que as duas sessões abriram. Recarregar aqui apaga exatamente
 * o que se quer ver.
 *
 * Uso: npx tsx scripts/dev/check-sessao-ao-vivo.ts
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Browser, type Page } from "playwright";
import { BASE_URL } from "./authSession";

loadDotenv({ path: ".env.local" });

function exigirEnv(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} ausente no .env.local`);
  return v;
}

const admin = createClient(exigirEnv("SUPABASE_URL"), exigirEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const anon = createClient(exigirEnv("SUPABASE_URL"), exigirEnv("SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const SENHA = "Fixture#12345";
const PREFIXO = "zz_e2e_sessao_viva";

let passou = 0;
let falhou = 0;
function registrar(criterio: string, ok: boolean, detalhe: string) {
  if (ok) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

const criados = { usuarios: [] as string[], campanhas: [] as string[] };

async function criarConta(papel: string): Promise<{ id: string; email: string }> {
  const email = `${PREFIXO}-${papel}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@ruptura.dev`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: SENHA, email_confirm: true, user_metadata: { display_name: papel } });
  if (error || !data.user) throw new Error(`Falha ao criar ${papel}: ${error?.message}`);
  criados.usuarios.push(data.user.id);
  return { id: data.user.id, email };
}

/** Espera por CONDIÇÃO, com o relógio só como teto. */
async function esperarAte(cond: () => Promise<boolean>, tetoMs = 12000): Promise<number | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < tetoMs) {
    if (await cond()) return Date.now() - t0;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

async function abrirSessao(browser: Browser, email: string, campaignId: string): Promise<{ page: Page; fechar: () => Promise<void> }> {
  const { data, error } = await anon.auth.signInWithPassword({ email, password: SENHA });
  if (error || !data.session) throw new Error(`Falha ao logar ${email}: ${error?.message}`);
  const contexto = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await contexto.addCookies([{
    name: "ruptura_auth",
    value: JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }),
    domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 604800,
  }]);
  const page = await contexto.newPage();
  await page.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".rv-ferramentas", { timeout: 30000 });
  return { page, fechar: () => contexto.close() };
}

/**
 * Abre o menu da mesa, que é onde o controle de sessão vive. Fica
 * aberto: o estado que se quer observar está dentro dele, e fechar
 * entre uma leitura e outra é o que faria a observação depender de
 * reabrir na hora certa.
 */
async function abrirMenuDaMesa(page: Page): Promise<void> {
  if ((await page.locator('[data-testid="vtt-session-control"]').count()) > 0) return;
  await page.locator('[data-testid="vtt-menu-mesa-btn"]').click();
  await page.waitForSelector('[data-testid="vtt-session-control"]', { timeout: 8000 });
}

/** "ONLINE"/"OFFLINE" como a pessoa lê, pelo atributo que a interface já expõe. */
async function estadoNaTela(page: Page): Promise<string | null> {
  return page.locator(".rv-session-status").getAttribute("data-online").catch(() => null);
}

async function limpar(): Promise<void> {
  for (const id of criados.campanhas) await admin.from("campaigns").delete().eq("id", id);
  for (const id of criados.usuarios) await admin.auth.admin.deleteUser(id).catch(() => {});
}

async function main(): Promise<void> {
  const narrador = await criarConta("narrador");
  const jogador = await criarConta("jogador");
  const campaignId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: `${PREFIXO}_mesa`, owner_id: narrador.id });
  criados.campanhas.push(campaignId);
  await admin.from("campaign_members").insert({ campaign_id: campaignId, user_id: jogador.id, role: "player", status: "active" });
  const { data: cena } = await admin.from("vtt_scenes").insert({ campaign_id: campaignId, nome: "Cena", largura: 12, altura: 12 }).select("id").single();
  await admin.from("vtt_scene_presentation").insert({ campaign_id: campaignId, presented_scene_id: cena!.id, updated_by: narrador.id });

  const browser = await chromium.launch({ headless: true });
  let sN: { page: Page; fechar: () => Promise<void> } | null = null;
  let sJ: { page: Page; fechar: () => Promise<void> } | null = null;
  try {
    sN = await abrirSessao(browser, narrador.email, campaignId);
    sJ = await abrirSessao(browser, jogador.email, campaignId);
    await abrirMenuDaMesa(sN.page);
    await abrirMenuDaMesa(sJ.page);
    registrar("0 (as duas sessões abrem com o menu da mesa)", true, `campanha=${campaignId}`);

    // ── 1. Começa offline para os dois ───────────────────────────
    registrar("1a (narrador começa vendo OFFLINE)", (await estadoNaTela(sN.page)) === "false", `data-online=${await estadoNaTela(sN.page)}`);
    registrar("1b (jogador começa vendo OFFLINE)", (await estadoNaTela(sJ.page)) === "false", `data-online=${await estadoNaTela(sJ.page)}`);

    // ── 2. Só o narrador tem o botão ─────────────────────────────
    // Não é detalhe de interface: quem pode abrir e fechar a mesa é
    // uma regra, e ela precisa estar na tela, não só na RLS.
    const botaoNarrador = await sN.page.getByRole("menuitem", { name: /Iniciar sessão/ }).count();
    const botaoJogador = await sJ.page.getByRole("menuitem", { name: /Iniciar sessão/ }).count();
    registrar("2 (só o narrador vê o controle de iniciar sessão)", botaoNarrador === 1 && botaoJogador === 0, `narrador=${botaoNarrador}, jogador=${botaoJogador}`);

    // ── 3. Iniciar chega ao jogador ──────────────────────────────
    await sN.page.getByRole("menuitem", { name: /Iniciar sessão/ }).click();
    const msOnline = await esperarAte(async () => (await estadoNaTela(sJ!.page)) === "true");
    registrar("3 (sessão iniciada pelo narrador aparece ONLINE para o jogador, sem reload)", msOnline !== null, msOnline !== null ? `${msOnline}ms` : "não chegou em 12s");

    // ── 4. E está de verdade no banco ────────────────────────────
    const { data: sessaoNoBanco } = await admin.from("campaign_online_sessions").select("id,ended_at").eq("campaign_id", campaignId).is("ended_at", null).maybeSingle();
    registrar("4 (a sessão aberta existe no banco, não só na tela)", !!sessaoNoBanco, sessaoNoBanco ? `id=${sessaoNoBanco.id}` : "nenhuma linha aberta");

    // ── 5. Encerrar pede confirmação ─────────────────────────────
    // Encerrar é destrutivo do ponto de vista da mesa: tira todo mundo
    // da sessão. A confirmação é parte do contrato, não enfeite.
    await sN.page.getByRole("menuitem", { name: /Encerrar/ }).first().click();
    const perguntou = await sN.page.locator(".rv-session-question").count();
    registrar("5 (encerrar pede confirmação antes de tirar a mesa do ar)", perguntou === 1, `pergunta visível=${perguntou}`);

    // ── 6. Encerrar chega ao jogador ─────────────────────────────
    await sN.page.getByRole("menuitem", { name: /^Encerrar$/ }).last().click();
    const msOffline = await esperarAte(async () => (await estadoNaTela(sJ!.page)) === "false");
    registrar("6 (sessão encerrada aparece OFFLINE para o jogador, sem reload)", msOffline !== null, msOffline !== null ? `${msOffline}ms` : "não chegou em 12s");

    // ── 7. E o histórico ficou ───────────────────────────────────
    // A interface promete isso com todas as letras ("O histórico fica
    // salvo"). Promessa escrita na tela é contrato.
    const { data: encerrada } = await admin.from("campaign_online_sessions").select("id,ended_at").eq("campaign_id", campaignId).not("ended_at", "is", null).maybeSingle();
    registrar("7 (a sessão encerrada fica no histórico, como a interface promete)", !!encerrada?.ended_at, encerrada ? `encerrada em ${encerrada.ended_at}` : "nenhuma linha encerrada");
  } finally {
    await sN?.fechar();
    await sJ?.fechar();
    await browser.close();
    await limpar();
    registrar("L (limpeza de fixtures)", true, `${criados.usuarios.length} conta(s), ${criados.campanhas.length} campanha(s)`);
  }
  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  process.exit(falhou > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("\ncheck-sessao-ao-vivo FALHOU:\n", err instanceof Error ? err.message : err);
  await limpar();
  process.exit(1);
});
