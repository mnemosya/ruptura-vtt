/**
 * Browser check da ferramenta ÁREAS do VTT — interações REAIS de mouse
 * e teclado do Playwright (nunca só `dispatchEvent`, que não
 * representa captura de ponteiro nem o caminho de eventos do React),
 * contra a rota real `/mesas/[campaignId]/vtt`.
 *
 * Cobre:
 *   1.  Ferramenta Áreas visível pro narrador; INVISÍVEL pro jogador
 *       sem autorização explícita; visível depois de autorizado.
 *   2.  Criação dos NOVE formatos, cada um com a sua geometria.
 *   3.  Prévia contínua durante o gesto (antes de soltar).
 *   4.  Geometria contínua de verdade: círculo/setor com ARCO SVG,
 *       nunca uma polilinha de degraus de hexes.
 *   5.  Células destacadas pela regra dos 50% e tokens destacados pela
 *       regra dos 50% da pegada — listas separadas.
 *   6.  Exceção da Linha (traço fino).
 *   7.  Cone com abertura de 45° (informação fixa, não campo).
 *   8.  Aura acompanhando o token quando ele se move.
 *   9.  Parede com altura persistida e largura fixa de 1 m.
 *   10. Cubo com orientação.
 *   11. Cancelamento por `Esc` e por troca de ferramenta.
 *   12. Início do gesto SOBRE um token e SOBRE um objeto/cobertura.
 *   13. Botão direito não inicia área (e o pan continua funcionando).
 *   14. Persistência (sobrevive a reload), edição, exclusão, visibilidade.
 *   15. Sincronização entre DUAS sessões (criar, editar, ocultar, apagar).
 *   16. Zoom, pan e viewport pequeno.
 *   17. Console sem erro inesperado.
 *
 * Uso: npx tsx scripts/dev/check-vtt-areas.ts
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
  // Aviso dev-only PRÉ-EXISTENTE (corrida entre escrita otimista e eco
  // do Realtime ao apagar marcação) — já documentado em
  // `check-vtt-integracao.ts`, fora do escopo desta entrega.
  if (t.includes("Cannot update a component") && t.includes("while rendering a different component")) return false;
  return true;
}

let campaignId: string | null = null;
let jogadorId: string | null = null;
let jogadorEmail: string | null = null;
let jogadorSenha: string | null = null;
let narradorEmail: string | null = null;
let narradorSenha: string | null = null;
const criados = { usuarios: [] as string[], campanhas: [] as string[] };

async function criarUsuario(prefixo: string, nome: string): Promise<{ id: string; email: string; senha: string }> {
  const email = `${prefixo}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { display_name: nome } });
  if (error) throw new Error(`Falha ao criar usuário ${prefixo}: ${error.message}`);
  criados.usuarios.push(data.user.id);
  return { id: data.user.id, email, senha };
}

async function configurarFixture(): Promise<void> {
  const narrador = await criarUsuario("check-vtt-areas-narrador", "Narrador Áreas");
  narradorEmail = narrador.email; narradorSenha = narrador.senha;

  campaignId = randomUUID();
  const { error: e1 } = await admin.from("campaigns").insert({ id: campaignId, name: "VTT Áreas", owner_id: narrador.id });
  if (e1) throw new Error(`Falha ao criar campanha: ${e1.message}`);
  criados.campanhas.push(campaignId);

  const jogador = await criarUsuario("check-vtt-areas-jogador", "Jogador Áreas");
  jogadorId = jogador.id; jogadorEmail = jogador.email; jogadorSenha = jogador.senha;
  const { error: e2 } = await admin.from("campaign_members").insert({ campaign_id: campaignId, user_id: jogadorId, role: "player", status: "active", origem: "fixture_vtt_areas" });
  if (e2) throw new Error(`Falha ao adicionar jogador: ${e2.message}`);
}

async function contextoDe(email: string, senha: string, viewport = { width: 1440, height: 950 }): Promise<{ context: BrowserContext; page: Page; close: () => Promise<void>; erros: string[] }> {
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
    await admin.from("vtt_area_permissoes").delete().eq("campaign_id", cid);
    await admin.from("vtt_marks").delete().eq("campaign_id", cid);
    await admin.from("vtt_terrain").delete().eq("campaign_id", cid);
    await admin.from("vtt_tokens").delete().eq("campaign_id", cid);
    await admin.from("vtt_scenes").delete().eq("campaign_id", cid);
    await admin.from("campaign_members").delete().eq("campaign_id", cid);
    await admin.from("campaigns").delete().eq("id", cid);
  }
  for (const uid of criados.usuarios) await admin.auth.admin.deleteUser(uid);
  registrar("L (limpeza de fixtures)", true, `${criados.usuarios.length} usuário(s), ${criados.campanhas.length} campanha(s)`);
}

// ── Ajudantes de mapa ────────────────────────────────────────────────

/**
 * Centro (em coordenadas de TELA) da célula da coluna `col`, linha
 * `row` da grade — e a garantia de que aquele ponto está mesmo LIVRE
 * sobre o mapa, não coberto por um painel flutuante (trilha, HUD,
 * painel de áreas). Um teste que clica "no mapa" mas acerta a trilha
 * falha por um motivo que não tem nada a ver com a regra sendo testada;
 * melhor estourar aqui, com a coordenada no erro.
 */
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

/** Arraste REAL de mouse (down → vários move → up) — nunca eventos sintéticos. */
async function arrastar(page: Page, de: { x: number; y: number }, ate: { x: number; y: number }, passos = 8) {
  await page.mouse.move(de.x, de.y);
  await page.mouse.down();
  for (let i = 1; i <= passos; i++) {
    await page.mouse.move(de.x + ((ate.x - de.x) * i) / passos, de.y + ((ate.y - de.y) * i) / passos);
  }
  await page.mouse.up();
}

async function abrirAreas(page: Page) {
  await page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Áreas"]').click();
  await page.waitForSelector('[data-testid="painel-areas"]', { timeout: 8000 });
}

async function escolherTipo(page: Page, tipo: string) {
  await page.locator(`[data-testid="area-tipo-${tipo}"]`).click();
}

async function manterNaMesa(page: Page) {
  await page.locator('[data-testid="area-manter"]').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="painel-areas"]')?.getAttribute("data-fase") === "ociosa", null, { timeout: 10000 });
}

/**
 * Espera a contagem de áreas no banco atingir `alvo` — condição real,
 * não `waitForTimeout`. Um sleep fixo esconde corrida: ou passa por
 * sorte, ou falha sem dizer que o problema era tempo.
 */
async function esperarContagemAreas(alvo: number, limiteMs = 10000): Promise<number> {
  const ate = Date.now() + limiteMs;
  let atual = await contarAreasNoBanco();
  while (atual !== alvo && Date.now() < ate) {
    await new Promise((r) => setTimeout(r, 150));
    atual = await contarAreasNoBanco();
  }
  return atual;
}

async function contarAreasNoBanco(): Promise<number> {
  const { data } = await admin.from("vtt_areas").select("id").eq("campaign_id", campaignId);
  return data?.length ?? 0;
}

async function areaDoBanco(tipo: string) {
  const { data } = await admin.from("vtt_areas").select("*").eq("campaign_id", campaignId).eq("tipo", tipo).limit(1).maybeSingle();
  return data as Record<string, unknown> | null;
}

