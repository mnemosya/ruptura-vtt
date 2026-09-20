/**
 * DASH-01 — o contador do hero contra navegadores reais: dois jogadores
 * abrem a mesa (e só por isso batem o coração), e o dashboard do
 * narrador tem de mostrar o número certo e a frase certa. Nada de SQL
 * fingindo ser presença: quem conta é quem está com a página aberta.
 *
 * Uso: npx tsx scripts/dev/check-dashboard-participantes-live.ts
 * (servidor dev já rodando em localhost:3000).
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright";
import { BASE_URL } from "./authSession";
import { textoDeParticipantes } from "../../src/app/mesas/_global/participantes";

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
const chip = (page: Page) => page.locator('[data-testid="dash-destaque-participantes"]');
async function lerHero(page: Page) {
  await page.goto(`${BASE_URL}/mesas`, { waitUntil: "networkidle" });
  if (await chip(page).count() === 0) return null;
  return {
    numero: (await chip(page).textContent())?.trim() ?? "",
    titulo: (await chip(page).getAttribute("title")) ?? "",
    rotulo: (await chip(page).getAttribute("aria-label")) ?? "",
  };
}

async function limpar() {
  for (const cid of criados.campanhas) {
    await admin.from("campaign_session_heartbeats").delete().eq("campaign_id", cid);
    await admin.from("campaign_online_sessions").delete().eq("campaign_id", cid);
    await admin.from("vtt_tokens").delete().eq("campaign_id", cid);
    await admin.from("vtt_scenes").delete().eq("campaign_id", cid);
    await admin.from("campaign_members").delete().eq("campaign_id", cid);
    await admin.from("campaigns").delete().eq("id", cid);
  }
  for (const uid of criados.usuarios) await admin.auth.admin.deleteUser(uid);
  registrar("L (limpeza de fixtures)", true, `${criados.usuarios.length} usuário(s), ${criados.campanhas.length} campanha(s)`);
}

async function main() {
  const narrador = await criarConta("check-dash-narrador", "Narrador Dash");
  const jogadorA = await criarConta("check-dash-jogador-a", "Jogadora A");
  const jogadorB = await criarConta("check-dash-jogador-b", "Jogador B");
  const campaignId = randomUUID();
  const { error } = await admin.from("campaigns").insert({ id: campaignId, name: "Presença Real", owner_id: narrador.id });
  if (error) throw new Error(`Falha ao criar campanha: ${error.message}`);
  criados.campanhas.push(campaignId);
  for (const j of [jogadorA, jogadorB]) {
    await admin.from("campaign_members").insert({
      campaign_id: campaignId, user_id: j.id, role: "player", status: "active", origem: "fixture_dash_presenca",
    });
  }
  registrar("0 (fixture: campanha com narrador e dois jogadores ativos)", true, `campanha=${campaignId}`);

  const abertos: (() => Promise<void>)[] = [];
  const { page: pn, close: fecharNarrador } = await contextoDe(narrador.email, narrador.senha);
  abertos.push(fecharNarrador);
  try {
    // --- 1. Sem sessão não há hero, por mais que alguém esteja conectado ---
    {
      await pn.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
      await pn.waitForSelector(".rv-ferramentas", { timeout: 20000 });
      const hero = await lerHero(pn);
      registrar("1 (sem sessão iniciada não existe hero, mesmo com o narrador na mesa)", hero === null,
        `hero=${hero ? "presente" : "ausente"}`);
    }

    // --- 2. Narrador sozinho na sessão: conta 1 e a frase distingue o caso ---
    {
      await pn.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
      await pn.waitForSelector(".rv-ferramentas", { timeout: 20000 });
      await pn.locator('[data-testid="vtt-menu-mesa-btn"]').click();
      await pn.waitForSelector('[data-testid="vtt-session-control"]', { timeout: 10000 });
      await pn.locator(".rv-session-toggle").click();
      await pn.waitForFunction(() => document.querySelector(".rv-session-status")?.textContent?.trim() === "ONLINE", null, { timeout: 15000 });
      const hero = await lerHero(pn);
      registrar("2 (narrador sozinho: conta 1 e a frase diz que não há jogadores)",
        hero?.numero === "1" && hero.titulo === textoDeParticipantes(true, 0),
        `numero=${hero?.numero}, titulo="${hero?.titulo}"`);
    }

    // --- 3. Um jogador abre a mesa: o número sobe porque ELE está lá ---
    {
      const { page: pa, close } = await contextoDe(jogadorA.email, jogadorA.senha);
      abertos.push(close);
      await pa.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
      await pa.waitForSelector(".rv-ferramentas", { timeout: 20000 });
      const hero = await lerHero(pn);
      registrar("3 (um jogador conectado: conta 2, singular correto)",
        hero?.numero === "2" && hero.titulo === textoDeParticipantes(true, 1),
        `numero=${hero?.numero}, titulo="${hero?.titulo}"`);
    }

    // --- 4. Dois jogadores: plural correto ---
    {
      const { page: pb, close } = await contextoDe(jogadorB.email, jogadorB.senha);
      abertos.push(close);
      await pb.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
      await pb.waitForSelector(".rv-ferramentas", { timeout: 20000 });
      const hero = await lerHero(pn);
      registrar("4 (dois jogadores conectados: conta 3, plural correto)",
        hero?.numero === "3" && hero.titulo === textoDeParticipantes(true, 2),
        `numero=${hero?.numero}, titulo="${hero?.titulo}"`);
    }

    // Captura do hero com a contagem real, para inspeção humana.
    if (process.argv.includes("--captura")) {
      await pn.goto(`${BASE_URL}/mesas`, { waitUntil: "networkidle" });
      await chip(pn).hover();
      await pn.locator('[data-testid="dash-mesa-destaque"]').screenshot({ path: "/tmp/dash-hero-participantes.png" });
      console.log("captura: /tmp/dash-hero-participantes.png");
    }

    // --- 5. O rótulo acessível carrega a mesma frase do title ---
    {
      const hero = await lerHero(pn);
      registrar("5 (aria-label repete a frase; o número sozinho fica aria-hidden)",
        !!hero && hero.rotulo === hero.titulo && hero.rotulo.length > 0,
        `aria-label="${hero?.rotulo}"`);
    }

    // --- 6. O jogador também vê o hero e a mesma contagem ---
    {
      const { page: pv, close } = await contextoDe(jogadorA.email, jogadorA.senha);
      abertos.push(close);
      const hero = await lerHero(pv);
      registrar("6 (o jogador vê o mesmo hero e a mesma contagem)",
        hero?.numero === "3" && hero.titulo === textoDeParticipantes(true, 2),
        `numero=${hero?.numero}, titulo="${hero?.titulo}"`);
    }

    // --- 7. Encerrada a sessão, o hero some — presença não sustenta hero ---
    {
      await pn.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
      await pn.waitForSelector(".rv-ferramentas", { timeout: 20000 });
      await pn.locator('[data-testid="vtt-menu-mesa-btn"]').click();
      await pn.waitForSelector('[data-testid="vtt-session-control"]', { timeout: 10000 });
      await pn.locator(".rv-session-toggle").click();
      await pn.locator(".rv-session-confirm .rv-session-button--danger").click();
      await pn.waitForFunction(() => document.querySelector(".rv-session-status")?.textContent?.trim() === "OFFLINE", null, { timeout: 15000 });
      const hero = await lerHero(pn);
      registrar("7 (sessão encerrada tira o hero, ainda com gente conectada)", hero === null,
        `hero=${hero ? "presente" : "ausente"}`);
    }
  } finally {
    for (const fechar of abertos) await fechar();
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
