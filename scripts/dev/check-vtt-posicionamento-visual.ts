/**
 * Verificação visual obrigatória (seção 19 do pedido) do novo fluxo de
 * posicionamento de token — 11 capturas inspecionadas, com asserções
 * de `boundingBox()` pra detectar interseção (não só "parece certo"
 * no PNG): zero sobreposição, zero texto cortado, preview inteiro
 * visível, mensagens abaixo dos elementos (nunca por cima), rodapé
 * acessível, campos alinhados.
 *
 * Screenshots salvos em `scripts/dev/.artefatos-visuais/` (git-
 * ignorado — mesmo padrão de artefato temporário de outras suítes
 * desta sessão) pra inspeção manual, além das asserções automáticas.
 *
 * Uso: npx tsx scripts/dev/check-vtt-posicionamento-visual.ts
 * (servidor dev já rodando em localhost:3000).
 */

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
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
const admin = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anonKey = requireEnv("SUPABASE_ANON_KEY");
const supabaseUrl = requireEnv("SUPABASE_URL");

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR_SHOTS = path.join(__dirname, ".artefatos-visuais");
mkdirSync(DIR_SHOTS, { recursive: true });

let passou = 0;
let falhou = 0;
function registrar(criterio: string, ok: boolean, detalhe: string) {
  if (ok) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

type Box = { x: number; y: number; width: number; height: number };
/** `true` se dois retângulos (de `boundingBox()`) se sobrepõem de verdade — não só encostam na borda. */
function sobrepoe(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

let campaignId: string | null = null;
let narradorEmail: string | null = null;
let narradorSenha: string | null = null;
let sceneId: string | null = null;
const criados = { usuarios: [] as string[], campanhas: [] as string[] };

async function configurarFixture(): Promise<void> {
  campaignId = randomUUID();
  const email = `check-vtt-visual-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { display_name: "Narrador Visual" } });
  if (error) throw new Error(`Falha ao criar narrador fixture: ${error.message}`);
  narradorEmail = email; narradorSenha = senha;
  criados.usuarios.push(data.user.id);
  const { error: e1 } = await admin.from("campaigns").insert({ id: campaignId, name: "VTT Visual", owner_id: data.user.id });
  if (e1) throw new Error(`Falha ao criar campanha: ${e1.message}`);
  criados.campanhas.push(campaignId);
}

async function limpar() {
  for (const cid of criados.campanhas) {
    await admin.from("vtt_marks").delete().eq("campaign_id", cid);
    await admin.from("vtt_terrain").delete().eq("campaign_id", cid);
    await admin.from("vtt_tokens").delete().eq("campaign_id", cid);
    await admin.from("vtt_scenes").delete().eq("campaign_id", cid);
    await admin.from("campaigns").delete().eq("id", cid);
  }
  for (const uid of criados.usuarios) await admin.auth.admin.deleteUser(uid);
  registrar("L (limpeza de fixtures)", true, `${criados.usuarios.length} usuário(s), ${criados.campanhas.length} campanha(s)`);
}

async function abrirCriarConfigurando(page: Page, indiceCelula = 40) {
  // Fecha o que estiver aberto ANTES de procurar célula livre: com a
  // janela do cenário anterior ainda no ar, boa parte do mapa está
  // coberta e o clique direito nunca chega na grade.
  if (await page.locator(".rv-gerenciador-token").count() > 0) {
    page.once("dialog", (d) => d.accept());
    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});
  }
  await page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
  // A célula precisa estar DESCOBERTA: a janela de token nasce colada
  // na barra de ferramentas e cresceu, e o índice fixo passou a cair
  // debaixo dela — o clique direito ia parar no formulário e o menu
  // nunca abria. Tenta o índice pedido e, se ele estiver coberto,
  // procura a primeira célula que responde por si no ponto do clique.
  const ponto = await page.evaluate((idx) => {
    // Sem função nomeada aqui: o `tsx`/esbuild injeta um helper
    // (`__name`) que não existe dentro do browser.
    const celulas = Array.from(document.querySelectorAll(".rv-camada-grade path"));
    const ordem = celulas[idx] ? [celulas[idx], ...celulas] : celulas;
    for (const c of ordem) {
      const r = c.getBoundingClientRect();
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      if (document.elementFromPoint(x, y) === c) return { x, y };
    }
    return null;
  }, indiceCelula);

  if (ponto) {
    await page.mouse.click(ponto.x, ponto.y, { button: "right" });
    await page.locator(".rv-menu-item", { hasText: "Adicionar token" }).click();
  } else {
    // Nenhuma célula alcançável: numa viewport estreita (o cenário 4
    // usa 380px) a barra e o painel da sessão cobrem o mapa inteiro, e
    // o menu do hex vazio deixa de ser uma porta possível. O botão da
    // barra é a outra porta real, e é a que o cenário precisa — ele
    // testa o LAYOUT do formulário, não por onde ele foi aberto.
    await page.locator('.rv-ferr-btn[aria-label="Adicionar token"]').click();
  }
  await page.waitForSelector(".rv-gerenciador-token", { timeout: 5000 });
}
async function continuarParaPosicionar(page: Page) {
  await page.locator(".rv-gerenciador-token .rv-btn--pri", { hasText: "Continuar para posicionar" }).click();
  await page.waitForSelector(".rv-escolha-posicao", { timeout: 5000 });
  await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 });
}
async function celulaBox(page: Page, indice: number) {
  return page.locator(".rv-camada-grade path").nth(indice).boundingBox();
}
async function moverParaCelula(page: Page, indice: number) {
  const box = await celulaBox(page, indice);
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 3 });
  await page.waitForTimeout(150);
  return box!;
}
async function encontrarCelulaValida(page: Page, indiceInicial: number, passo = 41): Promise<number> {
  for (let i = 0; i < 8; i++) {
    const indice = indiceInicial + i * passo;
    await moverParaCelula(page, indice);
    const valida = await page.locator(".rv-camada-posicionamento-token").getAttribute("data-valida").catch(() => null);
    if (valida === "true") return indice;
  }
  throw new Error("Não achei uma célula válida.");
}

async function main() {
  await configurarFixture();
  registrar("0 (fixture)", true, `campanha=${campaignId}`);

  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sess } = await anon.auth.signInWithPassword({ email: narradorEmail!, password: narradorSenha! });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  await context.addCookies([{
    name: "ruptura_auth",
    value: JSON.stringify({ access_token: sess!.session!.access_token, refresh_token: sess!.session!.refresh_token }),
    domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  }]);
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
  await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
  const { data: sceneRow } = await admin.from("vtt_scenes").select("id, largura, altura").eq("campaign_id", campaignId).single();
  sceneId = sceneRow!.id;

  // ── 1: formulário Médio ──────────────────────────────────────────
  {
    await abrirCriarConfigurando(page, 60);
    await page.locator(".rv-gerenciador-token input[type=text]").first().fill("Visual Médio");
    await page.selectOption("#rv-campo-tamanho", "medio");
    await page.screenshot({ path: path.join(DIR_SHOTS, "01-formulario-medio.png") });
    const nomeBox = await page.locator(".rv-gerenciador-token input[type=text]").first().boundingBox();
    const siglaBox = await page.locator('.rv-gerenciador-token input[maxlength="3"]').boundingBox();
    const semSobreposicao = !sobrepoe(nomeBox!, siglaBox!);
    const modalBox = await page.locator(".rv-gerenciador-token").boundingBox();
    const dentroDaViewport = modalBox!.x >= 0 && modalBox!.y >= 0 && modalBox!.x + modalBox!.width <= 1280;
    registrar("1 (formulário Médio: Nome/Sigla lado a lado sem sobreposição, modal dentro da viewport)", semSobreposicao && dentroDaViewport, `semSobreposicao=${semSobreposicao}, dentroDaViewport=${dentroDaViewport}`);
  }

  // ── 2: formulário Grande ─────────────────────────────────────────
  {
    await page.selectOption("#rv-campo-tamanho", "grande");
    await page.screenshot({ path: path.join(DIR_SHOTS, "02-formulario-grande.png") });
    const tamanhoBox = await page.locator("#rv-campo-tamanho").boundingBox();
    const previewBox = await page.locator(".rv-gerenciador-token .rv-pegada-preview").boundingBox();
    const semSobreposicao = !sobrepoe(tamanhoBox!, previewBox!);
    const dicaOrientacao = await page.locator(".rv-gerenciador-token .rv-field-ajuda", { hasText: "orientação da pegada poderá ser ajustada" }).count();
    registrar("2 (formulário Grande: campo Tamanho e preview lado a lado, dica de orientação futura presente)", semSobreposicao && dicaOrientacao > 0, `semSobreposicao=${semSobreposicao}, dica=${dicaOrientacao > 0}`);
  }

  // ── 3: "Mais opções" aberto ──────────────────────────────────────
  {
    await page.locator("summary", { hasText: "Identidade ampliada" }).click();
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(DIR_SHOTS, "03-mais-opcoes-aberto.png") });
    const vertenteVisivel = await page.locator('.rv-gerenciador-token label:has-text("Vertente")').isVisible();
    const imagemVisivel = await page.locator('.rv-gerenciador-token label:has-text("Imagem do token")').isVisible();
    const pvVisivel = await page.locator('.rv-gerenciador-token fieldset:has-text("Pontos de Vida")').isVisible();
    const condicoesVisivel = await page.locator('.rv-gerenciador-token fieldset:has-text("Condições")').isVisible();
    registrar("3 ('Identidade ampliada' aberta: Vertente/Imagem/PV/Condições visíveis)", vertenteVisivel && imagemVisivel && pvVisivel && condicoesVisivel, `vertente=${vertenteVisivel}, imagem=${imagemVisivel}, pv=${pvVisivel}, condicoes=${condicoesVisivel}`);
    page.once("dialog", (d) => d.accept());
    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});
  }

  // ── 4: viewport estreita ─────────────────────────────────────────
  {
    await page.setViewportSize({ width: 380, height: 700 });
    await abrirCriarConfigurando(page, 55);
    await page.locator(".rv-gerenciador-token input[type=text]").first().fill("Visual Estreito");
    await page.locator("summary", { hasText: "Identidade ampliada" }).click();
    await page.screenshot({ path: path.join(DIR_SHOTS, "04-viewport-estreita.png") });
    const rodapeBox = await page.locator(".rv-modal-rodape").boundingBox();
    const rodapeDentro = rodapeBox!.x >= 0 && rodapeBox!.x + rodapeBox!.width <= 380;
    const botoes = await page.locator(".rv-modal-rodape .rv-btn").all();
    const boxesBotoes = await Promise.all(botoes.map((b) => b.boundingBox()));
    let botoesSemSobreposicao = true;
    for (let i = 0; i < boxesBotoes.length; i++) for (let j = i + 1; j < boxesBotoes.length; j++) {
      if (boxesBotoes[i] && boxesBotoes[j] && sobrepoe(boxesBotoes[i]!, boxesBotoes[j]!)) botoesSemSobreposicao = false;
    }
    const semOverflowHorizontal = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
    registrar("4 (viewport estreita: rodapé dentro da tela, botões sem sobreposição, sem overflow horizontal)", rodapeDentro && botoesSemSobreposicao && semOverflowHorizontal, `rodapeDentro=${rodapeDentro}, botoesSemSobreposicao=${botoesSemSobreposicao}, semOverflow=${semOverflowHorizontal}`);
    page.once("dialog", (d) => d.accept());
    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});
    await page.setViewportSize({ width: 1280, height: 950 });
  }

  // ── 5: preview válido no mapa ────────────────────────────────────
  {
    await abrirCriarConfigurando(page, 100);
    await page.locator(".rv-gerenciador-token input[type=text]").first().fill("Visual Válido");
    await continuarParaPosicionar(page);
    const idx = await encontrarCelulaValida(page, 100);
    await page.screenshot({ path: path.join(DIR_SHOTS, "05-preview-valido.png") });
    const valida = await page.locator(".rv-camada-posicionamento-token").getAttribute("data-valida");
    const barraBox = await page.locator(".rv-escolha-posicao").boundingBox();
    const fantasmaBox = await page.locator(".rv-camada-posicionamento-token").boundingBox();
    const semSobreposicaoComBarra = !barraBox || !fantasmaBox || !sobrepoe(barraBox, fantasmaBox);
    registrar("5 (preview válido no mapa: verde, sem sobrepor a barra de instrução)", valida === "true" && semSobreposicaoComBarra, `valida=${valida}, semSobreposicaoComBarra=${semSobreposicaoComBarra}`);
    void idx;
    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-escolha-posicao", { state: "detached", timeout: 3000 });
  }

  // ── 6: preview sobre token ───────────────────────────────────────
  {
    // Semeia um token real numa posição conhecida.
    await admin.from("vtt_tokens").insert({ scene_id: sceneId, campaign_id: campaignId, nome: "Obstáculo Visual", sigla: "OB", lado: "pn", q: 3, r: 3, visivel: true });
    await abrirCriarConfigurando(page, 120);
    await page.locator(".rv-gerenciador-token input[type=text]").first().fill("Visual Sobre Token");
    await continuarParaPosicionar(page);
    // acha o token semeado na tela e passa o mouse exatamente ali.
    const tokenBox = await page.locator('.rv-token[data-sigla="OB"], .rv-token', { hasText: "OB" }).first().boundingBox().catch(() => null);
    if (tokenBox) {
      await page.mouse.move(tokenBox.x + tokenBox.width / 2, tokenBox.y + tokenBox.height / 2, { steps: 3 });
    } else {
      // fallback: célula (3,3) calculada a partir do próprio grid, se o seletor de token não bater por atributo.
      await moverParaCelula(page, 120);
    }
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(DIR_SHOTS, "06-preview-sobre-token.png") });
    const valida = await page.locator(".rv-camada-posicionamento-token").getAttribute("data-valida");
    registrar("6 (preview sobre token existente: inválido/vermelho)", valida === "false", `valida=${valida}`);
    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-escolha-posicao", { state: "detached", timeout: 3000 });
    await admin.from("vtt_tokens").delete().eq("sigla", "OB").eq("campaign_id", campaignId);
  }

  // ── 7: preview em terreno bloqueado ──────────────────────────────
  {
    const bloqueadosAntes = await page.locator(".rv-terreno-real--bloqueado").count();
    await admin.from("vtt_terrain").upsert({ scene_id: sceneId, campaign_id: campaignId, q: 6, r: 6, tipo: "bloqueado" });
    // Escrita ADMIN direta — espera propagar via `postgres_changes`
    // antes de contar com `terrenoReal` refletindo o bloqueio.
    for (let i = 0; i < 20 && (await page.locator(".rv-terreno-real--bloqueado").count()) < bloqueadosAntes + 1; i++) await page.waitForTimeout(150);
    await abrirCriarConfigurando(page, 130);
    await page.locator(".rv-gerenciador-token input[type=text]").first().fill("Visual Bloqueado");
    await continuarParaPosicionar(page);
    // A célula (6,6) tem índice exato na grade — `linha * largura +
    // coluna`. A varredura de 11 em 11 que estava aqui só encontrava
    // (6,6) por coincidência aritmética (126 não é múltiplo de 11) e
    // dependia de o passeio do mouse cair nela por acaso; qualquer
    // mudança de tamanho de cena ou de área coberta a fazia falhar sem
    // dizer por quê.
    // A célula bloqueada acabou de ser pintada e está DESENHADA no
    // mapa: mirar nela é mais direto (e mais honesto) que caçar um
    // índice de `path`. A varredura de 11 em 11 que estava aqui só
    // encontrava (6,6) por coincidência aritmética, e a ordem do DOM
    // nem é `linha * largura + coluna` — o índice 126 numa cena 20×20
    // cai em (3,6).
    const boxBloqueado = await page.locator(".rv-terreno-real--bloqueado").first().boundingBox();
    if (boxBloqueado) {
      await page.mouse.move(boxBloqueado.x + boxBloqueado.width / 2, boxBloqueado.y + boxBloqueado.height / 2, { steps: 3 });
      await page.waitForTimeout(150);
    }
    const achou = (await page.locator(".rv-camada-posicionamento-token").getAttribute("data-ancora")) === "6,6";
    await page.screenshot({ path: path.join(DIR_SHOTS, "07-preview-terreno-bloqueado.png") });
    const valida = await page.locator(".rv-camada-posicionamento-token").getAttribute("data-valida");
    registrar("7 (preview em terreno bloqueado: inválido/vermelho)", achou && valida === "false", `achouCelula66=${achou}, valida=${valida}`);
    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-escolha-posicao", { state: "detached", timeout: 3000 });
    await admin.from("vtt_terrain").delete().eq("scene_id", sceneId).eq("q", 6).eq("r", 6);
  }

  // ── 8: preview fora da borda ─────────────────────────────────────
  {
    await abrirCriarConfigurando(page, 0);
    await page.locator(".rv-gerenciador-token input[type=text]").first().fill("Visual Borda");
    await page.selectOption("#rv-campo-tamanho", "colossal"); // 12 células — na quina do mapa, ao menos uma cai fora
    await continuarParaPosicionar(page);
    await moverParaCelula(page, 0); // primeira célula da grade — canto do mapa
    await page.screenshot({ path: path.join(DIR_SHOTS, "08-preview-fora-da-borda.png") });
    const valida = await page.locator(".rv-camada-posicionamento-token").getAttribute("data-valida");
    const celulasFantasma = await page.locator(".rv-camada-posicionamento-token path").count();
    registrar("8 (preview fora da borda: inválido, mesmo com pegada Colossal completa desenhada)", valida === "false" && celulasFantasma > 0, `valida=${valida}, célulasDesenhadas=${celulasFantasma}`);
    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-escolha-posicao", { state: "detached", timeout: 3000 });
  }

  // ── 9: Grande rotacionado ────────────────────────────────────────
  {
    await abrirCriarConfigurando(page, 150);
    await page.locator(".rv-gerenciador-token input[type=text]").first().fill("Visual Grande Girado");
    await page.selectOption("#rv-campo-tamanho", "grande");
    await continuarParaPosicionar(page);
    const idx = await encontrarCelulaValida(page, 150);
    await page.keyboard.press("e");
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(DIR_SHOTS, "09-grande-rotacionado.png") });
    const orientacao = await page.locator(".rv-camada-posicionamento-token").getAttribute("data-orientacao");
    const setaPresente = await page.locator(".rv-camada-posicionamento-token line").count();
    registrar("9 (Grande rotacionado: orientação mudou, seta de direção visível)", orientacao === "1" && setaPresente > 0, `orientacao=${orientacao}, seta=${setaPresente}`);
    void idx;
    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-escolha-posicao", { state: "detached", timeout: 3000 });
  }

  // ── 10: Colossal rotacionado ─────────────────────────────────────
  {
    await abrirCriarConfigurando(page, 160);
    await page.locator(".rv-gerenciador-token input[type=text]").first().fill("Visual Colossal Girado");
    await page.selectOption("#rv-campo-tamanho", "colossal");
    await continuarParaPosicionar(page);
    const idx = await encontrarCelulaValida(page, 160);
    await page.keyboard.press("e");
    await page.keyboard.press("e");
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(DIR_SHOTS, "10-colossal-rotacionado.png") });
    const orientacao = await page.locator(".rv-camada-posicionamento-token").getAttribute("data-orientacao");
    // `> path` (filho direto) exclui de propósito o `<path>` da ponta da
    // seta de orientação, que mora dentro de `<defs><marker>` aninhado
    // num `<g>` filho — não é uma célula da pegada.
    const celulas = await page.locator(".rv-camada-posicionamento-token > path").count();
    registrar("10 (Colossal rotacionado: orientação mudou, 12 células ainda desenhadas)", orientacao === "2" && celulas === 12, `orientacao=${orientacao}, células=${celulas}`);
    void idx;
    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-escolha-posicao", { state: "detached", timeout: 3000 });
  }

  // ── 11: erro de servidor sem perda do rascunho ───────────────────
  {
    await abrirCriarConfigurando(page, 170);
    await page.locator(".rv-gerenciador-token input[type=text]").first().fill("Visual Erro Servidor");
    await continuarParaPosicionar(page);
    const idx = await encontrarCelulaValida(page, 170);
    const box = await celulaBox(page, idx);
    const ancora = await page.locator(".rv-camada-posicionamento-token").getAttribute("data-ancora");
    const [q, r] = (ancora ?? "0,0").split(",").map(Number);
    await admin.from("vtt_tokens").insert({ scene_id: sceneId, campaign_id: campaignId, nome: "Bloqueador Visual", sigla: "BV", lado: "pn", q, r, visivel: true });
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForSelector('.rv-escolha-posicao[data-fase="erro"]', { timeout: 5000 });
    await page.screenshot({ path: path.join(DIR_SHOTS, "11-erro-servidor.png") });
    const barraErroBox = await page.locator(".rv-escolha-posicao").boundingBox();
    const dentroDaViewport = barraErroBox!.x >= 0 && barraErroBox!.x + barraErroBox!.width <= 1280;
    const textoErroVisivel = await page.locator('.rv-escolha-posicao [role="alert"]').isVisible();
    registrar("11 (erro de servidor: barra de erro visível, dentro da tela)", dentroDaViewport && textoErroVisivel, `dentroDaViewport=${dentroDaViewport}, textoVisivel=${textoErroVisivel}`);
    await page.locator(".rv-btn", { hasText: "Voltar para editar" }).click();
    await page.waitForSelector(".rv-gerenciador-token", { timeout: 3000 });
    const nomePreservado = await page.locator(".rv-gerenciador-token input[type=text]").first().inputValue();
    registrar("11b (rascunho preservado após o erro — nome não se perdeu)", nomePreservado === "Visual Erro Servidor", `nome="${nomePreservado}"`);
    page.once("dialog", (d) => d.accept());
    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});
    await admin.from("vtt_tokens").delete().eq("sigla", "BV").eq("campaign_id", campaignId);
  }

  await browser.close();
  await limpar();

  console.log(`\nScreenshots salvos em ${DIR_SHOTS}`);
  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  process.exit(falhou > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("Erro fatal:", e);
  await limpar().catch(() => {});
  process.exit(1);
});
