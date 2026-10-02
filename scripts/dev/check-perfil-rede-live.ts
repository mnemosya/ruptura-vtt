/**
 * NET-01 em navegadores reais: a Rede vira navegável e o perfil abre
 * como modal COM url — interceptado dentro de /mesas, página cheia
 * quando o endereço é aberto direto.
 *
 * Uso: npx tsx scripts/dev/check-perfil-rede-live.ts
 * (servidor dev já rodando em localhost:3000).
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright";
import { BASE_URL } from "./authSession";

import { personagemV12 } from "./fixtures/personagemV12";
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

const criados = { usuarios: [] as string[], campanhas: [] as string[], personagens: [] as string[] };
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

async function limpar() {
  for (const id of criados.personagens) await admin.from("characters").delete().eq("id", id);
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
  const narrador = await criarConta("check-perfil-narrador", "Narrador Rede");
  const jogador = await criarConta("check-perfil-jogador", "Jogadora Rede");
  const campaignId = randomUUID();
  const { error } = await admin.from("campaigns").insert({ id: campaignId, name: "Mesa da Rede", owner_id: narrador.id });
  if (error) throw new Error(`Falha ao criar campanha: ${error.message}`);
  criados.campanhas.push(campaignId);
  await admin.from("campaign_members").insert({
    campaign_id: campaignId, user_id: jogador.id, role: "player", status: "active", origem: "fixture_perfil_live",
  });
  const personagem = randomUUID();
  await admin.from("characters").insert({
    id: personagem, name: "Kael", status: "draft", payload: personagemV12("Kael"),
    campaign_id: campaignId, owner_id: jogador.id,
  });
  criados.personagens.push(personagem);
  registrar("0 (fixture: campanha, narrador, jogadora e um personagem)", true, `campanha=${campaignId}`);

  const fechar: (() => Promise<void>)[] = [];
  try {
    const { page: pn, close: fn } = await contextoDe(narrador.email, narrador.senha);
    fechar.push(fn);
    const { page: pj, close: fj } = await contextoDe(jogador.email, jogador.senha);
    fechar.push(fj);

    // A jogadora abre a mesa: passa a ter presença real.
    await pj.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
    await pj.waitForSelector(".rv-ferramentas", { timeout: 20000 });

    await pn.goto(`${BASE_URL}/mesas`, { waitUntil: "networkidle" });

    // --- 1. A Rede lista pessoas como links, com status REAL ---
    {
      const linhas = pn.locator('[data-testid="rede-pessoa"]');
      const eu = pn.locator('[data-testid="rede-pessoa-eu"]');
      const texto = (await linhas.first().textContent())?.trim() ?? "";
      registrar("1 (a Rede lista a jogadora como link, com presença real)",
        await eu.count() === 1 && await linhas.count() === 1 && /Online/.test(texto),
        `eu=${await eu.count()}, outros=${await linhas.count()}, texto="${texto}"`);
    }

    // --- 2. A própria conta não se repete na lista ---
    {
      const nomes = await pn.locator(".ra2-person-name").allTextContents();
      const proprio = nomes.filter((n) => n.includes("Narrador Rede"));
      registrar("2 (a própria conta aparece uma vez só, marcada como você)",
        proprio.length === 1 && proprio[0].includes("(você)"), `nomes=${JSON.stringify(nomes)}`);
    }

    // --- 3. Clicar abre o perfil em MODAL, com a URL mudando ---
    {
      await pn.locator('[data-testid="rede-pessoa"]').first().click();
      await pn.waitForSelector('[data-testid="perfil-modal"]', { timeout: 10000 });
      const url = pn.url();
      const nome = (await pn.locator('[data-testid="perfil-nome"]').textContent())?.trim();
      // A página de baixo continua montada — é disso que se trata interceptar.
      const dashboardVivo = await pn.locator('[data-testid="dash-mesa-destaque"], .ra2-panel').count() > 0;
      registrar("3 (abre em modal, a URL muda e o dashboard continua por baixo)",
        url.includes(`/perfil?userId=${jogador.id}`) && nome === "Jogadora Rede" && dashboardVivo,
        `url=${url.replace(BASE_URL, "")}, nome=${nome}`);
    }

    // --- 4. O perfil mostra campanha em comum, papel e personagem ---
    {
      const linha = (await pn.locator('[data-testid="perfil-campanhas"] li').first().textContent())?.trim() ?? "";
      const presenca = (await pn.locator('[data-testid="perfil-presenca"]').textContent())?.trim();
      registrar("4 (mostra campanha em comum, papel, personagem e presença real)",
        /Mesa da Rede/.test(linha) && /Jogador/.test(linha) && /Kael/.test(linha) && presenca === "Online",
        `linha="${linha}", presenca=${presenca}`);
    }

    if (process.argv.includes("--captura")) {
      await pn.locator('[data-testid="perfil-modal"]').screenshot({ path: "/tmp/perfil-modal.png" });
      console.log("captura: /tmp/perfil-modal.png");
    }

    // --- 5. Voltar fecha o modal (o histórico é de verdade) ---
    {
      await pn.goBack();
      await pn.waitForSelector('[data-testid="perfil-modal"]', { state: "detached", timeout: 10000 });
      registrar("5 (o botão voltar fecha o modal e devolve ao dashboard)",
        pn.url().endsWith("/mesas") && await pn.locator('[data-testid="rede-pessoa"]').count() === 1,
        `url=${pn.url().replace(BASE_URL, "")}`);
    }

    // --- 6. O mesmo endereço, aberto direto, é página cheia ---
    {
      const { page: nova, close } = await contextoDe(narrador.email, narrador.senha);
      fechar.push(close);
      await nova.goto(`${BASE_URL}/perfil?userId=${jogador.id}`, { waitUntil: "networkidle" });
      await nova.waitForSelector('[data-testid="perfil"]', { timeout: 15000 });
      registrar("6 (link colado numa aba nova abre página cheia, sem modal)",
        await nova.locator('[data-testid="perfil-modal"]').count() === 0
        && (await nova.locator('[data-testid="perfil-nome"]').textContent())?.trim() === "Jogadora Rede",
        "página cheia");
    }

    // --- 7. O próprio perfil abre igual, com atalho para a conta ---
    {
      await pn.locator('[data-testid="rede-pessoa-eu"]').click();
      await pn.waitForSelector('[data-testid="perfil-modal"]', { timeout: 10000 });
      registrar("7 (o próprio perfil abre como o dos outros, com atalho para Conta)",
        await pn.locator('[data-testid="perfil-ir-para-conta"]').count() === 1
        && (await pn.locator('[data-testid="perfil-nome"]').textContent())?.trim() === "Narrador Rede",
        "com atalho");
      await pn.keyboard.press("Escape");
      await pn.waitForSelector('[data-testid="perfil-modal"]', { state: "detached", timeout: 10000 });
    }

    // --- 8. Teclado: a linha é acionável com Enter ---
    {
      await pn.locator('[data-testid="rede-pessoa"]').first().focus();
      await pn.keyboard.press("Enter");
      await pn.waitForSelector('[data-testid="perfil-modal"]', { timeout: 10000 });
      registrar("8 (a linha inteira é acionável por teclado)", true, "Enter abriu o perfil");
      await pn.keyboard.press("Escape");
      await pn.waitForSelector('[data-testid="perfil-modal"]', { state: "detached", timeout: 10000 });
    }

    // --- 9. "Aparecer offline" chega à Rede e ao perfil ---
    {
      await pj.goto(`${BASE_URL}/mesas`, { waitUntil: "networkidle" });
      await pj.locator('[data-testid="topbar-perfil"]').click();
      await pj.locator('[data-testid="account-aparecer-offline"]').click();
      await pj.locator(".ra-toast", { hasText: "Você está aparecendo offline." }).waitFor({ timeout: 15000 });
      await pn.goto(`${BASE_URL}/mesas`, { waitUntil: "networkidle" });
      const texto = (await pn.locator('[data-testid="rede-pessoa"]').first().textContent())?.trim() ?? "";
      await pn.locator('[data-testid="rede-pessoa"]').first().click();
      await pn.waitForSelector('[data-testid="perfil-modal"]', { timeout: 10000 });
      const presenca = (await pn.locator('[data-testid="perfil-presenca"]').textContent())?.trim();
      registrar("9 (quem está escondido aparece offline na Rede e no perfil)",
        /offline/i.test(texto) && presenca === "Offline", `rede="${texto}", perfil=${presenca}`);
    }

    // --- 10. Quem não compartilha campanha não abre o perfil ---
    {
      const forasteiro = await criarConta("check-perfil-fora", "De Fora");
      const { page: pf, close } = await contextoDe(forasteiro.email, forasteiro.senha);
      fechar.push(close);
      await pf.goto(`${BASE_URL}/perfil?userId=${jogador.id}`, { waitUntil: "networkidle" });
      await pf.waitForSelector('[data-testid="perfil-recusado"]', { timeout: 15000 });
      registrar("10 (sem campanha em comum, o perfil é recusado, não vazio)",
        await pf.locator('[data-testid="perfil-nome"]').count() === 0, "recusa explícita");
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
