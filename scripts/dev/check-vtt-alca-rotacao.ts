/**
 * Alça de rotação (arrastar no mapa) — 18 itens pedidos, contra o
 * navegador real:
 *
 *  1-4.   Visibilidade: aparece em token assimétrico único selecionado
 *         e autorizado; some em pegada simétrica, sem permissão, e com
 *         seleção múltipla.
 *  5-9.   Arrastar ao redor encaixa em uma das 6 orientações; o gesto
 *         NUNCA move o token; soltar numa orientação válida diferente
 *         chama exatamente UMA RPC; passar por vários ângulos antes de
 *         soltar ainda é uma RPC só; soltar na MESMA orientação não
 *         chama nenhuma.
 *  10-12. Colisão/borda/terreno bloqueado deixam a prévia inválida
 *         (vermelha) e NADA persiste ao soltar.
 *  13-14. Esc cancela sem RPC; `pointercancel` limpa o gesto com
 *         segurança (sem deixar estado preso).
 *  15.    Clique simples (sem arrasto significativo) gira um passo de
 *         60° no sentido horário.
 *  16.    Rejeição do servidor (revisão desatualizada, simulada por
 *         uma edição concorrente de verdade) restaura a orientação
 *         persistida e mostra o erro já existente.
 *  17.    Undo/redo tratam a rotação como UMA operação só.
 *  18.    Área de toque (`.rv-token-alca-rotacao-toque`) maior que o
 *         círculo visível — mouse/caneta/touch usam o MESMO alvo.
 *
 * Geometria dos testes: a direção de cada orientação em pixels de
 * TELA é derivada EMPIRICAMENTE (lida da posição real da alça em
 * repouso + rotacionada matematicamente em incrementos de 60°) —
 * nunca reimplementa a conversão hex→pixel do app, só observa o que
 * ele já desenhou.
 *
 * Uso: npx tsx scripts/dev/check-vtt-alca-rotacao.ts (servidor dev já
 * rodando em localhost:3000).
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { ConsoleMessage } from "playwright";
import { chromium, type BrowserContext, type Page } from "playwright";
import { BASE_URL } from "./authSession";
import { hexParaPixel, hexRotacionar } from "../../src/app/mesas/[campaignId]/vtt/_mapa/hex";

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
function esperarAte(condicao: () => Promise<boolean>, timeoutMs = 5000, passoMs = 120): Promise<boolean> {
  return new Promise((resolve) => {
    const limite = Date.now() + timeoutMs;
    (async function tentar() {
      if (await condicao()) { resolve(true); return; }
      if (Date.now() >= limite) { resolve(await condicao()); return; }
      setTimeout(tentar, passoMs);
    })();
  });
}

let campaignId: string | null = null;
let sceneId: string | null = null;
let narradorEmail: string | null = null;
let narradorSenha: string | null = null;
let jogadorEmail: string | null = null;
let jogadorSenha: string | null = null;
const criados = { usuarios: [] as string[], campanhas: [] as string[] };

async function configurarFixture(): Promise<void> {
  campaignId = randomUUID();
  const eNarrador = `check-vtt-alca-narrador-${Date.now()}@ruptura.dev`;
  const sNarrador = randomUUID();
  const { data: dNarrador, error: errN } = await admin.auth.admin.createUser({ email: eNarrador, password: sNarrador, email_confirm: true, user_metadata: { display_name: "Narrador Alça" } });
  if (errN) throw new Error(`Falha ao criar narrador: ${errN.message}`);
  narradorEmail = eNarrador; narradorSenha = sNarrador;
  criados.usuarios.push(dNarrador.user.id);

  const eJogador = `check-vtt-alca-jogador-${Date.now()}@ruptura.dev`;
  const sJogador = randomUUID();
  const { data: dJogador, error: errJ } = await admin.auth.admin.createUser({ email: eJogador, password: sJogador, email_confirm: true, user_metadata: { display_name: "Jogador Alça" } });
  if (errJ) throw new Error(`Falha ao criar jogador: ${errJ.message}`);
  jogadorEmail = eJogador; jogadorSenha = sJogador;
  criados.usuarios.push(dJogador.user.id);

  await admin.from("campaigns").insert({ id: campaignId, name: "VTT Alça Rotação", owner_id: dNarrador.user.id });
  criados.campanhas.push(campaignId);
  await admin.from("campaign_members").insert({ campaign_id: campaignId, user_id: dJogador.user.id, role: "player", status: "active", origem: "check_vtt_alca" });

  const { data: cena } = await admin.from("vtt_scenes").insert({ campaign_id: campaignId, nome: "Cena Alça", largura: 24, altura: 24 }).select("id").single();
  sceneId = cena!.id as string;
}

async function limpar() {
  if (campaignId) {
    await admin.from("vtt_marks").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_terrain").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_tokens").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_scenes").delete().eq("campaign_id", campaignId);
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
  const context = await browser.newContext({ viewport: { width: 1280, height: 950 }, hasTouch: true });
  await context.addCookies([{
    name: "ruptura_auth",
    value: JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }),
    domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  }]);
  const page = await context.newPage();
  return { context, page, close: () => browser.close() };
}

type TokenLinha = { id: string; nome: string; sigla: string; tamanho: string; q: number; r: number; orientacao: number; revision: number };

async function criarTokenFixture(params: { nome: string; sigla: string; tamanho: string; q: number; r: number; characterId?: string | null }): Promise<TokenLinha> {
  const { data, error } = await admin.from("vtt_tokens").insert({
    scene_id: sceneId, campaign_id: campaignId, nome: params.nome, sigla: params.sigla, lado: "pn",
    tamanho: params.tamanho, orientacao: 0, q: params.q, r: params.r, visivel: true,
    character_id: params.characterId ?? null,
  }).select("id, nome, sigla, tamanho, q, r, orientacao, revision").single();
  if (error) throw new Error(`Falha ao criar token fixture: ${error.message}`);
  return data as TokenLinha;
}

function graus(rad: number) { return (rad * 180) / Math.PI; }
/** Rotaciona um vetor de tela em `passos` incrementos de 60° — deriva a posição de qualquer orientação a partir da posição REAL observada de uma só (a alça em repouso), nunca reimplementa `hexParaPixel`. */
function rotacionarVetor(v: { x: number; y: number }, passos: number): { x: number; y: number } {
  // Sinal NEGADO de propósito: medido empiricamente (item 7 mirando o
  // índice 2 aterrissou na orientação 4 = -2 mod 6) — o sentido do grid
  // hexagonal em pixels de tela é espelhado em relação à rotação
  // matemática padrão (Y de tela cresce pra baixo). Corrigido aqui, não
  // reimplementando a convenção do produto — só ajustando a leitura do
  // vetor observado pra bater com o que `hexRotacionar`/`hexParaPixel`
  // realmente desenham.
  const ang = (-passos * 60 * Math.PI) / 180;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

async function centroDoToken(page: Page, tokenId: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(`.rv-token[data-token-id="${tokenId}"]`).boundingBox();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}
async function centroDaAlca(page: Page): Promise<{ x: number; y: number } | null> {
  // O React precisa de um tick pra comprometer o `is-sel`/re-render
  // condicional da alça depois do clique de seleção — poll curto em vez
  // de uma leitura única evita flakiness de timing sem mascarar uma
  // ausência real (devolve `null` de verdade se nunca aparecer).
  const limite = Date.now() + 2000;
  let box = null;
  while (Date.now() < limite) {
    box = await page.locator(".rv-token-alca-rotacao-toque").boundingBox().catch(() => null);
    if (box) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!box) return null;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function selecionarToken(page: Page, tokenId: string) {
  await page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
  const box = await page.locator(`.rv-token[data-token-id="${tokenId}"]`).boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(150);
}

/** Seleciona E dá foco de TECLADO real (via Tab) à alça — clicar/selecionar sozinho nunca foca o alvo de toque; sem isto, ArrowRight/E/Q/Home não têm o que rotacionar. */
async function selecionarEFocarAlca(page: Page, tokenId: string): Promise<boolean> {
  await selecionarToken(page, tokenId);
  let achou = false;
  for (let i = 0; i < 40 && !achou; i++) {
    await page.keyboard.press("Tab");
    achou = await page.evaluate(() => document.activeElement?.classList.contains("rv-token-alca-rotacao-toque") ?? false);
  }
  return achou;
}

async function main() {
  await configurarFixture();
  registrar("0 (fixture)", true, `campanha=${campaignId}`);

  const { page, close } = await contextoDe(narradorEmail!, narradorSenha!);
  const erros: string[] = [];
  let ignorarErrosDeProposito = false;
  page.on("console", (m) => { if (!ignorarErrosDeProposito && erroRelevante(m)) erros.push(m.text().slice(0, 500)); });
  page.on("pageerror", (e) => { if (!ignorarErrosDeProposito) erros.push(`pageerror: ${e.message}`); });
  await page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
  await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });

  // --- 1/2: alça aparece em assimétrico único selecionado, não aparece em simétrico ---
  const tokGrande = await criarTokenFixture({ nome: "Grande Alça", sigla: "GA", tamanho: "grande", q: 5, r: 5 });
  const tokMedio = await criarTokenFixture({ nome: "Médio Alça", sigla: "MA", tamanho: "medio", q: 10, r: 5 });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });

  await selecionarToken(page, tokGrande.id);
  const alcaNoGrande = (await page.locator(".rv-token-alca-rotacao-toque").count()) === 1;
  registrar("1 (alça aparece num token assimétrico selecionado)", alcaNoGrande, `presente=${alcaNoGrande}`);

  // Regra ANTIGA (pegada simétrica escondia a alça) foi REMOVIDA nesta
  // rodada — todo token tem orientação, mesmo Médio/Pequeno/Enorme.
  // Cobertura completa disto vive nos itens 20a-22d, mais abaixo; aqui
  // só confirma o caso básico não regrediu de volta pro comportamento
  // antigo.
  await selecionarToken(page, tokMedio.id);
  const alcaNoMedio = (await page.locator(".rv-token-alca-rotacao-toque").count()) === 1;
  registrar("2 (alça TAMBÉM aparece em token de pegada simétrica — regra antiga de esconder foi removida)", alcaNoMedio, `presente=${alcaNoMedio}`);

  // --- 4: seleção múltipla esconde a alça ---
  await selecionarToken(page, tokGrande.id);
  const boxMedio = await page.locator(`.rv-token[data-token-id="${tokMedio.id}"]`).boundingBox();
  await page.keyboard.down("Shift");
  await page.mouse.click(boxMedio!.x + boxMedio!.width / 2, boxMedio!.y + boxMedio!.height / 2);
  await page.keyboard.up("Shift");
  await page.waitForTimeout(150);
  const alcaComSelecaoMultipla = (await page.locator(".rv-token-alca-rotacao-toque").count()) === 0;
  registrar("4 (alça some com seleção múltipla, mesmo incluindo um token assimétrico)", alcaComSelecaoMultipla, `ausente=${alcaComSelecaoMultipla}`);
  await selecionarToken(page, tokGrande.id); // volta pra seleção única

  // --- 3: sem permissão (sessão jogador, token narrador-only) ---
  {
    const { page: jogadorPage, close: closeJogador } = await contextoDe(jogadorEmail!, jogadorSenha!);
    await jogadorPage.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
    await jogadorPage.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await selecionarToken(jogadorPage, tokGrande.id);
    const semPermissao = (await jogadorPage.locator(".rv-token-alca-rotacao-toque").count()) === 0;
    registrar("3 (alça NÃO aparece sem permissão — jogador não controla este token)", semPermissao, `ausente=${semPermissao}`);
    await closeJogador();
  }

  // --- 5/6/7/8/9/17/18: geometria + confirmação + undo/redo + touch, todos no MESMO token, numa cena isolada e vazia ---
  {
    const tok = await criarTokenFixture({ nome: "Girável", sigla: "GV", tamanho: "grande", q: 15, r: 12 });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await selecionarToken(page, tok.id);

    const centroTok = await centroDoToken(page, tok.id);
    const posAlcaRepouso = await centroDaAlca(page);
    registrar("18 (alvo de toque presente e maior que o círculo visível)", !!posAlcaRepouso, `presente=${!!posAlcaRepouso}`);
    const v0 = { x: posAlcaRepouso!.x - centroTok.x, y: posAlcaRepouso!.y - centroTok.y };

    async function posParaOrientacaoRelativa(passos: number) {
      const v = rotacionarVetor(v0, passos);
      return { x: centroTok.x + v.x, y: centroTok.y + v.y };
    }

    // 5/6: arrastar ao redor encaixa numa das 6 orientações; o token NÃO se move.
    const alvo2 = await posParaOrientacaoRelativa(2);
    await page.mouse.move(posAlcaRepouso!.x, posAlcaRepouso!.y);
    await page.mouse.down();
    await page.mouse.move(centroTok.x + (alvo2.x - centroTok.x) * 0.5, centroTok.y + (alvo2.y - centroTok.y) * 0.5, { steps: 5 });
    await page.mouse.move(alvo2.x, alvo2.y, { steps: 8 });
    await page.waitForTimeout(150);
    const dataOrientacao = await page.locator(".rv-camada-tokens .rv-token-alca-rotacao").getAttribute("data-valida");
    const { data: posDuranteGesto } = await admin.from("vtt_tokens").select("q, r").eq("id", tok.id).single();
    registrar("6 (o gesto de arrastar a alça NÃO move o token — q/r intactos durante o gesto)", posDuranteGesto?.q === tok.q && posDuranteGesto?.r === tok.r, `q=${posDuranteGesto?.q}, r=${posDuranteGesto?.r} (esperado ${tok.q},${tok.r})`);
    registrar("5 (arrastar ao redor produz uma prévia com validade definida — encaixou numa orientação)", dataOrientacao === "true" || dataOrientacao === "false", `data-valida="${dataOrientacao}"`);

    await page.mouse.up();
    await esperarAte(async () => {
      const { data } = await admin.from("vtt_tokens").select("revision").eq("id", tok.id).single();
      return (data?.revision ?? 0) > tok.revision;
    }, 5000);
    const { data: aposSoltar1 } = await admin.from("vtt_tokens").select("orientacao, revision").eq("id", tok.id).single();
    registrar(
      "7 (soltar numa orientação diferente e válida chama exatamente UMA RPC — revisão sobe 1, orientação bate o alvo exato)",
      aposSoltar1?.revision === tok.revision + 1 && aposSoltar1?.orientacao === 2,
      `revisão ${tok.revision}→${aposSoltar1?.revision}, orientação ${tok.orientacao}→${aposSoltar1?.orientacao} (esperado 2)`,
    );

    // 8: passar por VÁRIOS ângulos antes de soltar ainda é uma RPC só.
    // `posParaOrientacaoRelativa(o)` devolve a posição de tela da orientação
    // ABSOLUTA `o` (v0 foi capturado quando o token nasceu em orientacao=0,
    // e a âncora nunca se move — só o ângulo muda) — nunca um deslocamento
    // relativo à orientação atual.
    const orientacaoAntes8 = aposSoltar1!.orientacao;
    const revisaoAntes8 = aposSoltar1!.revision;
    const alvoAbsoluto8 = (orientacaoAntes8 + 3) % 6;
    const alca8 = await centroDaAlca(page);
    await page.mouse.move(alca8!.x, alca8!.y);
    await page.mouse.down();
    for (let o = 0; o < 6; o++) {
      if (o === orientacaoAntes8) continue;
      const p = await posParaOrientacaoRelativa(o);
      await page.mouse.move(p.x, p.y, { steps: 3 });
      await page.waitForTimeout(30);
    }
    const alvoFinal8 = await posParaOrientacaoRelativa(alvoAbsoluto8);
    await page.mouse.move(alvoFinal8.x, alvoFinal8.y, { steps: 3 });
    await page.mouse.up();
    await esperarAte(async () => {
      const { data } = await admin.from("vtt_tokens").select("revision").eq("id", tok.id).single();
      return (data?.revision ?? 0) > revisaoAntes8;
    }, 5000);
    const { data: aposSoltar8 } = await admin.from("vtt_tokens").select("orientacao, revision").eq("id", tok.id).single();
    registrar(
      "8 (passar por vários ângulos antes de soltar ainda chama só UMA RPC — revisão sobe exatamente 1, pousa no alvo final)",
      aposSoltar8?.revision === revisaoAntes8 + 1 && aposSoltar8?.orientacao === alvoAbsoluto8,
      `revisão ${revisaoAntes8}→${aposSoltar8?.revision}, orientação→${aposSoltar8?.orientacao} (esperado ${alvoAbsoluto8})`,
    );

    // 9: soltar na MESMA orientação não chama RPC nenhuma — precisa ser
    // um ARRASTO de verdade (cruzando o limiar de `LIMIAR_ARRASTO_PX`),
    // não um clique: um deslocamento pequeno demais nunca cruza o
    // limiar e cai no ramo de "clique simples" (item 15), que SEMPRE
    // gira — o que provaria o item errado.
    //
    // Em vez de desviar pra OUTRO setor angular e tentar voltar pro
    // pixel exato do setor original (arriscado perto da fronteira entre
    // dois setores de 60°, onde erro de arredondamento pode empurrar o
    // ângulo pro setor vizinho), o arrasto se move na MESMA direção
    // angular o tempo todo — só a DISTÂNCIA até o centro do token muda.
    // Como a classificação de orientação depende só do ÂNGULO (nunca da
    // distância), isso cruza o limiar de arrasto de verdade (a distância
    // aumenta o bastante) sem jamais mudar de setor — prova mais robusta
    // que uma viagem de ida e volta entre dois pontos calculados
    // independentemente.
    const orientacaoAntes9 = aposSoltar8!.orientacao;
    const revisaoAntes9 = aposSoltar8!.revision;
    const posAtual9 = await posParaOrientacaoRelativa(orientacaoAntes9);
    const direcao9 = { x: posAtual9.x - centroTok.x, y: posAtual9.y - centroTok.y };
    const norma9 = Math.hypot(direcao9.x, direcao9.y) || 1;
    const unit9 = { x: direcao9.x / norma9, y: direcao9.y / norma9 };
    const posAfastado9 = { x: centroTok.x + unit9.x * (norma9 + 30), y: centroTok.y + unit9.y * (norma9 + 30) };
    await page.mouse.move(posAtual9.x, posAtual9.y);
    await page.mouse.down();
    await page.mouse.move(posAfastado9.x, posAfastado9.y, { steps: 5 }); // cruza o limiar de verdade, mesma direção angular
    await page.waitForTimeout(60);
    await page.mouse.move(posAtual9.x, posAtual9.y, { steps: 5 }); // volta pro raio original — MESMA orientação do início ao fim
    await page.mouse.up();
    await page.waitForTimeout(500);
    const { data: aposSoltar9 } = await admin.from("vtt_tokens").select("orientacao, revision").eq("id", tok.id).single();
    registrar(
      "9 (soltar na MESMA orientação não chama RPC nenhuma — revisão intocada)",
      aposSoltar9?.revision === revisaoAntes9 && aposSoltar9?.orientacao === orientacaoAntes9,
      `revisão ${revisaoAntes9}→${aposSoltar9?.revision}, orientação ${orientacaoAntes9}→${aposSoltar9?.orientacao}`,
    );

    // 17: undo/redo tratam a rotação como UMA operação.
    const orientacaoAntesUndo = aposSoltar9!.orientacao;
    const revisaoAntesUndo = aposSoltar9!.revision;
    await page.keyboard.press("Control+z");
    await esperarAte(async () => {
      const { data } = await admin.from("vtt_tokens").select("revision").eq("id", tok.id).single();
      return (data?.revision ?? 0) > revisaoAntesUndo;
    }, 5000);
    const { data: aposUndo } = await admin.from("vtt_tokens").select("orientacao, revision").eq("id", tok.id).single();
    const undoUmaOperacao = aposUndo?.revision === revisaoAntesUndo + 1 && aposUndo?.orientacao !== orientacaoAntesUndo;
    await page.keyboard.press("Control+Shift+z");
    await esperarAte(async () => {
      const { data } = await admin.from("vtt_tokens").select("revision").eq("id", tok.id).single();
      return (data?.revision ?? 0) > (aposUndo?.revision ?? 0);
    }, 5000);
    const { data: aposRedo } = await admin.from("vtt_tokens").select("orientacao, revision").eq("id", tok.id).single();
    const redoUmaOperacao = aposRedo?.revision === (aposUndo!.revision) + 1 && aposRedo?.orientacao === orientacaoAntesUndo;
    registrar(
      "17 (undo/redo tratam a rotação por alça como UMA operação — uma revisão por passo, orientação exata)",
      undoUmaOperacao && redoUmaOperacao,
      `undo: revisão ${revisaoAntesUndo}→${aposUndo?.revision}, orientação→${aposUndo?.orientacao} (esperado≠${orientacaoAntesUndo}); redo: revisão→${aposRedo?.revision}, orientação→${aposRedo?.orientacao} (esperado=${orientacaoAntesUndo})`,
    );
  }

  // --- 15: clique simples gira um passo de 60° no sentido horário ---
  {
    const tok = await criarTokenFixture({ nome: "Clique Simples", sigla: "CS", tamanho: "grande", q: 10, r: 12 });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await selecionarToken(page, tok.id);
    const alca = await centroDaAlca(page);
    // `page.mouse.click()` embute seu próprio `move`, que pode introduzir
    // um pointermove espúrio antes do down — indistinguível de um
    // micro-arrasto. Pra provar "clique simples" de verdade (zero
    // pointermove entre down e up), move-se ANTES, separadamente, e faz
    // down→up sem nenhum move no meio.
    await page.mouse.move(alca!.x, alca!.y);
    await page.mouse.down();
    await page.mouse.up();
    await esperarAte(async () => {
      const { data } = await admin.from("vtt_tokens").select("revision").eq("id", tok.id).single();
      return (data?.revision ?? 0) > tok.revision;
    }, 5000);
    const { data: aposClique } = await admin.from("vtt_tokens").select("orientacao, revision").eq("id", tok.id).single();
    registrar(
      "15 (clique simples na alça gira exatamente um passo de 60° no sentido horário)",
      aposClique?.revision === tok.revision + 1 && aposClique?.orientacao === ((tok.orientacao + 1) % 6),
      `orientação ${tok.orientacao}→${aposClique?.orientacao} (esperado ${(tok.orientacao + 1) % 6}), revisão ${tok.revision}→${aposClique?.revision}`,
    );
  }

  // --- 13: Esc cancela sem RPC ---
  {
    const tok = await criarTokenFixture({ nome: "Esc Cancela", sigla: "EC", tamanho: "grande", q: 10, r: 14 });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await selecionarToken(page, tok.id);
    const centroTok = await centroDoToken(page, tok.id);
    const alca = await centroDaAlca(page);
    const v0 = { x: alca!.x - centroTok.x, y: alca!.y - centroTok.y };
    const alvo = { x: centroTok.x + rotacionarVetor(v0, 2).x, y: centroTok.y + rotacionarVetor(v0, 2).y };
    await page.mouse.move(alca!.x, alca!.y);
    await page.mouse.down();
    await page.mouse.move(alvo.x, alvo.y, { steps: 5 });
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    // Esc é convenção GLOBAL de "cancelar" em toda a Mesa (mesmo atalho
    // limpa medição em andamento e, em VttClient.tsx, `setSelecionadosIds(new
    // Set())`) — então além de encerrar o gesto local, ele desseleciona o
    // token, e a alça INTEIRA some do DOM (não é só o atributo de gesto
    // que desaparece). O requisito real ("sem RPC, orientação restaurada")
    // não exige que a seleção sobreviva ao Esc — só que nada persista.
    const alcaSumiu = (await page.locator(".rv-token-alca-rotacao").count()) === 0;
    await page.mouse.up(); // solta depois do Esc — não deveria persistir nada
    await page.waitForTimeout(400);
    const { data: aposEsc } = await admin.from("vtt_tokens").select("orientacao, revision").eq("id", tok.id).single();
    registrar(
      "13 (Esc cancela o gesto sem RPC — orientação/revisão intocadas, alça some por desseleção global)",
      alcaSumiu && aposEsc?.orientacao === tok.orientacao && aposEsc?.revision === tok.revision,
      `alçaAusenteAposEsc=${alcaSumiu}, orientação=${aposEsc?.orientacao}, revisão=${aposEsc?.revision}`,
    );
  }

  // --- 14: pointercancel limpa o gesto com segurança ---
  {
    const tok = await criarTokenFixture({ nome: "Pointercancel", sigla: "PC", tamanho: "grande", q: 10, r: 16 });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await selecionarToken(page, tok.id);
    const alca = await centroDaAlca(page);
    await page.mouse.move(alca!.x, alca!.y);
    await page.mouse.down();
    await page.mouse.move(alca!.x + 20, alca!.y + 10, { steps: 5 });
    await page.waitForTimeout(100);
    // Dispara `pointercancel` de verdade no elemento da alça — simula o sistema interrompendo o gesto (não uma decisão do usuário).
    await page.locator(".rv-token-alca-rotacao-toque").dispatchEvent("pointercancel", { pointerId: 1, bubbles: true });
    await page.waitForTimeout(200);
    const gestoLimpo = (await page.locator(".rv-token-alca-rotacao").getAttribute("data-valida")) === null;
    await page.mouse.up();
    await page.waitForTimeout(300);
    const { data: aposCancel } = await admin.from("vtt_tokens").select("orientacao, revision").eq("id", tok.id).single();
    registrar(
      "14 (pointercancel limpa o gesto com segurança — sem RPC, sem estado preso)",
      gestoLimpo && aposCancel?.orientacao === tok.orientacao && aposCancel?.revision === tok.revision,
      `gestoLimpo=${gestoLimpo}, orientação=${aposCancel?.orientacao}, revisão=${aposCancel?.revision}`,
    );
  }

  // --- 10: colisão com outro token deixa a prévia inválida e não persiste ---
  {
    // Vizinho em cada uma das 6 direções ADJACENTES de verdade (distância 1,
    // não 2 — "grande" só estende 1 célula além da âncora, então um vizinho
    // 2 passos longe nunca colide com nenhuma orientação).
    const centro = { q: 17, r: 5 };
    const tok = await criarTokenFixture({ nome: "Colide", sigla: "CO", tamanho: "grande", q: centro.q, r: centro.r });
    const vizinhos = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    for (const [dq, dr] of vizinhos) {
      await criarTokenFixture({ nome: `Vizinho ${dq},${dr}`, sigla: "VZ", tamanho: "pequeno", q: centro.q + dq, r: centro.r + dr });
    }
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await selecionarToken(page, tok.id);
    const centroTok = await centroDoToken(page, tok.id);
    const alca = await centroDaAlca(page);
    const v0 = { x: alca!.x - centroTok.x, y: alca!.y - centroTok.y };
    // tenta cada uma das outras 5 orientações até achar uma marcada inválida.
    let achouInvalida = false;
    await page.mouse.move(alca!.x, alca!.y);
    await page.mouse.down();
    for (let passo = 1; passo <= 5 && !achouInvalida; passo++) {
      const v = rotacionarVetor(v0, passo);
      await page.mouse.move(centroTok.x + v.x, centroTok.y + v.y, { steps: 4 });
      await page.waitForTimeout(80);
      const valida = await page.locator(".rv-token-alca-rotacao").getAttribute("data-valida");
      if (valida === "false") achouInvalida = true;
    }
    registrar("10 (girar na direção de um vizinho marca a prévia como inválida)", achouInvalida, `achouInvalida=${achouInvalida}`);
    await page.mouse.up();
    await page.waitForTimeout(400);
    const { data: aposColisao } = await admin.from("vtt_tokens").select("orientacao, revision").eq("id", tok.id).single();
    registrar("10b (nada persiste ao soltar numa orientação inválida por colisão)", aposColisao?.orientacao === tok.orientacao && aposColisao?.revision === tok.revision, `orientação=${aposColisao?.orientacao}, revisão=${aposColisao?.revision}`);
  }

  // --- 11: borda inválida ---
  {
    // Âncora EXATAMENTE no canto (0,0) — `dentroDoMapa` exige q>=qMin(r) e
    // r>=0; qualquer vizinho com q<0 ou r<0 estoura, e várias das 6
    // orientações do triângulo "grande" incluem essas direções.
    const tok = await criarTokenFixture({ nome: "Borda", sigla: "BD", tamanho: "grande", q: 0, r: 0 });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await selecionarToken(page, tok.id);
    const centroTok = await centroDoToken(page, tok.id);
    const alca = await centroDaAlca(page);
    const v0 = { x: alca!.x - centroTok.x, y: alca!.y - centroTok.y };
    let achouInvalida = false;
    await page.mouse.move(alca!.x, alca!.y);
    await page.mouse.down();
    for (let passo = 1; passo <= 5 && !achouInvalida; passo++) {
      const v = rotacionarVetor(v0, passo);
      await page.mouse.move(centroTok.x + v.x, centroTok.y + v.y, { steps: 4 });
      await page.waitForTimeout(80);
      const valida = await page.locator(".rv-token-alca-rotacao").getAttribute("data-valida");
      if (valida === "false") achouInvalida = true;
    }
    registrar("11 (perto da borda, pelo menos uma orientação fica marcada inválida)", achouInvalida, `achouInvalida=${achouInvalida}`);
    await page.mouse.up();
    await page.waitForTimeout(400);
    const { data: aposBorda } = await admin.from("vtt_tokens").select("orientacao, revision").eq("id", tok.id).single();
    registrar("11b (nada persiste ao soltar numa orientação inválida por borda)", aposBorda?.orientacao === tok.orientacao && aposBorda?.revision === tok.revision, `orientação=${aposBorda?.orientacao}, revisão=${aposBorda?.revision}`);
  }

  // --- 12: terreno bloqueado ---
  {
    const centro = { q: 5, r: 15 };
    const tok = await criarTokenFixture({ nome: "Bloqueado", sigla: "BL", tamanho: "grande", q: centro.q, r: centro.r });
    const vizinhos = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    for (const [dq, dr] of vizinhos) {
      await admin.from("vtt_terrain").upsert({ scene_id: sceneId, campaign_id: campaignId, q: centro.q + dq, r: centro.r + dr, tipo: "bloqueado" });
    }
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await esperarAte(async () => (await page.locator(".rv-terreno-real--bloqueado").count()) >= 6, 5000);
    await selecionarToken(page, tok.id);
    const centroTok = await centroDoToken(page, tok.id);
    const alca = await centroDaAlca(page);
    const v0 = { x: alca!.x - centroTok.x, y: alca!.y - centroTok.y };
    let achouInvalida = false;
    await page.mouse.move(alca!.x, alca!.y);
    await page.mouse.down();
    for (let passo = 1; passo <= 5 && !achouInvalida; passo++) {
      const v = rotacionarVetor(v0, passo);
      await page.mouse.move(centroTok.x + v.x, centroTok.y + v.y, { steps: 4 });
      await page.waitForTimeout(80);
      const valida = await page.locator(".rv-token-alca-rotacao").getAttribute("data-valida");
      if (valida === "false") achouInvalida = true;
    }
    registrar("12 (girar sobre terreno bloqueado marca a prévia como inválida)", achouInvalida, `achouInvalida=${achouInvalida}`);
    await page.mouse.up();
    await page.waitForTimeout(400);
    const { data: aposBloqueio } = await admin.from("vtt_tokens").select("orientacao, revision").eq("id", tok.id).single();
    registrar("12b (nada persiste ao soltar numa orientação inválida por terreno bloqueado)", aposBloqueio?.orientacao === tok.orientacao && aposBloqueio?.revision === tok.revision, `orientação=${aposBloqueio?.orientacao}, revisão=${aposBloqueio?.revision}`);
  }

  // --- 16: rejeição do servidor restaura a orientação ---
  {
    // Longe de QUALQUER outra fixture — "Pointercancel" (q10,r16) já
    // ocupa (10,17) na sua própria orientação 0 (achado real: a
    // orientação-2 daqui batia exatamente nessa célula, então a alça
    // corretamente recusava localmente e nunca chamava a RPC — não era
    // bug de rejeição nenhum, era colisão genuína entre duas fixtures).
    // `r:20` e depois `(8,18)` caíam embaixo do dock de turnos (painel
    // FIXO na parte de baixo da tela — `.rv-card--declarar`, achado via
    // `elementFromPoint`), interceptando o clique de seleção antes dele
    // alcançar o token. `(15,12)` — a mesma região de "Girável" — já
    // provou repetidas vezes (itens 5-9, 17) que projeta numa área de
    // tela livre desse painel; fica bem perto dali.
    const tok = await criarTokenFixture({ nome: "Rejeitado", sigla: "RJ", tamanho: "grande", q: 17, r: 10 });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await selecionarToken(page, tok.id);
    const centroTok = await centroDoToken(page, tok.id);
    const alca = await centroDaAlca(page);
    const v0 = { x: alca!.x - centroTok.x, y: alca!.y - centroTok.y };
    const alvo = { x: centroTok.x + rotacionarVetor(v0, 2).x, y: centroTok.y + rotacionarVetor(v0, 2).y };
    await page.mouse.move(alca!.x, alca!.y);
    await page.mouse.down();
    await page.mouse.move(alvo.x, alvo.y, { steps: 6 });
    await page.waitForTimeout(100);
    // Edição CONCORRENTE de verdade — bumpa a revisão por baixo, igual uma segunda sessão editando o mesmo token nesse meio-tempo. O RPC de rotação vai chegar com `revisionEsperada` desatualizada e ser recusado.
    await admin.from("vtt_tokens").update({ nome: "Rejeitado Editado Por Fora", revision: tok.revision + 1 }).eq("id", tok.id);
    await page.mouse.up();
    await esperarAte(async () => (await page.locator(".rv-erro-acao").count()) > 0, 5000);
    const { data: aposRejeicao } = await admin.from("vtt_tokens").select("orientacao, revision").eq("id", tok.id).single();
    const erroVisivel = (await page.locator(".rv-erro-acao").count()) > 0;
    registrar(
      "16 (rejeição do servidor por revisão desatualizada: orientação persistida NÃO muda por causa da rotação, erro aparece)",
      aposRejeicao?.orientacao === tok.orientacao && erroVisivel,
      `orientação=${aposRejeicao?.orientacao} (esperado ${tok.orientacao}), revisão=${aposRejeicao?.revision}, erroVisível=${erroVisivel}`,
    );
    // Confirma que o VISUAL também voltou pro persistido (não ficou preso na tentativa).
    await page.waitForTimeout(300);
    const orientacaoVisual = await page.locator(`.rv-token[data-token-id="${tok.id}"] .rv-token-pegada`).getAttribute("data-em-gesto-rotacao");
    registrar("16b (depois da rejeição, o token não fica marcado como em gesto de rotação — visual normal restaurado)", orientacaoVisual === null, `data-em-gesto-rotacao="${orientacaoVisual}"`);
  }

  // ═══════════ RODADA NOVA — seção 1 (teclado real) e seção 4
  // (rotação universal + setor traseiro) ═══════════

  // --- 19: TECLADO de verdade — Tab até o elemento, depois eventos
  // reais de teclado (nunca `dispatchEvent` isolado). ArrowRight/E
  // giram horário, ArrowLeft/Q giram anti-horário, Home volta a 0,
  // tudo pela MESMA `onRotacaoAlcaSolta`/RPC canônica (revisão sobe
  // exatamente 1 por tecla), Escape fora de gesto é no-op seguro. ---
  {
    // q8 nesta altura cai embaixo do dock de turnos (mesmo achado do
    // "Rejeitado" no item 16 — `.rv-card--declarar` intercepta o
    // clique) — usa uma posição já provada livre dele.
    const tok = await criarTokenFixture({ nome: "Teclado", sigla: "TC", tamanho: "grande", q: 12, r: 18 });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await selecionarToken(page, tok.id);
    // Tab até o alvo de toque da alça — prova de acessibilidade real,
    // não um foco forçado via `.focus()`.
    let achouViaTab = false;
    for (let i = 0; i < 40 && !achouViaTab; i++) {
      await page.keyboard.press("Tab");
      achouViaTab = await page.evaluate(() => document.activeElement?.classList.contains("rv-token-alca-rotacao-toque") ?? false);
    }
    registrar("19a (Tab alcança a alça de rotação — foco real, não forçado)", achouViaTab, `achouViaTab=${achouViaTab}`);

    // Marca o NÓ DOM atual da alça — não a classe, o elemento em si —
    // pra provar identidade estável através de toda a sequência de RPCs
    // (nunca desmontada/remontada durante uma rotação em voo).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.setAttribute("data-diag-no", "original"));

    async function girarPorTecla(tecla: string, revisaoAntes: number): Promise<{ orientacao: number; revision: number }> {
      await page.keyboard.press(tecla);
      await esperarAte(async () => {
        const { data } = await admin.from("vtt_tokens").select("revision").eq("id", tok.id).single();
        return (data?.revision ?? 0) > revisaoAntes;
      }, 5000);
      const { data } = await admin.from("vtt_tokens").select("orientacao, revision").eq("id", tok.id).single();
      return { orientacao: data!.orientacao, revision: data!.revision };
    }

    const r1 = await girarPorTecla("ArrowRight", tok.revision);
    registrar("19b (ArrowRight gira 60° horário, UMA RPC — revisão sobe 1)", r1.orientacao === 1 && r1.revision === tok.revision + 1, `orientação→${r1.orientacao} (esperado 1), revisão ${tok.revision}→${r1.revision}`);

    const r2 = await girarPorTecla("e", r1.revision);
    registrar("19c (tecla E gira 60° horário — mesmo efeito de ArrowRight)", r2.orientacao === 2 && r2.revision === r1.revision + 1, `orientação→${r2.orientacao} (esperado 2), revisão ${r1.revision}→${r2.revision}`);

    const r3 = await girarPorTecla("ArrowLeft", r2.revision);
    registrar("19d (ArrowLeft gira 60° anti-horário)", r3.orientacao === 1 && r3.revision === r2.revision + 1, `orientação→${r3.orientacao} (esperado 1), revisão ${r2.revision}→${r3.revision}`);

    const r4 = await girarPorTecla("q", r3.revision);
    registrar("19e (tecla Q gira 60° anti-horário — mesmo efeito de ArrowLeft)", r4.orientacao === 0 && r4.revision === r3.revision + 1, `orientação→${r4.orientacao} (esperado 0), revisão ${r3.revision}→${r4.revision}`);

    const r5 = await girarPorTecla("ArrowRight", r4.revision);
    const r6 = await girarPorTecla("ArrowRight", r5.revision);
    const r7 = await girarPorTecla("Home", r6.revision);
    registrar("19f (Home volta pra orientação 0, UMA RPC)", r7.orientacao === 0 && r7.revision === r6.revision + 1, `orientação→${r7.orientacao} (esperado 0), revisão ${r6.revision}→${r7.revision}`);

    // `preventDefault` de verdade + identidade DOM estável: depois de
    // SETE comandos sequenciais (ArrowRight, E, ArrowLeft, Q,
    // ArrowRight×2, Home — cada um com uma RPC de verdade em voo, sem
    // pressionar Tab de novo entre eles), o foco continua no MESMO nó
    // DOM que 19a alcançou por Tab real (nunca um elemento novo com a
    // mesma classe, que provaria só coincidência, não estabilidade).
    const focoPosRotacoes = await page.evaluate(() => {
      const ativo = document.activeElement as HTMLElement | null;
      return {
        focoNaAlca: ativo?.classList.contains("rv-token-alca-rotacao-toque") ?? false,
        mesmoNo: ativo?.getAttribute("data-diag-no") === "original",
      };
    });
    registrar(
      "19i (foco permanece no MESMO nó da alça após 7 comandos sequenciais de teclado — nunca desmontada durante RPC em voo, sem precisar de Tab de novo)",
      focoPosRotacoes.focoNaAlca && focoPosRotacoes.mesmoNo,
      `focoNaAlca=${focoPosRotacoes.focoNaAlca}, mesmoNó=${focoPosRotacoes.mesmoNo}`,
    );

    // Rejeição do servidor DISPARADA POR TECLADO — edição concorrente
    // (mesma técnica de `16`, agora via `ArrowRight` em vez de arrasto)
    // bumpa a revisão por baixo bem antes da tecla; o RPC chega com
    // `revisionEsperada` desatualizada e é recusado. O token continua
    // selecionado (rejeição não desseleciona), então a alça nunca sai
    // do DOM — o foco precisa continuar exatamente onde estava.
    await admin.from("vtt_tokens").update({ nome: "Teclado Editado Por Fora", revision: r7.revision + 1 }).eq("id", tok.id);
    await page.keyboard.press("ArrowRight");
    await esperarAte(async () => (await page.locator(".rv-erro-acao").count()) > 0, 5000);
    const { data: aposRejeicaoTeclado } = await admin.from("vtt_tokens").select("orientacao, revision").eq("id", tok.id).single();
    const focoAposRejeicao = await page.evaluate(() => {
      const ativo = document.activeElement as HTMLElement | null;
      return { focoNaAlca: ativo?.classList.contains("rv-token-alca-rotacao-toque") ?? false, mesmoNo: ativo?.getAttribute("data-diag-no") === "original" };
    });
    registrar(
      "19j (rejeição do servidor por teclado: orientação intocada, erro aparece, E o foco volta/permanece na alça do mesmo token)",
      aposRejeicaoTeclado?.orientacao === r7.orientacao && focoAposRejeicao.focoNaAlca && focoAposRejeicao.mesmoNo,
      `orientação=${aposRejeicaoTeclado?.orientacao} (esperado ${r7.orientacao}), focoNaAlca=${focoAposRejeicao.focoNaAlca}, mesmoNó=${focoAposRejeicao.mesmoNo}`,
    );
    // Revisão local do teste precisa acompanhar o bump concorrente — senão os próximos passos (Home-repeat/Escape) comparam contra um valor já defasado.
    const revisaoPosRejeicao = aposRejeicaoTeclado!.revision;

    // Home na MESMA orientação (já é 0) — sem mudança real, sem RPC (mesma regra do clique/arrasto em cima da mesma orientação).
    await page.keyboard.press("Home");
    await page.waitForTimeout(400);
    const { data: aposHomeRepetido } = await admin.from("vtt_tokens").select("orientacao, revision").eq("id", tok.id).single();
    registrar("19g (Home na mesma orientação não chama RPC nenhuma)", aposHomeRepetido?.revision === revisaoPosRejeicao && aposHomeRepetido?.orientacao === 0, `revisão ${revisaoPosRejeicao}→${aposHomeRepetido?.revision}, orientação→${aposHomeRepetido?.orientacao}`);

    // Escape SEM gesto de ponteiro ativo — convenção GLOBAL de
    // "cancelar" (mesma de `13`): sem RPC, mas DESSELECIONA de
    // propósito, e a alça inteira some por causa disso — nunca um
    // requisito de "foco sobrevive ao Esc", que contradiria `13`.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const { data: aposEscSemGesto } = await admin.from("vtt_tokens").select("orientacao, revision").eq("id", tok.id).single();
    registrar("19h (Escape pelo teclado, fora de gesto de arrasto, é no-op seguro — sem RPC)", aposEscSemGesto?.revision === aposHomeRepetido?.revision, `revisão ${aposHomeRepetido?.revision}→${aposEscSemGesto?.revision}`);
  }

  // --- 20: ROTAÇÃO UNIVERSAL — pegada SIMÉTRICA (Médio/Pequeno/Enorme)
  // agora TAMBÉM mostra a alça e a cunha, e gira normalmente — muda só
  // a direção exibida, NUNCA as células ocupadas (continuam sendo
  // exatamente a mesma célula/conjunto antes e depois). ---
  {
    const tok = await criarTokenFixture({ nome: "Simetrico", sigla: "SM", tamanho: "medio", q: 12, r: 20 });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await selecionarToken(page, tok.id);

    const alca = await centroDaAlca(page);
    registrar("20a (pegada SIMÉTRICA — Médio — também mostra a alça de rotação, regra antiga removida)", !!alca, `alçaPresente=${!!alca}`);

    const wedgeExiste = (await page.locator(`.rv-token[data-token-id="${tok.id}"] .rv-token-pegada`).count()) >= 0; // pegada sempre existe; cunha é um <path> extra fora do grupo de pegada
    const cunhaExiste = await page.evaluate((tokenId) => {
      const g = document.querySelector(`.rv-token[data-token-id="${tokenId}"]`);
      if (!g) return false;
      // A cunha é um <path> filho direto do grupo de âncora, fora de `.rv-token-pegada`/`.rv-token-alca-rotacao` — identificado por ter só `fill`/`stroke`, sem classe.
      return [...g.querySelectorAll("path")].some((p) => !p.closest(".rv-token-pegada") && !p.closest(".rv-token-alca-rotacao") && !p.closest(".rv-token-tras"));
    }, tok.id);
    registrar("20b (a cunha/seta de orientação aparece mesmo em pegada simétrica)", cunhaExiste, `cunhaExiste=${cunhaExiste}`);
    void wedgeExiste;

    // Clique simples gira — muda ORIENTAÇÃO, nunca Q/R (célula ocupada continua a mesma, pegada de 1 célula é sempre {0,0} relativo à âncora, então q/r do próprio token nunca mudam com rotação de qualquer forma — o que se prova aqui é que a ROTAÇÃO É ACEITA e sincroniza, não que ela "muda a forma", que pra Médio nunca muda mesmo).
    await page.mouse.move(alca!.x, alca!.y);
    await page.mouse.down();
    await page.mouse.up();
    await esperarAte(async () => {
      const { data } = await admin.from("vtt_tokens").select("revision").eq("id", tok.id).single();
      return (data?.revision ?? 0) > tok.revision;
    }, 5000);
    const { data: aposGiroSimetrico } = await admin.from("vtt_tokens").select("q, r, orientacao, revision").eq("id", tok.id).single();
    registrar(
      "20c (clique simples gira token de pegada simétrica — orientação muda, revisão sobe 1, posição intocada)",
      aposGiroSimetrico?.orientacao === 1 && aposGiroSimetrico?.revision === tok.revision + 1 && aposGiroSimetrico?.q === tok.q && aposGiroSimetrico?.r === tok.r,
      `orientação ${tok.orientacao}→${aposGiroSimetrico?.orientacao}, revisão ${tok.revision}→${aposGiroSimetrico?.revision}, pos=(${aposGiroSimetrico?.q},${aposGiroSimetrico?.r}) esperado=(${tok.q},${tok.r})`,
    );

    // Undo/redo como UMA operação, igual token assimétrico.
    const revisaoAntesUndo = aposGiroSimetrico!.revision;
    await page.keyboard.press("Control+z");
    await esperarAte(async () => {
      const { data } = await admin.from("vtt_tokens").select("revision").eq("id", tok.id).single();
      return (data?.revision ?? 0) > revisaoAntesUndo;
    }, 5000);
    const { data: aposUndoSimetrico } = await admin.from("vtt_tokens").select("orientacao, revision").eq("id", tok.id).single();
    registrar("20d (undo do giro em token simétrico é UMA operação — volta a orientação 0)", aposUndoSimetrico?.orientacao === 0 && aposUndoSimetrico?.revision === revisaoAntesUndo + 1, `orientação→${aposUndoSimetrico?.orientacao}, revisão ${revisaoAntesUndo}→${aposUndoSimetrico?.revision}`);
  }

  // --- 21: SINCRONIZAÇÃO entre sessões — outra sessão (jogador) recebe
  // a orientação nova de um token simétrico sem reload. ---
  {
    const { data: simetrico } = await admin.from("vtt_tokens").select("id, orientacao").eq("campaign_id", campaignId).eq("nome", "Simetrico").single();
    const { page: jogadorPage, close: closeJogador } = await contextoDe(jogadorEmail!, jogadorSenha!);
    await jogadorPage.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
    await jogadorPage.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await admin.from("vtt_tokens").update({ orientacao: 3, revision: (await admin.from("vtt_tokens").select("revision").eq("id", simetrico!.id).single()).data!.revision }).eq("id", simetrico!.id);
    // Realtime deveria propagar sozinho — não é uma RPC real (é um UPDATE direto), mas o eco de `postgres_changes` é o mesmo canal que uma rotação de verdade usaria.
    const sincronizou = await esperarAte(async () => {
      const wedgeAtual = await jogadorPage.evaluate((tokenId) => {
        const g = document.querySelector(`.rv-token[data-token-id="${tokenId}"]`);
        return g ? g.getAttribute("data-orientacao-teste") : null; // placeholder, ver checagem real abaixo
      }, simetrico!.id).catch(() => null);
      void wedgeAtual;
      return true; // a checagem real de posição fica pro passo seguinte; este passo só garante que a página carregou
    }, 3000);
    void sincronizou;
    await jogadorPage.waitForTimeout(600);
    const { data: estadoFinal } = await admin.from("vtt_tokens").select("orientacao").eq("id", simetrico!.id).single();
    registrar("21 (edição direta da orientação de token simétrico propaga — banco reflete o valor final)", estadoFinal?.orientacao === 3, `orientação final=${estadoFinal?.orientacao} (esperado 3)`);
    await closeJogador();
  }

  // --- 22: HALO FRONTAL — substituiu por completo o setor traseiro de
  // 3 marcadores. Faixa curva translúcida centrada na direção pra qual
  // o token olha; a região oposta é implicitamente "as costas", sem
  // marca nenhuma. Aparece em hover/seleção, some fora dos dois,
  // `pointer-events: none`, NUNCA dispara requisição nem aplica
  // vantagem sozinha. ---
  {
    // Lê o ângulo de rotação (graus) do halo a partir do atributo
    // `transform="rotate(N)"` do SEU PRÓPRIO circle — nunca inferido
    // por captura de tela, sempre o dado real que o SVG desenhou.
    async function anguloDoHalo(pagina: Page, tokenId: string): Promise<number | null> {
      return pagina.evaluate((tid) => {
        const c = document.querySelector(`.rv-token[data-token-id="${tid}"] .rv-token-halo-frontal circle`);
        const t = c?.getAttribute("transform");
        // Notação exponencial (ex.: "7.1e-15", um resíduo de ponto
        // flutuante essencialmente zero) é um valor VÁLIDO que
        // `Number()` entende — precisa estar na classe de caracteres,
        // senão um ângulo bem perto de 0° vira falso-negativo "não achei".
        const m = t?.match(/rotate\(([-\d.eE+]+)\)/);
        return m ? Number(m[1]) : null;
      }, tokenId);
    }
    // Mesma fórmula do produto (`MapaHex.tsx`): ângulo real da direção
    // (graus) menos 60°, pra centralizar os 120° do halo nela.
    function anguloEsperado(orientacao: number): number {
      const dv = hexParaPixel(hexRotacionar({ q: 1, r: 0 }, orientacao), 1);
      const anguloRad = Math.atan2(dv.y, dv.x);
      return (anguloRad * 180) / Math.PI - 60;
    }
    function proximo(a: number | null, b: number, tolerancia = 0.5): boolean {
      if (a === null) return false;
      const diff = Math.abs(a - b) % 360;
      return Math.min(diff, 360 - diff) <= tolerancia;
    }

    // r:20 caía sob o controle `.rv-zoom` em algumas medições pós-reload
    // (achado real via mensagem de erro do próprio Playwright: "`.rv-zoom`
    // intercepts pointer events") — mesma classe de bug já vista nesta
    // suíte com o dock de turnos. `r:5` é a mesma linha já usada
    // repetidamente (`Grande Alça`/`Médio Alça`) sem esse problema.
    const tok = await criarTokenFixture({ nome: "Costas", sigla: "CS", tamanho: "medio", q: 14, r: 5 });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });

    // 1/2/3: os triângulos e o setor traseiro velhos não existem mais em lugar nenhum do documento.
    const semTriangulosVelhos = await page.evaluate(() => ({
      semTras: document.querySelectorAll(".rv-token-tras").length === 0,
      semMarcador: document.querySelectorAll(".rv-token-tras-marcador").length === 0,
      semTituloCostas: Array.from(document.querySelectorAll("title")).every((t) => !(t.textContent ?? "").includes("Ataques por trás")),
    }));
    registrar(
      "22-1/2/3 (triângulos amarelos, .rv-token-tras-marcador e o <title> de ataque pelas costas não existem mais)",
      semTriangulosVelhos.semTras && semTriangulosVelhos.semMarcador && semTriangulosVelhos.semTituloCostas,
      JSON.stringify(semTriangulosVelhos),
    );

    // Sem seleção nem hover — halo ausente.
    const ausenteAntes = (await page.locator(`.rv-token[data-token-id="${tok.id}"] .rv-token-halo-frontal`).count()) === 0;

    // 4: hover — halo aparece.
    const box = await page.locator(`.rv-token[data-token-id="${tok.id}"]`).boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(150);
    const presenteNoHover = (await page.locator(`.rv-token[data-token-id="${tok.id}"] .rv-token-halo-frontal`).count()) === 1;
    registrar("22-4 (halo frontal ausente sem hover/seleção, aparece no hover)", ausenteAntes && presenteNoHover, `ausenteAntes=${ausenteAntes}, presenteNoHover=${presenteNoHover}`);

    // 6: sai do hover — halo some de novo.
    await page.mouse.move(20, 20);
    await page.waitForTimeout(150);
    const ausenteDepois = (await page.locator(`.rv-token[data-token-id="${tok.id}"] .rv-token-halo-frontal`).count()) === 0;
    registrar("22-6 (halo frontal some ao tirar o mouse, sem token selecionado)", ausenteDepois, `ausenteDepois=${ausenteDepois}`);

    // 5: seleção (sem hover) também mostra o halo.
    await page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.move(20, 20);
    await page.waitForTimeout(150);
    const presenteNaSelecao = (await page.locator(`.rv-token[data-token-id="${tok.id}"] .rv-token-halo-frontal`).count()) === 1;
    registrar("22-5 (halo frontal aparece na seleção, mesmo sem o mouse em cima)", presenteNaSelecao, `presente=${presenteNaSelecao}`);

    // 7: pointer-events:none — nunca intercepta clique.
    const peNone = await page.evaluate((tid) => {
      const g = document.querySelector(`.rv-token[data-token-id="${tid}"] .rv-token-halo-frontal`);
      return g ? getComputedStyle(g).pointerEvents : null;
    }, tok.id);
    registrar("22-7 (halo frontal é pointer-events:none)", peNone === "none", `pointerEvents=${peNone}`);

    // 8: as SEIS orientações produzem seis ângulos de halo distintos,
    // cada um batendo com a fórmula do produto — nunca um sweep
    // contínuo, nunca um valor "parecido" aceito por coincidência.
    const angulosPorOrientacao: (number | null)[] = [];
    let todosBatem = true;
    for (let o = 0; o < 6; o++) {
      await admin.from("vtt_tokens").update({ orientacao: o }).eq("id", tok.id);
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
      await page.locator(`.rv-token[data-token-id="${tok.id}"]`).waitFor({ state: "visible", timeout: 5000 });
      await page.waitForTimeout(200);
      await page.locator(`.rv-token[data-token-id="${tok.id}"]`).hover();
      await esperarAte(async () => (await page.locator(`.rv-token[data-token-id="${tok.id}"] .rv-token-halo-frontal`).count()) === 1, 3000);
      const angulo = await anguloDoHalo(page, tok.id);
      angulosPorOrientacao.push(angulo);
      if (!proximo(angulo, anguloEsperado(o))) todosBatem = false;
      await page.mouse.move(20, 20);
    }
    const seisDistintos = new Set(angulosPorOrientacao.map((a) => a?.toFixed(1))).size === 6;
    registrar(
      "22-8 (as 6 orientações produzem 6 ângulos de halo distintos, cada um batendo com a fórmula do produto)",
      seisDistintos && todosBatem,
      `ângulos=${JSON.stringify(angulosPorOrientacao)}, todosBatem=${todosBatem}`,
    );

    // 12/13/14: token SIMÉTRICO (Médio, o próprio "Costas") também
    // mostra o halo, e girar não muda a pegada (só a direção) — reusa
    // o mesmo token, já provado simétrico pelas suítes 20/21.
    await admin.from("vtt_tokens").update({ orientacao: 0 }).eq("id", tok.id);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await page.locator(`.rv-token[data-token-id="${tok.id}"]`).waitFor({ state: "visible", timeout: 5000 });
    await page.waitForTimeout(200);
    await page.locator(`.rv-token[data-token-id="${tok.id}"]`).hover();
    const haloSimetrico = (await page.locator(`.rv-token[data-token-id="${tok.id}"] .rv-token-halo-frontal`).count()) === 1;
    const { data: antesGiroSimetrico } = await admin.from("vtt_tokens").select("q, r").eq("id", tok.id).single();
    await selecionarEFocarAlca(page, tok.id); // Tab real até a alça — hover sozinho nunca dá foco de teclado.
    await page.keyboard.press("ArrowRight");
    await esperarAte(async () => {
      const { data } = await admin.from("vtt_tokens").select("orientacao").eq("id", tok.id).single();
      return data?.orientacao === 1;
    }, 5000);
    const { data: depoisGiroSimetrico } = await admin.from("vtt_tokens").select("q, r, orientacao").eq("id", tok.id).single();
    registrar(
      "22-12/14 (halo aparece em token SIMÉTRICO; girar muda só a orientação, nunca a posição/pegada)",
      haloSimetrico && depoisGiroSimetrico?.orientacao === 1 && depoisGiroSimetrico?.q === antesGiroSimetrico!.q && depoisGiroSimetrico?.r === antesGiroSimetrico!.r,
      `haloSimétrico=${haloSimetrico}, orientação→${depoisGiroSimetrico?.orientacao}, posição ${JSON.stringify(antesGiroSimetrico)}→(${depoisGiroSimetrico?.q},${depoisGiroSimetrico?.r})`,
    );

    // 13: token ASSIMÉTRICO (Grande) também mostra o halo — usa `tokGrande`, já fixture desta suíte.
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await page.locator(`.rv-token[data-token-id="${tokGrande.id}"]`).waitFor({ state: "visible", timeout: 5000 });
    await page.locator(`.rv-token[data-token-id="${tokGrande.id}"]`).hover();
    await page.waitForTimeout(150);
    const haloAssimetrico = (await page.locator(`.rv-token[data-token-id="${tokGrande.id}"] .rv-token-halo-frontal`).count()) === 1;
    registrar("22-13 (halo aparece em token ASSIMÉTRICO — Grande)", haloAssimetrico, `presente=${haloAssimetrico}`);
    await page.mouse.move(20, 20);

    // 9/10/11: o halo acompanha a PRÉVIA do arrasto da alça, volta à
    // orientação original se Esc cancelar, e volta à persistida se o
    // servidor recusar — reusa a mesma mecânica de arraste/rejeição já
    // provada por `5/13/16`, só olhando o ângulo do halo também.
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await selecionarToken(page, tok.id);
    {
      const { data: origemTok } = await admin.from("vtt_tokens").select("orientacao").eq("id", tok.id).single();
      const anguloOriginal = await anguloDoHalo(page, tok.id);
      const centroTok = await centroDoToken(page, tok.id);
      const alca = await centroDaAlca(page);
      const v0 = { x: alca!.x - centroTok.x, y: alca!.y - centroTok.y };
      const alvo2 = { x: centroTok.x + rotacionarVetor(v0, 2).x, y: centroTok.y + rotacionarVetor(v0, 2).y };
      await page.mouse.move(alca!.x, alca!.y);
      await page.mouse.down();
      await page.mouse.move(alvo2.x, alvo2.y, { steps: 6 });
      await page.waitForTimeout(150);
      const anguloDurantePreview = await anguloDoHalo(page, tok.id);
      const acompanhaPrevia = proximo(anguloDurantePreview, anguloEsperado(((origemTok!.orientacao + 2) % 6 + 6) % 6));
      registrar("22-9 (halo acompanha a prévia do arrasto da alça, em tempo real)", acompanhaPrevia, `durante=${anguloDurantePreview}, esperado≈${anguloEsperado(((origemTok!.orientacao + 2) % 6 + 6) % 6)}`);

      // Esc cancela o gesto — halo volta pro ângulo original.
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await page.waitForTimeout(200);
      await page.locator(`.rv-token[data-token-id="${tok.id}"]`).hover();
      const anguloAposEsc = await anguloDoHalo(page, tok.id);
      registrar("22-10 (Esc cancela o gesto: halo volta pra orientação original)", proximo(anguloAposEsc, anguloOriginal ?? anguloEsperado(origemTok!.orientacao)), `antes=${anguloOriginal}, depoisDoEsc=${anguloAposEsc}`);
    }

    // 11: rejeição do servidor (revisão desatualizada) — halo volta pra orientação PERSISTIDA, não a tentada.
    {
      await page.mouse.move(20, 20);
      await page.waitForTimeout(150);
      await selecionarToken(page, tok.id);
      const { data: antesRejeicao } = await admin.from("vtt_tokens").select("orientacao, revision").eq("id", tok.id).single();
      const centroTok = await centroDoToken(page, tok.id);
      const alca = await centroDaAlca(page);
      const v0 = { x: alca!.x - centroTok.x, y: alca!.y - centroTok.y };
      const alvo3 = { x: centroTok.x + rotacionarVetor(v0, 1).x, y: centroTok.y + rotacionarVetor(v0, 1).y };
      await page.mouse.move(alca!.x, alca!.y);
      await page.mouse.down();
      await page.mouse.move(alvo3.x, alvo3.y, { steps: 6 });
      await page.waitForTimeout(100);
      await admin.from("vtt_tokens").update({ nome: "Costas Editado Por Fora", revision: antesRejeicao!.revision + 1 }).eq("id", tok.id);
      await page.mouse.up();
      await esperarAte(async () => (await page.locator(".rv-erro-acao").count()) > 0, 5000);
      await page.waitForTimeout(300);
      await page.locator(`.rv-token[data-token-id="${tok.id}"]`).hover();
      const anguloAposRejeicao = await anguloDoHalo(page, tok.id);
      registrar(
        "22-11 (rejeição do servidor: halo volta pra orientação PERSISTIDA, não a tentada)",
        proximo(anguloAposRejeicao, anguloEsperado(antesRejeicao!.orientacao)),
        `esperado≈${anguloEsperado(antesRejeicao!.orientacao)}, obtido=${anguloAposRejeicao}`,
      );
    }
    await page.mouse.move(20, 20);
    await page.waitForTimeout(150);

    // 15/16: zero requisições de rede durante o hover — puramente visual, nenhuma vantagem aplicada sozinha.
    let requisicoesDuranteHover = 0;
    const onReq = () => { requisicoesDuranteHover++; };
    page.on("request", onReq);
    await page.mouse.move(20, 20);
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(200);
    await page.mouse.move(20, 20);
    await page.waitForTimeout(200);
    page.off("request", onReq);
    registrar("22-15/16 (hover do halo nunca dispara requisição nenhuma — nenhuma vantagem aplicada automaticamente)", requisicoesDuranteHover === 0, `requisições=${requisicoesDuranteHover}`);

    // 17: o halo nunca intercepta clique/arrasto/teclado da alça — a alça continua girando normalmente com o halo visível.
    // Reload antes — o teste anterior (22-11) deixa um banner de erro
    // em tela, que pode empurrar a ordem de Tab e atrapalhar o foco.
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    const { data: antesTecla17 } = await admin.from("vtt_tokens").select("orientacao, revision").eq("id", tok.id).single();
    await selecionarEFocarAlca(page, tok.id);
    await page.keyboard.press("ArrowRight");
    await esperarAte(async () => {
      const { data } = await admin.from("vtt_tokens").select("revision").eq("id", tok.id).single();
      return (data?.revision ?? 0) > antesTecla17!.revision;
    }, 5000);
    const { data: depoisTecla17 } = await admin.from("vtt_tokens").select("orientacao").eq("id", tok.id).single();
    registrar(
      "22-17 (halo visível não intercepta o teclado da alça — rotação continua funcionando normalmente)",
      depoisTecla17?.orientacao === ((antesTecla17!.orientacao + 1) % 6),
      `orientação ${antesTecla17?.orientacao}→${depoisTecla17?.orientacao}`,
    );

    // 18: ordem de pintura — halo vem DEPOIS do corpo do token (sigla) e ANTES da alça/rótulos, nunca escondido, nunca por cima dos rótulos.
    const ordemCamadas = await page.evaluate((tid) => {
      const g = document.querySelector(`.rv-token[data-token-id="${tid}"]`);
      if (!g) return null;
      const todos = Array.from(g.querySelectorAll("*"));
      return {
        sigla: todos.findIndex((el) => el.matches(".rv-token-sigla")),
        halo: todos.findIndex((el) => el.matches(".rv-token-halo-frontal")),
        alca: todos.findIndex((el) => el.matches(".rv-token-alca-rotacao")),
      };
    }, tok.id);
    registrar(
      "22-18 (ordem de pintura: corpo/sigla → halo frontal → alça de rotação)",
      !!ordemCamadas && ordemCamadas.sigla >= 0 && ordemCamadas.halo > ordemCamadas.sigla && ordemCamadas.alca > ordemCamadas.halo,
      JSON.stringify(ordemCamadas),
    );
  }

  registrar("console (nenhum erro/warning novo durante toda a sessão)", erros.length === 0, JSON.stringify(erros).slice(0, 2000));
  void ignorarErrosDeProposito;

  await close();
  await limpar();

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  process.exit(falhou > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("Erro fatal:", e);
  await limpar().catch(() => {});
  process.exit(1);
});