async function main() {
  await configurarFixture();
  registrar("0 (fixture: campanha + narrador + jogador)", true, `campanha=${campaignId}`);

  const narrador = await contextoDe(narradorEmail!, narradorSenha!);
  await narrador.page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
  await narrador.page.waitForSelector(".rv-ferramentas", { timeout: 20000 });
  const P = narrador.page;

  // ── 1. Autorização ──────────────────────────────────────────────
  {
    const temAreas = await P.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Áreas"]').count();
    registrar("1a (narrador vê a ferramenta Áreas)", temAreas === 1, `${temAreas} botão(ões)`);
  }

  const jogador = await contextoDe(jogadorEmail!, jogadorSenha!);
  await jogador.page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
  await jogador.page.waitForSelector(".rv-ferramentas", { timeout: 20000 });
  {
    // Migration 0083: criação é aberta a qualquer participante da
    // campanha — sem autorização explícita, o jogador já vê a ferramenta.
    const temAreas = await jogador.page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Áreas"]').count();
    registrar("1b (jogador SEM autorização explícita ANTIGA já vê a ferramenta Áreas — criação é aberta)", temAreas === 1, `${temAreas} botão(ões)`);
  }

  await abrirAreas(P);

  // ── 19d. Posição inicial encostada na barra de ferramentas de verdade ──
  {
    await P.waitForTimeout(150);
    const barra = await P.locator(".rv-ferramentas").boundingBox();
    const painel = await P.locator('[data-testid="painel-areas"]').boundingBox();
    registrar("19d (janela abre encostada na barra de ferramentas real, não numa margem fixa da página)",
      !!barra && !!painel && Math.abs(painel.x - barra.x - barra.width) <= 16 && painel.x > barra.x + barra.width - 1,
      `barra.right=${barra ? barra.x + barra.width : "?"} painel.x=${painel?.x}`);
  }

  // ── 2/3/4. Esfera: prévia contínua durante o gesto, arco real ────
  const c0 = await celula(P, 10, 3);
  const c1 = await celula(P, 14, 3);
  {
    await escolherTipo(P, "esfera");
    // Gesto em duas partes pra inspecionar a PRÉVIA antes de soltar.
    await P.mouse.move(c0.x, c0.y);
    await P.mouse.down();
    await P.mouse.move(c1.x, c1.y, { steps: 8 });
    const previaVisivel = await P.locator(".rv-camada-areas .rv-area--previa").count();
    const dPrevia = await P.locator(".rv-camada-areas .rv-area--previa path").first().getAttribute("d");
    registrar("3 (prévia contínua aparece durante o arraste, antes de soltar)", previaVisivel === 1, `${previaVisivel} prévia(s)`);
    registrar("4a (esfera desenha com ARCO de círculo real — `A` no caminho, nunca degraus de hexes)", !!dPrevia && dPrevia.includes("A"), (dPrevia ?? "").slice(0, 50));
    await P.mouse.up();
    await P.waitForTimeout(150);
    const fase = await P.locator('[data-testid="painel-areas"]').getAttribute("data-fase");
    registrar("3b (soltar conclui LOCALMENTE — fase `concluida_local`, nada no banco ainda)", fase === "concluida_local" && (await contarAreasNoBanco()) === 0, `fase=${fase}, áreas no banco=${await contarAreasNoBanco()}`);

    const resumo = await P.locator('[data-testid="area-resumo"]').textContent();
    registrar("5a (o painel informa células e tokens afetados separadamente)", !!resumo && /célula/.test(resumo) && /token/.test(resumo), resumo ?? "");

    await manterNaMesa(P);
    const linha = await areaDoBanco("esfera");
    registrar("2a (Esfera criada e persistida)", !!linha && Number(linha.raio_m) > 0, `raio=${linha?.raio_m}`);
    registrar("14a (persistência guarda PARÂMETROS canônicos — origem em axial fracionário e raio em metros, nunca pixels)",
      !!linha && linha.origem_q !== null && linha.origem_r !== null,
      `origem=(${linha?.origem_q}, ${linha?.origem_r})`);
  }

  // ── Domo — mesma projeção, tipo diferente ────────────────────────
  {
    await escolherTipo(P, "domo");
    await arrastar(P, await celula(P, 17, 3), await celula(P, 21, 3));
    await manterNaMesa(P);
    const linha = await areaDoBanco("domo");
    registrar("2b (Domo criado e persistido com TIPO próprio, não como esfera)", !!linha && linha.tipo === "domo", `tipo=${linha?.tipo}, raio=${linha?.raio_m}`);
  }

  // ── Linha (uma célula) e a exceção do traço fino ─────────────────
  {
    await escolherTipo(P, "linha");
    await arrastar(P, await celula(P, 9, 5), await celula(P, 15, 5));
    await manterNaMesa(P);
    const linha = await areaDoBanco("linha");
    registrar("2c (Linha criada com modo `uma_celula`)", !!linha && linha.modo_linha === "uma_celula", `modo=${linha?.modo_linha}, comprimento=${linha?.comprimento_m}`);

    // Traço fino: mesma origem/direção, células ATRAVESSADAS.
    await escolherTipo(P, "linha");
    await P.locator('[data-testid="area-modo-traco_fino"]').click();
    const a = await celula(P, 9, 7);
    const b = await celula(P, 15, 7);
    await arrastar(P, a, b);
    const celulasFino = await P.locator('.rv-camada-areas .rv-area--previa').getAttribute("data-celulas-afetadas");
    registrar("6 (exceção da Linha — traço fino destaca as células ATRAVESSADAS, sem exigir 50%)", Number(celulasFino) >= 6, `${celulasFino} células atravessadas`);
    await manterNaMesa(P);
    const fino = await admin.from("vtt_areas").select("modo_linha").eq("campaign_id", campaignId).eq("modo_linha", "traco_fino").maybeSingle();
    registrar("6b (o modo especial da Linha é persistido)", fino.data?.modo_linha === "traco_fino", `${fino.data?.modo_linha}`);
  }

  // ── Faixa ────────────────────────────────────────────────────────
  {
    await escolherTipo(P, "faixa");
    await P.locator('[data-testid="area-campo-largura"]').fill("3");
    await arrastar(P, await celula(P, 17, 5), await celula(P, 23, 5));
    await manterNaMesa(P);
    const linha = await areaDoBanco("faixa");
    registrar("2d (Faixa criada com comprimento e largura declarados)", !!linha && Number(linha.largura_m) === 3 && Number(linha.comprimento_m) > 0, `${linha?.comprimento_m} × ${linha?.largura_m} m`);
  }

  // ── Parede (percurso por pontos, altura, largura fixa) ───────────
  {
    await escolherTipo(P, "parede");
    const infoLargura = await P.locator('[data-testid="area-info-largura-parede"]').textContent();
    registrar("9a (a largura da Parede aparece como regra fixa de 1 m, não como campo editável)", !!infoLargura && infoLargura.includes("1 m"), infoLargura ?? "");
    await P.locator('[data-testid="area-campo-altura"]').fill("4");
    const p1 = await celula(P, 9, 9);
    const p2 = await celula(P, 13, 9);
    const p3 = await celula(P, 13, 11);
    await P.mouse.click(p1.x, p1.y);
    await P.mouse.click(p2.x, p2.y);
    await P.mouse.click(p3.x, p3.y);
    await P.waitForTimeout(120);
    await P.locator('[data-testid="area-concluir"]').click();
    await manterNaMesa(P);
    const linha = await areaDoBanco("parede");
    const pontos = (linha?.pontos as { q: number; r: number }[] | null) ?? [];
    registrar("2e/9b (Parede com múltiplos segmentos, altura persistida e largura fixa de 1 m)",
      !!linha && pontos.length === 3 && Number(linha.altura_m) === 4 && Number(linha.largura_m) === 1,
      `pontos=${pontos.length}, altura=${linha?.altura_m} m, largura=${linha?.largura_m} m`);
  }

  // ── Cubo (orientação + altura igual ao lado) ─────────────────────
  {
    await escolherTipo(P, "cubo");
    await arrastar(P, await celula(P, 17, 8), await celula(P, 22, 8));
    const infoAltura = await P.locator('[data-testid="area-info-altura-cubo"]').textContent();
    await manterNaMesa(P);
    const linha = await areaDoBanco("cubo");
    registrar("2f/10 (Cubo com lado, orientação livre e altura igual ao lado)",
      !!linha && Number(linha.lado_m) > 0 && Number(linha.altura_m) === Number(linha.lado_m) && linha.direcao_graus !== null,
      `lado=${linha?.lado_m} m, altura=${linha?.altura_m} m, direção=${linha?.direcao_graus}°`);
    // Rodada de correção de UX: a frase editorial ("regra do formato")
    // foi removida — o painel mostra só rótulo + valor derivado, sem
    // reexplicar a regra por extenso.
    registrar("10b (a interface mostra a altura derivada, sem frase editorial explicando a regra)",
      !!infoAltura && infoAltura.includes("Altura") && infoAltura.includes("m") && !infoAltura.toLowerCase().includes("regra"),
      infoAltura ?? "");
  }

  // ── Cone (45° fixo, arco real) ───────────────────────────────────
  {
    await escolherTipo(P, "cone");
    await arrastar(P, await celula(P, 9, 11), await celula(P, 15, 11));
    const info = await P.locator('[data-testid="area-info-abertura"]').textContent();
    const d = await P.locator(".rv-camada-areas .rv-area--previa path").first().getAttribute("d");
    registrar("7a (Cone: abertura fixa de 45° como informação, não campo editável)", !!info && info.includes("45°"), info ?? "");
    registrar("7b (Cone desenha setor contínuo com ARCO real, não degraus de hexes)", !!d && d.includes("A"), (d ?? "").slice(0, 60));
    await manterNaMesa(P);
    const linha = await areaDoBanco("cone");
    registrar("2g (Cone persistido com abertura 45° garantida pelo servidor)", !!linha && Number(linha.abertura_graus) === 45, `abertura=${linha?.abertura_graus}°`);
  }

  // ── Área personalizada (polígono côncavo) ────────────────────────
  {
    await escolherTipo(P, "personalizada");
    const motivoAntes = await P.locator('[data-testid="area-motivo"]').count();
    for (const [col, row] of [[18, 10], [23, 10], [23, 12], [19, 12]] as [number, number][]) {
      const c = await celula(P, col, row);
      await P.mouse.click(c.x, c.y);
    }
    await P.waitForTimeout(120);
    await P.locator('[data-testid="area-concluir"]').click();
    await manterNaMesa(P);
    const linha = await areaDoBanco("personalizada");
    const pontos = (linha?.pontos as { q: number; r: number }[] | null) ?? [];
    registrar("2h (Área personalizada criada por cliques, com 4 vértices)", !!linha && pontos.length === 4, `${pontos.length} vértices, aviso inicial=${motivoAntes}`);
  }

  // ── Aura ligada a token ──────────────────────────────────────────
  // FLUXO NOVO: escolher o tipo Aura já coloca a ferramenta esperando
  // um TOKEN (fase `escolhendo_token_da_aura`). O `<select>` continua
  // como alternativa acessível e SINCRONIZA com o mapa — escolher por
  // ele monta a prévia igual ao clique no token faria.
  let tokenAuraId: string | null = null;
  {
    await escolherTipo(P, "aura");
    await P.waitForTimeout(150);
    const faseAura = await P.locator('[data-testid="painel-areas"]').getAttribute("data-fase");
    registrar("A1 (escolher o tipo Aura já entra na fase de escolher token — fluxo pelo mapa é o principal)",
      faseAura === "escolhendo_token_da_aura", `fase=${faseAura}`);
    const realceElegiveis = await P.locator(".rv-camada-tokens--escolhendo-aura").count();
    registrar("A2 (tokens elegíveis recebem realce discreto durante a escolha)", realceElegiveis === 1, `${realceElegiveis} camada realçada`);

    const opcoes = await P.locator('[data-testid="area-campo-token"] option').count();
    const valor = await P.locator('[data-testid="area-campo-token"] option').nth(1).getAttribute("value");
    tokenAuraId = valor;
    await P.locator('[data-testid="area-campo-token"]').selectOption(valor!);
    await P.waitForTimeout(200);
    // Rodada de correção de UX: escolher pelo `<select>` NUNCA conclui
    // a Aura sozinho (raio predefinido) — entra em
    // `definindo_raio_da_aura`, esperando o gesto de arrasto que
    // define o raio de verdade.
    const faseAposSelect = await P.locator('[data-testid="painel-areas"]').getAttribute("data-fase");
    registrar("A3 (escolher pelo `<select>` sincroniza com o mapa SEM concluir — espera o raio)",
      faseAposSelect === "definindo_raio_da_aura", `fase=${faseAposSelect}`);

    // O raio vem de um arrasto NOVO, em qualquer ponto do mapa — nunca
    // de um valor predefinido de configuração.
    await arrastar(P, await celula(P, 10, 4), await celula(P, 14, 4));
    await P.waitForTimeout(150);
    const faseAposArrasto = await P.locator('[data-testid="painel-areas"]').getAttribute("data-fase");
    registrar("A3b (o arrasto seguinte conclui a prévia local da Aura — 'concluida_local')",
      faseAposArrasto === "concluida_local", `fase=${faseAposArrasto}`);
    await manterNaMesa(P);
    const linha = await areaDoBanco("aura");
    registrar("2i (Aura criada a partir de um TOKEN, nunca de um ponto solto)", !!linha && linha.token_id === valor, `token=${linha?.token_id}, opções=${opcoes - 1}`);
    registrar("2i-b (a aura NÃO persiste origem própria — a geometria é derivada do token)", !!linha && linha.origem_q === null && linha.origem_r === null, `origem=(${linha?.origem_q}, ${linha?.origem_r})`);
  }

  registrar("2 (os NOVE formatos foram criados e persistidos)", (await contarAreasNoBanco()) === 10, `${await contarAreasNoBanco()} áreas (a Linha aparece nos dois modos)`);

  // ── 5. Células e tokens pela regra dos 50% ───────────────────────
  {
    const dados = await P.locator(".rv-camada-areas .rv-area").evaluateAll((els) => els.map((e) => ({
      tipo: e.getAttribute("data-area-tipo"),
      celulas: Number(e.getAttribute("data-celulas-afetadas")),
      tokens: Number(e.getAttribute("data-tokens-afetados")),
    })));
    const comCelulas = dados.filter((d) => d.celulas > 0).length;
    registrar("5b (toda área persistida reporta a sua lista de células pela regra dos 50%)", comCelulas === dados.length && dados.length >= 9, JSON.stringify(dados.map((d) => `${d.tipo}:${d.celulas}c/${d.tokens}t`)));
    const celulasDesenhadas = await P.locator(".rv-camada-areas .rv-area-celula").count();
    registrar("5c (as células afetadas são desenhadas como destaque secundário, sem substituir a forma)", celulasDesenhadas > 0, `${celulasDesenhadas} hexes destacados`);
  }

  // ── 8. Aura acompanha o token ────────────────────────────────────
  {
    const antes = await P.locator('.rv-camada-areas .rv-area[data-area-tipo="aura"] path').first().getAttribute("d");
    const { data: tk } = await admin.from("vtt_tokens").select("q,r,revision").eq("id", tokenAuraId!).single();
    await admin.from("vtt_tokens").update({ q: (tk!.q as number) + 3, revision: (tk!.revision as number) + 1 }).eq("id", tokenAuraId!);
    await P.waitForTimeout(1800);
    const depois = await P.locator('.rv-camada-areas .rv-area[data-area-tipo="aura"] path').first().getAttribute("d");
    const { data: auras } = await admin.from("vtt_areas").select("id").eq("campaign_id", campaignId).eq("tipo", "aura");
    registrar("8 (a Aura acompanha o token quando ele se move — geometria derivada, nunca regravada)", antes !== depois, `${(antes ?? "").slice(0, 28)} → ${(depois ?? "").slice(0, 28)}`);
    registrar("8b (mover o token NÃO duplica a aura)", (auras?.length ?? 0) === 1, `${auras?.length} aura(s) no banco`);
  }

  // ── 11. Cancelamentos ────────────────────────────────────────────
  {
    await escolherTipo(P, "esfera");
    await arrastar(P, await celula(P, 11, 2), await celula(P, 14, 2));
    const antesEsc = await P.locator(".rv-camada-areas .rv-area--previa").count();
    await P.keyboard.press("Escape");
    await P.waitForTimeout(120);
    const depoisEsc = await P.locator(".rv-camada-areas .rv-area--previa").count();
    registrar("11a (Esc cancela a criação incompleta, sem tocar o banco)", antesEsc === 1 && depoisEsc === 0, `${antesEsc} → ${depoisEsc}`);

    await arrastar(P, await celula(P, 11, 2), await celula(P, 14, 2));
    const antesTroca = await P.locator(".rv-camada-areas .rv-area--previa").count();
    await P.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
    await P.waitForTimeout(150);
    const depoisTroca = await P.locator(".rv-camada-areas .rv-area--previa").count();
    const painelSumiu = await P.locator('[data-testid="painel-areas"]').count();
    registrar("11b (trocar de ferramenta cancela a criação incompleta)", antesTroca === 1 && depoisTroca === 0 && painelSumiu === 0, `${antesTroca} → ${depoisTroca}, painel=${painelSumiu}`);
    await abrirAreas(P);
  }

  // ── 12. Início sobre token e sobre objeto ────────────────────────
  {
    const antes = await contarAreasNoBanco();
    const token = await P.locator(".rv-token").first().boundingBox();
    const idSelecionadoAntes = await P.locator(".rv-token.is-sel").count();
    await escolherTipo(P, "esfera");
    await arrastar(P, { x: token!.x + token!.width / 2, y: token!.y + token!.height / 2 }, await celula(P, 18, 2));
    const previa = await P.locator(".rv-camada-areas .rv-area--previa").count();
    const idSelecionadoDepois = await P.locator(".rv-token.is-sel").count();
    registrar("12a (o gesto pode COMEÇAR sobre um token — o token não é selecionado nem movido)",
      previa === 1 && idSelecionadoDepois === idSelecionadoAntes, `prévia=${previa}, selecionados ${idSelecionadoAntes}→${idSelecionadoDepois}`);
    await P.keyboard.press("Escape");

    const objeto = await P.locator(".rv-objeto").first().boundingBox();
    if (objeto) {
      await arrastar(P, { x: objeto.x + objeto.width / 2, y: objeto.y + objeto.height / 2 }, await celula(P, 22, 2));
      const previaObj = await P.locator(".rv-camada-areas .rv-area--previa").count();
      registrar("12b (o gesto pode COMEÇAR sobre um objeto/cobertura)", previaObj === 1, `prévia=${previaObj}`);
      await P.keyboard.press("Escape");
    } else {
      registrar("12b (o gesto pode COMEÇAR sobre um objeto/cobertura)", false, "nenhum objeto na cena de demonstração");
    }
    registrar("12c (nenhum desses gestos cancelados tocou o banco)", (await contarAreasNoBanco()) === antes, `${antes} áreas antes e depois`);
  }

  // ── 13. Botão direito não cria área (e o pan continua) ───────────
  {
    const antes = await contarAreasNoBanco();
    const de = await celula(P, 12, 12);
    const dPrimeiraAntes = await P.locator(".rv-camada-areas .rv-area path").first().getAttribute("d");
    await P.mouse.move(de.x, de.y);
    await P.mouse.down({ button: "right" });
    await P.mouse.move(de.x + 120, de.y + 60, { steps: 8 });
    await P.mouse.up({ button: "right" });
    await P.waitForTimeout(200);
    const previa = await P.locator(".rv-camada-areas .rv-area--previa").count();
    const transformDepois = await P.locator(".rv-mapa > g").first().getAttribute("transform");
    registrar("13a (botão direito NÃO inicia área)", previa === 0 && (await contarAreasNoBanco()) === antes, `prévia=${previa}`);
    registrar("13b (pan continua funcionando com a ferramenta Áreas ativa)", !!transformDepois && !transformDepois.startsWith("translate(0 0)"), transformDepois ?? "");
    registrar("13c (a geometria persistida não muda com o pan — nada depende de pixel de tela)",
      dPrimeiraAntes === (await P.locator(".rv-camada-areas .rv-area path").first().getAttribute("d")), "caminho idêntico");
  }

  // ── 16. Zoom não deforma nem muda o resultado ────────────────────
  {
    const antes = await P.locator(".rv-camada-areas .rv-area").evaluateAll((els) => els.map((e) => e.getAttribute("data-celulas-afetadas")).join(","));
    await P.locator('.rv-zoom button[aria-label="Aproximar"]').click();
    await P.locator('.rv-zoom button[aria-label="Aproximar"]').click();
    await P.waitForTimeout(200);
    const zoomAlto = await P.locator(".rv-camada-areas .rv-area").evaluateAll((els) => els.map((e) => e.getAttribute("data-celulas-afetadas")).join(","));
    for (let i = 0; i < 5; i++) await P.locator('.rv-zoom button[aria-label="Afastar"]').click();
    await P.waitForTimeout(200);
    const zoomBaixo = await P.locator(".rv-camada-areas .rv-area").evaluateAll((els) => els.map((e) => e.getAttribute("data-celulas-afetadas")).join(","));
    registrar("16a (zoom não muda NENHUM resultado da regra dos 50%)", antes === zoomAlto && antes === zoomBaixo, `${antes} | ${zoomAlto} | ${zoomBaixo}`);
    const arcoAindaArco = await P.locator('.rv-camada-areas .rv-area[data-area-tipo="esfera"] path').first().getAttribute("d");
    registrar("16b (em zoom baixo a esfera continua um círculo verdadeiro, não degraus)", !!arcoAindaArco && arcoAindaArco.includes("A"), (arcoAindaArco ?? "").slice(0, 40));
  }

  // ── 14. Edição, visibilidade, duplicação e exclusão ──────────────
  {
    // "Áreas na cena" abre RECOLHIDA por padrão (mesmo já havendo
    // áreas) — precisa expandir explicitamente antes de alcançar os
    // ícones da lista. Fica expandida pro resto da sessão (estado
    // preservado enquanto o painel continua montado).
    await P.locator('[data-testid="area-lista-toggle"]').click();
    await P.waitForSelector('[data-testid="area-lista"]', { timeout: 5000 });

    const alvo = await areaDoBanco("faixa");
    const id = alvo!.id as string;
    await P.locator(`[data-testid="area-editar-${id}"]`).click();
    await P.waitForFunction(() => document.querySelector('[data-testid="painel-areas"]')?.getAttribute("data-fase") === "editando", null, { timeout: 6000 });
    const alcas = await P.locator(".rv-area-alca").count();
    registrar("14b (editar mostra alças reais — origem, destino e largura da faixa)", alcas === 3, `${alcas} alças`);

    // Editando também mostra os botões flutuantes e a régua de medida —
    // MESMO comportamento de quando está criando.
    await P.waitForSelector('[data-testid="area-acoes-flutuantes"]', { timeout: 5000 });
    const rotulosEditando = await P.locator('[data-testid="area-acoes-flutuantes"] .rv-area-acao-rotulo').allInnerTexts();
    registrar("14b2 (editando mostra os botões flutuantes com rótulos Salvar/Cancelar)", rotulosEditando.includes("Salvar") && rotulosEditando.includes("Cancelar"), JSON.stringify(rotulosEditando));
    const medidaVisivel = await P.locator('[data-testid="area-acoes-medida"]').count();
    registrar("14b3 (a régua de medida fica visível editando, igual ao criar)", medidaVisivel === 1, `${medidaVisivel}`);

    // Arrastar a alça "destino" (comprimento) SEM Alt/Command tem que
    // dar um metro INTEIRO — nunca "1,22 m" só porque o pixel do
    // arrasto não caiu certo. Reproduz e prova a correção do bug.
    {
      const caixaDestino = await P.locator('.rv-area-alca--destino [role="slider"]').boundingBox();
      await P.mouse.move(caixaDestino!.x + caixaDestino!.width / 2, caixaDestino!.y + caixaDestino!.height / 2);
      await P.mouse.down();
      await P.mouse.move(caixaDestino!.x + 37, caixaDestino!.y + 13, { steps: 5 });
      await P.mouse.up();
      await P.waitForTimeout(150);
      const comprimentoTexto = await P.locator('[data-testid="area-campo-comprimento"]').inputValue();
      const comprimento = Number(comprimentoTexto);
      registrar("14b4 (arrastar a alça SEM Alt/Command dá metro INTEIRO)", Number.isInteger(comprimento), `comprimento=${comprimentoTexto}`);

      // A MESMA alça, agora segurando Alt — libera a fração, como no
      // arrasto de criação. Precisa de um NOVO pointerdown (o anterior
      // já soltou a captura no `mouse.up()` de cima) na posição ATUAL
      // da alça, que já se moveu depois do primeiro arrasto.
      const caixaDestino2 = await P.locator('.rv-area-alca--destino [role="slider"]').boundingBox();
      await P.mouse.move(caixaDestino2!.x + caixaDestino2!.width / 2, caixaDestino2!.y + caixaDestino2!.height / 2);
      await P.mouse.down();
      await P.keyboard.down("Alt");
      await P.mouse.move(caixaDestino2!.x + 29, caixaDestino2!.y + 8, { steps: 5 });
      await P.mouse.up();
      await P.keyboard.up("Alt");
      await P.waitForTimeout(150);
      const comprimentoComAlt = Number(await P.locator('[data-testid="area-campo-comprimento"]').inputValue());
      registrar("14b5 (com Alt segurado, a alça libera medida fracionária — mesma regra do criar)", !Number.isInteger(comprimentoComAlt), `comprimento=${comprimentoComAlt}`);
    }

    await P.locator('[data-testid="area-campo-largura"]').fill("5");
    await P.locator('[data-testid="area-salvar"]').click();
    await P.waitForFunction(() => document.querySelector('[data-testid="painel-areas"]')?.getAttribute("data-fase") === "ociosa", null, { timeout: 10000 });
    const depois = await areaDoBanco("faixa");
    registrar("14c (edição persiste e sobe a revisão)", Number(depois!.largura_m) === 5 && Number(depois!.revision) > Number(alvo!.revision), `largura ${alvo!.largura_m}→${depois!.largura_m} m, revisão ${alvo!.revision}→${depois!.revision}`);

    // Esc durante edição restaura a última versão confirmada.
    await P.locator(`[data-testid="area-editar-${id}"]`).click();
    await P.waitForFunction(() => document.querySelector('[data-testid="painel-areas"]')?.getAttribute("data-fase") === "editando", null, { timeout: 6000 });
    await P.locator('[data-testid="area-campo-largura"]').fill("9");
    await P.locator("body").click({ position: { x: 5, y: 5 } });
    await P.keyboard.press("Escape");
    await P.waitForTimeout(200);
    const semSalvar = await areaDoBanco("faixa");
    registrar("14d (Esc durante a edição descarta a alteração sem tocar o banco)", Number(semSalvar!.largura_m) === 5, `largura no banco = ${semSalvar!.largura_m} m`);

    await P.locator(`[data-testid="area-visibilidade-${id}"]`).click();
    await P.waitForTimeout(700);
    const oculta = await areaDoBanco("faixa");
    registrar("14e (ocultar dos jogadores persiste)", oculta!.visivel === false, `visivel=${oculta!.visivel}`);

    const antesDup = await contarAreasNoBanco();
    await P.locator(`[data-testid="area-duplicar-${id}"]`).click();
    const depoisDup = await esperarContagemAreas(antesDup + 1);
    registrar("14f (duplicar cria uma área nova)", depoisDup === antesDup + 1, `${antesDup} → ${depoisDup}`);
  }

  // ── 14g. Persistência sobrevive a reload ─────────────────────────
  {
    const noBanco = await contarAreasNoBanco();
    await P.reload({ waitUntil: "networkidle" });
    await P.waitForSelector(".rv-camada-areas", { timeout: 20000 });
    const desenhadas = await P.locator(".rv-camada-areas .rv-area").count();
    registrar("14g (as áreas sobrevivem ao reload — persistência de verdade)", desenhadas === noBanco, `${desenhadas} desenhadas / ${noBanco} no banco`);
    const previaSobrando = await P.locator(".rv-camada-areas .rv-area--previa").count();
    registrar("14h (nenhuma prévia sobrevive à remontagem)", previaSobrando === 0, `${previaSobrando} prévias`);
  }

  // ── 15. Duas sessões: sincronização, remoção — SEM autorização
  // explícita (0083 removeu essa seção): o jogador já vê e usa a
  // ferramenta desde o carregamento (1b), nenhuma concessão prévia.
  {
    await abrirAreas(P);
    // A remontagem (reload acima) resetou "Áreas na cena" pro padrão
    // recolhido — precisa expandir de novo pra alcançar os ícones da lista.
    await P.locator('[data-testid="area-lista-toggle"]').click();
    await P.waitForSelector('[data-testid="area-lista"]', { timeout: 5000 });

    // O jogador NÃO vê a área oculta pelo narrador (RLS).
    const visiveisJogador = await jogador.page.locator(".rv-camada-areas .rv-area").count();
    const totalBanco = await contarAreasNoBanco();
    registrar("15a (área oculta pelo narrador não chega ao jogador — RLS, não só interface)", visiveisJogador < totalBanco, `${visiveisJogador} visíveis / ${totalBanco} no banco`);

    // Sincronização ao vivo: o narrador cria, o jogador vê sem reload.
    const antesJogador = await jogador.page.locator(".rv-camada-areas .rv-area").count();
    await escolherTipo(P, "cone");
    await arrastar(P, await celula(P, 9, 3), await celula(P, 15, 3));
    await manterNaMesa(P);
    await jogador.page.waitForFunction(
      (n) => document.querySelectorAll(".rv-camada-areas .rv-area").length > n,
      antesJogador, { timeout: 12000 },
    ).catch(() => {});
    const depoisJogador = await jogador.page.locator(".rv-camada-areas .rv-area").count();
    registrar("15b (área nova aparece na OUTRA sessão sem reload)", depoisJogador === antesJogador + 1, `${antesJogador} → ${depoisJogador}`);

    // Exclusão remota some na outra sessão.
    const { data: cone } = await admin.from("vtt_areas").select("id").eq("campaign_id", campaignId).eq("tipo", "cone").limit(1).maybeSingle();
    await P.locator(`[data-testid="area-excluir-${cone!.id}"]`).click();
    await jogador.page.waitForFunction(
      (n) => document.querySelectorAll(".rv-camada-areas .rv-area").length < n,
      depoisJogador, { timeout: 12000 },
    ).catch(() => {});
    const aposExclusao = await jogador.page.locator(".rv-camada-areas .rv-area").count();
    registrar("15c (exclusão remota some na outra sessão sem reload)", aposExclusao === depoisJogador - 1, `${depoisJogador} → ${aposExclusao}`);

    // Revelar uma área oculta chega ao jogador (invalidação sanitizada).
    const faixa = await areaDoBanco("faixa");
    const antesRevelar = await jogador.page.locator(".rv-camada-areas .rv-area").count();
    await P.locator(`[data-testid="area-visibilidade-${faixa!.id}"]`).click();
    await jogador.page.waitForFunction(
      (n) => document.querySelectorAll(".rv-camada-areas .rv-area").length > n,
      antesRevelar, { timeout: 12000 },
    ).catch(() => {});
    const aposRevelar = await jogador.page.locator(".rv-camada-areas .rv-area").count();
    registrar("15d (revelar uma área oculta chega ao jogador — canal de invalidação sanitizada)", aposRevelar === antesRevelar + 1, `${antesRevelar} → ${aposRevelar}`);
  }

  // ── 18. Alternativa mínima de TECLADO nas alças (auditoria pós-0081) ──
  // `page.keyboard.press` do Playwright (diferente da ferramenta de
  // automação remota usada em outras verificações desta rodada) envia
  // o evento de teclado de verdade — é o caminho fiel pra confirmar
  // que a alça responde por teclado, não só por ponteiro.
  {
    const faixaId = (await areaDoBanco("faixa"))!.id as string;
    await P.locator(`[data-testid="area-editar-${faixaId}"]`).click();
    await P.waitForFunction(() => document.querySelector('[data-testid="painel-areas"]')?.getAttribute("data-fase") === "editando", null, { timeout: 6000 });
    const antesLargura = await P.locator('[data-testid="area-campo-largura"]').inputValue();
    // Clica na alça de "largura" pra focá-la (mesmo elemento que o
    // arraste de ponteiro usa) e usa Shift+Seta (passo maior) — sem
    // NENHUM arraste de mouse.
    await P.locator('.rv-area-alca--largura [role="slider"]').click();
    const focoAntes = await P.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    await P.keyboard.press("Shift+ArrowUp");
    await P.waitForTimeout(150);
    const depoisLargura = await P.locator('[data-testid="area-campo-largura"]').inputValue();
    registrar("18 (alça de largura responde a Shift+Seta do teclado, sem nenhum arraste de ponteiro)",
      focoAntes === "Alterar a largura" && depoisLargura !== antesLargura,
      `foco="${focoAntes}", largura ${antesLargura}→${depoisLargura}`);
    await P.locator('[data-testid="area-cancelar-edicao"]').click();
  }

  // ══════════════════════════════════════════════════════════════
  // 19-24. REVISÃO DE UX (janela, guia, snap, arredondamento, ações)
  // ══════════════════════════════════════════════════════════════

  // ── 19. Janela: cabeçalho, recolher, arrastar, limites ──────────
  {
    const cab = P.locator('[data-testid="area-cabecalho"]');
    const antes = await P.locator('[data-testid="painel-areas"]').boundingBox();
    // Arrasta a janela PELO CABEÇALHO com mouse real.
    await P.mouse.move(antes!.x + 60, antes!.y + 12);
    await P.mouse.down();
    await P.mouse.move(antes!.x + 260, antes!.y + 160, { steps: 10 });
    await P.mouse.up();
    await P.waitForTimeout(150);
    const depois = await P.locator('[data-testid="painel-areas"]').boundingBox();
    registrar("19 (janela é arrastável pelo cabeçalho)", !!depois && Math.abs(depois.x - antes!.x) > 100, `x ${antes!.x} → ${depois?.x}`);
    void cab;

    // Arrastar pra MUITO longe não pode tirar a janela da tela.
    await P.mouse.move(depois!.x + 60, depois!.y + 12);
    await P.mouse.down();
    await P.mouse.move(5000, 5000, { steps: 6 });
    await P.mouse.up();
    await P.waitForTimeout(150);
    const extremo = await P.locator('[data-testid="painel-areas"]').boundingBox();
    const vp = P.viewportSize()!;
    registrar("19b (janela nunca sai completamente do viewport — faixa do cabeçalho sempre alcançável)",
      !!extremo && extremo.x < vp.width && extremo.y < vp.height, `${JSON.stringify(extremo)} viewport=${vp.width}×${vp.height}`);

    // Redimensionar o VIEWPORT depois de um arrasto manual NÃO pode
    // resetar a janela pra perto da barra de ferramentas de novo — a
    // posição manual tem prioridade sobre o reposicionamento
    // automático (`prefsAreas.posicaoManual`).
    const antesResize = await P.locator('[data-testid="painel-areas"]').boundingBox();
    await P.setViewportSize({ width: vp.width - 120, height: vp.height });
    await P.waitForTimeout(200);
    const depoisResize = await P.locator('[data-testid="painel-areas"]').boundingBox();
    const barraAgora = await P.locator(".rv-ferramentas").boundingBox();
    registrar("19e (posição manual sobrevive a um resize — não volta a colar na barra)",
      !!antesResize && !!depoisResize && !!barraAgora && (depoisResize.x - (barraAgora.x + barraAgora.width)) > 30,
      `antes.x=${antesResize?.x} depois.x=${depoisResize?.x} barra.right=${barraAgora ? barraAgora.x + barraAgora.width : "?"}`);
    await P.setViewportSize({ width: vp.width, height: vp.height });
    await P.waitForTimeout(150);

    // Recolher/expandir.
    await P.locator('[data-testid="area-recolher"]').click();
    await P.waitForTimeout(120);
    const corpoRecolhido = await P.locator('[data-testid="area-lista-toggle"]').count();
    await P.locator('[data-testid="area-recolher"]').click();
    await P.waitForTimeout(120);
    const corpoExpandido = await P.locator('[data-testid="area-lista-toggle"]').count();
    registrar("19c (recolher esconde o corpo e expandir traz de volta)", corpoRecolhido === 0 && corpoExpandido === 1, `recolhido=${corpoRecolhido}, expandido=${corpoExpandido}`);

    // Devolve a janela pra perto do canto pra não atrapalhar os gestos seguintes.
    const atual = await P.locator('[data-testid="painel-areas"]').boundingBox();
    await P.mouse.move(atual!.x + 60, atual!.y + 12);
    await P.mouse.down();
    await P.mouse.move(80, 90, { steps: 8 });
    await P.mouse.up();
    await P.waitForTimeout(150);
  }

  // ── 20. Guia visual durante o arraste ───────────────────────────
  {
    await escolherTipo(P, "esfera");
    const a = await celula(P, 14, 4);
    const b = await celula(P, 18, 4);
    await P.mouse.move(a.x, a.y);
    await P.mouse.down();
    await P.mouse.move(b.x, b.y, { steps: 8 });
    const guia = await P.locator('[data-testid="area-guia"]').count();
    const origem = await P.locator('[data-testid="area-guia-origem"]').count();
    const destino = await P.locator('[data-testid="area-guia-destino"]').count();
    const texto = await P.locator('[data-testid="area-guia"]').getAttribute("data-texto");
    registrar("20 (guia aparece durante o arraste, com marcador de origem e de posição atual)",
      guia === 1 && origem === 1 && destino === 1, `guia=${guia}, origem=${origem}, destino=${destino}`);
    registrar("20b (guia mostra a medida em metros ao lado da linha)", !!texto && /m$/.test(texto), `texto="${texto}"`);
    // A guia é puramente visual — não intercepta ponteiro.
    const semPonteiro = await P.locator('[data-testid="area-guia"]').evaluate((el) => getComputedStyle(el).pointerEvents);
    registrar("20c (guia tem pointer-events: none — nunca rouba o gesto)", semPonteiro === "none", `pointer-events=${semPonteiro}`);
    await P.mouse.up();
    await P.waitForTimeout(120);
    const aposConcluir = await P.locator('[data-testid="area-guia"]').count();
    registrar("20d (guia some ao concluir o gesto)", aposConcluir === 0, `${aposConcluir}`);
    await P.locator('[data-testid="area-descartar"]').click();
    await P.waitForTimeout(120);
  }

  // ── 21. Snap angular ligado por padrão + medida inteira ─────────
  {
    await escolherTipo(P, "cone");
    const marcado = await P.locator('[data-testid="area-campo-snap"]').isChecked();
    registrar("21 (snap angular de 15° vem LIGADO por padrão)", marcado, `marcado=${marcado}`);

    const a = await celula(P, 12, 6);
    const b = await celula(P, 17, 7);
    await arrastar(P, a, b);
    await P.waitForTimeout(120);
    const dir = Number(await P.locator('[data-testid="area-campo-direcao"]').inputValue());
    const alcance = Number(await P.locator('[data-testid="area-campo-alcance"]').inputValue());
    registrar("21b (com snap ligado, a direção é múltiplo exato de 15°)", dir % 15 === 0, `direção=${dir}°`);
    registrar("21c (a dimensão é INTEIRA por padrão, sem modificador)", Number.isInteger(alcance), `alcance=${alcance} m`);
    await P.locator('[data-testid="area-descartar"]').click();
    await P.waitForTimeout(120);

    // Desligar o snap → direção livre (não múltiplo de 15 em geral).
    await P.locator('[data-testid="area-campo-snap"]').uncheck();
    await P.waitForTimeout(100);
    await arrastar(P, await celula(P, 12, 6), await celula(P, 17, 7));
    await P.waitForTimeout(120);
    const dirLivre = Number(await P.locator('[data-testid="area-campo-direcao"]').inputValue());
    registrar("21d (com snap desligado, a direção é livre)", dirLivre % 15 !== 0, `direção=${dirLivre}°`);
    await P.locator('[data-testid="area-descartar"]').click();
    await P.locator('[data-testid="area-campo-snap"]').check();
    await P.waitForTimeout(120);
  }

  // ── 22. Modificador de precisão livre (Alt / Meta) ──────────────
  {
    await escolherTipo(P, "esfera");
    const a = await celula(P, 12, 9);
    const b = await celula(P, 16, 10);

    // Sem modificador → inteiro.
    await arrastar(P, a, b);
    await P.waitForTimeout(120);
    const inteiro = Number(await P.locator('[data-testid="area-campo-raio"]').inputValue());
    registrar("22 (sem modificador — raio inteiro)", Number.isInteger(inteiro), `raio=${inteiro} m`);
    await P.locator('[data-testid="area-descartar"]').click();
    await P.waitForTimeout(100);

    // Com Alt segurado durante o movimento → fração permitida.
    await P.mouse.move(a.x, a.y);
    await P.mouse.down();
    await P.keyboard.down("Alt");
    await P.mouse.move(b.x, b.y, { steps: 8 });
    await P.mouse.move(b.x + 7, b.y + 5, { steps: 3 });
    const comAlt = Number(await P.locator('[data-testid="area-campo-raio"]').inputValue());
    // Soltar o Alt AINDA durante o gesto volta pro inteiro.
    await P.keyboard.up("Alt");
    await P.mouse.move(b.x + 8, b.y + 6, { steps: 2 });
    const semAlt = Number(await P.locator('[data-testid="area-campo-raio"]').inputValue());
    await P.mouse.up();
    await P.waitForTimeout(120);
    registrar("22b (Alt segurado durante o arraste libera medida fracionária)", !Number.isInteger(comAlt), `raio com Alt=${comAlt} m`);
    registrar("22c (soltar Alt no meio do gesto volta imediatamente ao inteiro)", Number.isInteger(semAlt), `raio sem Alt=${semAlt} m`);
    registrar("22d (a fração nunca vem com ruído binário — no máximo 2 casas)", String(comAlt).replace("-", "").split(".")[1]?.length <= 2 || Number.isInteger(comAlt), `${comAlt}`);
    await P.locator('[data-testid="area-descartar"]').click();
    await P.waitForTimeout(100);

    // Meta/Command tem o mesmo efeito.
    await P.mouse.move(a.x, a.y);
    await P.mouse.down();
    await P.keyboard.down("Meta");
    await P.mouse.move(b.x + 7, b.y + 5, { steps: 8 });
    const comMeta = Number(await P.locator('[data-testid="area-campo-raio"]').inputValue());
    await P.keyboard.up("Meta");
    await P.mouse.up();
    await P.waitForTimeout(120);
    registrar("22e (Command/Meta também libera medida fracionária)", !Number.isInteger(comMeta), `raio com Meta=${comMeta} m`);
    await P.locator('[data-testid="area-descartar"]').click();
    await P.waitForTimeout(120);
  }

  // ── 23. Snap da origem em token ─────────────────────────────────
  {
    await escolherTipo(P, "esfera");
    const desligadoPorPadrao = await P.locator('[data-testid="area-campo-snap-token"]').isChecked();
    registrar("23 (snap da origem em token vem DESLIGADO por padrão)", !desligadoPorPadrao, `marcado=${desligadoPorPadrao}`);

    // Liga e arrasta a partir do CENTRO REAL de um token de uma
    // célula. A caixa do `<g>` do token não serve: ela inclui halo,
    // pegada e rótulos, então seu centro não é a origem mecânica — e é
    // exatamente a origem mecânica que o snap usa.
    await P.locator('[data-testid="area-campo-snap-token"]').check();
    await P.waitForTimeout(100);
    // Coloca um token de UMA célula numa posição conhecida e livre do
    // painel — determinístico, em vez de depender de onde a cena de
    // demonstração deixou os tokens (que podem cair sob a janela).
    const { data: tokenUmHex } = await admin.from("vtt_tokens")
      .select("id,revision").eq("campaign_id", campaignId).in("tamanho", ["pequeno", "medio"]).limit(1).maybeSingle();
    const COL_LIVRE = 20, ROW_LIVRE = 8;
    await admin.from("vtt_tokens")
      .update({ q: COL_LIVRE - Math.floor(ROW_LIVRE / 2), r: ROW_LIVRE, revision: (tokenUmHex!.revision as number) + 1 })
      .eq("id", tokenUmHex!.id as string);
    await P.waitForTimeout(1500); // Realtime entrega a posição nova
    const centroToken = await celula(P, COL_LIVRE, ROW_LIVRE);
    await P.mouse.move(centroToken.x + 3, centroToken.y + 3);
    await P.mouse.down();
    await P.mouse.move(centroToken.x + 120, centroToken.y, { steps: 8 });
    const marcaToken = await P.locator('[data-testid="area-guia-token"]').count();
    registrar("23b (token próximo é capturado — a guia marca a origem mecânica dele)", marcaToken === 1, `${marcaToken} marcador de captura`);
    await P.mouse.up();
    await P.waitForTimeout(120);
    await P.locator('[data-testid="area-descartar"]').click();
    await P.waitForTimeout(100);

    // Longe de qualquer token: nada é capturado, e a criação NÃO é bloqueada.
    const longe = await celula(P, 22, 12);
    await P.mouse.move(longe.x, longe.y);
    await P.mouse.down();
    await P.mouse.move(longe.x + 100, longe.y, { steps: 8 });
    const semCaptura = await P.locator('[data-testid="area-guia-token"]').count();
    const guiaExiste = await P.locator('[data-testid="area-guia"]').count();
    registrar("23c (token distante NÃO é capturado, e a criação continua liberada)", semCaptura === 0 && guiaExiste === 1, `captura=${semCaptura}, guia=${guiaExiste}`);
    await P.mouse.up();
    await P.waitForTimeout(120);
    await P.locator('[data-testid="area-descartar"]').click();
    await P.locator('[data-testid="area-campo-snap-token"]').uncheck();
    await P.waitForTimeout(120);
  }

  // ── 24. Botões contextuais junto da geometria ────────────────────
  {
    const antesNoBanco = await contarAreasNoBanco();
    await escolherTipo(P, "esfera");
    await arrastar(P, await celula(P, 13, 3), await celula(P, 16, 3));
    await P.waitForTimeout(150);
    const flutuantes = await P.locator('[data-testid="area-acoes-flutuantes"]').count();
    const caixaAcoes = await P.locator('[data-testid="area-acoes-flutuantes"]').boundingBox();
    const vp = P.viewportSize()!;
    registrar("24 (botões contextuais aparecem no MAPA junto da geometria concluída)", flutuantes === 1, `${flutuantes} grupo`);
    registrar("24b (grupo de ações fica dentro do viewport)",
      !!caixaAcoes && caixaAcoes.x >= 0 && caixaAcoes.y >= 0 && caixaAcoes.x + caixaAcoes.width <= vp.width + 1 && caixaAcoes.y + caixaAcoes.height <= vp.height + 1,
      JSON.stringify(caixaAcoes));
    const rotuloManter = await P.locator('[data-testid="area-flutuante-manter"]').getAttribute("aria-label");
    const rotuloDescartar = await P.locator('[data-testid="area-flutuante-descartar"]').getAttribute("aria-label");
    registrar("24c (ações contextuais têm rótulo acessível)",
      rotuloManter === "Manter área na mesa" && rotuloDescartar === "Descartar área", `"${rotuloManter}" / "${rotuloDescartar}"`);

    // Descartar contextual não persiste nada.
    await P.locator('[data-testid="area-flutuante-descartar"]').click();
    await P.waitForTimeout(300);
    const aposDescarte = await contarAreasNoBanco();
    registrar("24d (descarte contextual não toca o banco)", aposDescarte === antesNoBanco, `${antesNoBanco} áreas antes e depois`);

    // Confirmar contextual persiste.
    await arrastar(P, await celula(P, 13, 3), await celula(P, 16, 3));
    await P.waitForTimeout(150);
    await P.locator('[data-testid="area-flutuante-manter"]').click();
    await P.waitForFunction(() => document.querySelector('[data-testid="painel-areas"]')?.getAttribute("data-fase") === "ociosa", null, { timeout: 10000 });
    const aposConfirmar = await esperarContagemAreas(antesNoBanco + 1);
    registrar("24e (confirmação contextual persiste a área)", aposConfirmar === antesNoBanco + 1, `${antesNoBanco} → ${aposConfirmar}`);

    // O rodapé do painel continua oferecendo a MESMA ação por teclado.
    await arrastar(P, await celula(P, 19, 3), await celula(P, 22, 3));
    await P.waitForTimeout(150);
    const rodape = await P.locator('[data-testid="area-rodape-previa"]').count();
    await P.locator('[data-testid="area-manter"]').focus();
    await P.keyboard.press("Enter");
    await P.waitForFunction(() => document.querySelector('[data-testid="painel-areas"]')?.getAttribute("data-fase") === "ociosa", null, { timeout: 10000 });
    const aposTeclado = await esperarContagemAreas(antesNoBanco + 2);
    registrar("24f (a mesma ação continua alcançável por TECLADO pelo rodapé do painel)",
      rodape === 1 && aposTeclado === antesNoBanco + 2, `rodapé=${rodape}, áreas=${aposTeclado}`);
  }

  // ── 25. Duplo-clique em "Manter" NUNCA cria duas áreas ────────────
  // Rodada de correção de UX: `manterAreaNaMesa` ganhou uma trava de
  // reentrância — clicar duas vezes rápido (ou o botão flutuante e o
  // do painel quase juntos) não pode disparar duas RPCs de criação.
  {
    const antes = await contarAreasNoBanco();
    await escolherTipo(P, "esfera");
    await arrastar(P, await celula(P, 10, 3), await celula(P, 13, 3));
    await P.waitForTimeout(150);
    // Dois cliques REAIS, sem esperar entre eles — o mais perto que
    // Playwright chega de um duplo-clique humano rápido no MESMO botão.
    const botao = P.locator('[data-testid="area-manter"]');
    await Promise.all([
      botao.click({ timeout: 2000 }).catch(() => {}),
      botao.click({ force: true, timeout: 2000 }).catch(() => {}),
    ]);
    await P.waitForFunction(() => document.querySelector('[data-testid="painel-areas"]')?.getAttribute("data-fase") === "ociosa", null, { timeout: 10000 });
    const depois = await contarAreasNoBanco();
    registrar("25 (duplo-clique em Manter cria EXATAMENTE uma área, nunca duas)", depois === antes + 1, `antes=${antes}, depois=${depois}`);
  }

  // ══════════════════════════════════════════════════════════════
  // 26. Botão de edição rápida — hover repetido, Interagir/Medir, permissão, região interativa
  // ══════════════════════════════════════════════════════════════
  let centroAreaTesteHover: { x: number; y: number };
  {
    // Esfera NOVA, num canto limpo, só pra estes testes — a ORIGEM do
    // arrasto (`a`) é o CENTRO geométrico do disco, garantidamente
    // dentro da forma (nunca só a caixa envolvente).
    const a = await celula(P, 10, 6), b = await celula(P, 12, 6);
    await escolherTipo(P, "esfera");
    await P.mouse.move(a.x, a.y); await P.mouse.down();
    await P.mouse.move(b.x, b.y, { steps: 6 }); await P.mouse.up();
    await manterNaMesa(P);
    centroAreaTesteHover = a;
    // Criar já SELECIONA a área (comportamento existente, correto —
    // seleção também mantém o botão visível). Pros testes de hover
    // isolado (26a-26c) precisamos DESSELECIONAR primeiro, senão o
    // botão fica visível pela seleção, não pelo hover que queremos medir.
    const { data: novaEsfera } = await admin.from("vtt_areas").select("id").eq("campaign_id", campaignId).eq("tipo", "esfera").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const idEsferaHover = novaEsfera!.id as string;
    await P.locator(`[data-testid="area-item-${idEsferaHover}"] .rv-area-item-nome`).click();
    await P.waitForTimeout(150);

    // 26a — hover mostra, sair esconde, hover de novo reaparece.
    await P.mouse.move(centroAreaTesteHover.x, centroAreaTesteHover.y);
    await P.waitForSelector('[data-testid="area-editar-rapido"]', { timeout: 4000 });
    registrar("26a (hover sobre a área mostra o botão — ferramenta Áreas)", true, "apareceu");
    // Sai da forma da própria área (mesma célula da borda, já fora do
    // raio) — testa o caso central do bug sem depender de nenhum ponto
    // "vazio" adivinhado num mapa com dezenas de outras áreas.
    await P.mouse.move(b.x + 80, b.y);
    // A suíte já criou dezenas de outras áreas — o ponto de saída pode
    // legitimamente cair sobre OUTRA área editável (aí o botão troca
    // de alvo, o que é correto). O teste checa especificamente que
    // NOSSA esfera parou de mostrar o botão, não que nenhum botão exista.
    await P.waitForFunction(
      (id) => document.querySelector('[data-testid="area-editar-rapido"]')?.getAttribute("data-area-id") !== id,
      idEsferaHover, { timeout: 4000 },
    ).catch(() => {});
    const idMostradoDepois = await P.locator('[data-testid="area-editar-rapido"]').getAttribute("data-area-id").catch(() => null);
    const naoMostraMaisANossa = idMostradoDepois !== idEsferaHover;
    registrar("26b (sair da área esconde o botão — nossa área não fica mais em exibição)", naoMostraMaisANossa, `mostrado=${idMostradoDepois}, nossa=${idEsferaHover}`);
    await P.mouse.move(centroAreaTesteHover.x, centroAreaTesteHover.y);
    await P.waitForSelector('[data-testid="area-editar-rapido"]', { timeout: 4000 });
    registrar("26c (novo hover faz o botão REAPARECER — não fica preso ausente)", true, "reapareceu");
    await P.mouse.move(20, 20);
    await P.waitForTimeout(300);

    // 26d — com Interagir, o botão também aparece; com Medir, não.
    await P.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
    await P.mouse.move(centroAreaTesteHover.x, centroAreaTesteHover.y);
    await P.waitForSelector('[data-testid="area-editar-rapido"]', { timeout: 4000 });
    registrar("26d (com Interagir, hover sobre a área também mostra o botão)", true, "apareceu");
    await P.mouse.move(20, 20);
    await P.waitForTimeout(300);
    await P.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Medir"]').click();
    await P.mouse.move(centroAreaTesteHover.x, centroAreaTesteHover.y);
    await P.waitForTimeout(500);
    const comMedir = await P.locator('[data-testid="area-editar-rapido"]').count();
    registrar("26e (com Medir, o botão NÃO aparece)", comMedir === 0, `${comMedir}`);
    await P.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Áreas"]').click();
    await P.waitForTimeout(200);

    // 26f — mover o ponteiro da área até o botão, sem ele sumir, e clicar.
    // Seleção e hover têm lápis INDEPENDENTES, e a essa altura a suíte
    // já criou dezenas de áreas sobrepostas — ao caminhar até o botão o
    // ponteiro passa por OUTRA área, que legitimamente ganha o lápis
    // dela. Então o teste fixa o id do lápis que apareceu neste hover e
    // segue exatamente esse, em vez de um seletor genérico (que casaria
    // com mais de um botão) ou do id da esfera (que pode não ser a área
    // desenhada por cima neste ponto).
    await P.mouse.move(centroAreaTesteHover.x, centroAreaTesteHover.y);
    await P.waitForSelector('[data-testid="area-editar-rapido"]', { timeout: 4000 });
    const idLapisSeguido = await P.locator('[data-testid="area-editar-rapido"]').first().getAttribute("data-area-id");
    const lapisDaNossaArea = `[data-testid="area-editar-rapido"][data-area-id="${idLapisSeguido}"]`;
    const caixaBotao = await P.locator(lapisDaNossaArea).boundingBox();
    const alvoBotao = { x: caixaBotao!.x + caixaBotao!.width / 2, y: caixaBotao!.y + caixaBotao!.height / 2 };
    await P.mouse.move(
      (centroAreaTesteHover.x + alvoBotao.x) / 2,
      (centroAreaTesteHover.y + alvoBotao.y) / 2,
      { steps: 5 },
    );
    const aindaVisivelNoMeioDoCaminho = (await P.locator(lapisDaNossaArea).count()) === 1;
    await P.mouse.move(alvoBotao.x, alvoBotao.y, { steps: 5 });
    await P.locator(lapisDaNossaArea).click();
    await P.waitForFunction(() => document.querySelector('[data-testid="painel-areas"]')?.getAttribute("data-fase") === "editando", null, { timeout: 6000 });
    registrar("26f (mover da área até o botão sem ele sumir, e clicar entra em edição)", aindaVisivelNoMeioDoCaminho, `meio-do-caminho=${aindaVisivelNoMeioDoCaminho}`);
    await P.locator('[data-testid="area-cancelar-edicao"]').click();
    await P.waitForTimeout(200);

    // 26g — permissão: narrador vê em qualquer área; criador vê na própria; outro jogador não vê em área alheia.
    await jogador.page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Áreas"]').click().catch(() => {});
    await jogador.page.waitForSelector('[data-testid="painel-areas"]', { timeout: 8000 }).catch(() => {});
    await jogador.page.mouse.move(centroAreaTesteHover.x, centroAreaTesteHover.y);
    await jogador.page.waitForTimeout(500);
    const jogadorVeAreaDoNarrador = await jogador.page.locator('[data-testid="area-editar-rapido"]').count();
    registrar("26g (outro jogador NÃO vê o botão numa área do narrador)", jogadorVeAreaDoNarrador === 0, `${jogadorVeAreaDoNarrador}`);
    await jogador.page.mouse.move(20, 20);

    await escolherTipo(jogador.page, "esfera");
    const ja = await celula(jogador.page, 16, 6), jb = await celula(jogador.page, 18, 6);
    await jogador.page.mouse.move(ja.x, ja.y); await jogador.page.mouse.down();
    await jogador.page.mouse.move(jb.x, jb.y, { steps: 6 }); await jogador.page.mouse.up();
    await manterNaMesa(jogador.page);
    await jogador.page.mouse.move(ja.x, ja.y);
    await jogador.page.waitForSelector('[data-testid="area-editar-rapido"]', { timeout: 4000 });
    registrar("26h (o jogador CRIADOR vê o botão na PRÓPRIA área)", true, "apareceu");
    await jogador.page.mouse.move(20, 20);
    await jogador.page.waitForTimeout(300);
  }

  // ══════════════════════════════════════════════════════════════
  // 27. "Áreas na cena" — recolhida por padrão, alterna, criação/edição não força expandir
  // ══════════════════════════════════════════════════════════════
  {
    // Remonta o painel do jogador do zero — estado local de UI não é
    // persistido (nem deveria), então uma montagem NOVA é o único jeito
    // confiável de checar "abre recolhida por padrão" sem contaminação
    // de um toggle anterior nesta mesma sessão.
    await jogador.page.reload({ waitUntil: "networkidle" });
    await jogador.page.waitForSelector(".rv-ferramentas", { timeout: 20000 });
    await abrirAreas(jogador.page);

    const expandidoInicial = await jogador.page.locator('[data-testid="area-lista-toggle"]').getAttribute("aria-expanded");
    const corpoInicial = await jogador.page.locator('[data-testid="area-lista"]').count();
    registrar("27a (\"Áreas na cena\" abre RECOLHIDA por padrão, mesmo já havendo áreas)", expandidoInicial === "false" && corpoInicial === 0, `aria-expanded=${expandidoInicial}, corpo=${corpoInicial}`);

    await jogador.page.locator('[data-testid="area-lista-toggle"]').click();
    const expandidoDepois = await jogador.page.locator('[data-testid="area-lista-toggle"]').getAttribute("aria-expanded");
    const corpoDepois = await jogador.page.locator('[data-testid="area-lista"]').count();
    registrar("27b (clicar no cabeçalho expande)", expandidoDepois === "true" && corpoDepois === 1, `aria-expanded=${expandidoDepois}, corpo=${corpoDepois}`);

    await jogador.page.locator('[data-testid="area-lista-toggle"]').click();
    const expandidoRecolhe = await jogador.page.locator('[data-testid="area-lista-toggle"]').getAttribute("aria-expanded");
    registrar("27c (clicar de novo recolhe)", expandidoRecolhe === "false", `aria-expanded=${expandidoRecolhe}`);

    // Criar uma área não força expandir.
    await escolherTipo(jogador.page, "faixa");
    const fa = await celula(jogador.page, 21, 6), fb = await celula(jogador.page, 24, 6);
    // Meio do arrasto — dentro do RETÂNGULO de verdade. O ponto de
    // ORIGEM (`fa`) cai exatamente na ARESTA da faixa (`retanguloDoEixo`
    // centraliza a largura na origem, então ela é o meio de uma borda
    // curta, não o interior) — ambíguo pra um teste de "dentro da forma".
    const meioFaixa = { x: (fa.x + fb.x) / 2, y: (fa.y + fb.y) / 2 };
    await jogador.page.mouse.move(fa.x, fa.y); await jogador.page.mouse.down();
    await jogador.page.mouse.move(fb.x, fb.y, { steps: 6 }); await jogador.page.mouse.up();
    await manterNaMesa(jogador.page);
    const aindaRecolhidaAposCriar = await jogador.page.locator('[data-testid="area-lista-toggle"]').getAttribute("aria-expanded");
    registrar("27d (criar uma área NÃO força a lista a expandir)", aindaRecolhidaAposCriar === "false", `aria-expanded=${aindaRecolhidaAposCriar}`);

    // Editar pelo botão contextual (rápido) também não força expandir.
    await jogador.page.mouse.move(meioFaixa.x, meioFaixa.y);
    await jogador.page.waitForSelector('[data-testid="area-editar-rapido"]', { timeout: 4000 });
    await jogador.page.locator('[data-testid="area-editar-rapido"]').click();
    await jogador.page.waitForFunction(() => document.querySelector('[data-testid="painel-areas"]')?.getAttribute("data-fase") === "editando", null, { timeout: 6000 });
    await jogador.page.locator('[data-testid="area-campo-largura"]').fill("2");
    await jogador.page.locator('[data-testid="area-salvar"]').click();
    await jogador.page.waitForFunction(() => document.querySelector('[data-testid="painel-areas"]')?.getAttribute("data-fase") === "ociosa", null, { timeout: 10000 });
    const aindaRecolhidaAposEditar = await jogador.page.locator('[data-testid="area-lista-toggle"]').getAttribute("aria-expanded");
    registrar("27e (atualizar uma área NÃO força a lista a expandir)", aindaRecolhidaAposEditar === "false", `aria-expanded=${aindaRecolhidaAposEditar}`);
  }

  // ══════════════════════════════════════════════════════════════
  // 28. Selecionar uma área e apertar Delete/Backspace exclui
  // ══════════════════════════════════════════════════════════════
  {
    await abrirAreas(P);
    await escolherTipo(P, "esfera");
    const a = await celula(P, 10, 8), b = await celula(P, 12, 8);
    await P.mouse.move(a.x, a.y); await P.mouse.down();
    await P.mouse.move(b.x, b.y, { steps: 6 }); await P.mouse.up();
    await manterNaMesa(P);
    const { data: nova } = await admin.from("vtt_areas").select("id").eq("campaign_id", campaignId).eq("tipo", "esfera").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const idParaExcluir = nova!.id as string;

    // Criar já seleciona — clica em outro lugar da própria área de
    // novo só pra confirmar que ela está mesmo selecionada, e então apaga.
    const antes = await contarAreasNoBanco();
    await P.keyboard.press("Delete");
    await esperarContagemAreas(antes - 1, 6000);
    const depois = await contarAreasNoBanco();
    registrar("28a (área selecionada + Delete exclui)", depois === antes - 1, `${antes} → ${depois}`);
    const { data: sumiu } = await admin.from("vtt_areas").select("id").eq("id", idParaExcluir).maybeSingle();
    registrar("28b (a área excluída é EXATAMENTE a selecionada)", !sumiu, `linha=${JSON.stringify(sumiu)}`);

    // Backspace faz o mesmo, com outra área.
    await escolherTipo(P, "esfera");
    const c = await celula(P, 14, 8), d = await celula(P, 16, 8);
    await P.mouse.move(c.x, c.y); await P.mouse.down();
    await P.mouse.move(d.x, d.y, { steps: 6 }); await P.mouse.up();
    await manterNaMesa(P);
    const antesB = await contarAreasNoBanco();
    await P.keyboard.press("Backspace");
    await esperarContagemAreas(antesB - 1, 6000);
    registrar("28c (Backspace faz o mesmo que Delete)", (await contarAreasNoBanco()) === antesB - 1, `${antesB} → ${await contarAreasNoBanco()}`);

    // Sem seleção nenhuma, Delete não faz nada (não derruba a mesa).
    await P.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
    await P.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Áreas"]').click();
    const antesSemSelecao = await contarAreasNoBanco();
    await P.keyboard.press("Delete");
    await P.waitForTimeout(400);
    registrar("28d (sem área selecionada, Delete não apaga nada)", (await contarAreasNoBanco()) === antesSemSelecao, `${antesSemSelecao} → ${await contarAreasNoBanco()}`);

    // Jogador consegue apagar a PRÓPRIA área do mesmo jeito (permissão
    // de autor, não só narrador) — e a proteção contra área ALHEIA já
    // está coberta: sem seleção possível (nenhum caminho de UI
    // seleciona a área de outra pessoa) e pela RPC (`check-vtt-areas-
    // seguranca-rpc.mjs`, testes 11b/11c), que recusa mesmo se forçada.
    await abrirAreas(jogador.page);
    await escolherTipo(jogador.page, "esfera");
    const g2 = await celula(jogador.page, 10, 10), h2 = await celula(jogador.page, 12, 10);
    await jogador.page.mouse.move(g2.x, g2.y); await jogador.page.mouse.down();
    await jogador.page.mouse.move(h2.x, h2.y, { steps: 6 }); await jogador.page.mouse.up();
    await manterNaMesa(jogador.page);
    const antesJogador = await contarAreasNoBanco();
    await jogador.page.keyboard.press("Delete");
    await esperarContagemAreas(antesJogador - 1, 6000);
    registrar("28e (jogador criador seleciona a própria área e apaga com Delete)", (await contarAreasNoBanco()) === antesJogador - 1, `${antesJogador} → ${await contarAreasNoBanco()}`);
  }

  // ══════════════════════════════════════════════════════════════
  // 29. Editar pelo ícone/atalho NUNCA força a janela de Áreas a abrir
  // ══════════════════════════════════════════════════════════════
  {
    // Cria uma área de teste e recolhe a janela inteira (não só a lista).
    await escolherTipo(P, "esfera");
    const a = await celula(P, 14, 3), b = await celula(P, 16, 3);
    await P.mouse.move(a.x, a.y); await P.mouse.down();
    await P.mouse.move(b.x, b.y, { steps: 6 }); await P.mouse.up();
    await manterNaMesa(P);
    await P.locator('[data-testid="area-recolher"]').click();
    await P.waitForTimeout(150);
    const recolhidaAntes = await P.locator('[data-testid="painel-areas"]').evaluate((el) => el.className.includes("recolhido"));
    registrar("29a (janela recolhida antes do teste)", recolhidaAntes, `recolhido=${recolhidaAntes}`);

    // Atalho de edição rápida no mapa: entra em edição sem reabrir a
    // janela. Seleção e hover têm lápis independentes, então pode haver
    // mais de um na tela — clica no primeiro, seja de qual área for (o
    // que se testa aqui é a JANELA não reabrir, não qual área abriu).
    await P.mouse.move(a.x, a.y);
    await P.waitForSelector('[data-testid="area-editar-rapido"]', { timeout: 4000 });
    await P.locator('[data-testid="area-editar-rapido"]').first().click();
    await P.waitForFunction(() => document.querySelector('[data-testid="painel-areas"]')?.getAttribute("data-fase") === "editando", null, { timeout: 6000 });
    const recolhidaDepois = await P.locator('[data-testid="painel-areas"]').evaluate((el) => el.className.includes("recolhido"));
    registrar("29b (editar pelo atalho do mapa NÃO reabre a janela recolhida)", recolhidaDepois, `recolhido=${recolhidaDepois}`);
    // Mesmo recolhida, a edição continua alcançável no mapa (alças + botões flutuantes).
    const alcasComJanelaRecolhida = await P.locator(".rv-area-alca").count();
    const botoesComJanelaRecolhida = await P.locator('[data-testid="area-acoes-flutuantes"]').count();
    registrar("29c (alças e botões flutuantes continuam no mapa mesmo com a janela recolhida)", alcasComJanelaRecolhida > 0 && botoesComJanelaRecolhida === 1, `alças=${alcasComJanelaRecolhida}, botões=${botoesComJanelaRecolhida}`);

    await P.locator('[data-testid="area-flutuante-descartar"]').click();
    await P.waitForTimeout(200);
    await P.locator('[data-testid="area-recolher"]').click();
    await P.waitForTimeout(150);

    // Cenário exato relatado: editar pelo ícone a partir do Interagir
    // (não da ferramenta Áreas) NUNCA deve montar a janela — nem
    // recolhida, nem expandida. É o próprio `<PainelAreas>` que não
    // pode existir no DOM, e a ferramenta ativa não pode mudar. Área
    // NOVA num canto isolado (mesmo cuidado do bloco 26) — o mapa já
    // tem dezenas de áreas sobrepostas a esta altura da suíte, e uma
    // posição espremida entre formas produz hover instável que não é
    // o que este teste quer medir.
    await P.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Áreas"]').click();
    await escolherTipo(P, "esfera");
    const d1 = await celula(P, 10, 8), d2 = await celula(P, 12, 8);
    await P.mouse.move(d1.x, d1.y); await P.mouse.down();
    await P.mouse.move(d2.x, d2.y, { steps: 6 }); await P.mouse.up();
    await manterNaMesa(P);
    const centroIsolado = d1;

    await P.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
    await P.waitForTimeout(150);
    const painelAntesInteragir = await P.locator('[data-testid="painel-areas"]').count();
    registrar("29d (Interagir: janela de Áreas nem existe no DOM antes do atalho)", painelAntesInteragir === 0, `painéis=${painelAntesInteragir}`);

    await P.mouse.move(20, 20);
    await P.waitForTimeout(100);
    await P.mouse.move(centroIsolado.x, centroIsolado.y);
    await P.waitForSelector('[data-testid="area-editar-rapido"]', { timeout: 4000 });
    // Pode haver mais de um lápis (seleção + hover são independentes) —
    // o que se testa aqui é a janela não abrir e a ferramenta não trocar.
    await P.locator('[data-testid="area-editar-rapido"]').first().click();
    await P.waitForSelector(".rv-area-alca", { timeout: 6000 });
    const painelDepoisInteragir = await P.locator('[data-testid="painel-areas"]').count();
    const ferramentaAtiva = await P.locator('.rv-ferramentas .rv-ferr-btn[aria-pressed="true"]').getAttribute("aria-label");
    const alcasInteragir = await P.locator(".rv-area-alca").count();
    const botoesInteragir = await P.locator('[data-testid="area-acoes-flutuantes"]').count();
    registrar("29e (editar pelo ícone a partir de Interagir NÃO abre a janela de Áreas nem troca de ferramenta)",
      painelDepoisInteragir === 0 && !!ferramentaAtiva?.startsWith("Interagir") && alcasInteragir > 0 && botoesInteragir === 1,
      `painéis=${painelDepoisInteragir}, ferramenta=${ferramentaAtiva}, alças=${alcasInteragir}, botões=${botoesInteragir}`);

    await P.locator('[data-testid="area-flutuante-descartar"]').click();
    await P.waitForTimeout(200);
    await P.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Áreas"]').click();
    await P.waitForTimeout(150);
  }

  // ── 16c. Viewport pequeno ────────────────────────────────────────
  {
    await P.setViewportSize({ width: 900, height: 620 });
    await P.waitForTimeout(300);
    const painel = await P.locator('[data-testid="painel-areas"]').boundingBox();
    const dentro = !!painel && painel.x >= 0 && painel.y >= 0 && painel.x + painel.width <= 900 + 1;
    const mapaVisivel = await P.locator(".rv-mapa").isVisible();
    registrar("16c (viewport pequeno: o painel cabe na tela e a mesa continua visível — nunca modal)", dentro && mapaVisivel, JSON.stringify(painel));
    await P.setViewportSize({ width: 1440, height: 950 });
    await P.waitForTimeout(200);
  }

  // ── 17. Console limpo ────────────────────────────────────────────
  registrar("17a (console do narrador sem erro inesperado)", narrador.erros.length === 0, narrador.erros.slice(0, 2).join(" | ") || "limpo");
  registrar("17b (console do jogador sem erro inesperado)", jogador.erros.length === 0, jogador.erros.slice(0, 2).join(" | ") || "limpo");

  await narrador.close();
  await jogador.close();
  await limpar();

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  process.exit(falhou > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("ERRO:", e);
  await limpar().catch(() => {});
  process.exit(1);
});
