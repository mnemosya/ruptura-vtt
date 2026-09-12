/**
 * Ordem de pintura/camadas (seção 6) — prova ESTRUTURAL (ordem real no
 * DOM, que em SVG é a própria ordem de pintura) de que nada relevante
 * fica escondido atrás de outra coisa, mais uma prova de CONTRASTE real
 * (halo) pro rótulo de terreno difícil sobre a hachura, e screenshots
 * reais salvos em disco pra inspeção visual — nunca só "existe no DOM".
 *
 * Cenário deliberadamente pior caso: UM token narrador-only com PV baixo
 * (barra vermelha), condição ativa, travado, OCULTO (só narrador vê) e
 * SELECIONADO (mostra setor traseiro + cunha de orientação + alça de
 * rotação) ao mesmo tempo — todo elemento do "layer 5/6/7" competindo
 * pelo mesmo espaço visual que o pedido descreve.
 *
 * Uso: npx tsx scripts/dev/check-vtt-camadas-visuais.ts (servidor dev já
 * rodando em localhost:3000).
 */

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { ConsoleMessage } from "playwright";
import { chromium, type Page } from "playwright";
import { BASE_URL } from "./authSession";
import { hexParaPixel } from "../../src/app/mesas/[campaignId]/vtt/_mapa/hex";
// IMPORTADO de verdade, nunca copiado — um `const TAM = 40` local
// (cópia de outro script desta sessão) divergiu do `TAM = 26` real de
// `MapaHex.tsx` e fez todo clique de mundo→tela apontar pra um pixel
// bem longe do token de verdade (achado real, diagnosticado com
// `document.elementFromPoint`: o clique caía no painel lateral).
import { TAM } from "../../src/app/mesas/[campaignId]/vtt/_mapa/MapaHex";

loadDotenv({ path: ".env.local" });
function requireEnv(nome: string): string {
  const v = process.env[nome];
  if (!v) { console.error(`Variável de ambiente ausente: ${nome}`); process.exit(1); }
  return v;
}
const admin = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anonKey = requireEnv("SUPABASE_ANON_KEY");
const supabaseUrl = requireEnv("SUPABASE_URL");

const SCREENSHOT_DIR = "/private/tmp/claude-501/-Users-gabi-Developer-ruptura-vtt/c32dcb0f-5ce9-4a88-92bd-363c6df35bb2/scratchpad";
mkdirSync(SCREENSHOT_DIR, { recursive: true });

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
  return true;
}

let campaignId: string | null = null;
let sceneId: string | null = null;
let narradorEmail: string | null = null;
let narradorSenha: string | null = null;
let jogadorEmail: string | null = null;
let jogadorSenha: string | null = null;
const criados = { usuarios: [] as string[], campanhas: [] as string[] };

