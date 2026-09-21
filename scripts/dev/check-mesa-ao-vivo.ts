/**
 * A MESA AO VIVO — duas pessoas, sem reload.
 *
 * ── Por que este check existe ───────────────────────────────────────
 * Em 2026-09-20 o Realtime do mapa estava MORTO e nenhum dos 94 checks
 * da suíte percebeu. Uma única assinatura recusada pelo servidor
 * (`vtt_scene_images`, "invalid column for filter") derrubava o canal
 * inteiro, e com ele terreno, marcas, medições, áreas, objetos e cenas.
 *
 * Passou despercebido por dois motivos, e os dois viraram critério aqui:
 *
 *   1. NINGUÉM olhava se o canal chegou a assinar. O erro vinha como um
 *      frame `system` no WebSocket e não virava exceção, log nem tela
 *      vermelha — o app seguia funcionando, mudo.
 *
 *   2. O critério que PARECIA cobrir ("segunda sessão enxerga o
 *      terreno", em `check-vtt-integracao`) recarrega a página do
 *      jogador antes de olhar. Isso mede persistência por SSR, não
 *      entrega ao vivo, e dava verde com o canal morto.
 *
 * Daí a regra deste arquivo: NENHUM reload depois que as duas sessões
 * estão abertas. Recarregar aqui é apagar justamente o que se quer ver.
 *
 * ── O que ele cobre ─────────────────────────────────────────────────
 * O mínimo que precisa funcionar para duas pessoas jogarem: o canal
 * assina sem erro, e o que uma faz aparece para a outra — terreno,
 * token e área. Não é uma suíte extensa de propósito; é a fiação
 * elétrica da mesa, e o valor dela está em ser curta o bastante para
 * continuar viva.
 *
 * Uso: npx tsx scripts/dev/check-mesa-ao-vivo.ts
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Browser, type Page } from "playwright";
import { BASE_URL } from "./authSession";
import { recolherPainelDaSessao } from "./painelDaSessao";

loadDotenv({ path: ".env.local" });

function exigirEnv(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} ausente no .env.local`);
  return v;
}

const admin = createClient(exigirEnv("SUPABASE_URL"), exigirEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const anon = createClient(exigirEnv("SUPABASE_URL"), exigirEnv("SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const SENHA = "Fixture#12345";
/** Prefixo reconhecível — `varrer-residuo-de-teste.ts` limpa por ele. */
const PREFIXO = "zz_e2e_ao_vivo";

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

/**
 * Espera por CONDIÇÃO, com o relógio como teto e não como medida. Toda
 * espera deste arquivo passa por aqui: "esperar 500ms e olhar" responde
 * pela velocidade da máquina, não pelo comportamento do produto.
 */
