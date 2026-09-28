/**
 * SESS-01 / SESS-02 — validação integrada em DOIS navegadores reais
 * (narrador + jogador), o aceite que faltava no backlog: nada aqui é
 * substituído por chamada SQL direta. O narrador age pela UI do menu
 * da mesa; o jogador só observa e é conferido sem reload.
 *
 * Cobre: controle exclusivo do narrador, início visto pelo jogador em
 * tempo real, confirmação ao encerrar, encerramento propagado, clique
 * repetido sem duplicar sessão, erro de sincronização visível, nova
 * sessão preservando o histórico, e horário localizado.
 *
 * Uso: npx tsx scripts/dev/check-campanha-sessao-online-live.ts
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

let passou = 0;
let falhou = 0;
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
  const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  await context.addCookies([{
    name: "ruptura_auth",
    value: JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }),
    domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  }]);
  const page = await context.newPage();
  return { page, close: () => browser.close() };
}

async function esperarAte(fn: () => Promise<boolean>, timeoutMs: number, intervaloMs = 400): Promise<boolean> {
  const fim = Date.now() + timeoutMs;
  for (;;) {
    if (await fn()) return true;
    if (Date.now() >= fim) return false;
    await new Promise((r) => setTimeout(r, intervaloMs));
  }
}

/** O controle vive dentro do menu da mesa — abre e deixa aberto. */
async function abrirMenu(page: Page) {
  if (await page.locator('[data-testid="vtt-session-control"]').count() === 0) {
    await page.locator('[data-testid="vtt-menu-mesa-btn"]').click();
  }
  await page.waitForSelector('[data-testid="vtt-session-control"]', { timeout: 10000 });
}
const estado = (page: Page) => page.locator(".rv-session-status").first();
async function textoEstado(page: Page) { return (await estado(page).textContent())?.trim() ?? ""; }

async function sessoesDa(campanha: string) {
  const { data } = await admin.from("campaign_online_sessions")
    .select("id,started_at,ended_at").eq("campaign_id", campanha).order("started_at", { ascending: true });
  return data ?? [];
}

async function limpar() {
  for (const cid of criados.campanhas) {
    await admin.from("campaign_online_sessions").delete().eq("campaign_id", cid);
    await admin.from("campaign_session_heartbeats").delete().eq("campaign_id", cid);
    await admin.from("vtt_tokens").delete().eq("campaign_id", cid);
    await admin.from("vtt_scenes").delete().eq("campaign_id", cid);
    await admin.from("campaign_members").delete().eq("campaign_id", cid);
    await admin.from("campaigns").delete().eq("id", cid);
  }
  for (const uid of criados.usuarios) await admin.auth.admin.deleteUser(uid);
  registrar("L (limpeza de fixtures)", true, `${criados.usuarios.length} usuário(s), ${criados.campanhas.length} campanha(s)`);
}