async function configurarFixture(): Promise<{ tokenId: string }> {
  campaignId = randomUUID();
  const eNarrador = `check-vtt-camadas-narrador-${Date.now()}@ruptura.dev`;
  const sNarrador = randomUUID();
  const { data: dNarrador, error: errN } = await admin.auth.admin.createUser({ email: eNarrador, password: sNarrador, email_confirm: true, user_metadata: { display_name: "Narrador Camadas" } });
  if (errN) throw new Error(`Falha ao criar narrador: ${errN.message}`);
  narradorEmail = eNarrador; narradorSenha = sNarrador;
  criados.usuarios.push(dNarrador.user.id);

  await admin.from("campaigns").insert({ id: campaignId, name: "VTT Camadas Visuais", owner_id: dNarrador.user.id });
  criados.campanhas.push(campaignId);

  const { data: cena } = await admin.from("vtt_scenes").insert({ campaign_id: campaignId, nome: "Cena Camadas", largura: 16, altura: 16 }).select("id").single();
  sceneId = cena!.id as string;

  // Um JOGADOR de verdade na mesa — o painel de Camadas é decisão do
  // narrador e não pode nem aparecer pra ele.
  const eJogador = `check-vtt-camadas-jogador-${Date.now()}@ruptura.dev`;
  const sJogador = randomUUID();
  const { data: dJogador, error: errJ } = await admin.auth.admin.createUser({ email: eJogador, password: sJogador, email_confirm: true, user_metadata: { display_name: "Jogador Camadas" } });
  if (errJ) throw new Error(`Falha ao criar jogador: ${errJ.message}`);
  jogadorEmail = eJogador; jogadorSenha = sJogador;
  criados.usuarios.push(dJogador.user.id);
  await admin.from("campaign_members").insert({
    campaign_id: campaignId, user_id: dJogador.user.id, role: "player", status: "active", origem: "check_camadas",
  });

  // Terreno difícil bem debaixo/perto do token — prova o halo de contraste do rótulo "×2" sobre a hachura âmbar (mesma cor do texto sem halo).
  await admin.from("vtt_terrain").upsert({ scene_id: sceneId, campaign_id: campaignId, q: 8, r: 8, tipo: "dificil" });
  // Célula bloqueada (hachura vermelha) numa borda diferente do mesmo
  // token — variedade de terreno colorido/hachurado pra checar
  // legibilidade do halo frontal contra mais de um fundo.
  await admin.from("vtt_terrain").upsert({ scene_id: sceneId, campaign_id: campaignId, q: 7, r: 7, tipo: "bloqueado" });

  // Pior caso combinado: PV baixo (barra vermelha), condição, travado,
  // oculto (só narrador enxerga) — todos os "rótulos/indicadores"
  // competindo pelo mesmo token, orientação virada pra permitir setor
  // traseiro + cunha + alça no mesmo hover/seleção.
  const { data: tok, error: errT } = await admin.from("vtt_tokens").insert({
    scene_id: sceneId, campaign_id: campaignId, nome: "PiorCaso", sigla: "PC",
    lado: "pn", tamanho: "medio", orientacao: 3, q: 8, r: 7,
    visivel: false, bloqueado: true, pv_atual: 2, pv_max: 10, condicoes: ["sangrando"],
  }).select("id").single();
  if (errT) throw new Error(`Falha ao criar token fixture: ${errT.message}`);

  return { tokenId: tok!.id as string };
}

async function limpar() {
  if (campaignId) {
    await admin.from("campaign_members").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_terrain").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_tokens").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_scenes").delete().eq("campaign_id", campaignId);
    await admin.from("campaigns").delete().eq("id", campaignId);
  }
  for (const uid of criados.usuarios) await admin.auth.admin.deleteUser(uid);
  registrar("L (limpeza de fixtures)", true, `${criados.usuarios.length} usuário(s), ${criados.campanhas.length} campanha(s)`);
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
  return { context, page, close: () => browser.close() };
}

// Converte um ponto de MUNDO (o mesmo espaço de `hexParaPixel`) pra
// coordenadas de TELA reais via `getScreenCTM()` — nunca um pixel de
// tela fixo "chutado": o mapa tem zoom/pan próprios (`<g transform=
// "translate(pan) scale(zoom)">`) empilhados sobre o viewBox do `<svg>`,
// então um ponto de tela fixo pode cair sobre a barra de ferramentas ou
// qualquer outro chrome, não necessariamente sobre uma célula vazia do
// mapa (achado real: `page.mouse.click(40, 40)` caiu fora da área do
// mapa nesta viewport, deixando a seleção intocada e o critério
// reportando um falso "não desmarcou").
async function pontoMundoParaTela(page: Page, ponto: { x: number; y: number }): Promise<{ x: number; y: number }> {
  return page.evaluate(([px, py]) => {
    const svg = document.querySelector(".rv-mapa") as SVGSVGElement;
    const g = svg.querySelector(":scope > g") as SVGGElement;
    const pt = svg.createSVGPoint();
    pt.x = px as number; pt.y = py as number;
    const transformado = pt.matrixTransform(g.getScreenCTM()!);
    return { x: transformado.x, y: transformado.y };
  }, [ponto.x, ponto.y]);
}

