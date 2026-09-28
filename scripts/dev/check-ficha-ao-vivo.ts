/**
 * A FICHA AO VIVO — o que uma pessoa muda na ficha chega ao mapa da
 * outra, sem reload.
 *
 * Terceiro da família iniciada por `check-mesa-ao-vivo.ts`, e pela
 * mesma razão: a suíte tinha muita cobertura do BANCO e da tela de quem
 * age, e quase nenhuma da pergunta que decide se a mesa funciona —
 * **a outra pessoa fica sabendo?**
 *
 * Foi essa lacuna que deixou o RT-01 passar por meses: o terreno
 * chegava ao banco, a tela de quem pintava mostrava certo, e ninguém
 * verificava a segunda sessão sem recarregar.
 *
 * ── Por que a ficha, e por que PV ───────────────────────────────────
 * A ficha é a outra metade do que se faz numa sessão: o mapa mostra
 * onde as pessoas estão, a ficha mostra como elas estão. E PV é o
 * recurso que muda mais numa luta — é o que o narrador precisa ver sem
 * perguntar "quanto você tem?".
 *
 * O caminho é real e atravessa três camadas: o jogador edita o card de
 * recurso no Console; isso grava em `characters.payload`; e a HUD do
 * token lê do personagem VINCULADO (`read_vtt_token_hud` resolve
 * `v_token.character_id` e calcula o máximo derivado). Nenhuma delas é
 * verificada ao vivo em nenhum outro lugar.
 *
 * Regra do arquivo, como nos irmãos: NENHUM reload depois que as duas
 * sessões abriram. Recarregar aqui apaga exatamente o que se quer ver.
 *
 * Uso: npx tsx scripts/dev/check-ficha-ao-vivo.ts
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Browser, type Page } from "playwright";
import { BASE_URL } from "./authSession";
import { garantirTokenAlcancavel, recolherPainelDaSessao } from "./painelDaSessao";
import { createInitialCharacter } from "../../src/lib/character/createCharacter";

loadDotenv({ path: ".env.local" });

function exigirEnv(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} ausente no .env.local`);
  return v;
}

const admin = createClient(exigirEnv("SUPABASE_URL"), exigirEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const anon = createClient(exigirEnv("SUPABASE_URL"), exigirEnv("SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const SENHA = "Fixture#12345";
const PREFIXO = "zz_e2e_ficha_viva";

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

interface Sessao { page: Page; recusasDeCanal: string[]; fechar: () => Promise<void> }

async function abrirSessao(browser: Browser, email: string, url: string): Promise<Sessao> {
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

  /* A recusa de assinatura só existe nos frames do WebSocket: o
     servidor responde `system` com status de erro, o cliente não lança
     nada, e a página segue com cara de saudável. Foi assim que um canal
     morto sobreviveu meses (RT-01). */
  const recusasDeCanal: string[] = [];
  const texto = (p: string | Buffer) => (typeof p === "string" ? p : Buffer.from(p).toString("utf8"));
  page.on("websocket", (ws) => {
    if (!ws.url().includes("supabase")) return;
    ws.on("framereceived", (f) => {
      const t = texto(f.payload);
      if (t.includes("Unable to subscribe")) recusasDeCanal.push(t.slice(0, 300));
    });
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });
  return { page, recusasDeCanal, fechar: () => contexto.close() };
}

async function limpar(): Promise<void> {
  for (const id of criados.campanhas) await admin.from("campaigns").delete().eq("id", id);
  for (const id of criados.usuarios) await admin.auth.admin.deleteUser(id).catch(() => {});
}