async function main() {
  const narrador = await criarConta("check-sessao-narrador", "Narrador Sessão");
  const jogador = await criarConta("check-sessao-jogador", "Jogador Sessão");
  const campaignId = randomUUID();
  const { error: eCamp } = await admin.from("campaigns").insert({ id: campaignId, name: "Sessão Online Live", owner_id: narrador.id });
  if (eCamp) throw new Error(`Falha ao criar campanha: ${eCamp.message}`);
  criados.campanhas.push(campaignId);
  await admin.from("campaign_members").insert({
    campaign_id: campaignId, user_id: jogador.id, role: "player", status: "active", origem: "fixture_sessao_online",
  });
  registrar("0 (fixture: campanha com narrador e jogador ativo)", true, `campanha=${campaignId}`);

  const { page: pn, close: fecharNarrador } = await contextoDe(narrador.email, narrador.senha);
  const { page: pj, close: fecharJogador } = await contextoDe(jogador.email, jogador.senha);
  try {
    for (const page of [pn, pj]) {
      await page.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
      await page.waitForSelector(".rv-ferramentas", { timeout: 20000 });
      await abrirMenu(page);
    }

    // --- 1. Estado inicial: OFFLINE para os dois, sem sessão no banco ---
    {
      const nOk = await esperarAte(async () => (await textoEstado(pn)) === "OFFLINE", 8000);
      const jOk = await esperarAte(async () => (await textoEstado(pj)) === "OFFLINE", 8000);
      registrar("1 (estado inicial OFFLINE nos dois navegadores)", nOk && jOk,
        `narrador=${await textoEstado(pn)}, jogador=${await textoEstado(pj)}`);
    }

    // --- 2. Controle é exclusivo do narrador ---
    {
      const temNoNarrador = await pn.locator(".rv-session-toggle").count();
      const temNoJogador = await pj.locator(".rv-session-toggle").count();
      registrar("2 (só o narrador vê iniciar/encerrar; o jogador lê o estado)", temNoNarrador === 1 && temNoJogador === 0,
        `botões narrador=${temNoNarrador}, jogador=${temNoJogador}`);
    }

    // --- 3. Narrador inicia pela UI (três cliques seguidos, de propósito:
    //        o guarda de envio pendente e o índice único têm de segurar);
    //        o jogador vê ONLINE sem reload e o banco tem UMA linha. ---
    {
      await pn.evaluate(() => {
        const b = document.querySelector<HTMLButtonElement>(".rv-session-toggle");
        b?.click(); b?.click(); b?.click();
      });
      const nOk = await esperarAte(async () => (await textoEstado(pn)) === "ONLINE", 15000);
      const jOk = await esperarAte(async () => (await textoEstado(pj)) === "ONLINE", 40000);
      const linhas = await sessoesDa(campaignId);
      registrar("3 (início repetido vira ONLINE no jogador sem recarregar e sem duplicar sessão)",
        nOk && jOk && linhas.length === 1 && linhas[0].ended_at === null,
        `narrador=${await textoEstado(pn)}, jogador=${await textoEstado(pj)}, linhas=${linhas.length}`);
      // O clique repetido pode ter deixado a confirmação aberta.
      if (await pn.locator(".rv-session-confirm").count() > 0) {
        await pn.locator(".rv-session-confirm .rv-session-button", { hasText: "Voltar" }).click();
      }
    }

    // --- 4. Horário localizado, coerente com o started_at do banco ---
    {
      const linhas = await sessoesDa(campaignId);
      const esperado = new Date(linhas[0].started_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const textoN = (await pn.locator(".rv-session-time time").textContent())?.trim() ?? "";
      const textoJ = (await pj.locator(".rv-session-time time").textContent())?.trim() ?? "";
      registrar("4 (horário exibido usa started_at e localização pt-BR)",
        textoN === `Desde ${esperado}` && textoJ === textoN, `narrador="${textoN}", esperado="Desde ${esperado}"`);
    }

    // --- 5. Encerrar pede confirmação e não encerra antes dela ---
    {
      await pn.locator(".rv-session-toggle").click();
      await pn.waitForSelector(".rv-session-confirm", { timeout: 5000 });
      const pergunta = (await pn.locator(".rv-session-question").textContent())?.trim();
      const linhas = await sessoesDa(campaignId);
      const aindaAtiva = linhas.length === 1 && linhas[0].ended_at === null;
      await pn.locator(".rv-session-confirm .rv-session-button", { hasText: "Voltar" }).click();
      const voltou = await esperarAte(async () => (await textoEstado(pn)) === "ONLINE", 5000);
      registrar("5 (confirmação antes de encerrar; 'Voltar' não encerra)",
        pergunta === "Encerrar a sessão?" && aindaAtiva && voltou, `pergunta="${pergunta}", ativa=${aindaAtiva}`);
    }

    // --- 6. Erro de sincronização é visível (e não vira "OFFLINE") ---
    {
      await pj.route("**/mesas/**", (route) => route.abort());
      await pj.evaluate(() => window.dispatchEvent(new Event("focus")));
      const apareceu = await esperarAte(async () => (await pj.locator("p[role=alert], .rv-session-status").first().isVisible())
        && ((await textoEstado(pj)) === "Indisponível" || (await pj.locator("p[role=alert]").count()) > 0), 15000);
      const naoMentiu = (await textoEstado(pj)) !== "OFFLINE";
      await pj.unroute("**/mesas/**");
      await pj.evaluate(() => window.dispatchEvent(new Event("focus")));
      const recuperou = await esperarAte(async () => (await textoEstado(pj)) === "ONLINE", 20000);
      registrar("6 (falha de sincronização aparece e não se disfarça de OFFLINE; recupera depois)",
        apareceu && naoMentiu && recuperou, `erroVisivel=${apareceu}, naoMentiu=${naoMentiu}, recuperou=${recuperou}`);
    }

    // --- 7. Encerrar de verdade: confirma e o jogador vê sem reload ---
    {
      await pn.locator(".rv-session-toggle").click();
      await pn.waitForSelector(".rv-session-confirm", { timeout: 5000 });
      // Também em triplicata: encerrar duas vezes não pode encerrar a
      // sessão seguinte nem gravar um segundo fim.
      await pn.evaluate(() => {
        const b = document.querySelector<HTMLButtonElement>(".rv-session-button--danger");
        b?.click(); b?.click(); b?.click();
      });
      const nOk = await esperarAte(async () => (await textoEstado(pn)) === "OFFLINE", 15000);
      const jOk = await esperarAte(async () => (await textoEstado(pj)) === "OFFLINE", 40000);
      const linhas = await sessoesDa(campaignId);
      registrar("7 (encerramento confirmado e repetido propaga, registra fim e não duplica)",
        nOk && jOk && linhas.length === 1 && !!linhas[0].ended_at,
        `narrador=${await textoEstado(pn)}, jogador=${await textoEstado(pj)}, ended_at=${linhas[0]?.ended_at}`);
    }

    // --- 8. Nova sessão preserva o histórico (SESS-01) ---
    {
      await pn.locator(".rv-session-toggle").click();
      const nOk = await esperarAte(async () => (await textoEstado(pn)) === "ONLINE", 15000);
      const linhas = await sessoesDa(campaignId);
      registrar("8 (iniciar de novo cria nova sessão e preserva a anterior)",
        nOk && linhas.length === 2 && !!linhas[0].ended_at && linhas[1].ended_at === null,
        `linhas=${linhas.length}, primeira encerrada=${!!linhas[0]?.ended_at}, segunda ativa=${linhas[1]?.ended_at === null}`);
    }

    // --- 9. Refresh preserva o estado nos dois papéis ---
    {
      for (const page of [pn, pj]) {
        await page.reload({ waitUntil: "networkidle" });
        await page.waitForSelector(".rv-ferramentas", { timeout: 20000 });
        await abrirMenu(page);
      }
      const nOk = await esperarAte(async () => (await textoEstado(pn)) === "ONLINE", 15000);
      const jOk = await esperarAte(async () => (await textoEstado(pj)) === "ONLINE", 15000);
      registrar("9 (refresh/reconexão preserva o estado para os dois papéis)", nOk && jOk,
        `narrador=${await textoEstado(pn)}, jogador=${await textoEstado(pj)}`);
    }

    // Deixa a campanha encerrada antes de limpar.
    await pn.locator(".rv-session-toggle").click();
    await pn.waitForSelector(".rv-session-confirm", { timeout: 5000 });
    await pn.locator(".rv-session-confirm .rv-session-button--danger").click();
    await esperarAte(async () => (await textoEstado(pn)) === "OFFLINE", 15000);
  } finally {
    await fecharNarrador();
    await fecharJogador();
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