async function esperarAte(cond: () => Promise<boolean>, tetoMs = 10000): Promise<number | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < tetoMs) {
    if (await cond()) return Date.now() - t0;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

interface Sessao { page: Page; errosDeCanal: string[]; fechar: () => Promise<void> }

async function abrirSessao(browser: Browser, email: string, campaignId: string): Promise<Sessao> {
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

  /* Os frames do WebSocket, porque a recusa de assinatura só existe
     ali: o servidor responde `system` com `status: error`, o cliente
     não lança nada, e a página segue com cara de saudável. Foi assim
     que um canal morto sobreviveu meses. */
  const errosDeCanal: string[] = [];
  const texto = (p: string | Buffer) => (typeof p === "string" ? p : Buffer.from(p).toString("utf8"));
  page.on("websocket", (ws) => {
    if (!ws.url().includes("supabase")) return;
    ws.on("framereceived", (f) => {
      const t = texto(f.payload);
      if (t.includes("Unable to subscribe") || t.includes('"status":"error"')) errosDeCanal.push(t.slice(0, 300));
    });
  });

  await page.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".rv-ferramentas", { timeout: 30000 });
  return { page, errosDeCanal, fechar: () => contexto.close() };
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
  const { data: cena } = await admin.from("vtt_scenes").insert({ campaign_id: campaignId, nome: "Cena ao vivo", largura: 14, altura: 14 }).select("id").single();
  await admin.from("vtt_scene_presentation").insert({ campaign_id: campaignId, presented_scene_id: cena!.id, updated_by: narrador.id });
  const { data: token } = await admin.from("vtt_tokens").insert({
    scene_id: cena!.id, campaign_id: campaignId, nome: "Alvo", sigla: "AL", lado: "pn",
    vertente: "nenhuma", q: 4, r: 4, tamanho: "medio", orientacao: 0, visivel: true,
  }).select("id,revision").single();

  const browser = await chromium.launch({ headless: true });
  let sessaoN: Sessao | null = null;
  let sessaoJ: Sessao | null = null;
  try {
    sessaoN = await abrirSessao(browser, narrador.email, campaignId);
    sessaoJ = await abrirSessao(browser, jogador.email, campaignId);
    registrar("0 (as duas sessões abrem na mesma mesa)", true, `campanha=${campaignId}`);

    // ── 1. O canal assinou? ───────────────────────────────────────
    // Primeiro critério de propósito: se o canal não assinou, todo o
    // resto falha por consequência, e saber disso primeiro é a
    // diferença entre "o Realtime está morto" e três sintomas soltos.
    await new Promise((r) => setTimeout(r, 4000)); // janela para o servidor responder às assinaturas
    registrar("1a (o narrador assina os canais sem recusa do servidor)", sessaoN.errosDeCanal.length === 0, sessaoN.errosDeCanal[0] ?? "nenhuma recusa");
    registrar("1b (o jogador assina os canais sem recusa do servidor)", sessaoJ.errosDeCanal.length === 0, sessaoJ.errosDeCanal[0] ?? "nenhuma recusa");

    await recolherPainelDaSessao(sessaoN.page);

    // ── 2. Terreno pintado pelo narrador chega ao jogador ─────────
    // Pela FERRAMENTA, não por insert: é o caminho que uma pessoa faz.
    await sessaoN.page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Terreno"]').click();
    await sessaoN.page.waitForSelector('section[aria-label="Ferramenta Terreno"]', { timeout: 8000 });
    await sessaoN.page.locator('.rv-fp-opcao[data-tipo="dificil"]').click();
    await sessaoN.page.locator(".rv-camada-grade path").first().dispatchEvent("pointerdown");
    const msTerreno = await esperarAte(async () => (await sessaoJ!.page.locator(".rv-camada-terreno-real .rv-terreno-real--dificil").count()) > 0);
    registrar("2 (terreno pintado pelo narrador aparece para o jogador, sem reload)", msTerreno !== null, msTerreno !== null ? `${msTerreno}ms` : "não chegou em 10s");

    // ── 3. Token movido chega ao jogador ─────────────────────────
    // A posição de ANTES, medida na tela do jogador: o critério é
    // "mudou para a nova", e comparar contra um valor calculado à mão
    // exigiria reproduzir a conversão mundo→tela, que tem fator de
    // escala próprio. Comparar com o que estava ali é exato e barato.
    const transformAntes = await sessaoJ.page.locator(`.rv-token[data-token-id="${token!.id}"]`).getAttribute("transform").catch(() => null);
    await admin.from("vtt_tokens").update({ q: 8, revision: (token!.revision ?? 0) + 1 }).eq("id", token!.id);
    const msToken = await esperarAte(async () => {
      const t = await sessaoJ!.page.locator(`.rv-token[data-token-id="${token!.id}"]`).getAttribute("transform").catch(() => null);
      return !!t && t !== transformAntes;
    });
    registrar("3 (token movido aparece na posição nova para o jogador, sem reload)", msToken !== null, msToken !== null ? `${msToken}ms (antes="${transformAntes}")` : `não chegou em 10s (segue em "${transformAntes}")`);

    // ── 4. Área criada chega ao jogador ──────────────────────────
    await admin.from("vtt_areas").insert({
      id: randomUUID(), scene_id: cena!.id, campaign_id: campaignId, tipo: "esfera",
      origem_q: 6, origem_r: 6, raio_m: 3, visivel: true, criador_id: narrador.id,
    });
    const msArea = await esperarAte(async () => (await sessaoJ!.page.locator(".rv-camada-areas .rv-area").count()) > 0);
    registrar("4 (área criada aparece para o jogador, sem reload)", msArea !== null, msArea !== null ? `${msArea}ms` : "não chegou em 10s");

    // ── 5. Nada disso deixou erro de canal para trás ──────────────
    const recusasDepois = [...sessaoN.errosDeCanal, ...sessaoJ.errosDeCanal];
    registrar("5 (nenhuma recusa de assinatura durante a sessão inteira)", recusasDepois.length === 0, recusasDepois[0] ?? "nenhuma");
  } finally {
    await sessaoN?.fechar();
    await sessaoJ?.fechar();
    await browser.close();
    await limpar();
    registrar("L (limpeza de fixtures)", true, `${criados.usuarios.length} conta(s), ${criados.campanhas.length} campanha(s)`);
  }
  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  process.exit(falhou > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("\ncheck-mesa-ao-vivo FALHOU:\n", err instanceof Error ? err.message : err);
  await limpar();
  process.exit(1);
});
