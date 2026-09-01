/**
 * Browser check da rodada 5 de Áreas — interações REAIS de Playwright:
 *
 *   1. Destaque visual do token escolhido como origem de uma Aura
 *      (aparece/desaparece nos estados certos, nunca se confunde com
 *      seleção/alvo/halo frontal).
 *   2. Botão de edição rápida direto no mapa — visível só pra quem
 *      pode editar (narrador ou criador), some no hover-out sem
 *      seleção, some no console do outro jogador.
 *   3. Hints acessíveis nos ícones da lista "Áreas na cena".
 *   4. Seção "Quem pode criar áreas" removida da interface — narrador
 *      e jogador.
 *   5. Jogador sem autorização explícita antiga cria e edita a
 *      própria área; não vê o botão de editar na área de outra pessoa.
 *
 * Uso: npx tsx scripts/dev/check-vtt-areas-ux-r5.ts
 * (servidor dev já rodando em localhost:3000)
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

let campaignId: string | null = null;
let sceneId: string | null = null;
let tokenId: string | null = null;
const criados = { usuarios: [] as string[], campanhas: [] as string[] };

async function criarUsuario(prefixo: string, nome: string) {
  const email = `${prefixo}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { display_name: nome } });
  if (error) throw new Error(`Falha ao criar usuário ${prefixo}: ${error.message}`);
  criados.usuarios.push(data.user.id);
  return { id: data.user.id, email, senha };
}

interface Usuario { id: string; email: string; senha: string }
let narrador: Usuario, jogadorA: Usuario, jogadorB: Usuario;

async function configurarFixture(): Promise<void> {
  narrador = await criarUsuario("check-r5-narrador", "Narrador R5");
  campaignId = randomUUID();
  const { error: e1 } = await admin.from("campaigns").insert({ id: campaignId, name: "VTT Áreas R5", owner_id: narrador.id });
  if (e1) throw new Error(`Falha ao criar campanha: ${e1.message}`);
  criados.campanhas.push(campaignId);

  jogadorA = await criarUsuario("check-r5-jogadorA", "Jogador A");
  jogadorB = await criarUsuario("check-r5-jogadorB", "Jogador B");
  for (const j of [jogadorA, jogadorB]) {
    const { error } = await admin.from("campaign_members").insert({ campaign_id: campaignId, user_id: j.id, role: "player", status: "active", origem: "fixture_r5" });
    if (error) throw new Error(`Falha ao adicionar membro: ${error.message}`);
  }

  sceneId = randomUUID();
  const { error: e2 } = await admin.from("vtt_scenes").insert({ id: sceneId, campaign_id: campaignId, nome: "Cena R5", largura: 26, altura: 20, ativa: true });
  if (e2) throw new Error(`Falha ao criar cena: ${e2.message}`);

  tokenId = randomUUID();
  const { error: e3 } = await admin.from("vtt_tokens").insert({
    id: tokenId, scene_id: sceneId, campaign_id: campaignId, nome: "Alvo R5", sigla: "AR",
    lado: "pj", vertente: "nenhuma", q: 12, r: 8, tamanho: "medio", orientacao: 0, visivel: true,
  });
  if (e3) throw new Error(`Falha ao criar token: ${e3.message}`);
}

async function contextoDe(email: string, senha: string, viewport = { width: 1440, height: 950 }) {
  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) throw new Error(`Falha ao logar ${email}: ${error?.message}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport });
  await context.addCookies([{
    name: "ruptura_auth",
    value: JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }),
    domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  }]);
  const page = await context.newPage();
  const erros: string[] = [];
  page.on("console", (m) => { if (erroRelevante(m)) erros.push(m.text().slice(0, 500)); });
  return { context, page, close: () => browser.close(), erros };
}

async function limpar() {
  for (const cid of criados.campanhas) {
    await admin.from("vtt_areas").delete().eq("campaign_id", cid);
    await admin.from("vtt_tokens").delete().eq("campaign_id", cid);
    await admin.from("vtt_scenes").delete().eq("campaign_id", cid);
    await admin.from("campaign_members").delete().eq("campaign_id", cid);
    await admin.from("campaigns").delete().eq("id", cid);
  }
  for (const uid of criados.usuarios) await admin.auth.admin.deleteUser(uid);
  registrar("L (limpeza de fixtures)", true, `${criados.usuarios.length} usuário(s), ${criados.campanhas.length} campanha(s)`);
}

async function posicaoDoToken(page: Page, id: string): Promise<{ x: number; y: number }> {
  const caixa = await page.locator(`.rv-token[data-token-id="${id}"]`).boundingBox();
  if (!caixa) throw new Error(`Token ${id} sem caixa (não renderizado?)`);
  return { x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 };
}

async function celula(page: Page, col: number, row: number): Promise<{ x: number; y: number }> {
  const largura = await page.locator(".rv-mapa").getAttribute("aria-label").then((r) => Number(/de (\d+) por/.exec(r ?? "")?.[1] ?? 26));
  const caixa = await page.locator(".rv-camada-grade path").nth(row * largura + col).boundingBox();
  if (!caixa) throw new Error(`Célula (${col},${row}) sem caixa`);
  const ponto = { x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 };
  const livre = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return !!el && !!el.closest("svg.rv-mapa");
  }, ponto);
  if (!livre) {
    const quem = await page.evaluate(({ x, y }) => {
      const e = document.elementFromPoint(x, y) as Element | null;
      return e ? `${e.tagName}.${e.getAttribute("class") ?? ""}` : "nada";
    }, ponto);
    throw new Error(`Célula (${col},${row}) está coberta por ${quem} em ${JSON.stringify(ponto)}`);
  }
  return ponto;
}

async function abrirAreas(page: Page) {
  await page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Áreas"]').click();
  await page.waitForSelector('[data-testid="painel-areas"]', { timeout: 8000 });
}

async function escolherTipo(page: Page, tipo: string) {
  await page.locator(`[data-testid="area-tipo-${tipo}"]`).click();
}

/**
 * Reentra em `escolhendo_token_da_aura` quando o tipo JÁ é Aura (o
 * efeito que auto-entra nessa fase só dispara numa MUDANÇA de tipo —
 * reclicar o mesmo tipo não teria efeito). O botão "Escolher no mapa"
 * é o caminho real da interface pra isso.
 */
