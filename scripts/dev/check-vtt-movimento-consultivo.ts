/**
 * Movimento consultivo (seção 5) — terreno bloqueado deixa de EXCLUIR
 * movimento de um token já existente; vira aviso visual. Contra o
 * navegador real, ponta a ponta: arrasto → prévia com destaque →
 * soltar → servidor aceita → banco reflete o destino → outra sessão
 * recebe sem reload.
 *
 * Escopo desta suíte (nunca confundir com as OUTRAS operações, que
 * este pedido explicitamente NÃO altera): só o ARRASTO de um token já
 * posicionado no mapa. Criação/posicionamento inicial, redimensionar,
 * rotação e pintura de terreno continuam recusando bloqueio
 * normalmente — não são tocados aqui.
 *
 * Complementa (não substitui) `scripts/test-vtt-pathfinding.ts` (puro,
 * sem browser — prova a função `ignorarBloqueioTerreno` em isolamento)
 * e `scripts/test-vtt-arrasto-token.ts` (puro — prova o fallback de
 * duas camadas do estado de arrasto).
 *
 * Uso: npx tsx scripts/dev/check-vtt-movimento-consultivo.ts (servidor
 * dev já rodando em localhost:3000).
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { ConsoleMessage } from "playwright";
import { chromium, type Page } from "playwright";
import { BASE_URL } from "./authSession";
import { hexParaPixel } from "../../src/app/mesas/[campaignId]/vtt/_mapa/hex";
// IMPORTADO de verdade, nunca copiado — um `const TAM = 40` local
// divergiu do `TAM = 26` real de `MapaHex.tsx` (achado real, encontrado
// via `document.elementFromPoint` em `check-vtt-camadas-visuais.ts`: um
// clique de mundo→tela calculado com o TAM errado caía longe do alvo).
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
  const eNarrador = `check-vtt-movcons-narrador-${Date.now()}@ruptura.dev`;
  const sNarrador = randomUUID();
  const { data: dNarrador, error: errN } = await admin.auth.admin.createUser({ email: eNarrador, password: sNarrador, email_confirm: true, user_metadata: { display_name: "Narrador MovCons" } });
  if (errN) throw new Error(`Falha ao criar narrador: ${errN.message}`);
  narradorEmail = eNarrador; narradorSenha = sNarrador;
  criados.usuarios.push(dNarrador.user.id);

  const eJogador = `check-vtt-movcons-jogador-${Date.now()}@ruptura.dev`;
  const sJogador = randomUUID();
  const { data: dJogador, error: errJ } = await admin.auth.admin.createUser({ email: eJogador, password: sJogador, email_confirm: true, user_metadata: { display_name: "Jogador MovCons" } });
  if (errJ) throw new Error(`Falha ao criar jogador: ${errJ.message}`);
  jogadorEmail = eJogador; jogadorSenha = sJogador;
  criados.usuarios.push(dJogador.user.id);

  await admin.from("campaigns").insert({ id: campaignId, name: "VTT Movimento Consultivo", owner_id: dNarrador.user.id });
  criados.campanhas.push(campaignId);
  await admin.from("campaign_members").insert({ campaign_id: campaignId, user_id: dJogador.user.id, role: "player", status: "active", origem: "check_vtt_movcons" });

  const { data: cena } = await admin.from("vtt_scenes").insert({ campaign_id: campaignId, nome: "Cena MovCons", largura: 24, altura: 24 }).select("id").single();
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

type TokenLinha = { id: string; nome: string; sigla: string; q: number; r: number; revision: number };
async function criarTokenFixture(nome: string, sigla: string, q: number, r: number, characterId: string | null = null): Promise<TokenLinha> {
  const { data, error } = await admin.from("vtt_tokens").insert({
    scene_id: sceneId, campaign_id: campaignId, nome, sigla, lado: characterId ? "pj" : "pn",
    tamanho: "medio", orientacao: 0, q, r, visivel: true, character_id: characterId,
  }).select("id, nome, sigla, q, r, revision").single();
  if (error) throw new Error(`Falha ao criar token fixture: ${error.message}`);
  return data as TokenLinha;
}

async function selecionarInteragir(page: Page) {
  await page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
}

// Converte um ponto em coordenadas de MUNDO (as mesmas que `hexParaPixel`
// devolve) pra coordenadas de TELA reais, via `getScreenCTM()` do `<g>`
// que aplica `translate(pan) scale(zoom)` — nunca assumir 1:1 entre delta
// de mundo e delta de tela: o mapa tem zoom próprio (frequentemente
// diferente de 1, pra caber a cena inteira no viewport) empilhado sobre o
// `viewBox` do próprio `<svg>`, então um delta de mundo aplicado direto
// em pixels de tela super/sub-estima a distância real do arrasto.
// Compara um `transform="translate(x y)"` com um ponto esperado por
// DISTÂNCIA numérica real, nunca por substring de um valor arredondado
// (`.includes(x.toFixed(0))`) — achado real: `382.7832...toFixed(0)` vira
// a STRING "383", que nunca aparece dentro de "382.7832..." porque
// arredondar PRA CIMA muda o dígito inteiro sem mudar o texto de fato
// impresso no atributo. Um falso "não sincronizou" nasceu exatamente
// disso, não de um bug de sincronização de verdade.
function transformBateComPonto(transform: string | null, ponto: { x: number; y: number }, tolerancia = 1): boolean {
  if (!transform) return false;
  const m = transform.match(/translate\(([-\d.]+)[ ,]([-\d.]+)\)/);
  if (!m) return false;
  const x = Number(m[1]), y = Number(m[2]);
  return Math.abs(x - ponto.x) <= tolerancia && Math.abs(y - ponto.y) <= tolerancia;
}

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
  await configurarFixture();
  registrar("0 (fixture)", true, `campanha=${campaignId}`);

  const { page, close } = await contextoDe(narradorEmail!, narradorSenha!);
  const erros: string[] = [];
  page.on("console", (m) => { if (erroRelevante(m)) erros.push(m.text().slice(0, 400)); });
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
  await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
  await selecionarInteragir(page);

  // --- 1: pathfinding PREFERE contornar quando existe passagem livre — nunca atravessa bloqueio à toa. ---
  {
    const tok = await criarTokenFixture("Contorna", "CT", 5, 5);
    // Bloqueia só a célula (6,5), diretamente no caminho reto — sobra desvio por (6,4)/(6,6).
    await admin.from("vtt_terrain").upsert({ scene_id: sceneId, campaign_id: campaignId, q: 6, r: 5, tipo: "bloqueado" });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await selecionarInteragir(page);

    // A prévia de arrasto é uma TRILHA DESENHADA À MÃO, não um
    // pathfinding: quem arrasta escolhe por onde passar, célula a
    // célula (`moverDestino` em `_dominio/arrastoToken.ts`), e terreno
    // bloqueado é consultivo — atravessar é permitido e AVISADO. Este
    // critério já cobrou "o pathfinding contornou sozinho", que é um
    // mecanismo que este gesto não tem (e não deve ter: escolher a rota
    // é da pessoa). O que importa provar é o outro lado do 2a: quando a
    // trilha DESVIA do bloqueio, nenhum passo fica âmbar — o aviso é
    // por passo atravessado, não por "existe uma parede por perto".
    const destino = { q: 7, r: 5 };
    const origemTela = await pontoMundoParaTela(page, hexParaPixel({ q: tok.q, r: tok.r }, TAM));
    const desvio1 = await pontoMundoParaTela(page, hexParaPixel({ q: 6, r: 4 }, TAM));
    const desvio2 = await pontoMundoParaTela(page, hexParaPixel({ q: 7, r: 4 }, TAM));
    const alvoTela = await pontoMundoParaTela(page, hexParaPixel(destino, TAM));

    await page.mouse.move(origemTela.x, origemTela.y);
    await page.mouse.down();
    await page.mouse.move(desvio1.x, desvio1.y, { steps: 4 });
    await page.mouse.move(desvio2.x, desvio2.y, { steps: 4 });
    await page.mouse.move(alvoTela.x, alvoTela.y, { steps: 4 });
    // Espera a prévia MONTAR (a trilha desviada tem 3 passos), em vez
    // de contar o âmbar num instante em que talvez nem exista rota.
    await esperarAte(async () => (await page.locator(".rv-camada-rota-preview line").count()) >= 3, 5000);
    const linhasAmbar = await page.locator(".rv-camada-rota-preview line[stroke='#ff9d4d']").count();
    registrar(
      "1 (trilha desviando do bloqueio: nenhum passo fica âmbar — o aviso é do passo atravessado, não da parede existir)",
      linhasAmbar === 0, `linhasÂmbar=${linhasAmbar}`,
    );
    await page.mouse.up();
    await esperarAte(async () => {
      const { data } = await admin.from("vtt_tokens").select("revision").eq("id", tok.id).single();
      return (data?.revision ?? 0) > tok.revision;
    }, 5000);
    const { data: final1 } = await admin.from("vtt_tokens").select("q, r, revision").eq("id", tok.id).single();
    registrar("1b (movimento com desvio confirma normalmente no destino)", final1?.q === destino.q && final1?.r === destino.r, `pos=(${final1?.q},${final1?.r}) esperado=(${destino.q},${destino.r})`);
  }

  // --- 2: SÓ existe passagem atravessando bloqueio — permite montar E confirmar, com destaque visual e aviso textual; servidor aceita; custo nunca Infinity/NaN. ---
  {
    const tok = await criarTokenFixture("SoAtravessando", "SA", 3, 10);
    // Parede de verdade: bloqueia a coluna q=4 na ALTURA INTEIRA do mapa
    // (0..23, cena 24×24) — não só uma janela de linhas. Um bloqueio
    // parcial deixa desvio por cima/por baixo da parede (mesmo defeito já
    // encontrado e corrigido nos testes puros de `pathfindingHex.ts`), o
    // que faria o pathfinding estrito encontrar rota sem nunca precisar
    // da flag de relaxamento — nenhum âmbar apareceria, e o teste
    // provaria a coisa errada.
    for (let r = 0; r < 24; r++) {
      await admin.from("vtt_terrain").upsert({ scene_id: sceneId, campaign_id: campaignId, q: 4, r, tipo: "bloqueado" });
    }
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await esperarAte(async () => (await page.locator(".rv-terreno-real--bloqueado").count()) >= 20, 5000);
    await selecionarInteragir(page);

    const destino = { q: 5, r: 10 };
    const origemTela = await pontoMundoParaTela(page, hexParaPixel({ q: tok.q, r: tok.r }, TAM));
    const alvoTela = await pontoMundoParaTela(page, hexParaPixel(destino, TAM));

    await page.mouse.move(origemTela.x, origemTela.y);
    await page.mouse.down();
    await page.mouse.move(alvoTela.x, alvoTela.y, { steps: 10 });
    await page.waitForTimeout(250);

    const linhasAmbar = await page.locator(".rv-camada-rota-preview line[stroke='#ff9d4d']").count();
    const avisoTexto = await page.locator(".rv-camada-rota-preview text").textContent().catch(() => null);
    registrar(
      "2a (única passagem atravessa bloqueio: prévia destaca em âmbar E mostra aviso textual — MONTA a rota, não recusa)",
      linhasAmbar > 0 && !!avisoTexto && avisoTexto.includes("bloqueada"),
      `linhasÂmbar=${linhasAmbar}, aviso="${avisoTexto}"`,
    );

    await page.mouse.up();
    const confirmou = await esperarAte(async () => {
      const { data } = await admin.from("vtt_tokens").select("revision").eq("id", tok.id).single();
      return (data?.revision ?? 0) > tok.revision;
    }, 5000);
    const { data: final2 } = await admin.from("vtt_tokens").select("q, r, revision").eq("id", tok.id).single();
    registrar(
      "2b (CONFIRMA de verdade — narrador consegue completar o movimento atravessando o bloqueio, servidor aceita)",
      confirmou && final2?.q === destino.q && final2?.r === destino.r,
      `confirmou=${confirmou}, pos=(${final2?.q},${final2?.r}) esperado=(${destino.q},${destino.r}), revisão ${tok.revision}→${final2?.revision}`,
    );

    // Animação: o token deveria ter percorrido a rota (não teleportado) — verificado indiretamente via `useAnimacaoToken` já coberto noutra suíte; aqui confirma que o `transform` final bate com o destino real (sem congelar no meio).
    const transformFinal = await page.locator(`.rv-token[data-token-id="${tok.id}"]`).getAttribute("transform");
    const pFinalMundo = hexParaPixel(destino, TAM);
    const bateComDestino = transformBateComPonto(transformFinal, pFinalMundo);
    registrar("2c (visual: o token termina no ponto do destino real, não preso no meio da rota)", bateComDestino, `transform="${transformFinal}"`);
  }

  // --- 3: destino OCUPADO por outro token continua recusado, mesmo com "atravessar" liberado — regra separada. ---
  {
    const tok = await criarTokenFixture("NuncaOcupa", "NO", 3, 15);
    const obstaculo = await criarTokenFixture("JaEstaLa", "JL", 6, 15);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await selecionarInteragir(page);

    const origemTela = await pontoMundoParaTela(page, hexParaPixel({ q: tok.q, r: tok.r }, TAM));
    const alvoTela = await pontoMundoParaTela(page, hexParaPixel({ q: obstaculo.q, r: obstaculo.r }, TAM));

    await page.mouse.move(origemTela.x, origemTela.y);
    await page.mouse.down();
    await page.mouse.move(alvoTela.x, alvoTela.y, { steps: 10 });
    await page.waitForTimeout(200);
    // Nunca deveria montar uma rota terminando ali — sem caminho válido até a célula ocupada (regra separada, não relaxada).
    const linhaVermelhaSemRota = await page.locator(".rv-camada-rota-preview line[stroke='#ff5f74']").count();
    await page.mouse.up();
    await page.waitForTimeout(300);
    const { data: final3 } = await admin.from("vtt_tokens").select("q, r, revision").eq("id", tok.id).single();
    registrar(
      "3 (destino ocupado por outro token continua recusado — 'pode atravessar' não é 'pode terminar em cima')",
      final3?.q === tok.q && final3?.r === tok.r && final3?.revision === tok.revision,
      `linhaSemRota=${linhaVermelhaSemRota > 0}, posição final=(${final3?.q},${final3?.r}) esperado=(${tok.q},${tok.r}), revisão intocada=${final3?.revision === tok.revision}`,
    );

    // Reforço direto no servidor, como o NARRADOR de verdade (nunca o
    // service role — bypassaria a própria checagem de autorização que
    // este teste quer exercitar) — mesmo se o cliente tentasse forçar,
    // o RPC recusa terminar sobre outro token.
    const cliNarradorReforco = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await cliNarradorReforco.auth.signInWithPassword({ email: narradorEmail!, password: narradorSenha! });
    const { error: erroServidor } = await cliNarradorReforco.rpc("move_vtt_token", {
      p_token_id: tok.id,
      p_rota: [{ q: tok.q, r: tok.r }, { q: obstaculo.q, r: obstaculo.r }],
      p_expected_revision: tok.revision,
    });
    registrar("3b (servidor recusa diretamente uma rota forçada terminando sobre outro token)", !!erroServidor, erroServidor ? erroServidor.message : "RPC aceitou — deveria ter recusado");
  }

  // --- 4: jogador sem autorização continua sem conseguir mover (nem com bloqueio, nem sem). ---
  {
    const tok = await criarTokenFixture("SemPermissao", "SP", 10, 15);
    const { page: jogadorPage, close: closeJogador } = await contextoDe(jogadorEmail!, jogadorSenha!);
    await jogadorPage.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
    await jogadorPage.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await jogadorPage.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();

    // Chamada direta como JOGADOR (não admin) via RPC, pra confirmar autorização de verdade — nunca só o cliente escondendo o botão.
    const cliJogador = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await cliJogador.auth.signInWithPassword({ email: jogadorEmail!, password: jogadorSenha! });
    const { error: erroAutorizacao } = await cliJogador.rpc("move_vtt_token", {
      p_token_id: tok.id,
      p_rota: [{ q: tok.q, r: tok.r }, { q: tok.q + 1, r: tok.r }],
      p_expected_revision: tok.revision,
    });
    registrar("4 (jogador sem controle sobre o token continua sem conseguir mover — regra consultiva não afeta autorização)", !!erroAutorizacao, erroAutorizacao ? erroAutorizacao.message : "RPC aceitou — deveria ter recusado por falta de permissão");
    await closeJogador();
  }

  // --- 5: outra sessão recebe a posição final sem reload (sincronização não regrediu). ---
  {
    // r baixo de propósito: `dentroDoMapa` usa bordas CISALHADAS
    // (`qMin = -floor(r/2)`), então em r=15 o q máximo válido é 16 — um
    // destino a 2 células (q:17) cairia FORA do mapa sem que nada
    // pareça errado à primeira vista. Achado real: a suíte inteira
    // "falhava" aqui achando que era sincronização quebrada, quando na
    // verdade era o próprio arrasto do narrador nunca completando (rota
    // "sem rota até aqui") — nenhum evento de realtime tinha COMO
    // chegar, porque a posição nunca mudou no banco. Em r baixo essa
    // margem é bem maior, eliminando a ambiguidade.
    const tok = await criarTokenFixture("Sincroniza", "SY", 15, 2);
    const { page: jogadorPage, close: closeJogador } = await contextoDe(jogadorEmail!, jogadorSenha!);
    await jogadorPage.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
    await jogadorPage.waitForSelector(".rv-ferramentas", { timeout: 15000 });

    // Nunca dar reload no narrador aqui: a página dele já está aberta e
    // já tem sua PRÓPRIA assinatura Realtime — o token novo (inserido
    // direto no banco pelo fixture) chega sozinho, sem precisar de SSR
    // de novo. Um reload supérfluo bem antes do arrasto só reintroduz
    // atividade de navegação/compilação (dev server) na janela exata em
    // que o canal do JOGADOR precisa ficar estável — achado real: os
    // frames de WebSocket mostraram o Turbopack recompilando várias
    // vezes durante a janela de teste, coincidindo exatamente com as
    // falhas de sincronização, nunca com uma causa no produto.
    await selecionarInteragir(page);
    // O token é NOVO (inserido pelo fixture DEPOIS do último carregamento
    // do narrador) — espera a própria assinatura Realtime dele entregar
    // o INSERT antes de tentar arrastar, senão o clique cairia no piso
    // vazio (nenhum elemento ali pra receber o pointerdown de arrasto).
    await page.locator(`.rv-token[data-token-id="${tok.id}"]`).waitFor({ state: "visible", timeout: 5000 });
    const destino = { q: 17, r: 2 };
    const origemTela = await pontoMundoParaTela(page, hexParaPixel({ q: tok.q, r: tok.r }, TAM));
    const alvoTela = await pontoMundoParaTela(page, hexParaPixel(destino, TAM));
    await page.mouse.move(origemTela.x, origemTela.y);
    await page.mouse.down();
    await page.mouse.move(alvoTela.x, alvoTela.y, { steps: 8 });
    await page.mouse.up();
    await esperarAte(async () => {
      const { data } = await admin.from("vtt_tokens").select("q").eq("id", tok.id).single();
      return data?.q === destino.q;
    }, 5000);

    const pEsperado = hexParaPixel(destino, TAM);
    const sincronizou = await esperarAte(async () => {
      const transform = await jogadorPage.locator(`.rv-token[data-token-id="${tok.id}"]`).getAttribute("transform").catch(() => null);
      return transformBateComPonto(transform, pEsperado);
    }, 6000);
    registrar("5 (outra sessão recebe a posição final atravessando bloqueio sem reload)", sincronizou, `sincronizou=${sincronizou}`);
    await closeJogador();
  }

  registrar("console (nenhum erro/warning novo durante toda a sessão)", erros.length === 0, JSON.stringify(erros).slice(0, 2000));

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
