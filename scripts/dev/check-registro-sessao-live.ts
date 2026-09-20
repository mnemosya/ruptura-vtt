/**
 * CONT-04 em navegadores reais: iniciar a sessão pela UI faz nascer o
 * registro no organizador, com os participantes que de fato passaram
 * pela mesa — e com quem estava aparecendo offline fora dele.
 *
 * Uso: npx tsx scripts/dev/check-registro-sessao-live.ts
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
  return { id: data.user.id, email, senha, nome };
}
async function contextoDe(email: string, senha: string) {
  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) throw new Error(`Falha ao logar ${email}: ${error?.message}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addCookies([{
    name: "ruptura_auth",
    value: JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }),
    domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  }]);
  return { page: await context.newPage(), close: () => browser.close() };
}
async function abrirMenu(page: Page) {
  await fecharJanela(page);
  if (await page.locator(".rv-menu-mesa").count() === 0) {
    await page.locator('[data-testid="vtt-menu-mesa-btn"]').click();
  }
  await page.waitForSelector(".rv-menu-mesa", { timeout: 10000 });
}
/**
 * A janela é modal: o fundo dela (`pn-jan-fundo`) intercepta cliques, e
 * por isso o menu da mesa não é alcançável enquanto ela estiver aberta.
 */
async function fecharJanela(page: Page) {
  const fechar = page.locator('[data-testid="painel-janela-fechar"]');
  if (await fechar.count() > 0) {
    await fechar.first().click();
    await page.waitForSelector(".pn-jan-fundo", { state: "detached", timeout: 10000 }).catch(() => {});
  }
}

async function abrirOrganizador(page: Page) {
  await abrirMenu(page);
  await page.locator(".rv-menu-mesa-item", { hasText: "Organizador" }).first().click();
  await page.waitForSelector('[data-testid="painel-janela-organizador"]', { timeout: 15000 });
}