/** PV que a HUD do token mostra na sessão do narrador, lido do cartão de hover. */
async function pvNoCartao(page: Page): Promise<string | null> {
  const linha = page.locator('.rv-cartao-token__linha[data-recurso="pv"]');
  if ((await linha.count()) === 0) return null;
  return (await linha.first().innerText()).replace(/\s+/g, " ").trim();
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

  // Personagem pela fábrica canônica do produto — payload inventado à
  // mão já produziu token que nem renderiza.
  const personagemId = randomUUID();
  const payload = createInitialCharacter(null, "Alvo Vivo");
  // `name`, não `nome`: a coluna da tabela é em inglês, e um insert com
  // nome errado falha em silêncio quando ninguém lê o retorno — foi
  // exatamente o que aconteceu na primeira versão deste arquivo, e a
  // ficha respondia "personagem não encontrado" com toda a razão.
  const { error: erroPersonagem } = await admin.from("characters").insert({
    id: personagemId, campaign_id: campaignId, owner_id: jogador.id,
    name: "Alvo Vivo", payload,
  });
  if (erroPersonagem) throw new Error(`Falha ao criar personagem: ${erroPersonagem.message}`);
  const { error: erroControle } = await admin.from("character_controllers").insert({ character_id: personagemId, campaign_id: campaignId, user_id: jogador.id });
  if (erroControle) throw new Error(`Falha ao vincular controlador: ${erroControle.message}`);

  // `pv_publico`: sem isso a HUD só responde a quem controla, e o
  // critério viraria sobre autorização em vez de sobre propagação.
  const { data: token } = await admin.from("vtt_tokens").insert({
    scene_id: cena!.id, campaign_id: campaignId, character_id: personagemId,
    nome: "Alvo Vivo", sigla: "AV", lado: "pj", vertente: "nenhuma",
    q: 4, r: 4, tamanho: "medio", orientacao: 0, visivel: true, pv_publico: true,
  }).select("id").single();

  const browser = await chromium.launch({ headless: true });
  let sN: Sessao | null = null;
  let sJ: Sessao | null = null;
  try {
    sN = await abrirSessao(browser, narrador.email, `${BASE_URL}/mesas/${campaignId}`);
    await sN.page.waitForSelector(".rv-ferramentas", { timeout: 30000 });
    // O token precisa estar ALCANÇÁVEL na sessão do narrador: o painel
    // flutua sobre o mapa e o enquadramento inicial pode deixar a
    // célula fora da viewport. Sem isso o `hover` nunca acerta, e a
    // falha aparece como "o cartão não mostra PV" — culpando a HUD por
    // um ponteiro que não chegou ao token.
    await garantirTokenAlcancavel(sN.page, "AV");

    sJ = await abrirSessao(browser, jogador.email, `${BASE_URL}/ficha?campaignId=${campaignId}&characterId=${personagemId}`);
    await sJ.page.waitForSelector('[data-testid="console-res-pv"]', { timeout: 30000 });
    registrar("0 (narrador na mesa, jogador com a ficha aberta)", true, `campanha=${campaignId}`);

    // ── 1. Os canais assinaram? ──────────────────────────────────
    // Primeiro critério de propósito: canal recusado derruba tudo que
    // vem depois, e saber isso ANTES é a diferença entre uma causa e
    // três sintomas soltos.
    await new Promise((r) => setTimeout(r, 4000));
    registrar("1a (o narrador assina os canais sem recusa do servidor)", sN.recusasDeCanal.length === 0, sN.recusasDeCanal[0] ?? "nenhuma recusa");
    registrar("1b (o jogador assina os canais sem recusa do servidor)", sJ.recusasDeCanal.length === 0, sJ.recusasDeCanal[0] ?? "nenhuma recusa");

    // ── 2. O narrador enxerga o PV do token antes de qualquer mudança ──
    const alvo = sN.page.locator(`.rv-token[data-token-id="${token!.id}"]`);
    await alvo.hover();
    const pvAntes = await esperarAte(async () => (await pvNoCartao(sN!.page)) !== null).then(async (ms) => (ms === null ? null : pvNoCartao(sN!.page)));
    registrar("2 (o cartão do token mostra PV para o narrador)", pvAntes !== null, pvAntes ?? "cartão sem linha de PV");

    // ── 3. O jogador tira PV pela FICHA ──────────────────────────
    //
    // Pelo caminho real: clicar no card abre o editor, digitar e Enter
    // confirma. É o que uma pessoa faz no meio de uma luta.
    //
    // Isto só virou possível quando o Console passou a gravar sozinho.
    // Antes era "local até Salvar personagem", e o botão de salvar
    // ficava na página DE BAIXO, coberto pela janela do Console —
    // medido em (440,413), dentro da área que o Console ocupa. Editar
    // PV mostrava 8/11 no card, o banco seguia em 11, e recarregar
    // devolvia 11/11, sem aviso nenhum.
    const pvOriginal = (payload.recursos_atuais as { pv: number }).pv;
    const cardPv = sJ.page.locator('[data-testid="console-res-pv"]');
    await cardPv.click();
    const campo = sJ.page.locator('input[aria-label^="PV"]').first();
    await campo.waitFor({ timeout: 5000 });
    await campo.fill("-3");
    await campo.press("Enter");

    const msBanco = await esperarAte(async () => {
      const { data } = await admin.from("characters").select("payload").eq("id", personagemId).single();
      const pv = (data?.payload as { recursos_atuais?: { pv?: number } } | null)?.recursos_atuais?.pv;
      return pv === pvOriginal - 3;
    });
    registrar("3 (o jogador tira 3 de PV pela ficha e grava SOZINHO, sem botão)", msBanco !== null,
      msBanco !== null ? `${msBanco}ms (${pvOriginal} → ${pvOriginal - 3})` : "banco não mudou em 12s");

    // ── 4. E o narrador vê, sem reload ───────────────────────────
    //
    // O critério que dá nome ao arquivo. A HUD do token lê do
    // personagem VINCULADO (`read_vtt_token_hud` resolve
    // `v_token.character_id`), então a mudança atravessa três camadas
    // antes de chegar ao cartão.
    // SAI e VOLTA o ponteiro a cada tentativa: o cartão é de hover, e
    // manter o mouse parado sobre o token não pede leitura nova. Quem
    // está na mesa faz isso naturalmente — olha outra coisa e volta.
    const msNarrador = await esperarAte(async () => {
      await sN!.page.mouse.move(5, 5);
      await alvo.hover().catch(() => {});
      await sN!.page.waitForTimeout(250);
      const agora = await pvNoCartao(sN!.page);
      return agora !== null && agora !== pvAntes;
    }, 15000);
    registrar("4 (o narrador vê o PV novo no cartão do token, sem reload)", msNarrador !== null,
      msNarrador !== null ? `${msNarrador}ms: "${pvAntes}" → "${await pvNoCartao(sN.page)}"` : `seguiu em "${pvAntes}" por 12s`);

    // ── 5. Nada disso deixou recusa de canal para trás ───────────
    const recusas = [...sN.recusasDeCanal, ...sJ.recusasDeCanal];
    registrar("5 (nenhuma recusa de assinatura durante a sessão inteira)", recusas.length === 0, recusas[0] ?? "nenhuma");
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
  console.error("\ncheck-ficha-ao-vivo FALHOU:\n", err instanceof Error ? err.message : err);
  await limpar();
  process.exit(1);
});
