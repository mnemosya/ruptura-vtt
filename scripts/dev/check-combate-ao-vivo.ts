/**
 * O COMBATE AO VIVO — a rodada anda para os dois lados da mesa.
 *
 * Quinto da família iniciada por `check-mesa-ao-vivo.ts`.
 *
 * ── A lacuna, e por que ela é a mais cara do VTT ────────────────────
 * `check-vtt-rodadas` tem 40 critérios e é dos melhores da suíte, mas
 * as únicas coisas que ele confere na SEGUNDA sessão são o início (9a)
 * e o encerramento (9b) do combate. O que acontece no meio — avançar a
 * janela, virar a rodada — é conferido só na tela de quem clica.
 *
 * E é justamente o meio que acontece o tempo todo: um combate tem um
 * início, um fim e dezenas de avanços. Se o avanço não chegar, a mesa
 * se desencontra na pergunta mais básica de uma luta — "de quem é a
 * vez?" —, e o modo de falha é o pior possível: cada lado vê um estado
 * coerente, só que estados DIFERENTES. Ninguém recebe erro. As pessoas
 * é que começam a discordar.
 *
 * ── Duas encanações distintas, de propósito ─────────────────────────
 * A trilha de turnos viaja por `postgres_changes` (`vtt_turn_tracks`,
 * no canal `campaign:<id>:vtt`). As condições de um token NÃO: elas
 * chegam por BROADCAST, porque `vtt_tokens` não está entre as ligações
 * daquele canal.
 *
 * São caminhos diferentes, com modos de falha diferentes, e uma sessão
 * de combate usa os dois ao mesmo tempo — girar a rodada e marcar quem
 * está sangrando. Por isso os dois estão aqui: um check que cobrisse só
 * um deles deixaria metade do combate sem guarda, exatamente como o
 * RT-01 deixou as imagens.
 *
 * ── Regras do arquivo ───────────────────────────────────────────────
 *   · NENHUM reload depois que as duas sessões abrem;
 *   · toda espera é por CONDIÇÃO, com o relógio como teto;
 *   · o primeiro critério é "o canal assinou", porque sem isso todo o
 *     resto falha por consequência.
 *
 * Uso: npx tsx scripts/dev/check-combate-ao-vivo.ts
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
  const { data, error } = await admin.auth.admin.createUser({
    email, password: SENHA, email_confirm: true, user_metadata: { display_name: papel },
  });
  if (error || !data.user) throw new Error(`Falha ao criar ${papel}: ${error?.message}`);
  criados.usuarios.push(data.user.id);
  return { id: data.user.id, email };
}

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

/** O que a rodada diz, do jeito que a pessoa lê. */
async function leituraDaRodada(page: Page): Promise<{ rodada: string; janela: string }> {
  const nucleo = page.locator(".rv-rodadas").first();
  return {
    rodada: ((await nucleo.locator(".rv-rodadas-rodada").textContent().catch(() => "")) ?? "").trim(),
    janela: ((await nucleo.locator(".rv-rodadas-janela").getAttribute("data-janela").catch(() => null)) ?? ""),
  };
}

async function abrirPainelRodadas(page: Page): Promise<void> {
  if ((await page.locator('[data-testid="painel-rodadas"]').count()) === 0) {
    await page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Rodadas"]').click();
  }
  await page.waitForSelector('[data-testid="painel-rodadas"]', { timeout: 10000 });
}

async function limpar(): Promise<void> {
  for (const id of criados.campanhas) await admin.from("campaigns").delete().eq("id", id);
  for (const id of criados.usuarios) await admin.auth.admin.deleteUser(id).catch(() => {});
}