async function main() {
  const { tokenId } = await configurarFixture();
  registrar("0 (fixture)", true, `campanha=${campaignId}, token=${tokenId}`);

  const { page, close } = await contextoDe(narradorEmail!, narradorSenha!);
  const erros: string[] = [];
  page.on("console", (m) => { if (erroRelevante(m)) erros.push(m.text().slice(0, 400)); });
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
  await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
  await page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();

  const tokenLocator = page.locator(`.rv-token[data-token-id="${tokenId}"]`);
  await tokenLocator.waitFor({ state: "visible", timeout: 5000 });

  // Seleciona clicando EXATAMENTE nas coordenadas de mundo da âncora do
  // token (onde a sigla é desenhada, `origemLocal` em MapaHex.tsx) — via
  // CTM real, nunca um pixel de tela "chutado". Prova ao mesmo tempo a
  // seleção (dispara setor traseiro + cunha + alça) e que nenhum
  // elemento decorativo por cima da sigla intercepta o clique.
  const pontoAncora = await pontoMundoParaTela(page, hexParaPixel({ q: 8, r: 7 }, TAM));
  await page.mouse.click(pontoAncora.x, pontoAncora.y);
  await page.waitForTimeout(150);

  // --- 1: ordem estrutural das 7 camadas conceituais, dentro do próprio token. ---
  // Em SVG, ordem no DOM = ordem de pintura: cada seletor abaixo precisa
  // aparecer em índice CRESCENTE (nunca empatado) na travessia em ordem
  // de documento, provando "traseiro/cunha/alça" (6) sempre ANTES de
  // "PV/condições/oculto/travado" (7 — rótulos, topo).
  // Nota: NUNCA extrair um helper nomeado (`const indiceDe = ...`) dentro
  // do callback — rodando via `tsx`, o esbuild injeta um wrapper `__name`
  // que não existe no browser (`ReferenceError: __name is not defined`).
  // Tudo inline, mesmo repetitivo. Achado real, já documentado noutro
  // script desta sessão (`check-campanha-casca-fase2.ts`).
  const ordemCamadas = await page.evaluate((tid) => {
    const g = document.querySelector(`.rv-token[data-token-id="${tid}"]`);
    if (!g) return null;
    const todos = Array.from(g.querySelectorAll("*"));
    return {
      base: todos.findIndex((el) => el.matches("circle")),
      sigla: todos.findIndex((el) => el.matches(".rv-token-sigla")),
      halo: todos.findIndex((el) => el.matches(".rv-token-halo-frontal")),
      orientacao: todos.findIndex((el) => el.matches(".rv-token-orientacao")),
      alca: todos.findIndex((el) => el.matches(".rv-token-alca-rotacao")),
      pv: todos.findIndex((el) => el.matches(".rv-token-pv")),
      oculto: todos.findIndex((el) => el.matches(".rv-token-oculto")),
      travado: todos.findIndex((el) => el.matches(".rv-token-travado")),
      condicoes: todos.findIndex((el) => el.matches(".rv-token-condicoes")),
    };
  }, tokenId);

  const c = ordemCamadas!;
  const todosPresentes = Object.values(c).every((i) => i !== null && i >= 0);
  registrar("1a (todos os elementos do cenário pior-caso estão presentes no DOM)", todosPresentes, JSON.stringify(c));

  const ordemIndicadoresAntesDeRotacao = c.base < c.sigla && c.sigla < c.halo && c.halo < c.orientacao && c.orientacao < c.alca;
  registrar(
    "1b (camada 4→5→6: base/sigla do token vêm antes do halo frontal, cunha e alça de rotação)",
    ordemIndicadoresAntesDeRotacao,
    `base=${c.base} sigla=${c.sigla} halo=${c.halo} orientacao=${c.orientacao} alca=${c.alca}`,
  );

  const rotacaoAntesDeRotulos = c.alca < c.pv && c.pv < c.oculto && c.oculto < c.travado && c.travado < c.condicoes;
  registrar(
    "1c (camada 6→7: alça de rotação vem ANTES de PV/oculto/travado/condições — rótulos sempre no topo, nunca escondidos atrás da rotação)",
    rotacaoAntesDeRotulos,
    `alca=${c.alca} pv=${c.pv} oculto=${c.oculto} travado=${c.travado} condicoes=${c.condicoes}`,
  );

  // --- 2: rótulos decorativos nunca interceptam clique — pointer-events:none confirmado por getComputedStyle, não só por leitura de código. ---
  const pointerEventsDecorativos = await page.evaluate((tid) => {
    const g = document.querySelector(`.rv-token[data-token-id="${tid}"]`)!;
    const sigla = g.querySelector(".rv-token-sigla");
    const cond = g.querySelector(".rv-token-cond");
    return {
      sigla: sigla ? getComputedStyle(sigla).pointerEvents : null,
      cond: cond ? getComputedStyle(cond).pointerEvents : null,
    };
  }, tokenId);
  registrar(
    "2 (sigla e glifo de condição são pointer-events:none — nunca roubam o clique de seleção do próprio token)",
    pointerEventsDecorativos.sigla === "none" && pointerEventsDecorativos.cond === "none",
    JSON.stringify(pointerEventsDecorativos),
  );

  // O clique inicial que selecionou o token (logo depois de abrir a
  // página) já foi disparado nas coordenadas EXATAS da âncora — onde a
  // sigla é desenhada (mesmo ponto de `origemLocal` em MapaHex.tsx),
  // via CTM real, nunca `locator.click()` (que centraliza sozinho na
  // bounding box, o que poderia mascarar exatamente o problema que
  // este critério existe pra pegar). Se algum elemento decorativo por
  // cima da sigla estivesse capturando o ponteiro, essa seleção nunca
  // teria acontecido. `is-sel` aqui prova que o clique chegou no token.
  const selecionadoPelaAncora = await tokenLocator.evaluate((el) => el.classList.contains("is-sel"));
  registrar(
    "2b (clique nas coordenadas EXATAS da sigla — onde um elemento decorativo por cima poderia interceptar — chega no token e o seleciona)",
    selecionadoPelaAncora,
    `is-sel=${selecionadoPelaAncora}`,
  );

  // --- 3: halo de contraste no rótulo "×2" de terreno difícil (mesma cor do texto e da hachura, sem halo seria ilegível). ---
  const haloTerreno = await page.evaluate(() => {
    const texto = document.querySelector(".rv-terreno-real--dificil text");
    if (!texto) return null;
    const cs = getComputedStyle(texto);
    return { paintOrder: (texto as SVGTextElement).getAttribute("paint-order"), stroke: cs.stroke, strokeWidth: cs.strokeWidth };
  });
  registrar(
    "3 (rótulo ×2 de terreno difícil tem halo — paint-order stroke-primeiro + contorno escuro — nunca a mesma cor pura da hachura por baixo)",
    !!haloTerreno && haloTerreno.paintOrder === "stroke fill" && haloTerreno.strokeWidth !== "0px",
    JSON.stringify(haloTerreno),
  );

  // --- 4: screenshot real do pior caso, salvo em disco pra inspeção visual (não só asserções estruturais). ---
  const caminhoPiorCaso = `${SCREENSHOT_DIR}/vtt-camadas-pior-caso.png`;
  await page.screenshot({ path: caminhoPiorCaso });
  registrar("4 (screenshot real do cenário pior-caso salvo em disco)", true, caminhoPiorCaso);

  // Zoom aproximado no próprio token, pra inspeção detalhada sem precisar recortar a imagem inteira depois.
  const boxFinal = await tokenLocator.boundingBox();
  if (boxFinal) {
    const pad = 40;
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/vtt-camadas-pior-caso-zoom.png`,
      clip: { x: Math.max(0, boxFinal.x - pad), y: Math.max(0, boxFinal.y - pad - 20), width: boxFinal.width + pad * 2, height: boxFinal.height + pad * 2 + 20 },
    });
    registrar("4b (recorte aproximado do token, screenshot real salvo em disco)", true, `${SCREENSHOT_DIR}/vtt-camadas-pior-caso-zoom.png`);
  }

  // --- 4c/4d: halo frontal em diferentes NÍVEIS DE ZOOM do mapa —
  // legibilidade real, não só a um zoom fixo. Zoom in (roda do mouse
  // sobre o token) e novo screenshot real. ---
  await page.mouse.move(400, 400);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(250);
  const caminhoZoomIn = `${SCREENSHOT_DIR}/vtt-camadas-halo-zoom-in.png`;
  await page.screenshot({ path: caminhoZoomIn });
  registrar("4c (screenshot real com zoom aumentado, pra checar legibilidade do halo ampliado)", true, caminhoZoomIn);

  await page.mouse.wheel(0, 900); // volta abaixo de 100% pra checar o oposto — halo pequeno/distante
  await page.waitForTimeout(250);
  const caminhoZoomOut = `${SCREENSHOT_DIR}/vtt-camadas-halo-zoom-out.png`;
  await page.screenshot({ path: caminhoZoomOut });
  registrar("4d (screenshot real com zoom reduzido, pra checar legibilidade do halo a distância)", true, caminhoZoomOut);

  registrar("console (nenhum erro/warning novo durante toda a sessão)", erros.length === 0, JSON.stringify(erros).slice(0, 2000));

  await close();

  // ─── Camadas é do NARRADOR ───
  // Esconder e travar camada decide o que está no tabuleiro e o que dá
  // pra mexer. Um jogador com esse controle estaria mandando na cena
  // pela porta dos fundos — então nem o botão da barra existe pra ele.
  {
    const jog = await contextoDe(jogadorEmail!, jogadorSenha!);
    await jog.page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
    await jog.page.waitForSelector('[data-testid="painel-vtt"]', { timeout: 20000 });
    const botaoJogador = await jog.page.locator('button[aria-label="Camadas do mapa"]').count();
    const janelaJogador = await jog.page.locator('section[aria-label="Camadas do mapa"]').count();
    registrar(
      "5 (Camadas não existe pro jogador — nem botão, nem janela)",
      botaoJogador === 0 && janelaJogador === 0,
      `botões=${botaoJogador}, janelas=${janelaJogador}`,
    );
    await jog.close();
  }

  // ─── O ajuste vale pra MESA ───
  // Camadas era preferência local: esconder Objetos escondia só da
  // própria tela, o oposto do que a ferramenta é. Agora o estado é da
  // cena (0093) — narrador ajusta, todo mundo obedece. E quem esconde
  // continua enxergando (atenuado), pelo mesmo princípio de
  // `vtt_tokens.visivel`.
  {
    const nar = await contextoDe(narradorEmail!, narradorSenha!);
    await nar.page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
    await nar.page.waitForSelector('[data-testid="painel-vtt"]', { timeout: 20000 });
    await nar.page.locator('button[aria-label="Camadas do mapa"]').click();
    await nar.page.waitForSelector('section[aria-label="Camadas do mapa"]', { timeout: 10000 });
    await nar.page.locator('button[aria-label="Ocultar camada Tokens"]').click();
    await nar.page.waitForTimeout(1200);

    const { data: cenaDepois } = await admin
      .from("vtt_scenes").select("camadas").eq("id", sceneId!).maybeSingle();
    const gravado = (cenaDepois?.camadas ?? {}) as Record<string, { visivel?: boolean }>;
    registrar(
      "6 (esconder uma camada grava na CENA, não no navegador de quem clicou)",
      gravado.tokens?.visivel === false,
      `vtt_scenes.camadas.tokens=${JSON.stringify(gravado.tokens)}`,
    );

    const estiloNarrador = await nar.page.locator(".rv-camada-tokens").first().evaluate((el) => {
      const s = getComputedStyle(el);
      return { display: s.display, opacity: s.opacity };
    });
    registrar(
      "7 (o narrador continua vendo o que escondeu, atenuado)",
      estiloNarrador.display !== "none" && Number(estiloNarrador.opacity) < 1,
      JSON.stringify(estiloNarrador),
    );
    // Camada de FERRAMENTA é diferente: escondida, some pro narrador
    // também. Esconder a grade e continuar vendo a grade não é esconder.
    await nar.page.locator('button[aria-label="Ocultar camada Grade"]').click();
    await nar.page.waitForTimeout(1000);
    const gradeNarrador = await nar.page.locator(".rv-camada-grade").first().evaluate((el) => {
      const s = getComputedStyle(el);
      return { display: s.display, opacity: s.opacity, visibility: s.visibility };
    }).catch(() => ({ display: "ausente", opacity: "0", visibility: "hidden" }));
    registrar(
      "7b (camada de ferramenta escondida some pro narrador também)",
      gradeNarrador.display === "none" || Number(gradeNarrador.opacity) === 0 || gradeNarrador.visibility === "hidden" || gradeNarrador.display === "ausente",
      JSON.stringify(gradeNarrador),
    );
    await nar.close();

    const jog2 = await contextoDe(jogadorEmail!, jogadorSenha!);
    await jog2.page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
    await jog2.page.waitForSelector('[data-testid="painel-vtt"]', { timeout: 20000 });
    await jog2.page.waitForTimeout(800);
    const displayJogador = await jog2.page.locator(".rv-camada-tokens").first()
      .evaluate((el) => getComputedStyle(el).display).catch(() => "ausente");
    registrar(
      "8 (pro jogador a camada escondida some de verdade)",
      displayJogador === "none" || displayJogador === "ausente",
      `display=${displayJogador}`,
    );
    await jog2.close();
  }

  // ─── Grade escondida = movimento livre ───
  // Com a grade oculta a mesa joga no olho, e o token saltando pro
  // centro do hex ao soltar denuncia uma grade que deveria não existir.
  // O deslocamento é SÓ desenho: a célula ocupada continua sendo a
  // âncora, e é ela que terreno, colisão e alcance enxergam.
  {
    const nar = await contextoDe(narradorEmail!, narradorSenha!);
    await nar.page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
    await nar.page.waitForSelector('[data-testid="painel-vtt"]', { timeout: 20000 });

    const { data: antes } = await admin
      .from("vtt_tokens").select("q, r, offset_q, offset_r").eq("campaign_id", campaignId).limit(1).maybeSingle();
    registrar(
      "9 (com a grade à vista, o token não carrega deslocamento)",
      Number(antes?.offset_q ?? 0) === 0 && Number(antes?.offset_r ?? 0) === 0,
      `offset=(${antes?.offset_q}, ${antes?.offset_r})`,
    );

    // A coluna existe, aceita fração e é presa a ±1 pelo servidor — o
    // clamp importa porque um offset grande desenharia o token longe da
    // célula que ele de fato ocupa, o que seria mentira na tela.
    const { error: erroForaDeFaixa } = await admin
      .from("vtt_tokens").update({ offset_q: 5 }).eq("campaign_id", campaignId);
    registrar(
      "10 (o banco recusa deslocamento maior que uma célula)",
      !!erroForaDeFaixa,
      erroForaDeFaixa ? "recusado" : "PASSOU (FALHA — aceitou offset fora de faixa)",
    );

    await nar.close();
  }

  await limpar();

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  process.exit(falhou > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("Erro fatal:", e);
  await limpar().catch(() => {});
  process.exit(1);
});