async function reescolherOrigemAura(page: Page) {
  await page.locator('[data-testid="area-escolher-token-mapa"]').click();
}

async function manterNaMesa(page: Page) {
  await page.locator('[data-testid="area-manter"]').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="painel-areas"]')?.getAttribute("data-fase") === "ociosa", null, { timeout: 10000 });
}

async function main() {
  await configurarFixture();
  registrar("0 (fixture: campanha, narrador, 2 jogadores, 1 token)", true, `campanha=${campaignId}`);

  const N = await contextoDe(narrador.email, narrador.senha);
  await N.page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
  await N.page.waitForSelector(".rv-ferramentas", { timeout: 20000 });
  const P = N.page;

  // ══════════════════════════════════════════════════════════════
  // 4. Seção "Quem pode criar áreas" nunca mais aparece
  // ══════════════════════════════════════════════════════════════
  await abrirAreas(P);
  {
    const secao = await P.locator('[data-testid="area-abrir-autorizacoes"]').count();
    registrar("4a (seção 'Quem pode criar áreas' não existe mais pro narrador)", secao === 0, `${secao} elemento(s)`);
    const texto = await P.locator('[data-testid="painel-areas"]').innerText();
    registrar("4b (texto 'Quem pode criar áreas' não aparece em lugar nenhum do painel)", !texto.includes("Quem pode criar"), "ok");
  }

  // ══════════════════════════════════════════════════════════════
  // 1. Destaque de origem da Aura
  // ══════════════════════════════════════════════════════════════
  {
    await escolherTipo(P, "aura");
    await P.waitForSelector('[data-testid="painel-areas"][data-fase="escolhendo_token_da_aura"]', { timeout: 5000 });

    const c = await posicaoDoToken(P, tokenId!);
    // Clique-e-solta simples (sem arrastar) — escolhe o token, entra em `definindo_raio_da_aura`.
    await P.mouse.move(c.x, c.y);
    await P.mouse.down();
    await P.mouse.up();
    await P.waitForSelector('[data-testid="painel-areas"][data-fase="definindo_raio_da_aura"]', { timeout: 5000 });

    const destaque1 = await P.locator(`.rv-token[data-token-id="${tokenId}"] .rv-token-origem-aura`).count();
    registrar("1a (token escolhido recebe o destaque de origem em 'definindo_raio_da_aura')", destaque1 === 1, `${destaque1} anel(is)`);

    // Arrasta o raio a partir de outro ponto do mapa.
    const alvo = await celula(P, 16, 8);
    await P.mouse.move(alvo.x, alvo.y);
    await P.mouse.down();
    await P.mouse.move(alvo.x + 40, alvo.y, { steps: 6 });
    const destaqueDurante = await P.locator(`.rv-token[data-token-id="${tokenId}"] .rv-token-origem-aura`).count();
    registrar("1b (destaque continua durante o arrasto do raio)", destaqueDurante === 1, `${destaqueDurante} anel(is)`);
    await P.mouse.up();
    await P.waitForSelector('[data-testid="painel-areas"][data-fase="concluida_local"]', { timeout: 5000 });

    const destaquePrevia = await P.locator(`.rv-token[data-token-id="${tokenId}"] .rv-token-origem-aura`).count();
    registrar("1c (destaque continua na prévia local concluída)", destaquePrevia === 1, `${destaquePrevia} anel(is)`);

    // Descarta — destaque some.
    await P.locator('[data-testid="area-descartar"]').click();
    await P.waitForTimeout(200);
    const destaqueDepoisDescarte = await P.locator(`.rv-token[data-token-id="${tokenId}"] .rv-token-origem-aura`).count();
    registrar("1d (descartar a prévia remove o destaque)", destaqueDepoisDescarte === 0, `${destaqueDepoisDescarte} anel(is)`);

    // Refaz e confirma — destaque some ao sair do modo de edição/prévia.
    await reescolherOrigemAura(P);
    await P.waitForSelector('[data-testid="painel-areas"][data-fase="escolhendo_token_da_aura"]', { timeout: 5000 });
    await P.mouse.move(c.x, c.y); await P.mouse.down(); await P.mouse.up();
    await P.waitForSelector('[data-testid="painel-areas"][data-fase="definindo_raio_da_aura"]', { timeout: 5000 });
    await P.mouse.move(alvo.x, alvo.y); await P.mouse.down();
    await P.mouse.move(alvo.x + 30, alvo.y, { steps: 6 }); await P.mouse.up();
    await P.waitForSelector('[data-testid="painel-areas"][data-fase="concluida_local"]', { timeout: 5000 });
    await manterNaMesa(P);
    await P.waitForTimeout(300);
    const destaqueDepoisConfirmar = await P.locator(`.rv-token[data-token-id="${tokenId}"] .rv-token-origem-aura`).count();
    registrar("1e (confirmar a Aura remove o destaque — persistida-e-não-selecionada não fica marcada)", destaqueDepoisConfirmar === 0, `${destaqueDepoisConfirmar} anel(is)`);

    // Editar a Aura persistida reacende o destaque.
    const { data: auraRow } = await admin.from("vtt_areas").select("id").eq("campaign_id", campaignId).eq("tipo", "aura").limit(1).maybeSingle();
    await P.locator(`[data-testid="area-editar-${auraRow!.id}"]`).click();
    await P.waitForSelector('[data-testid="painel-areas"][data-fase="editando"]', { timeout: 5000 });
    const destaqueEdicao = await P.locator(`.rv-token[data-token-id="${tokenId}"] .rv-token-origem-aura`).count();
    registrar("1f (editar uma Aura persistida reacende o destaque no token de origem)", destaqueEdicao === 1, `${destaqueEdicao} anel(is)`);
    await P.locator('[data-testid="area-cancelar-edicao"]').click();
    await P.waitForTimeout(200);
    const destaqueSaiuEdicao = await P.locator(`.rv-token[data-token-id="${tokenId}"] .rv-token-origem-aura`).count();
    registrar("1g (cancelar a edição remove o destaque de novo)", destaqueSaiuEdicao === 0, `${destaqueSaiuEdicao} anel(is)`);

    // Trocar de ferramenta em pleno gesto remove o destaque.
    await reescolherOrigemAura(P);
    await P.waitForSelector('[data-testid="painel-areas"][data-fase="escolhendo_token_da_aura"]', { timeout: 5000 });
    await P.mouse.move(c.x, c.y); await P.mouse.down(); await P.mouse.up();
    await P.waitForSelector('[data-testid="painel-areas"][data-fase="definindo_raio_da_aura"]', { timeout: 5000 });
    await P.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
    await P.waitForTimeout(200);
    const destaqueAposTrocarFerramenta = await P.locator(`.rv-token[data-token-id="${tokenId}"] .rv-token-origem-aura`).count();
    registrar("1h (trocar de ferramenta remove o destaque)", destaqueAposTrocarFerramenta === 0, `${destaqueAposTrocarFerramenta} anel(is)`);
    await P.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Áreas"]').click();

    // O destaque nunca intercepta clique — pointer-events: none.
    const pe = await P.evaluate((tid) => {
      const el = document.querySelector(`.rv-token[data-token-id="${tid}"] .rv-token-origem-aura`);
      return el ? getComputedStyle(el).pointerEvents : null;
    }, tokenId);
    registrar("1i (destaque não intercepta clique — pointer-events: none, quando presente)", pe === null || pe === "none", `${pe}`);
  }

  // ══════════════════════════════════════════════════════════════
  // 2. Botão de edição rápida no mapa
  // ══════════════════════════════════════════════════════════════
  let areaEsferaNarrador: string;
  {
    await escolherTipo(P, "esfera");
    const a = await celula(P, 14, 5), b = await celula(P, 18, 5);
    await P.mouse.move(a.x, a.y); await P.mouse.down();
    await P.mouse.move(b.x, b.y, { steps: 6 }); await P.mouse.up();
    await manterNaMesa(P);
    const { data: esf } = await admin.from("vtt_areas").select("id").eq("campaign_id", campaignId).eq("tipo", "esfera").limit(1).maybeSingle();
    areaEsferaNarrador = esf!.id;

    // Hover sobre a área mostra o botão pro narrador (ele edita tudo).
    await P.mouse.move(b.x, b.y);
    await P.waitForSelector('[data-testid="area-editar-rapido"]', { timeout: 5000 });
    const btn = P.locator('[data-testid="area-editar-rapido"]');
    registrar("2a (narrador vê o botão de edição rápida ao passar o mouse sobre qualquer área)", await btn.count() === 1, "ok");
    registrar("2b (botão tem aria-label 'Editar área')", (await btn.getAttribute("aria-label")) === "Editar área", "ok");

    await btn.click();
    await P.waitForSelector('[data-testid="painel-areas"][data-fase="editando"]', { timeout: 5000 });
    registrar("2c (clicar no botão entra direto em modo de edição)", true, "fase=editando");
    await P.locator('[data-testid="area-cancelar-edicao"]').click();
    await P.waitForTimeout(150);
  }

  // Jogador A cria a própria área.
  const A = await contextoDe(jogadorA.email, jogadorA.senha);
  await A.page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
  await A.page.waitForSelector(".rv-ferramentas", { timeout: 20000 });
  let areaEsferaJogadorA: string;
  {
    const temFerramenta = await A.page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Áreas"]').count();
    registrar("5a (jogador SEM autorização antiga já vê e usa a ferramenta Áreas)", temFerramenta === 1, `${temFerramenta}`);
    await abrirAreas(A.page);
    await escolherTipo(A.page, "esfera");
    const a = await celula(A.page, 20, 5), b = await celula(A.page, 24, 5);
    await A.page.mouse.move(a.x, a.y); await A.page.mouse.down();
    await A.page.mouse.move(b.x, b.y, { steps: 6 }); await A.page.mouse.up();
    await manterNaMesa(A.page);
    const { data: esf } = await admin.from("vtt_areas").select("id").eq("campaign_id", campaignId).eq("tipo", "esfera").order("created_at", { ascending: false }).limit(1).maybeSingle();
    areaEsferaJogadorA = esf!.id;
    registrar("5b (jogador cria a própria área com sucesso)", !!areaEsferaJogadorA, `id=${areaEsferaJogadorA}`);

    // Vê o botão de editar rápido na PRÓPRIA área.
    await A.page.mouse.move(b.x, b.y);
    await A.page.waitForSelector('[data-testid="area-editar-rapido"]', { timeout: 5000 });
    registrar("5c (jogador vê o botão de edição rápida na PRÓPRIA área)", await A.page.locator('[data-testid="area-editar-rapido"]').count() === 1, "ok");
  }

  // Jogador B — outro jogador — não vê botão de editar em NENHUMA área alheia.
  const B = await contextoDe(jogadorB.email, jogadorB.senha);
  await B.page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
  await B.page.waitForSelector(".rv-ferramentas", { timeout: 20000 });
  {
    await abrirAreas(B.page);
    // Área do narrador.
    const cN = await celula(B.page, 18, 5); // borda da esfera do narrador
    await B.page.mouse.move(cN.x, cN.y);
    await B.page.waitForTimeout(400);
    const botaoNaAreaDoNarrador = await B.page.locator('[data-testid="area-editar-rapido"]').count();
    registrar("5d (outro jogador NÃO vê botão de editar na área do narrador)", botaoNaAreaDoNarrador === 0, `${botaoNaAreaDoNarrador}`);

    // Área do jogador A.
    const cA = await celula(B.page, 24, 5); // borda da esfera do jogador A
    await B.page.mouse.move(cA.x, cA.y);
    await B.page.waitForTimeout(400);
    const botaoNaAreaDoJogadorA = await B.page.locator('[data-testid="area-editar-rapido"]').count();
    registrar("5e (outro jogador NÃO vê botão de editar na área de outro jogador)", botaoNaAreaDoJogadorA === 0, `${botaoNaAreaDoJogadorA}`);

    // Na lista: sem ícone de editar/ocultar/duplicar/excluir nas áreas alheias, mas COM "Localizar".
    const listaBtn = B.page.locator(`[data-testid="area-item-${areaEsferaNarrador}"] .rv-area-item-acoes button`);
    const contagem = await listaBtn.count();
    registrar("5f (na lista, área alheia mostra só 'Localizar' pro outro jogador)", contagem === 1, `${contagem} botão(ões)`);
    const label = await listaBtn.first().getAttribute("aria-label");
    registrar("5g (o único botão restante é 'Localizar no mapa')", label === "Localizar no mapa", `${label}`);
  }

  // ══════════════════════════════════════════════════════════════
  // 3. Hints acessíveis na lista "Áreas na cena"
  // ══════════════════════════════════════════════════════════════
  {
    const item = P.locator(`[data-testid="area-item-${areaEsferaNarrador}"]`);
    const editarBtn = item.locator(`[data-testid="area-editar-${areaEsferaNarrador}"]`);
    await editarBtn.hover();
    // Atraso do hint é .35s (transição de opacidade .12s por cima) —
    // espera com folga real pro fim da transição, não um valor no meio dela.
    await P.waitForTimeout(600);
    const dicaVisivelHover = await editarBtn.locator(".rv-dica").evaluate((el) => getComputedStyle(el).opacity);
    registrar("3a (hover no ícone Editar mostra o hint com o atraso padrão)", dicaVisivelHover === "1", `opacity=${dicaVisivelHover}`);
    const textoDica = await editarBtn.locator(".rv-dica").innerText();
    registrar("3b (texto do hint é 'Editar área')", textoDica === "Editar área", `"${textoDica}"`);

    await P.mouse.move(0, 0);
    await P.waitForTimeout(150);
    // `.focus()` programático não confiavelmente marca `:focus-visible`
    // no Chromium headless — navegação real por Tab, sim (mesma
    // limitação de ferramenta já documentada em rodadas anteriores).
    await P.keyboard.press("Tab");
    let tentativas = 0;
    while (!(await editarBtn.evaluate((el) => el === document.activeElement)) && tentativas < 20) {
      await P.keyboard.press("Tab");
      tentativas++;
    }
    await P.waitForTimeout(600);
    const dicaVisivelFoco = await editarBtn.locator(".rv-dica").evaluate((el) => getComputedStyle(el).opacity);
    registrar("3c (foco por teclado também mostra o hint)", dicaVisivelFoco === "1", `opacity=${dicaVisivelFoco}, tentativas=${tentativas}`);
    await editarBtn.evaluate((el) => (el as HTMLElement).blur());
    await P.waitForTimeout(400);
    const dicaAposBlur = await editarBtn.locator(".rv-dica").evaluate((el) => getComputedStyle(el).opacity);
    registrar("3d (perder o foco esconde o hint)", Number(dicaAposBlur) < 0.02, `opacity=${dicaAposBlur}`);

    // Hint alternável: texto muda conforme o estado (visível → Ocultar; oculto → Mostrar).
    const visBtn = item.locator(`[data-testid="area-visibilidade-${areaEsferaNarrador}"]`);
    const textoAntes = await visBtn.getAttribute("aria-label");
    registrar("3e (hint de visibilidade reflete o estado ATUAL — 'Ocultar dos jogadores' enquanto visível)", textoAntes === "Ocultar dos jogadores", `"${textoAntes}"`);
    await visBtn.click();
    await P.waitForTimeout(600);
    const textoDepois = await visBtn.getAttribute("aria-label");
    registrar("3f (depois de ocultar, o hint muda pra 'Mostrar aos jogadores')", textoDepois === "Mostrar aos jogadores", `"${textoDepois}"`);
    await visBtn.click(); // devolve pro estado visível
    await P.waitForTimeout(400);

    // Todos os botões da lista têm type="button" e aria-label.
    const todos = await item.locator(".rv-area-item-acoes button").evaluateAll((els) =>
      els.map((e) => ({ type: e.getAttribute("type"), label: e.getAttribute("aria-label") })),
    );
    registrar("3g (todos os botões da lista têm type=\"button\" e aria-label)", todos.every((b) => b.type === "button" && !!b.label), JSON.stringify(todos));
  }

  registrar("6 (console limpo — narrador, jogador A, jogador B)", N.erros.length === 0 && A.erros.length === 0 && B.erros.length === 0,
    [...N.erros, ...A.erros, ...B.erros].slice(0, 2).join(" | ") || "limpo");

  await N.close(); await A.close(); await B.close();
  await limpar();

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  process.exit(falhou > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("Erro fatal:", e);
  await limpar().catch(() => {});
  process.exit(1);
});
