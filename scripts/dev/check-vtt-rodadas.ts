/**
 * Browser check da ferramenta "Rodadas" — a trilha de turnos deixou de
 * ser estado local do navegador e virou estado de MESA (migration
 * 0088). O que precisa ser provado é justamente o que um teste puro
 * não alcança: que iniciar/encerrar valem pra todos, que o F5 volta na
 * rodada certa, e que a autorização de narrador não é só um botão
 * escondido no cliente.
 *
 * Cobre, com duas sessões reais (narrador e jogador da mesma mesa):
 *
 *   1. Iniciar combate normal escolhendo o elenco no painel.
 *   2. Iniciar emboscada (exige escolher o lado que surpreendeu).
 *   3. Adicionar e remover participante com o combate aberto.
 *   4. Recarregar a página com rodada ativa — volta na mesma rodada.
 *   5. Ocultar a trilha SÓ pra mim — não encerra nem afeta o outro.
 *   6. Jogador não administra: sem controles no painel, e a RPC recusa
 *      no servidor mesmo se a chamada for forjada.
 *   7. Encerrar durante uma ativação aberta pede confirmação e mostra
 *      rodada, janela e quem está agindo.
 *   8. Encerrar não remove nem altera token nenhum do mapa.
 *   9. Início e encerramento chegam à outra sessão pelo Realtime.
 *
 * Uso: npx tsx scripts/dev/check-vtt-rodadas.ts
 *      (servidor dev já rodando em localhost:3000)
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { ConsoleMessage } from "playwright";
import { chromium, type BrowserContext, type Page } from "playwright";
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

function erroRelevante(msg: ConsoleMessage): boolean {
  if (msg.type() !== "error") return false;
  const t = msg.text();
  if (t.includes("favicon") || t.includes("Download the React DevTools")) return false;
  if (t.includes("/brand/")) return false; // asset de marca ausente no dev, pré-existente
  // Corrida de arquitetura de Realtime PRÉ-EXISTENTE, já documentada
  // em `check-vtt-integracao.ts`: escrita otimista + eco do canal
  // disparam o aviso no instante em que o setter é chamado.
  if (t.includes("Cannot update a component") && t.includes("while rendering a different component")) return false;
  return true;
}

let campaignId: string | null = null;
let sceneId: string | null = null;
let narradorId: string | null = null;
let narradorEmail: string | null = null;
let narradorSenha: string | null = null;
let jogadorEmail: string | null = null;
let jogadorSenha: string | null = null;
const criados = { usuarios: [] as string[], campanhas: [] as string[] };

async function criarUsuario(rotulo: string): Promise<{ id: string; email: string; senha: string }> {
  const email = `check-vtt-rodadas-${rotulo}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true, user_metadata: { display_name: `Rodadas ${rotulo}` },
  });
  if (error) throw new Error(`Falha ao criar usuário ${rotulo}: ${error.message}`);
  criados.usuarios.push(data.user.id);
  return { id: data.user.id, email, senha };
}

async function configurarFixture(): Promise<void> {
  const narrador = await criarUsuario("narrador");
  narradorId = narrador.id;
  narradorEmail = narrador.email; narradorSenha = narrador.senha;
  const jogador = await criarUsuario("jogador");
  jogadorEmail = jogador.email; jogadorSenha = jogador.senha;

  campaignId = randomUUID();
  const { error: e1 } = await admin.from("campaigns").insert({ id: campaignId, name: "VTT Rodadas", owner_id: narrador.id });
  if (e1) throw new Error(`Falha ao criar campanha: ${e1.message}`);
  criados.campanhas.push(campaignId);

  const { error: e2 } = await admin.from("campaign_members").insert({
    campaign_id: campaignId, user_id: jogador.id, role: "player", status: "active", origem: "fixture_rodadas",
  });
  if (e2) throw new Error(`Falha ao adicionar jogador: ${e2.message}`);

  const { data: cena, error: e3 } = await admin.from("vtt_scenes")
    .insert({ campaign_id: campaignId, nome: "Cena Rodadas", largura: 24, altura: 24 })
    .select("id").single();
  if (e3) throw new Error(`Falha ao criar cena: ${e3.message}`);
  sceneId = cena!.id as string;

  // Elenco: 2 do lado dos jogadores, 2 do narrador, e 1 que fica FORA
  // da trilha no início (pra provar "adicionar quem entrou depois").
  const tokens = [
    { nome: "Mara Venn", sigla: "MV", lado: "pj", q: 4, r: 4 },
    { nome: "Corvo", sigla: "CR", lado: "pj", q: 5, r: 6 },
    { nome: "Bando 1", sigla: "B1", lado: "pn", q: 12, r: 4 },
    { nome: "Bando 2", sigla: "B2", lado: "pn", q: 13, r: 6 },
    { nome: "Reforço", sigla: "RF", lado: "pn", q: 15, r: 9 },
  ];
  const { error: e4 } = await admin.from("vtt_tokens").insert(tokens.map((t) => ({
    scene_id: sceneId, campaign_id: campaignId, nome: t.nome, sigla: t.sigla, lado: t.lado,
    tamanho: "medio", orientacao: 0, q: t.q, r: t.r, visivel: true,
  })));
  if (e4) throw new Error(`Falha ao criar tokens: ${e4.message}`);
}

async function limpar() {
  if (campaignId) {
    await admin.from("vtt_turn_tracks").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_marks").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_tokens").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_scenes").delete().eq("campaign_id", campaignId);
    await admin.from("campaign_members").delete().eq("campaign_id", campaignId);
    await admin.from("campaigns").delete().eq("id", campaignId);
  }
  for (const uid of criados.usuarios) await admin.auth.admin.deleteUser(uid);
  registrar("L (limpeza de fixtures)", true, `${criados.usuarios.length} usuário(s), ${criados.campanhas.length} campanha(s)`);
}

async function contextoDe(email: string, senha: string): Promise<{ context: BrowserContext; page: Page; close: () => Promise<void> }> {
  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) throw new Error(`Falha ao logar ${email}: ${error?.message}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await context.addCookies([{
    name: "ruptura_auth",
    value: JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }),
    domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  }]);
  const page = await context.newPage();
  return { context, page, close: () => browser.close() };
}

async function abrirVtt(page: Page) {
  await page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
  await page.waitForSelector(".rv-ferramentas", { timeout: 20000 });
  await page.waitForTimeout(1200);
}

const botaoRodadas = (page: Page) => page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Rodadas"]');
const painel = (page: Page) => page.locator('[data-testid="painel-rodadas"]');

async function abrirPainel(page: Page) {
  if (await painel(page).count() === 0) await botaoRodadas(page).click();
  await page.waitForSelector('[data-testid="painel-rodadas"]', { timeout: 8000 });
}

async function esperarAte(cond: () => Promise<boolean>, timeoutMs = 8000): Promise<boolean> {
  const ate = Date.now() + timeoutMs;
  while (Date.now() < ate) {
    if (await cond()) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function linhaDoBanco(): Promise<{ estado: Record<string, unknown>; revision: number } | null> {
  const { data } = await admin.from("vtt_turn_tracks").select("estado, revision").eq("scene_id", sceneId).maybeSingle();
  return data ? { estado: data.estado as Record<string, unknown>, revision: data.revision as number } : null;
}

async function main() {
  await configurarFixture();
  registrar("0 (fixture: campanha, cena, 5 tokens, narrador + jogador)", true, `campanha=${campaignId}`);

  const narrador = await contextoDe(narradorEmail!, narradorSenha!);
  const jogador = await contextoDe(jogadorEmail!, jogadorSenha!);
  const erros: string[] = [];
  // O critério 6b FORJA uma chamada que o servidor tem que recusar — o
  // 400 resultante é o resultado esperado, não um defeito. Silenciar a
  // coleta só durante aquele trecho mantém "console limpo" útil pra
  // regressão real, em vez de virar um critério que sempre falha.
  let ignorarErrosDeProposito = false;
  for (const [rotulo, p] of [["narrador", narrador.page], ["jogador", jogador.page]] as const) {
    p.on("console", (m) => { if (!ignorarErrosDeProposito && erroRelevante(m)) erros.push(`${rotulo}: ${m.text().slice(0, 300)}`); });
    p.on("pageerror", (e) => { if (!ignorarErrosDeProposito) erros.push(`${rotulo} pageerror: ${e.message}`); });
  }

  await abrirVtt(narrador.page);
  await abrirVtt(jogador.page);

  try {
    // ── 0b: abrir a ferramenta NÃO inicia nada ─────────────────────
    await botaoRodadas(narrador.page).click();
    await narrador.page.waitForTimeout(600);
    registrar("0b (clicar no ícone abre o painel e NÃO inicia rodadas)",
      await painel(narrador.page).count() === 1 && (await linhaDoBanco()) === null
        && await narrador.page.locator(".rv-faccao").count() === 0,
      `painel=${await painel(narrador.page).count()} linhaNoBanco=${(await linhaDoBanco()) !== null}`);

    // Fechar o painel não desativa a ferramenta nem inicia nada.
    await narrador.page.locator('.rv-fp--rodadas .rv-fp-fechar').click();
    await narrador.page.waitForTimeout(300);
    registrar("0c (fechar o painel não encerra nada nem deixa a ferramenta presa)",
      await painel(narrador.page).count() === 0 && (await linhaDoBanco()) === null,
      "painel fechado, sem trilha");

    // ── 0d: a janela é ARRASTÁVEL pelo cabeçalho, e a posição fica ──
    await abrirPainel(narrador.page);
    const caixaAntes = await painel(narrador.page).boundingBox();
    const cab = narrador.page.locator(".rv-fp--rodadas .rv-fp-cab");
    const caixaCab = await cab.boundingBox();
    await narrador.page.mouse.move(caixaCab!.x + 90, caixaCab!.y + 14);
    await narrador.page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await narrador.page.mouse.move(caixaCab!.x + 90 + (240 * i) / 8, caixaCab!.y + 14 + (150 * i) / 8);
    }
    await narrador.page.mouse.up();
    await narrador.page.waitForTimeout(400);
    const caixaDepois = await painel(narrador.page).boundingBox();
    registrar("0d (janela arrasta pelo cabeçalho e vai parar onde foi solta)",
      Math.abs((caixaDepois!.x - caixaAntes!.x) - 240) < 6 && Math.abs((caixaDepois!.y - caixaAntes!.y) - 150) < 6,
      `dx=${Math.round(caixaDepois!.x - caixaAntes!.x)} dy=${Math.round(caixaDepois!.y - caixaAntes!.y)} (esperado 240/150)`);

    // Fechar e reabrir mantém onde a pessoa deixou (posição virou dela).
    await narrador.page.locator('.rv-fp--rodadas .rv-fp-fechar').click();
    await narrador.page.waitForTimeout(300);
    await abrirPainel(narrador.page);
    const caixaReaberta = await painel(narrador.page).boundingBox();
    registrar("0e (reabrir a ferramenta mantém a janela onde foi arrastada)",
      Math.abs(caixaReaberta!.x - caixaDepois!.x) < 3 && Math.abs(caixaReaberta!.y - caixaDepois!.y) < 3,
      `x=${Math.round(caixaReaberta!.x)} y=${Math.round(caixaReaberta!.y)}`);

    // E sobrevive ao reload — é preferência local persistida.
    await narrador.page.reload({ waitUntil: "networkidle" });
    await narrador.page.waitForSelector(".rv-ferramentas", { timeout: 20000 });
    await narrador.page.waitForTimeout(1200);
    await abrirPainel(narrador.page);
    const caixaPosReload = await painel(narrador.page).boundingBox();
    registrar("0f (a posição arrastada persiste no reload)",
      Math.abs(caixaPosReload!.x - caixaDepois!.x) < 3 && Math.abs(caixaPosReload!.y - caixaDepois!.y) < 3,
      `x=${Math.round(caixaPosReload!.x)} y=${Math.round(caixaPosReload!.y)}`);

    // O X de fechar continua sendo botão, não alça.
    await narrador.page.locator('.rv-fp--rodadas .rv-fp-fechar').click();
    await narrador.page.waitForTimeout(300);
    registrar("0g (clicar no X fecha em vez de arrastar)",
      await painel(narrador.page).count() === 0, "painel fechado");

    // ── 0h: a explicação do modo é DICA, não conteúdo do card ──────
    //
    // O card mostra só o nome — em qualquer estado, inclusive
    // selecionado. A regra aparece por cima ao passar o mouse. Duas
    // coisas se provam juntas: a dica de fato APARECE (dentro de um
    // `<button>` o Chromium não pintava o filho que ultrapassava a
    // caixa — daí o invólucro) e o card NÃO cresce ao mostrá-la, senão
    // o par de modos dança debaixo do cursor.
    await abrirPainel(narrador.page);
    {
      const caixa = narrador.page.locator(".rv-rodadas-modo-caixa").first();
      const cartao = caixa.locator(".rv-rodadas-modo");
      const dica = caixa.locator(".rv-rodadas-modo-dica");
      const alturaRepouso = (await cartao.boundingBox())!.height;
      const opacidadeRepouso = await dica.evaluate((el) => getComputedStyle(el).opacity);
      const textoNoCartao = ((await cartao.textContent()) ?? "").trim();
      await cartao.hover();
      await esperarAte(async () => (await dica.evaluate((el) => getComputedStyle(el).opacity)) === "1", 2000);
      const caixaDica = await dica.boundingBox();
      const alturaHover = (await cartao.boundingBox())!.height;
      const vp = narrador.page.viewportSize()!;
      const dentroDaTela = !!caixaDica && caixaDica.x >= 0 && caixaDica.y >= 0
        && caixaDica.x + caixaDica.width <= vp.width && caixaDica.y + caixaDica.height <= vp.height;
      const naoCresceu = Math.abs(alturaHover - alturaRepouso) < 1;
      const soONome = textoNoCartao.length > 0 && !textoNoCartao.includes("Rodada");
      registrar("0h (a regra do modo é dica flutuante: some em repouso, aparece no hover, dentro da tela, sem mexer no card)",
        opacidadeRepouso === "0" && dentroDaTela && naoCresceu && soONome,
        `opacidadeRepouso=${opacidadeRepouso}, dentroDaTela=${dentroDaTela}, altura ${alturaRepouso.toFixed(1)}→${alturaHover.toFixed(1)}, cartão="${textoNoCartao}"`);
      await narrador.page.mouse.move(4, 4);
    }
    await narrador.page.locator('.rv-fp--rodadas .rv-fp-fechar').click();
    await narrador.page.waitForTimeout(300);

    // ── 1: iniciar combate normal com elenco escolhido ─────────────
    await abrirPainel(narrador.page);
    // Deixa o "Reforço" de fora — ele entra no critério 3.
    const itens = narrador.page.locator(".rv-rodadas-item");
    const totalItens = await itens.count();
    for (let i = 0; i < totalItens; i++) {
      const texto = await itens.nth(i).textContent();
      if (texto?.includes("Reforço")) await itens.nth(i).locator("input").uncheck();
    }
    const resumoAntes = await narrador.page.locator(".rv-rodadas-resumo").textContent();
    await narrador.page.locator(".rv-rodadas-iniciar").click();
    const iniciou = await esperarAte(async () => (await linhaDoBanco()) !== null, 10000);
    const linha1 = await linhaDoBanco();
    const participantes1 = (linha1?.estado.participantes as { id: string }[] | undefined) ?? [];
    registrar("1 (iniciar combate normal grava a trilha com o elenco escolhido)",
      iniciou && participantes1.length === 4 && linha1?.estado.modo === "combate" && linha1?.estado.rodada === 1,
      `resumo="${resumoAntes?.trim()}" participantes=${participantes1.length} modo=${linha1?.estado.modo}`);

    const trilhosNarrador = await esperarAte(async () => await narrador.page.locator(".rv-faccao").count() === 2);
    registrar("1b (núcleo e os dois trilhos aparecem pra quem iniciou)",
      trilhosNarrador && await narrador.page.locator(".rv-rodadas").count() === 1,
      `trilhos=${await narrador.page.locator(".rv-faccao").count()} núcleo=${await narrador.page.locator(".rv-rodadas").count()}`);

    // ── 1n: núcleo da rodada, os dois estados do Figma ────────────
    //
    // A placa tem um rodapé CONDICIONAL — régua, estado e ação — que só
    // existe quando há notícia: alguém agindo, um lado da vez, ou a
    // janela fechada.
    //
    // Combate recém-iniciado tem notícia: NINGUÉM declarou ainda, então
    // ninguém é elegível, `podeEncerrarJanela` é verdadeiro e a placa
    // abre no estado com ação (Figma 440:2643) oferecendo "Resolver
    // Lentos". O estado de repouso (440:1827) aparece assim que alguém
    // declara — e é o que 3n-repouso confere, mais adiante.
    //
    // O botão NÃO é clicado: avançar de janela muda o estado do combate
    // pro resto da suíte e não tem ação inversa. O que se prova aqui é
    // o que a placa MOSTRA e OFERECE.
    {
      const nucleo = narrador.page.locator(".rv-rodadas");
      const cantos = await nucleo.locator(".rv-rodadas-canto").count();
      const janelaTxt = ((await nucleo.locator(".rv-rodadas-janela").textContent()) ?? "").trim();
      const janelaAttr = await nucleo.getAttribute("data-janela");
      const rodadaTxt = ((await nucleo.locator(".rv-rodadas-rodada").textContent()) ?? "").trim();
      const estadoTxt = ((await nucleo.locator(".rv-rodadas-estado").textContent()) ?? "").trim();
      const rotuloAcao = ((await nucleo.locator(".rv-rodadas-avanca").textContent()) ?? "").trim();
      registrar("1n (núcleo: rodada, janela com o teto de PA, quatro colchetes, e o rodapé com estado + ação)",
        cantos === 4 && janelaAttr === "rapidos"
          && janelaTxt === "Rápidos · até 2 PA" && rodadaTxt === "Rodada 1"
          && estadoTxt === "Janela concluída" && rotuloAcao === "Resolver Lentos",
        `colchetes=${cantos}, data-janela=${janelaAttr}, janela="${janelaTxt}", rodada="${rodadaTxt}", estado="${estadoTxt}", ação="${rotuloAcao}"`);
    }

    registrar("1c (declaração Rápido/Lento continua dentro dos slots)",
      await narrador.page.locator(".rv-ator .rv-ator-declara button").count() >= 8,
      `botões de declaração=${await narrador.page.locator(".rv-ator .rv-ator-declara button").count()}`);

    // ── 9a: o início chega na OUTRA sessão sem reload ──────────────
    const chegouNoJogador = await esperarAte(async () => await jogador.page.locator(".rv-faccao").count() === 2, 12000);
    registrar("9a (início sincroniza pro jogador pelo Realtime, sem reload)",
      chegouNoJogador,
      `trilhos no jogador=${await jogador.page.locator(".rv-faccao").count()}`);

    registrar("Badge (ícone aceso com o número da rodada)",
      await botaoRodadas(jogador.page).getAttribute("data-ativo") === "true"
        && (await botaoRodadas(jogador.page).locator(".rv-ferr-badge").textContent()) === "1",
      `data-ativo=${await botaoRodadas(jogador.page).getAttribute("data-ativo")} badge=${await botaoRodadas(jogador.page).locator(".rv-ferr-badge").textContent()}`);

    // ── 6: jogador não administra ──────────────────────────────────
    await abrirPainel(jogador.page);
    const painelJogador = painel(jogador.page);
    registrar("6 (jogador abre o painel e vê o estado, sem controles administrativos)",
      await painelJogador.count() === 1
        && await painelJogador.locator(".rv-rodadas-encerrar").count() === 0
        && await painelJogador.locator(".rv-rodadas-mini").count() === 0
        // O estado do combate agora são as PLACAS do topo (rodada e o
        // que resta de cada lado), não mais a lista de definições.
        && (await painelJogador.locator(".rv-fp-placas").textContent())?.includes("Rodada") === true,
      `encerrar=${await painelJogador.locator(".rv-rodadas-encerrar").count()} mini=${await painelJogador.locator(".rv-rodadas-mini").count()}`);

    // A prova que importa: o SERVIDOR recusa, não só a UI esconde.
    ignorarErrosDeProposito = true;
    const forja = await jogador.page.evaluate(async ({ url, key, cena }) => {
      const r = await fetch(`${url}/rest/v1/rpc/encerrar_vtt_trilha`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
        body: JSON.stringify({ p_scene_id: cena }),
      });
      return { status: r.status, corpo: (await r.text()).slice(0, 200) };
    }, { url: supabaseUrl, key: anonKey, cena: sceneId });
    await jogador.page.waitForTimeout(300);
    ignorarErrosDeProposito = false;
    registrar("6b (RPC de encerrar recusada pro jogador no SERVIDOR, não só na UI)",
      forja.status >= 400 && (await linhaDoBanco()) !== null,
      `status=${forja.status} trilhaAindaExiste=${(await linhaDoBanco()) !== null}`);

    const jogadorPodeJogar = await jogador.page.locator(".rv-faccao--pj .rv-ator-declara button").first().isEnabled();
    registrar("6c (jogador continua podendo JOGAR: declarar janela segue habilitado)",
      jogadorPodeJogar, `declarar habilitado=${jogadorPodeJogar}`);

    // ── 3z: botão de ícone diz o próprio nome ──────────────────────
    //
    // As ações da linha (incapaz, passar, remover) são ÍCONE, sem
    // rótulo escrito. Isso só é aceitável se o nome estiver a um
    // hover/foco de distância — e ele tem que passar por cima da borda
    // do corpo da janela, que ROLA e recortaria uma caixa comum.
    await abrirPainel(narrador.page);
    {
      const P = painel(narrador.page);
      const icones = P.locator(".rv-rodadas-linha").first().locator(".rv-rodadas-mini");
      const semRotuloEscrito = ((await icones.first().textContent()) ?? "").trim() === "";
      const rotulo = await icones.first().getAttribute("aria-label");
      const dica = narrador.page.locator(".rv-rodadas-dica");
      const antes = await dica.count();
      await icones.first().hover();
      const apareceu = await esperarAte(async () => await dica.count() === 1, 2000);
      const textoDica = apareceu ? ((await dica.textContent()) ?? "").trim() : "";
      const cx = await dica.boundingBox().catch(() => null);
      const vp = narrador.page.viewportSize()!;
      const naTela = !!cx && cx.x >= 0 && cx.y >= 0 && cx.x + cx.width <= vp.width && cx.y + cx.height <= vp.height;
      await narrador.page.mouse.move(4, 4);
      const sumiu = await esperarAte(async () => await dica.count() === 0, 2000);
      registrar("3z (ação de ícone mostra o próprio nome ao passar o mouse, dentro da tela, e some ao sair)",
        semRotuloEscrito && antes === 0 && apareceu && textoDica === rotulo && naTela && sumiu,
        `semRotuloEscrito=${semRotuloEscrito}, dica="${textoDica}", aria-label="${rotulo}", naTela=${naTela}, sumiu=${sumiu}`);

      // Teclado alcança a mesma dica — senão o nome existe só pro mouse.
      await icones.nth(1).focus();
      const dicaPorFoco = await esperarAte(async () => await dica.count() === 1, 2000);
      registrar("3z-teclado (a mesma dica aparece ao focar o botão pelo teclado)",
        dicaPorFoco && ((await dica.textContent()) ?? "").trim() === await icones.nth(1).getAttribute("aria-label"),
        `apareceu=${dicaPorFoco}, texto="${((await dica.textContent()) ?? "").trim()}"`);
      await icones.nth(1).blur();
    }

    // ── 3: adicionar e remover participante ────────────────────────
    const adicionar = narrador.page.locator('.rv-rodadas-mini[aria-label^="Adicionar Reforço"]');
    registrar("3 (token fora da trilha aparece como candidato a entrar)", await adicionar.count() === 1,
      `candidatos=${await narrador.page.locator('.rv-rodadas-mini[aria-label^="Adicionar"]').count()}`);
    await adicionar.click();
    const entrou = await esperarAte(async () => ((await linhaDoBanco())?.estado.participantes as unknown[])?.length === 5);
    registrar("3b (adicionar quem entrou depois grava no elenco)",
      entrou, `participantes=${((await linhaDoBanco())?.estado.participantes as unknown[])?.length}`);

    await narrador.page.locator('.rv-rodadas-mini--perigo[aria-label^="Remover Reforço"]').click();
    const saiu = await esperarAte(async () => ((await linhaDoBanco())?.estado.participantes as unknown[])?.length === 4);
    registrar("3c (remover participante tira do elenco sem confirmação — ninguém estava agindo)",
      saiu, `participantes=${((await linhaDoBanco())?.estado.participantes as unknown[])?.length}`);

    // ── 4: reload com rodada ativa ─────────────────────────────────
    // Avança de verdade antes de recarregar: um reload que só recupera
    // "rodada 1, nada aconteceu" não provaria muita coisa.
    await narrador.page.locator('.rv-fp--rodadas .rv-fp-fechar').click();

    const primeiroPj = narrador.page.locator(".rv-faccao--pj .rv-ator").first();
    await primeiroPj.locator('.rv-ator-declara button[data-janela="rapidos"]').click();
    // Espera fixa (700ms) flakeava aqui: "agir" só fica clicável depois
    // que a declaração volta do servidor, e às vezes demorava mais.
    // Espera pela condição e, se o primeiro clique não abriu o turno
    // (declaração ainda em voo quando ele saiu), insiste uma vez.
    let abriuTurno = false;
    for (let tentativa = 0; tentativa < 3 && !abriuTurno; tentativa++) {
      // A espera é BEST-EFFORT: se "agir" ainda não está clicável, o
      // timeout não é o fim — a declaração pode chegar no intervalo
      // seguinte. Estourar aqui transformava uma corrida em erro fatal
      // e derrubava a suíte inteira.
      await primeiroPj.locator(".rv-ator-agir:not([disabled])")
        .waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
      if (await primeiroPj.locator(".rv-ator-agir:not([disabled])").count() === 0) continue;
      await primeiroPj.locator(".rv-ator-agir").click();
      abriuTurno = await esperarAte(async () => (await linhaDoBanco())?.estado.agindoId !== null, 8000);
    }
    registrar("4a (assumir turno grava a ativação aberta no servidor)",
      abriuTurno, `agindoId=${(await linhaDoBanco())?.estado.agindoId}`);

    {
      // Agora HÁ notícia: o rodapé nasce, com o estado do lado de quem
      // age. A ação de avançar continua fora — nunca no meio de um
      // turno aberto.
      const nucleo = narrador.page.locator(".rv-rodadas");
      const temPe = await esperarAte(async () => await nucleo.locator(".rv-rodadas-pe").count() === 1, 8000);
      // Sem `count()` antes do `textContent()`, um rodapé ausente vira
      // 30s de espera e um erro fatal no lugar de uma falha legível.
      const temEstado = await nucleo.locator(".rv-rodadas-estado").count() === 1;
      const estadoTxt = temEstado ? ((await nucleo.locator(".rv-rodadas-estado").textContent()) ?? "").trim() : "";
      const lado = temEstado ? await nucleo.locator(".rv-rodadas-estado").getAttribute("data-lado") : null;
      const temAcao = await nucleo.locator(".rv-rodadas-avanca").count();
      registrar("3n-pe (com turno aberto o rodapé aparece com o estado do lado, e sem ação de avançar)",
        temPe && estadoTxt.endsWith("em ação") && lado === "pj" && temAcao === 0,
        `rodapé=${temPe}, estado="${estadoTxt}", data-lado=${lado}, ação=${temAcao}`);
    }

    const estadoAntesReload = await narrador.page.locator(".rv-rodadas-estado").first().textContent();
    await narrador.page.reload({ waitUntil: "networkidle" });
    await narrador.page.waitForSelector(".rv-ferramentas", { timeout: 20000 });
    const voltouComTrilha = await esperarAte(async () => await narrador.page.locator(".rv-faccao").count() === 2, 15000);
    const estadoDepoisReload = await narrador.page.locator(".rv-rodadas-estado").textContent();
    registrar("4 (recarregar com rodada ativa recupera a mesma trilha e a mesma ativação)",
      voltouComTrilha && estadoDepoisReload === estadoAntesReload
        && await narrador.page.locator('.rv-ator[data-situacao="agindo"]').count() === 1,
      `antes="${estadoAntesReload}" depois="${estadoDepoisReload}"`);

    // ── 5: ocultar só pra mim ──────────────────────────────────────
    await abrirPainel(narrador.page);
    await narrador.page.locator('.rv-rodadas-rodape button[aria-pressed]').click();
    await narrador.page.waitForTimeout(500);
    const escondeuLocal = await narrador.page.locator(".rv-faccao").count() === 0;
    const outroSegueVendo = await jogador.page.locator(".rv-faccao").count() === 2;
    const combateSegue = (await linhaDoBanco()) !== null;
    registrar("5 (ocultar esconde a trilha só pra mim: outro segue vendo, combate segue no banco)",
      escondeuLocal && outroSegueVendo && combateSegue,
      `meusTrilhos=${await narrador.page.locator(".rv-faccao").count()} trilhosDoOutro=${await jogador.page.locator(".rv-faccao").count()} trilhaNoBanco=${combateSegue}`);

    // Sobrevive ao reload (preferência local) e volta pelo mesmo painel.
    await narrador.page.reload({ waitUntil: "networkidle" });
    await narrador.page.waitForSelector(".rv-ferramentas", { timeout: 20000 });
    await narrador.page.waitForTimeout(1500);
    const seguiuOculta = await narrador.page.locator(".rv-faccao").count() === 0;
    await abrirPainel(narrador.page);
    await narrador.page.locator('.rv-rodadas-rodape button[aria-pressed]').click();
    const voltou = await esperarAte(async () => await narrador.page.locator(".rv-faccao").count() === 2);
    registrar("5b (a escolha de ocultar persiste no reload e se desfaz pelo mesmo painel)",
      seguiuOculta && voltou,
      `seguiuOculta=${seguiuOculta} voltouAoMostrar=${voltou}`);

    // ── 7: encerrar durante uma ativação pede confirmação ──────────
    await abrirPainel(narrador.page);
    await narrador.page.locator(".rv-rodadas-encerrar").click();
    const dialogo = narrador.page.locator('[role="alertdialog"]');
    const textoDialogo = (await dialogo.textContent()) ?? "";
    const linhaAgora = await linhaDoBanco();
    const nomeAgindo = ((linhaAgora?.estado.participantes as { id: string; nome: string }[]) ?? [])
      .find((p) => p.id === linhaAgora?.estado.agindoId)?.nome ?? "";
    registrar("7 (encerrar durante ativação pede confirmação mostrando rodada, janela e quem age)",
      await dialogo.count() === 1
        && /rodada\s*1/i.test(textoDialogo)
        && /r[áa]pidos/i.test(textoDialogo)
        && nomeAgindo !== "" && textoDialogo.includes(nomeAgindo)
        && /todos os participantes/i.test(textoDialogo),
      `nomeAgindo="${nomeAgindo}" diálogo="${textoDialogo.replace(/\s+/g, " ").trim().slice(0, 180)}"`);

    registrar("7b (cancelar a confirmação não encerra nada)",
      await (async () => {
        await dialogo.locator(".rv-btn--ghost").click();
        await narrador.page.waitForTimeout(400);
        return (await linhaDoBanco()) !== null && await narrador.page.locator(".rv-faccao").count() === 2;
      })(),
      "trilha intacta depois de cancelar");

    // ── 10: marcações com prazo vencem no SERVIDOR ────────────────
    // A janela de Marcar deixa escolher "Persistente", "Esta rodada" e
    // "Este combate". "Enforced de verdade" quer dizer: some pra mesa
    // inteira no mesmo instante, porque quem apaga é o servidor junto
    // da transição — não um filtro de tela por participante.
    const marcasFixture = [
      { duracao: "persistente", texto: "fica" },
      { duracao: "rodada", texto: "vence na virada" },
      { duracao: "combate", texto: "vence no fim do combate" },
    ];
    const { error: eMarcas } = await admin.from("vtt_marks").insert(marcasFixture.map((m, i) => ({
      scene_id: sceneId, campaign_id: campaignId, autor_id: narradorId,
      tipo: "texto", sinal: "alvo", cor: "ciano", pontos: [{ q: 2 + i, r: 2 }],
      duracao: m.duracao, rodada_criada: 1, texto: m.texto, privada: false,
    })));
    if (eMarcas) throw new Error(`Falha ao criar marcações: ${eMarcas.message}`);

    const textosDeMarcas = async () => {
      const { data } = await admin.from("vtt_marks").select("duracao").eq("scene_id", sceneId);
      return (data ?? []).map((m) => m.duracao as string).sort();
    };

    // 10a — a virada de rodada. A RPC é chamada pelo servidor dentro de
    // `atualizarTrilhaAction`; aqui ela é exercida com a sessão REAL da
    // narradora, que é a única autorização que conta.
    const clienteNarradora = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await clienteNarradora.auth.signInWithPassword({ email: narradorEmail!, password: narradorSenha! });
    const { data: removidasRodada, error: eRodada } = await clienteNarradora.rpc("expirar_marcas_da_cena", {
      p_scene_id: sceneId, p_rodada_atual: 2, p_combate_encerrado: false,
    });
    registrar("10a (virar a rodada apaga só as marcações de 'esta rodada')",
      !eRodada && removidasRodada === 1 && JSON.stringify(await textosDeMarcas()) === JSON.stringify(["combate", "persistente"]),
      `removidas=${removidasRodada} restantes=${JSON.stringify(await textosDeMarcas())} erro=${eRodada?.message ?? "nenhum"}`);

    // 10b — quem NÃO é da mesa não dispara a limpeza da cena alheia.
    const clienteEstranho = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const estranho = await criarUsuario("estranho");
    await clienteEstranho.auth.signInWithPassword({ email: estranho.email, password: estranho.senha });
    const { error: eEstranho } = await clienteEstranho.rpc("expirar_marcas_da_cena", {
      p_scene_id: sceneId, p_rodada_atual: 9, p_combate_encerrado: true,
    });
    registrar("10b (não-membro NÃO expira marcações de uma cena alheia)",
      !!eEstranho && JSON.stringify(await textosDeMarcas()) === JSON.stringify(["combate", "persistente"]),
      `erro="${eEstranho?.message ?? "NENHUM"}" restantes=${JSON.stringify(await textosDeMarcas())}`);

    // ── 2: emboscada — precisa reiniciar, então encerra antes ──────
    const tokensAntesDeEncerrar = await admin.from("vtt_tokens").select("id, q, r, nome, revision").eq("campaign_id", campaignId!);
    await narrador.page.locator(".rv-rodadas-encerrar").click();
    await narrador.page.locator('[role="alertdialog"] .rv-btn--perigo').click();
    const encerrou = await esperarAte(async () => (await linhaDoBanco()) === null, 10000);
    registrar("8a (encerrar apaga a trilha e some com os trilhos de quem encerrou)",
      encerrou && await esperarAte(async () => await narrador.page.locator(".rv-faccao").count() === 0),
      `trilhaNoBanco=${(await linhaDoBanco()) !== null} trilhos=${await narrador.page.locator(".rv-faccao").count()}`);

    // 10c — o encerramento REAL, pela UI, passando pelo server action:
    // "Este combate" some, "Persistente" fica. É esta a prova de que a
    // expiração está ligada no caminho de produção, não só na RPC.
    const restaramDepoisDoFim = await esperarAte(
      async () => JSON.stringify(await textosDeMarcas()) === JSON.stringify(["persistente"]), 10000);
    registrar("10c (encerrar o combate pela UI apaga 'este combate' e preserva 'persistente')",
      restaramDepoisDoFim, `restantes=${JSON.stringify(await textosDeMarcas())}`);

    // ── 9b: o encerramento chega na outra sessão ───────────────────
    const sumiuNoJogador = await esperarAte(async () => await jogador.page.locator(".rv-faccao").count() === 0, 12000);
    registrar("9b (encerramento sincroniza pro jogador pelo Realtime, sem reload)",
      sumiuNoJogador, `trilhos no jogador=${await jogador.page.locator(".rv-faccao").count()}`);

    // ── 8: tokens intactos ─────────────────────────────────────────
    const tokensDepois = await admin.from("vtt_tokens").select("id, q, r, nome, revision").eq("campaign_id", campaignId!);
    const iguais = JSON.stringify(
      (tokensAntesDeEncerrar.data ?? []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id))),
    ) === JSON.stringify(
      (tokensDepois.data ?? []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id))),
    );
    registrar("8 (encerrar NÃO remove nem altera token nenhum do mapa)",
      iguais && (tokensDepois.data?.length ?? 0) === 5,
      `tokens antes=${tokensAntesDeEncerrar.data?.length} depois=${tokensDepois.data?.length} idênticos=${iguais}`);

    // ── 2: emboscada ───────────────────────────────────────────────
    await abrirPainel(narrador.page);
    await narrador.page.locator('.rv-rodadas-modo[aria-checked="false"]').first().click();
    await narrador.page.waitForTimeout(300);
    const bloqueadoSemLado = !(await narrador.page.locator(".rv-rodadas-iniciar").isEnabled());
    const avisoSemLado = await narrador.page.locator(".rv-rodadas-aviso").textContent();
    registrar("2 (emboscada exige escolher o lado que surpreendeu antes de iniciar)",
      bloqueadoSemLado && /lado/i.test(avisoSemLado ?? ""),
      `iniciarDesabilitado=${bloqueadoSemLado} aviso="${avisoSemLado?.trim()}"`);

    await narrador.page.locator('.rv-rodadas-lado[data-lado="pn"]').click();
    await narrador.page.waitForTimeout(200);
    await narrador.page.locator(".rv-rodadas-iniciar").click();
    const iniciouEmboscada = await esperarAte(async () => (await linhaDoBanco())?.estado.modo === "emboscada", 10000);
    const linhaEmb = await linhaDoBanco();
    registrar("2b (emboscada inicia com o lado surpresa gravado)",
      iniciouEmboscada && linhaEmb?.estado.ladoSurpresa === "pn",
      `modo=${linhaEmb?.estado.modo} ladoSurpresa=${linhaEmb?.estado.ladoSurpresa}`);

    const nucleo = (await narrador.page.locator(".rv-rodadas").textContent()) ?? "";
    registrar("2c (o núcleo da trilha anuncia o modo emboscada)",
      /emboscada/i.test(nucleo), `núcleo="${nucleo.replace(/\s+/g, " ").trim()}"`);

    // Limpa a trilha da emboscada pra deixar a cena como encontrou.
    await abrirPainel(narrador.page);
    await narrador.page.locator(".rv-rodadas-encerrar").click();
    await narrador.page.locator('[role="alertdialog"] .rv-btn--perigo').click();
    await esperarAte(async () => (await linhaDoBanco()) === null, 10000);

    // ── Console limpo ──────────────────────────────────────────────
    registrar("C (console limpo nas duas sessões durante todo o fluxo)",
      erros.length === 0, erros.length ? erros.slice(0, 3).join(" | ") : "nenhum erro");
  } finally {
    await narrador.close();
    await jogador.close();
    await limpar();
  }

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  process.exit(falhou === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("Erro fatal:", e);
  await limpar().catch(() => {});
  process.exit(1);
});