async function limpar() {
  for (const uid of criados.usuarios) await admin.from("user_presence_preferences").delete().eq("user_id", uid);
  for (const cid of criados.campanhas) {
    await admin.from("campaign_narrative_entries").delete().eq("campaign_id", cid);
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
  const narrador = await criarConta("check-reg-narrador", "Narrador Reg");
  const visivel = await criarConta("check-reg-visivel", "Jogadora Visível");
  const oculto = await criarConta("check-reg-oculto", "Jogador Oculto");
  const campaignId = randomUUID();
  const { error } = await admin.from("campaigns").insert({ id: campaignId, name: "Mesa do registro", owner_id: narrador.id });
  if (error) throw new Error(`Falha ao criar campanha: ${error.message}`);
  criados.campanhas.push(campaignId);
  for (const j of [visivel, oculto]) {
    await admin.from("campaign_members").insert({
      campaign_id: campaignId, user_id: j.id, role: "player", status: "active", origem: "fixture_reg",
    });
  }
  registrar("0 (fixture: narrador e dois jogadores)", true, `campanha=${campaignId}`);

  const fechar: (() => Promise<void>)[] = [];
  try {
    const { page: pn, close: fn } = await contextoDe(narrador.email, narrador.senha);
    fechar.push(fn);
    await pn.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
    await pn.waitForSelector(".rv-ferramentas", { timeout: 20000 });

    // O jogador oculto liga "Aparecer offline" ANTES de entrar na mesa.
    {
      const { page: po, close } = await contextoDe(oculto.email, oculto.senha);
      fechar.push(close);
      await po.goto(`${BASE_URL}/mesas`, { waitUntil: "networkidle" });
      await po.locator('[data-testid="topbar-perfil"]').click();
      await po.locator('[data-testid="account-aparecer-offline"]').click();
      await po.locator(".ra-toast", { hasText: "Você está aparecendo offline." }).waitFor({ timeout: 15000 });
    }

    // --- 1. Iniciar a sessão pela UI faz nascer o registro ---
    {
      await abrirMenu(pn);
      await pn.waitForSelector('[data-testid="vtt-session-control"]', { timeout: 10000 });
      await pn.locator(".rv-session-toggle").click();
      await pn.waitForFunction(() =>
        document.querySelector(".rv-session-status")?.textContent?.trim() === "ONLINE", null, { timeout: 15000 });
      const { data } = await admin.from("campaign_narrative_entries")
        .select("tipo,estado,online_session_id,titulo,acontecida_em").eq("campaign_id", campaignId);
      registrar("1 (iniciar a sessão cria uma entrada de sessão em rascunho)",
        data?.length === 1 && data[0].tipo === "sessao" && data[0].estado === "rascunho"
        && !!data[0].online_session_id && !!data[0].acontecida_em,
        `entradas=${data?.length}, título="${data?.[0]?.titulo}"`);
    }

    // --- 2. O registro aparece no organizador, como qualquer entrada ---
    {
      await abrirOrganizador(pn);
      await pn.waitForSelector('[data-testid="organizador-item"]', { timeout: 15000 });
      const texto = (await pn.locator('[data-testid="organizador-item"]').first().textContent()) ?? "";
      registrar("2 (o registro nasce no organizador, marcado como rascunho)",
        /Sessão/.test(texto) && /Rascunho/.test(texto), `"${texto.trim().replace(/\s+/g, " ")}"`);
    }

    // --- 3. O narrador já está na lista, como autor ---
    {
      await pn.locator('[data-testid="organizador-item"]').first().click();
      await pn.waitForSelector('[data-testid="organizador-participantes"]', { timeout: 15000 });
      await pn.waitForFunction(() =>
        !document.querySelector(".rv-org-part-nome[data-carregando]"), null, { timeout: 20000 });
      const nomes = await pn.locator(".rv-org-part-nome").allTextContents();
      registrar("3 (o narrador entra na lista desde o início)",
        nomes.length === 1 && nomes[0].includes("Narrador Reg"), `nomes=${JSON.stringify(nomes)}`);
    }

    // --- 4. Jogadora visível entra ao abrir a mesa ---
    {
      const { page: pv, close } = await contextoDe(visivel.email, visivel.senha);
      fechar.push(close);
      await pv.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
      await pv.waitForSelector(".rv-ferramentas", { timeout: 20000 });
      await pn.reload({ waitUntil: "networkidle" });
      await pn.waitForSelector(".rv-ferramentas", { timeout: 20000 });
      await abrirOrganizador(pn);
      await pn.locator('[data-testid="organizador-item"]').first().click();
      await pn.waitForSelector('[data-testid="organizador-participantes"]', { timeout: 15000 });
      await pn.waitForFunction(() =>
        document.querySelectorAll(".rv-org-part-nome").length === 2
        && !document.querySelector(".rv-org-part-nome[data-carregando]"), null, { timeout: 20000 });
      const nomes = await pn.locator(".rv-org-part-nome").allTextContents();
      registrar("4 (quem abre a mesa entra na lista, com horários)",
        nomes.some((n) => n.includes("Jogadora Visível"))
        && (await pn.locator(".rv-org-part-horas").count()) === 2,
        `nomes=${JSON.stringify(nomes)}`);
    }

    // --- 5. Quem está aparecendo offline NÃO entra ---
    {
      const { page: po, close } = await contextoDe(oculto.email, oculto.senha);
      fechar.push(close);
      await po.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
      await po.waitForSelector(".rv-ferramentas", { timeout: 20000 });
      await po.waitForTimeout(2500);
      const { data: sessao } = await admin.from("campaign_online_sessions")
        .select("id").eq("campaign_id", campaignId).is("ended_at", null).single();
      const { data } = await admin.from("campaign_session_participants").select("user_id").eq("session_id", sessao!.id);
      registrar("5 (quem está aparecendo offline fica fora do registro)",
        data?.length === 2 && !data.some((p) => p.user_id === oculto.id),
        `registrados=${data?.length}, oculto presente=${data?.some((p) => p.user_id === oculto.id)}`);
    }

    // --- 6. Correção manual: tirar alguém marca origem e apaga a linha ---
    {
      await pn.reload({ waitUntil: "networkidle" });
      await pn.waitForSelector(".rv-ferramentas", { timeout: 20000 });
      await abrirOrganizador(pn);
      await pn.locator('[data-testid="organizador-item"]').first().click();
      await pn.waitForSelector('[data-testid="organizador-participantes"]', { timeout: 15000 });
      await pn.waitForFunction(() =>
        !document.querySelector(".rv-org-part-nome[data-carregando]"), null, { timeout: 20000 });
      await pn.locator('[data-testid="organizador-participante-alternar"]').last().click();
      await pn.waitForFunction(() =>
        !!document.querySelector('[data-testid="organizador-participante"][data-incluido="false"]'),
        null, { timeout: 15000 });
      const manual = await pn.locator(".rv-org-part-manual").count();
      const { data: sessao } = await admin.from("campaign_online_sessions")
        .select("id").eq("campaign_id", campaignId).is("ended_at", null).single();
      const { data: log } = await admin.from("campaign_session_participants_log").select("incluido").eq("session_id", sessao!.id);
      registrar("6 (correção manual marca a origem e fica auditada)",
        manual === 1 && log?.length === 1 && log[0].incluido === false,
        `selo manual=${manual}, linhas de histórico=${log?.length}`);
    }

    if (process.argv.includes("--captura")) {
      await pn.locator('[data-testid="organizador-detalhe"]').screenshot({ path: "/tmp/registro-sessao.png" });
      console.log("captura: /tmp/registro-sessao.png");
    }

    // --- 7. Encerrar não apaga quem já saiu da mesa ---
    {
      const { data: antes } = await admin.from("campaign_online_sessions")
        .select("id").eq("campaign_id", campaignId).is("ended_at", null).single();
      await admin.from("campaign_session_heartbeats").delete().eq("campaign_id", campaignId).eq("user_id", visivel.id);
      await abrirMenu(pn);
      await pn.waitForSelector('[data-testid="vtt-session-control"]', { timeout: 10000 });
      await pn.locator(".rv-session-toggle").click();
      await pn.locator(".rv-session-confirm .rv-session-button--danger").click();
      await pn.waitForFunction(() =>
        document.querySelector(".rv-session-status")?.textContent?.trim() === "OFFLINE", null, { timeout: 15000 });
      const { data } = await admin.from("campaign_session_participants").select("user_id").eq("session_id", antes!.id);
      registrar("7 (encerrar preserva quem passou pela sessão, não só quem ficou)",
        data?.length === 2 && data.some((p) => p.user_id === visivel.id),
        `registrados após o fim=${data?.length}`);
    }

    // --- 8. Nova sessão gera novo registro, sem mexer no anterior ---
    {
      await abrirMenu(pn);
      await pn.locator(".rv-session-toggle").click();
      await pn.waitForFunction(() =>
        document.querySelector(".rv-session-status")?.textContent?.trim() === "ONLINE", null, { timeout: 15000 });
      const { data } = await admin.from("campaign_narrative_entries")
        .select("online_session_id").eq("campaign_id", campaignId).eq("tipo", "sessao");
      const distintas = new Set((data ?? []).map((e) => e.online_session_id));
      registrar("8 (nova sessão gera novo registro, preservando o anterior)",
        data?.length === 2 && distintas.size === 2, `registros=${data?.length}, sessões distintas=${distintas.size}`);
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
