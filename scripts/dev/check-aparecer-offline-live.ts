/**
 * PRES-02 — "Aparecer offline" em navegadores reais, contra a matriz
 * aprovada em PRES-01: a preferência é da CONTA (sincroniza entre
 * dispositivos), some da projeção pública inclusive para o narrador, e
 * a pessoa escondida é avisada de que sua presença não segura a sessão.
 *
 * Uso: npx tsx scripts/dev/check-aparecer-offline-live.ts
 * (servidor dev já rodando em localhost:3000).
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

let passou = 0, falhou = 0;
function registrar(criterio: string, ok: boolean, detalhe: string) {
  if (ok) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

const criados = { usuarios: [] as string[], campanhas: [] as string[] };
async function criarConta(prefixo: string, nome: string) {
  const email = `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true, user_metadata: { display_name: nome },
  });
  if (error) throw new Error(`Falha ao criar ${nome}: ${error.message}`);
  criados.usuarios.push(data.user.id);
  return { id: data.user.id, email, senha };
}
/** Cada chamada é um NAVEGADOR novo — é assim que se testa "outro dispositivo". */
async function contextoDe(email: string, senha: string) {
  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) throw new Error(`Falha ao logar ${email}: ${error?.message}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await context.addCookies([{
    name: "ruptura_auth",
    value: JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }),
    domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  }]);
  return { page: await context.newPage(), close: () => browser.close() };
}

async function abrirMenuPerfil(page: Page) {
  await page.goto(`${BASE_URL}/mesas`, { waitUntil: "networkidle" });
  await page.locator('[data-testid="topbar-perfil"]').click();
  await page.waitForSelector('[data-testid="account-aparecer-offline"]', { timeout: 10000 });
}
const etiqueta = (page: Page) => page.locator('[data-testid="topbar-presenca"] .ra-online-txt');
async function contagemDoHero(page: Page) {
  await page.goto(`${BASE_URL}/mesas`, { waitUntil: "networkidle" });
  const chip = page.locator('[data-testid="dash-destaque-participantes"]');
  if (await chip.count() === 0) return null;
  return { numero: (await chip.textContent())?.trim() ?? "", titulo: (await chip.getAttribute("title")) ?? "" };
}

async function limpar() {
  for (const uid of criados.usuarios) await admin.from("user_presence_preferences").delete().eq("user_id", uid);
  for (const cid of criados.campanhas) {
    await admin.from("campaign_session_heartbeats").delete().eq("campaign_id", cid);
    await admin.from("campaign_online_sessions").delete().eq("campaign_id", cid);
    await admin.from("vtt_scenes").delete().eq("campaign_id", cid);
    await admin.from("campaign_members").delete().eq("campaign_id", cid);
    await admin.from("campaigns").delete().eq("id", cid);
  }
  for (const uid of criados.usuarios) await admin.auth.admin.deleteUser(uid);
  registrar("L (limpeza de fixtures)", true, `${criados.usuarios.length} usuário(s), ${criados.campanhas.length} campanha(s)`);
}

async function main() {
  const narrador = await criarConta("check-off-narrador", "Narrador Off");
  const jogador = await criarConta("check-off-jogador", "Jogador Off");
  const campaignId = randomUUID();
  const { error } = await admin.from("campaigns").insert({ id: campaignId, name: "Aparecer Offline", owner_id: narrador.id });
  if (error) throw new Error(`Falha ao criar campanha: ${error.message}`);
  criados.campanhas.push(campaignId);
  await admin.from("campaign_members").insert({
    campaign_id: campaignId, user_id: jogador.id, role: "player", status: "active", origem: "fixture_offline_live",
  });
  registrar("0 (fixture: campanha com narrador e um jogador)", true, `campanha=${campaignId}`);

  const fechar: (() => Promise<void>)[] = [];
  try {
    const { page: pn, close: fn } = await contextoDe(narrador.email, narrador.senha);
    fechar.push(fn);
    const { page: pj, close: fj } = await contextoDe(jogador.email, jogador.senha);
    fechar.push(fj);

    // Narrador abre a mesa e inicia a sessão; o jogador entra também.
    await pn.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
    await pn.waitForSelector(".rv-ferramentas", { timeout: 20000 });
    await pn.locator('[data-testid="vtt-menu-mesa-btn"]').click();
    await pn.waitForSelector('[data-testid="vtt-session-control"]', { timeout: 10000 });
    await pn.locator(".rv-session-toggle").click();
    await pn.waitForFunction(() => document.querySelector(".rv-session-status")?.textContent?.trim() === "ONLINE", null, { timeout: 15000 });
    await pj.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
    await pj.waitForSelector(".rv-ferramentas", { timeout: 20000 });

    // --- 1. Estado inicial: desligado, e o narrador conta os dois ---
    {
      await abrirMenuPerfil(pj);
      const estado = await pj.locator('[data-testid="account-aparecer-offline"]').getAttribute("aria-checked");
      const rotulo = (await etiqueta(pj).textContent())?.trim();
      const hero = await contagemDoHero(pn);
      registrar("1 (padrão desligado; etiqueta diz Online; narrador conta 2)",
        estado === "false" && rotulo === "Online" && hero?.numero === "2",
        `aria-checked=${estado}, etiqueta=${rotulo}, hero=${hero?.numero}`);
    }

    // --- 2. Ligar pelo menu muda o item e a etiqueta do topo ---
    {
      await abrirMenuPerfil(pj);
      await pj.locator('[data-testid="account-aparecer-offline"]').click();
      await pj.waitForFunction(() =>
        document.querySelector('[data-testid="topbar-presenca"] .ra-online-txt')?.textContent?.trim() === "Offline",
        null, { timeout: 10000 });
      await abrirMenuPerfil(pj);
      const estado = await pj.locator('[data-testid="account-aparecer-offline"]').getAttribute("aria-checked");
      registrar("2 (ligar pelo menu marca o item e apaga a etiqueta do topo)",
        estado === "true" && (await etiqueta(pj).textContent())?.trim() === "Offline",
        `aria-checked=${estado}, etiqueta=${(await etiqueta(pj).textContent())?.trim()}`);
    }

    // --- 3. É preferência de CONTA: outro navegador da mesma pessoa já nasce com ela ---
    {
      const { page: outro, close } = await contextoDe(jogador.email, jogador.senha);
      fechar.push(close);
      await abrirMenuPerfil(outro);
      const estado = await outro.locator('[data-testid="account-aparecer-offline"]').getAttribute("aria-checked");
      registrar("3 (a preferência sincroniza para outro dispositivo da mesma conta)",
        estado === "true" && (await etiqueta(outro).textContent())?.trim() === "Offline",
        `aria-checked=${estado}`);
    }

    // --- 4. O jogador escondido some da contagem do narrador ---
    {
      await pj.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
      await pj.waitForSelector(".rv-ferramentas", { timeout: 20000 });
      const hero = await contagemDoHero(pn);
      registrar("4 (jogador escondido sai da contagem do narrador)",
        hero?.numero === "1" && hero.titulo === "Narrador na mesa; nenhum jogador conectado.",
        `hero=${hero?.numero}, titulo="${hero?.titulo}"`);
    }

    // --- 5. Uma contagem só: a própria pessoa também não se vê ---
    {
      const hero = await contagemDoHero(pj);
      registrar("5 (quem está escondido não se vê na própria contagem)",
        hero?.numero === "1", `hero=${hero?.numero}`);
    }

    // --- 6. O aviso na mesa diz as duas coisas ---
    {
      await pj.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
      await pj.waitForSelector(".rv-ferramentas", { timeout: 20000 });
      await pj.locator('[data-testid="vtt-menu-mesa-btn"]').click();
      const aviso = pj.locator('[data-testid="vtt-aviso-offline"]');
      await aviso.waitFor({ timeout: 10000 });
      const texto = (await aviso.textContent())?.trim() ?? "";
      registrar("6 (o aviso diz que ninguém vê E que a presença não segura a sessão)",
        /nem o narrador/i.test(texto) && /não segura a sessão/i.test(texto), `"${texto}"`);
    }

    // --- 7. O narrador não tem aviso algum (não está escondido) ---
    {
      await pn.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
      await pn.waitForSelector(".rv-ferramentas", { timeout: 20000 });
      await pn.locator('[data-testid="vtt-menu-mesa-btn"]').click();
      await pn.waitForSelector('[data-testid="vtt-session-control"]', { timeout: 10000 });
      registrar("7 (quem está visível não recebe aviso)",
        await pn.locator('[data-testid="vtt-aviso-offline"]').count() === 0, "sem aviso");
    }

    // --- 8. Desligar devolve a presença ---
    {
      await abrirMenuPerfil(pj);
      await pj.locator('[data-testid="account-aparecer-offline"]').click();
      await pj.waitForFunction(() =>
        document.querySelector('[data-testid="topbar-presenca"] .ra-online-txt')?.textContent?.trim() === "Online",
        null, { timeout: 10000 });
      await pj.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
      await pj.waitForSelector(".rv-ferramentas", { timeout: 20000 });
      const hero = await contagemDoHero(pn);
      registrar("8 (desligar devolve a presença e a contagem)",
        hero?.numero === "2" && hero.titulo === "Narrador na mesa e 1 jogador conectado.",
        `hero=${hero?.numero}, titulo="${hero?.titulo}"`);
    }
  } finally {
    for (const f of fechar) await f();
  }
}

try {
  await main();
} catch (e) {
  registrar("E (execução)", false, e instanceof Error ? e.message : String(e));
} finally {
  await limpar();
  console.log(`\n${passou} ok, ${falhou} falha(s)`);
  process.exit(falhou > 0 ? 1 : 0);
}