async function main(): Promise<void> {
  const narrador = await criarConta("narrador");
  const jogador = await criarConta("jogador");
  const campaignId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: `${PREFIXO}_combate`, owner_id: narrador.id });
  criados.campanhas.push(campaignId);
  await admin.from("campaign_members").insert({
    campaign_id: campaignId, user_id: jogador.id, role: "player", status: "active",
  });
  const { data: cena } = await admin.from("vtt_scenes")
    .insert({ campaign_id: campaignId, nome: "Luta ao vivo", largura: 16, altura: 16 })
    .select("id").single();
  const sceneId = cena!.id as string;
  await admin.from("vtt_scene_presentation")
    .insert({ campaign_id: campaignId, presented_scene_id: sceneId, updated_by: narrador.id });

  // Dois lados, porque a trilha se organiza por lado — um combate com
  // um lado só não tem janela para avançar.
  const { data: tokens } = await admin.from("vtt_tokens").insert([
    { scene_id: sceneId, campaign_id: campaignId, nome: "Sentinela", sigla: "SE", lado: "pn",
      vertente: "nenhuma", q: 5, r: 5, tamanho: "medio", orientacao: 0, visivel: true },
    { scene_id: sceneId, campaign_id: campaignId, nome: "Corvo", sigla: "CO", lado: "pj",
      vertente: "nenhuma", q: 7, r: 5, tamanho: "medio", orientacao: 0, visivel: true },
  ]).select("id, nome, revision");
  const alvo = tokens!.find((t) => t.nome === "Sentinela")!;

  const browser = await chromium.launch({ headless: true });
  let sessaoN: Sessao | null = null;
  let sessaoJ: Sessao | null = null;
  try {
    sessaoN = await abrirSessao(browser, narrador.email, campaignId);
    sessaoJ = await abrirSessao(browser, jogador.email, campaignId);
    registrar("0 (as duas sessões abrem na mesma mesa)", true, `campanha=${campaignId}`);

    await new Promise((r) => setTimeout(r, 4000)); // janela para o servidor responder às assinaturas
    registrar("1a (o narrador assina os canais sem recusa do servidor)",
      sessaoN.errosDeCanal.length === 0, sessaoN.errosDeCanal[0] ?? "nenhuma recusa");
    registrar("1b (o jogador assina os canais sem recusa do servidor)",
      sessaoJ.errosDeCanal.length === 0, sessaoJ.errosDeCanal[0] ?? "nenhuma recusa");

    await recolherPainelDaSessao(sessaoN.page);
    await recolherPainelDaSessao(sessaoJ.page);

    // ── 2. O combate começa e o jogador vê ───────────────────────
    // Pré-condição dos critérios seguintes, e critério por direito:
    // sem ele, um avanço que não chega seria indistinguível de um
    // combate que nunca começou.
    await abrirPainelRodadas(sessaoN.page);
    await sessaoN.page.locator(".rv-rodadas-iniciar").click();
    const msInicio = await esperarAte(async () => (await sessaoJ!.page.locator(".rv-rodadas").count()) > 0);
    registrar("2 (combate iniciado pelo narrador aparece para o jogador, sem reload)",
      msInicio !== null, msInicio !== null ? `${msInicio}ms` : "não chegou em 10s");

    // ── 3. AVANÇAR A JANELA — o que ninguém checava dos dois lados ─
    // Sem ninguém declarado, a janela dos rápidos já nasce concluída e
    // o núcleo oferece "Resolver Lentos". É o avanço mais comum de uma
    // luta.
    {
      const antes = await leituraDaRodada(sessaoJ.page);
      await sessaoN.page.locator(".rv-rodadas-avanca").click();
      const ms = await esperarAte(async () => (await leituraDaRodada(sessaoJ!.page)).janela === "lentos");
      const depois = await leituraDaRodada(sessaoJ.page);
      registrar(
        "3 (avançar a janela chega ao jogador, sem reload)",
        ms !== null,
        ms !== null
          ? `${ms}ms — jogador via "${antes.janela}", agora vê "${depois.janela}"`
          : `não chegou em 10s — jogador continua em "${depois.janela}"`,
      );
    }

    // ── 4. VIRAR A RODADA ────────────────────────────────────────
    // O segundo avanço, e o que reinicia o ciclo. A leitura é o texto
    // que a pessoa lê na tela, não o número no banco: é o texto que
    // decide se as duas pessoas estão na mesma rodada.
    {
      const antes = await leituraDaRodada(sessaoJ.page);
      await sessaoN.page.locator(".rv-rodadas-avanca").click();
      const ms = await esperarAte(async () => (await leituraDaRodada(sessaoJ!.page)).rodada.includes("Rodada 2"));
      const depois = await leituraDaRodada(sessaoJ.page);
      registrar(
        "4 (virar a rodada chega ao jogador, sem reload)",
        ms !== null,
        ms !== null
          ? `${ms}ms — jogador via "${antes.rodada}", agora vê "${depois.rodada}"`
          : `não chegou em 10s — jogador continua em "${depois.rodada}"`,
      );
    }

    // ── 5. Os dois leem a MESMA coisa ────────────────────────────
    // O critério que nomeia o estrago de verdade. Os anteriores
    // provam que a mudança chega; este prova que ela chega IGUAL —
    // duas telas coerentes mostrando estados diferentes é o modo de
    // falha que ninguém percebe, porque não há erro em lugar nenhum.
    {
      const n = await leituraDaRodada(sessaoN.page);
      const j = await leituraDaRodada(sessaoJ.page);
      registrar(
        "5 (narrador e jogador leem a mesma rodada e a mesma janela)",
        n.rodada === j.rodada && n.janela === j.janela,
        `narrador="${n.rodada} / ${n.janela}", jogador="${j.rodada} / ${j.janela}"`,
      );
    }

    // ── 6. CONDIÇÃO — a outra encanação, e uma regra de sigilo ───
    //
    // Condição de token não viaja por `postgres_changes`: `vtt_tokens`
    // não está entre as ligações daquele canal. A mudança chega por
    // BROADCAST, disparado por gatilho no banco
    // (`vtt_hud_broadcast_token_changed`), e o cliente responde com uma
    // releitura SANITIZADA — `read_vtt_scene_tokens`.
    //
    // E é a sanitização que dá a este critério a forma que ele tem.
    // Escrevi primeiro "a condição chega ao jogador", e reprovou. Não
    // era defeito: `read_vtt_scene_tokens` só preenche as condições
    // quando `can_move_vtt_token` é verdadeiro. Numa criatura do
    // narrador, o jogador não controla — e portanto NÃO fica sabendo
    // que ela está sangrando. A informação é do jogo, e o jogo decide
    // quando revelar.
    //
    // Então o critério afirma a regra de verdade, que é mais valiosa
    // que a que eu tinha imaginado: a condição chega a quem pode ver e
    // NÃO vaza para quem não pode. As duas metades juntas, porque a
    // segunda sozinha passaria verde com a encanação inteira quebrada —
    // foi exatamente o que aconteceu com a imagem no RT-03.
    {
      const seletor = `.rv-token[data-token-id="${alvo.id}"] .rv-token-condicao-resumo`;
      const antesJogador = await sessaoJ.page.locator(seletor).count();
      await admin.from("vtt_tokens")
        .update({ condicoes: ["sangrando"], revision: (alvo.revision ?? 0) + 1 })
        .eq("id", alvo.id);

      const msNarrador = await esperarAte(async () => (await sessaoN!.page.locator(seletor).count()) > 0);
      await new Promise((r) => setTimeout(r, 3000)); // folga generosa para um vazamento aparecer
      const depoisJogador = await sessaoJ.page.locator(seletor).count();
      registrar(
        "6 (condição chega ao narrador por broadcast e NÃO vaza para quem não controla o token)",
        msNarrador !== null && depoisJogador === antesJogador,
        msNarrador !== null
          ? `${msNarrador}ms no narrador; jogador antes=${antesJogador} depois=${depoisJogador}`
          : `não chegou ao narrador em 10s (jogador antes=${antesJogador} depois=${depoisJogador})`,
      );
    }

    // ── 7. Encerrar tira a trilha dos DOIS ───────────────────────
    // O avesso do critério 2: o combate acabar precisa chegar com a
    // mesma confiabilidade com que começou. Uma trilha fantasma na
    // tela de quem não clicou é pior que nenhuma — ela afirma que a
    // luta continua.
    {
      await admin.from("vtt_turn_tracks").delete().eq("scene_id", sceneId);
      const ms = await esperarAte(async () => (await sessaoJ!.page.locator(".rv-rodadas").count()) === 0);
      const sumiuNoNarrador = (await sessaoN.page.locator(".rv-rodadas").count()) === 0;
      registrar(
        "7 (encerrado o combate, a trilha some dos dois sem reload)",
        ms !== null && sumiuNoNarrador,
        ms !== null ? `${ms}ms no jogador, sumiu no narrador=${sumiuNoNarrador}` : "não sumiu no jogador em 10s",
      );
    }

    // ── 8. Nenhuma recusa durante a sessão inteira ───────────────
    const todasRecusas = [...sessaoN.errosDeCanal, ...sessaoJ.errosDeCanal];
    registrar("8 (nenhuma recusa de assinatura durante a sessão inteira)",
      todasRecusas.length === 0, todasRecusas[0] ?? "nenhuma");
  } finally {
    await sessaoN?.fechar();
    await sessaoJ?.fechar();
    await browser.close();
    await limpar();
  }

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  process.exit(falhou > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("\ncheck-combate-ao-vivo FALHOU:\n", e instanceof Error ? e.message : e);
  await limpar().catch(() => {});
  process.exit(1);
});
