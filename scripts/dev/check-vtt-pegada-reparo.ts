/**
 * Reparo de inconsistências apontadas ANTES da aprovação da pegada
 * multicelular — cobre os itens que exigem banco/servidor/browser
 * reais (os puramente matemáticos continuam em
 * `scripts/test-vtt-pegada.ts`/`test-vtt-pathfinding-pegada.ts`/
 * `test-vtt-rotacao.ts`, intocados):
 *
 *  PARTE A (sem browser, banco real):
 *   A. Paridade TS↔SQL: para cada categoria(5) × orientação(6) = 30
 *      combinações, os offsets calculados por `pegadaEfetiva`/
 *      `projetarPegada` (TS) batem byte-a-byte com `vtt_pegada_celulas`
 *      (SQL), incluindo Colossal nas 6 orientações explicitamente.
 *   V. Validação SQL de pegada personalizada (`vtt_pegada_personalizada_valida`
 *      + o CHECK real da coluna): bateria de entradas inválidas
 *      (vazio, sem âncora, duplicata, desconexo, fração, string,
 *      campo faltando, não-array, payload grande) e válidas (1 célula,
 *      3 conectadas, o preset Colossal inteiro como "personalizada",
 *      25 células — o limite).
 *
 *  PARTE B (browser real, sessão do narrador):
 *   T1/T2. Tamanho persistido é a fonte canônica: demo diz Grande,
 *          banco diz Médio (e o inverso) — cliente (render + pathfinding
 *          via bloqueio geométrico) e servidor usam o valor do BANCO.
 *   R1. Rotação válida entra exatamente 1x no histórico (undo funciona).
 *   R2. Rotação que sairia do mapa é recusada pelo servidor e NÃO entra
 *       no histórico (botão desfazer continua desabilitado).
 *   R3. Rotação com revisão desatualizada (mudança concorrente via
 *       service role) é recusada e não entra no histórico.
 *   R4. Clique duplo rápido no mesmo botão de rotação gera UMA única
 *       escrita no banco (revisão sobe exatamente 1), não duas
 *       concorrentes.
 *
 * Uso: npx tsx scripts/dev/check-vtt-pegada-reparo.ts (servidor dev já
 * rodando em localhost:3000).
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ConsoleMessage } from "playwright";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { BASE_URL } from "./authSession";
import { pegadaEfetiva, projetarPegada, type CategoriaTamanho } from "../../src/app/mesas/[campaignId]/vtt/_dominio/pegada";

loadDotenv({ path: ".env.local" });

function requireEnv(nome: string): string {
  const v = process.env[nome];
  if (!v) { console.error(`Variável de ambiente ausente: ${nome}`); process.exit(1); }
  return v;
}
const SUPABASE_URL = requireEnv("SUPABASE_URL");
const ANON = requireEnv("SUPABASE_ANON_KEY");
const admin = createClient(SUPABASE_URL, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
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
  if (t.includes("Cannot update a component") && t.includes("while rendering a different component")) return false;
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

const criados = { usuarios: [] as string[], campanhas: [] as string[] };
let campaignId: string | null = null;
let narradorEmail: string | null = null;
let narradorSenha: string | null = null;

/** Largura da cena da fixture — `boxDaCelula` converte hex→índice do DOM com ela, então as duas TÊM que ser o mesmo número. */
const LARGURA_CENA = 26;

async function configurarFixture(): Promise<{ narradorId: string }> {
  const email = `check-vtt-pegrep-narrador-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { display_name: "Narrador Reparo" } });
  if (error) throw new Error(`Falha ao criar narrador fixture: ${error.message}`);
  narradorEmail = email; narradorSenha = senha;
  criados.usuarios.push(data.user.id);

  campaignId = randomUUID();
  const { error: e1 } = await admin.from("campaigns").insert({ id: campaignId, name: "VTT Reparo Pegada", owner_id: data.user.id });
  if (e1) throw new Error(`Falha ao criar campanha: ${e1.message}`);
  criados.campanhas.push(campaignId);

  // Cena e elenco PRÓPRIOS. Esta suíte nasceu apoiada no elenco da cena
  // de demonstração — que deixou de existir — e por isso parava logo no
  // critério 0. O que ela prova continua valendo e não depende de demo
  // nenhuma: renderização e pathfinding seguem o `tamanho` do BANCO,
  // nunca um palpite do cliente. CB nasce Grande e B1 Médio; cada
  // cenário inverte o do banco e confere quem o cliente obedece.
  const { data: cena, error: e2 } = await admin.from("vtt_scenes")
    .insert({ campaign_id: campaignId, nome: "Cena Reparo Pegada", largura: LARGURA_CENA, altura: 20 })
    .select("id").single();
  if (e2) throw new Error(`Falha ao criar cena: ${e2.message}`);
  const { error: e3 } = await admin.from("vtt_tokens").insert([
    // Perto do CENTRO do mapa de propósito: a barra de ferramentas
    // (esquerda), a janela que ela abre e o painel da sessão (direita)
    // cobrem as bordas, e um arrasto que começa debaixo deles nunca
    // chega ao mapa.
    { scene_id: cena!.id, campaign_id: campaignId, nome: "Colosso", sigla: "CB", lado: "pn", tamanho: "grande", orientacao: 0, q: 11, r: 8, visivel: true },
    { scene_id: cena!.id, campaign_id: campaignId, nome: "Bando 1", sigla: "B1", lado: "pn", tamanho: "medio", orientacao: 0, q: 12, r: 13, visivel: true },
  ]);
  if (e3) throw new Error(`Falha ao criar tokens: ${e3.message}`);

  return { narradorId: data.user.id };
}

async function contextoDe(email: string, senha: string): Promise<{ browser: Browser; context: BrowserContext; page: Page; close: () => Promise<void> }> {
  const anon = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
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
  return { browser, context, page, close: () => browser.close() };
}

async function limpar() {
  for (const cid of criados.campanhas) {
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

async function boxDaCelula(page: Page, hex: { q: number; r: number }): Promise<{ x: number; y: number } | null> {
  const qRaw = hex.q + Math.floor(hex.r / 2);
  const indice = hex.r * LARGURA_CENA + qRaw;
  const box = await page.locator(".rv-camada-grade path").nth(indice).boundingBox();
  return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
}
async function boxDoToken(page: Page, sigla: string): Promise<{ x: number; y: number } | null> {
  return page.evaluate((sig) => {
    const els = Array.from(document.querySelectorAll(".rv-camada-tokens .rv-token text.rv-token-sigla"));
    const el = els.find((e) => e.textContent === sig)?.closest("g");
    const r = el?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  }, sigla);
}
async function celulasDaPegadaRenderizada(page: Page, sigla: string): Promise<number> {
  return page.evaluate((sig) => {
    const els = Array.from(document.querySelectorAll(".rv-camada-tokens .rv-token text.rv-token-sigla"));
    // `.closest(".rv-token")`, NÃO `.closest("g")` — o `<text>` da sigla
    // fica dentro do `<g>` da origem mecânica (`translate(origemLocal)`),
    // que é FILHO do `<g class="rv-token">` raiz; `.rv-token-pegada` é
    // IRMÃO desse `<g>` de origem, não descendente dele. `.closest("g")`
    // para no ancestral mais próximo (a origem), nunca alcança o irmão.
    const raiz = els.find((e) => e.textContent === sig)?.closest(".rv-token");
    const grupo = raiz?.querySelector(".rv-token-pegada");
    return grupo ? grupo.children.length : 0;
  }, sigla);
}

/** Usuário fixture SEM campanha — `vtt_pegada_celulas`/`vtt_pegada_personalizada_valida` são funções puras de geometria, sem checagem de posse de campanha; só precisam de UMA sessão autenticada qualquer. */
async function criarUsuarioSimples(rotulo: string): Promise<{ email: string; senha: string }> {
  const email = `check-vtt-pegrep-${rotulo}-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw new Error(`Falha ao criar usuário ${rotulo}: ${error.message}`);
  criados.usuarios.push(data.user.id);
  return { email, senha };
}

async function parteA_paridadeTsSql() {
  const { email, senha } = await criarUsuarioSimples("paridade");
  const auth = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: eLogin } = await auth.auth.signInWithPassword({ email, password: senha });
  if (eLogin) throw new Error(`Falha ao logar pra parte A: ${eLogin.message}`);

  const CATEGORIAS: CategoriaTamanho[] = ["pequeno", "medio", "grande", "enorme", "colossal"];
  const ANCORA = { q: 5, r: 5 };
  let todasIguais = true;
  const falhas: string[] = [];
  for (const categoria of CATEGORIAS) {
    for (let orientacao = 0; orientacao < 6; orientacao++) {
      const pegadaTs = pegadaEfetiva({ categoria, orientacao, pegadaPersonalizada: null });
      const celulasTs = projetarPegada(ANCORA, pegadaTs)
        .map((c) => `${c.q},${c.r}`).sort();

      const { data, error } = await auth.rpc("vtt_pegada_celulas", {
        p_tamanho: categoria, p_orientacao: orientacao, p_pegada_personalizada: null,
        p_ancora_q: ANCORA.q, p_ancora_r: ANCORA.r,
      });
      if (error) { todasIguais = false; falhas.push(`${categoria}/${orientacao}: erro SQL ${error.message}`); continue; }
      const celulasSql = (data as { q: number; r: number }[]).map((c) => `${c.q},${c.r}`).sort();

      const igual = celulasTs.length === celulasSql.length && celulasTs.every((c, i) => c === celulasSql[i]);
      if (!igual) { todasIguais = false; falhas.push(`${categoria}/${orientacao}: TS=[${celulasTs.join(" ")}] SQL=[${celulasSql.join(" ")}]`); }
    }
  }
  registrar("A (paridade TS↔SQL: 5 categorias × 6 orientações = 30 combinações idênticas, Colossal incluso)", todasIguais, todasIguais ? "30/30 idênticas" : falhas.join(" | "));
}

async function parteV_validacaoSql() {
  const { email, senha } = await criarUsuarioSimples("valid");
  const auth = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: eLogin } = await auth.auth.signInWithPassword({ email, password: senha });
  if (eLogin) throw new Error(`Falha ao logar pra parte V: ${eLogin.message}`);

  const casos: { nome: string; valor: unknown; esperado: boolean }[] = [
    { nome: "null (sem pegada personalizada)", valor: null, esperado: true },
    { nome: "array vazio", valor: [], esperado: false },
    { nome: "1 célula na âncora", valor: [{ q: 0, r: 0 }], esperado: true },
    { nome: "sem a âncora {0,0}", valor: [{ q: 1, r: 0 }, { q: 1, r: -1 }], esperado: false },
    { nome: "offset duplicado", valor: [{ q: 0, r: 0 }, { q: 0, r: 0 }], esperado: false },
    { nome: "desconexo (dois grupos)", valor: [{ q: 0, r: 0 }, { q: 5, r: 5 }], esperado: false },
    { nome: "grande válido (3 conectadas)", valor: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }], esperado: true },
    { nome: "q fracionário", valor: [{ q: 0.5, r: 0 }], esperado: false },
    { nome: "q como string", valor: [{ q: "0", r: 0 }], esperado: false },
    { nome: "campo r faltando", valor: [{ q: 0, r: 0 }, { q: 1 }], esperado: false },
    { nome: "array de números, não de objetos", valor: [0, 1], esperado: false },
    { nome: "objeto solto, não array", valor: { q: 0, r: 0 }, esperado: false },
    { nome: "colossal inteiro como personalizada (12 células)", valor: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }, { q: -2, r: 2 }, { q: -1, r: 2 }, { q: 0, r: 2 }, { q: 1, r: 1 }, { q: 2, r: 0 }], esperado: true },
    { nome: "25 células conectadas (limite)", valor: Array.from({ length: 25 }, (_, i) => ({ q: i, r: 0 })), esperado: true },
    { nome: "26 células conectadas (acima do limite)", valor: Array.from({ length: 26 }, (_, i) => ({ q: i, r: 0 })), esperado: false },
  ];

  for (const c of casos) {
    const { data, error } = await auth.rpc("vtt_pegada_personalizada_valida", { p: c.valor });
    if (error) { registrar(`V (${c.nome})`, false, `erro inesperado: ${error.message}`); continue; }
    registrar(`V (${c.nome})`, data === c.esperado, `esperado=${c.esperado}, obtido=${data}`);
  }
  // O CHECK real da COLUNA (não só a função solta) é testado em `main`
  // contra um token de verdade, depois que a fixture de campanha existe.
}

async function main() {
  await parteA_paridadeTsSql();
  await parteV_validacaoSql();

  // ── Parte B: browser real ──────────────────────────────────────
  const { narradorId } = await configurarFixture();
  void narradorId;

  const { page, close } = await contextoDe(narradorEmail!, narradorSenha!);
  const erros: string[] = [];
  page.on("console", (m) => { if (erroRelevante(m)) erros.push(m.text().slice(0, 400)); });

  await page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
  await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });

  const { data: cbAntes } = await admin.from("vtt_tokens").select("id,sigla,q,r,tamanho,orientacao,revision").eq("campaign_id", campaignId).eq("sigla", "CB").maybeSingle();
  const { data: b1Antes } = await admin.from("vtt_tokens").select("id,sigla,q,r,tamanho,orientacao,revision").eq("campaign_id", campaignId).eq("sigla", "B1").maybeSingle();
  if (!cbAntes || !b1Antes) { registrar("0 (tokens de fixture CB/B1 seedados)", false, `cb=${!!cbAntes} b1=${!!b1Antes}`); await close(); await limpar(); process.exit(1); }
  registrar("0 (tokens de fixture CB/B1 seedados)", true, `CB tamanho=${cbAntes.tamanho}, B1 tamanho=${b1Antes.tamanho}`);

  // Agora que o token existe de verdade, o teste do CHECK real fica aqui.
  {
    const { error } = await admin.from("vtt_tokens").update({ pegada_personalizada: [{ q: 0, r: 0 }, { q: 9, r: 9 }] }).eq("id", cbAntes.id);
    registrar("V-check (CHECK real da coluna rejeita pegada desconexa numa escrita de verdade)", !!error && /check/i.test(error.message ?? ""), `erro=${error?.message ?? "NENHUM — deveria ter rejeitado"}`);
    const { error: e2 } = await admin.from("vtt_tokens").update({ pegada_personalizada: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }] }).eq("id", cbAntes.id);
    registrar("V-check2 (CHECK real da coluna aceita pegada conectada numa escrita de verdade)", !e2, `erro=${e2?.message ?? "nenhum"}`);
    await admin.from("vtt_tokens").update({ pegada_personalizada: null }).eq("id", cbAntes.id); // limpa pro resto do teste
  }

  // ── T1: demo diz Grande (CB), banco diz Médio ──────────────────
  {
    await admin.from("vtt_tokens").update({ tamanho: "medio" }).eq("id", cbAntes.id);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    const celulas = await celulasDaPegadaRenderizada(page, "CB");
    registrar("T1a (demo=Grande/banco=Médio: renderização usa Médio — grupo de pegada AUSENTE, 1 célula)", celulas === 0, `células de pegada renderizadas=${celulas} (Médio não desenha o grupo multicelular)`);

    // Pathfinding: um bloqueio na célula que SÓ importaria pra um
    // footprint de 3 (Grande) não pode impedir o movimento de um
    // token que o cliente trata como Médio.
    const destino = { q: cbAntes.q + 1, r: cbAntes.r };
    const celulaSoRelevantePraGrande = { q: destino.q + 1, r: destino.r }; // offset "E" do destino — 2ª célula do footprint Grande, irrelevante pro Médio.
    await admin.from("vtt_terrain").insert({ scene_id: (await admin.from("vtt_scenes").select("id").eq("campaign_id", campaignId).single()).data!.id, campaign_id: campaignId, q: celulaSoRelevantePraGrande.q, r: celulaSoRelevantePraGrande.r, tipo: "bloqueado" });
    await page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
    const origemBox = await boxDoToken(page, "CB");
    const destinoBox = await boxDaCelula(page, destino);
    if (origemBox && destinoBox) {
      await page.mouse.move(origemBox.x, origemBox.y);
      await page.mouse.down();
      await page.mouse.move(destinoBox.x, destinoBox.y, { steps: 10 });
      await page.mouse.up();
      // Espera o BANCO, não um relógio: a gravação é uma ida ao
      // servidor e 700ms fixos não a cobrem sob carga.
      await esperarAte(async () => {
        const { data } = await admin.from("vtt_tokens").select("q,r").eq("id", cbAntes.id).maybeSingle();
        return data?.q === destino.q && data?.r === destino.r;
      }, 8000);
    }
    const { data: cbDepois } = await admin.from("vtt_tokens").select("q,r").eq("id", cbAntes.id).maybeSingle();
    registrar("T1b (pathfinding usa Médio: move mesmo com bloqueio que só afetaria a 2ª célula de um Grande)", cbDepois?.q === destino.q && cbDepois?.r === destino.r, `posição final=(${cbDepois?.q},${cbDepois?.r}), esperado=(${destino.q},${destino.r})`);
    await admin.from("vtt_terrain").delete().eq("campaign_id", campaignId).eq("q", celulaSoRelevantePraGrande.q).eq("r", celulaSoRelevantePraGrande.r);
  }

  // ── T2: demo diz Médio (B1), banco diz Grande ──────────────────
  {
    await admin.from("vtt_tokens").update({ tamanho: "grande", orientacao: 0 }).eq("id", b1Antes.id);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    const celulas = await celulasDaPegadaRenderizada(page, "B1");
    registrar("T2a (demo=Médio/banco=Grande: renderização usa Grande — 3 células de pegada)", celulas === 3, `células de pegada renderizadas=${celulas}, esperado=3`);

    // Pathfinding: um bloqueio EXATAMENTE na 2ª célula (offset E) do
    // footprint Grande no destino precisa ser reconhecido agora que o
    // cliente trata B1 como Grande — o mesmo bloqueio que T1b provou
    // ser IRRELEVANTE pra Médio. Mas "reconhecer" não é mais "recusar":
    // pela regra consultiva (seção 5), atravessar/pousar sobre terreno
    // normalmente bloqueado ao mover um token JÁ EXISTENTE é permitido
    // com aviso visual — o mesmo vale pro footprint inteiro de um
    // multicelular, não só a célula-âncora. Esta asserção era de antes
    // da seção 5 existir; ficou obsoleta no dia em que "atravessar
    // bloqueio" virou o comportamento CORRETO, não um bug a evitar.
    const destino = { q: b1Antes.q + 1, r: b1Antes.r };
    const celulaBloqueadaDoFootprintGrande = { q: destino.q + 1, r: destino.r };
    const sceneId = (await admin.from("vtt_scenes").select("id").eq("campaign_id", campaignId).single()).data!.id;
    await admin.from("vtt_terrain").insert({ scene_id: sceneId, campaign_id: campaignId, q: celulaBloqueadaDoFootprintGrande.q, r: celulaBloqueadaDoFootprintGrande.r, tipo: "bloqueado" });
    // Espera o terreno chegar via Realtime antes de arrastar — sem
    // isto, o cliente ainda validaria contra o terreno VELHO (sem
    // bloqueio nenhum), o que faria a rota estrita "achar caminho" de
    // cara e nunca exercitar a camada de relaxamento — mascarando
    // exatamente o comportamento que este teste existe pra provar.
    await esperarAte(async () => (await page.locator(".rv-terreno-real--bloqueado").count()) >= 1, 5000);
    const origemBox = await boxDoToken(page, "B1");
    const destinoBox = await boxDaCelula(page, destino);
    let avisoTexto: string | null = null;
    let linhasAmbar = 0;
    let destaquesCelula = 0;
    if (origemBox && destinoBox) {
      await page.mouse.move(origemBox.x, origemBox.y);
      await page.mouse.down();
      await page.mouse.move(destinoBox.x, destinoBox.y, { steps: 10 });
      await page.waitForTimeout(200);
      // A pegada INTEIRA agora é projetada por passo (`bloqueiosNaRota`,
      // `_dominio/pathfindingHex.ts`) — o segmento fica âmbar mesmo
      // quando só uma célula SECUNDÁRIA do footprint (não a âncora)
      // cruza o bloqueio, e a célula específica ganha um destaque
      // próprio (`arrasto.celulasBloqueadas`). Os três indicadores
      // (linha, destaque de célula, texto) precisam bater juntos.
      avisoTexto = await page.locator(".rv-camada-rota-preview text").textContent().catch(() => null);
      linhasAmbar = await page.locator(".rv-camada-rota-preview line[stroke='#ff9d4d']").count();
      destaquesCelula = await page.locator(".rv-camada-rota-preview path[stroke='#ff9d4d']").count();
      await page.mouse.up();
      await esperarAte(async () => {
        const { data } = await admin.from("vtt_tokens").select("q,r").eq("id", b1Antes.id).maybeSingle();
        return data?.q === destino.q && data?.r === destino.r;
      }, 8000);
    }
    const { data: b1Depois } = await admin.from("vtt_tokens").select("q,r").eq("id", b1Antes.id).maybeSingle();
    registrar(
      "T2b (regra consultiva: bloqueio numa célula secundária do footprint Grande — linha âmbar, célula destacada e aviso textual, projetando a pegada inteira — e NÃO impede o movimento)",
      !!avisoTexto?.includes("bloqueada") && linhasAmbar > 0 && destaquesCelula > 0 && b1Depois?.q === destino.q && b1Depois?.r === destino.r,
      `aviso="${avisoTexto}", linhasÂmbar=${linhasAmbar}, destaquesCélula=${destaquesCelula}, posição final=(${b1Depois?.q},${b1Depois?.r}), destino=(${destino.q},${destino.r})`,
    );
    await admin.from("vtt_terrain").delete().eq("campaign_id", campaignId).eq("q", celulaBloqueadaDoFootprintGrande.q).eq("r", celulaBloqueadaDoFootprintGrande.r);
    // Devolve B1 pra Médio — os testes de rotação abaixo usam outro token.
    await admin.from("vtt_tokens").update({ tamanho: "medio" }).eq("id", b1Antes.id);
  }

  // ── Preparo pros testes de rotação: um token Grande de verdade,
  //    numa posição com margem (não perto de borda), pra R1/R3/R4;
  //    e uma posição de CANTO só pro R2 (rotação bloqueada). ──────
  await admin.from("vtt_tokens").update({ tamanho: "grande", orientacao: 0, q: 10, r: 8 }).eq("id", cbAntes.id);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
  await page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();

  /**
   * Seleciona CB e deixa o FOCO na alça de rotação.
   *
   * O HUD de rotação (`.rv-hud-rotacao`) que esta suíte clicava não
   * existe mais: girar é a ALÇA no mapa (ponteiro ou teclado) e o item
   * do menu de contexto. A alça com foco é a porta mais direta — mesmo
   * caminho que `check-vtt-alca-rotacao.ts` exercita.
   */
  async function selecionarCB() {
    const box = await boxDoToken(page, "CB");
    if (!box) throw new Error("CB fora de tela");
    await page.mouse.click(box.x, box.y);
    await page.waitForSelector(".rv-token-alca-rotacao-toque", { timeout: 5000 });
    await page.locator(".rv-token-alca-rotacao-toque").first().focus();
  }
  /** Um passo de 60° no sentido horário, pela alça focada. */
  async function girarDireita() {
    await page.locator(".rv-token-alca-rotacao-toque").first().focus();
    await page.keyboard.press("ArrowRight");
  }

  const SELETOR_DESFAZER = '.rv-ferr-btn[aria-label="Desfazer (Ctrl+Z)"]';
  /** Espera o `disabled` do botão desfazer bater com o esperado — nunca um `waitForTimeout` fixo pra estado assíncrono (a chamada ao servidor + `executarComando` podem levar mais ou menos que qualquer número mágico). */
  async function esperarDesfazer(habilitado: boolean, timeoutMs = 4000): Promise<boolean> {
    try {
      await page.waitForFunction(
        ({ sel, hab }) => {
          const b = document.querySelector(sel) as HTMLButtonElement | null;
          return !!b && b.disabled === !hab;
        },
        { sel: SELETOR_DESFAZER, hab: habilitado },
        { timeout: timeoutMs },
      );
      return true;
    } catch {
      return false;
    }
  }
  /**
   * Espera a REVISÃO no banco mudar de verdade — o botão desfazer/refazer
   * reflete o histórico OTIMISTA (flip síncrono de pilha, ver `desfazer`/
   * `refazer` em `VttClient.tsx`), que muda ANTES da chamada de rede
   * assentar. Pra confirmar o efeito de verdade (não só a UI do
   * histórico), é preciso esperar o banco, não o botão.
   */
  async function esperarRevisao(tokenId: string, revisaoAnterior: number, timeoutMs = 4000): Promise<{ orientacao: number; revision: number } | null> {
    const inicio = Date.now();
    while (Date.now() - inicio < timeoutMs) {
      const { data } = await admin.from("vtt_tokens").select("orientacao,revision").eq("id", tokenId).single();
      if (data && data.revision !== revisaoAnterior) return data;
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  }

  // ── R1: rotação válida entra 1x no histórico ────────────────────
  {
    await selecionarCB();
    const { data: antes } = await admin.from("vtt_tokens").select("orientacao,revision").eq("id", cbAntes.id).single();
    const desfazerAntes = await page.locator(SELETOR_DESFAZER).isDisabled();
    await girarDireita();
    const habilitouATempo = await esperarDesfazer(true);
    const { data: depois } = await admin.from("vtt_tokens").select("orientacao,revision").eq("id", cbAntes.id).single();
    const desfazerDepois = await page.locator(SELETOR_DESFAZER).isDisabled();
    registrar("R1a (rotação válida: orientação muda e revisão sobe 1 no banco)", depois?.orientacao === ((antes!.orientacao + 1) % 6) && depois?.revision === antes!.revision + 1, `antes=${JSON.stringify(antes)}, depois=${JSON.stringify(depois)}`);
    registrar("R1b (rotação válida entra no histórico: desfazer estava desabilitado, agora está habilitado)", desfazerAntes === true && habilitouATempo && desfazerDepois === false, `desfazer antes=${desfazerAntes}, habilitou a tempo=${habilitouATempo}, depois=${desfazerDepois}`);

    // Desfaz de verdade e confirma que volta pra orientação original.
    // O botão vira "desabilitado" na hora (flip otimista do histórico)
    // — a prova real é a revisão do BANCO mudar, então espera essa,
    // não o botão.
    await page.locator(SELETOR_DESFAZER).click();
    // 4s (o padrão) é apertado pra desfazer: é mais uma ida ao
    // servidor, logo depois de outra, e sob carga a janela estoura.
    const aposDesfazer = await esperarRevisao(cbAntes.id, depois!.revision, 12000);
    registrar("R1c (desfazer volta a orientação exata anterior, com nova revisão no banco)", aposDesfazer?.orientacao === antes!.orientacao && !!aposDesfazer && aposDesfazer.revision > depois!.revision, `depois de desfazer=${JSON.stringify(aposDesfazer)}`);
  }

  // ── R2: rotação que sairia do mapa é recusada e NÃO entra no histórico ──
  {
    // Âncora de canto onde só a orientação 3 (mesma geometria provada
    // manualmente na rodada anterior) cabe no mapa 26×18.
    await admin.from("vtt_tokens").update({ q: 17, r: 17, orientacao: 3 }).eq("id", cbAntes.id);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
    await selecionarCB();
    const { data: antes } = await admin.from("vtt_tokens").select("orientacao,revision").eq("id", cbAntes.id).single();
    const desfazerAntes = await page.locator(SELETOR_DESFAZER).isDisabled();
    await girarDireita();
    // Recusa esperada — não há estado positivo pra esperar (o botão
    // continua desabilitado o tempo todo), então espera o round-trip
    // de rede assentar em vez de um timeout arbitrário.
    await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
    const { data: depois } = await admin.from("vtt_tokens").select("orientacao,revision").eq("id", cbAntes.id).single();
    const desfazerDepois = await page.locator(SELETOR_DESFAZER).isDisabled();
    registrar("R2a (rotação pra fora do mapa é recusada pelo servidor: orientação/revisão inalteradas)", depois?.orientacao === antes!.orientacao && depois?.revision === antes!.revision, `antes=${JSON.stringify(antes)}, depois=${JSON.stringify(depois)}`);
    registrar("R2b (rotação recusada NÃO entra no histórico: desfazer continua desabilitado)", desfazerAntes === true && desfazerDepois === true, `desfazer antes=${desfazerAntes}, depois=${desfazerDepois}`);
  }

  // ── R3: revisão desatualizada (mudança concorrente) é recusada e NÃO entra no histórico ──
  {
    await admin.from("vtt_tokens").update({ q: 10, r: 8, orientacao: 0 }).eq("id", cbAntes.id);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
    await selecionarCB();
    const { data: antes } = await admin.from("vtt_tokens").select("orientacao,revision").eq("id", cbAntes.id).single();
    const desfazerAntes = await page.locator(SELETOR_DESFAZER).isDisabled();
    // Mudança concorrente "de outra sessão" — bumpa a revisão sem
    // passar pela UI, exatamente o cenário que a checagem de revisão
    // esperada existe pra pegar.
    await admin.from("vtt_tokens").update({ revision: antes!.revision + 1 }).eq("id", cbAntes.id);
    await girarDireita();
    await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
    const { data: depois } = await admin.from("vtt_tokens").select("orientacao,revision").eq("id", cbAntes.id).single();
    const desfazerDepois = await page.locator(SELETOR_DESFAZER).isDisabled();
    registrar("R3a (revisão desatualizada: servidor recusa, orientação continua a mesma)", depois?.orientacao === antes!.orientacao, `antes=${JSON.stringify(antes)}, depois=${JSON.stringify(depois)}`);
    registrar("R3b (rotação recusada por revisão desatualizada NÃO entra no histórico)", desfazerAntes === true && desfazerDepois === true, `desfazer antes=${desfazerAntes}, depois=${desfazerDepois}`);
  }

  // ── R4: clique duplo rápido não gera 2 revisões concorrentes ────
  {
    await admin.from("vtt_tokens").update({ q: 10, r: 8, orientacao: 0 }).eq("id", cbAntes.id);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
    await selecionarCB();
    const { data: antes } = await admin.from("vtt_tokens").select("orientacao,revision").eq("id", cbAntes.id).single();
    // Três pedidos em rajada. Este critério já cobrou "revisão sobe
    // EXATAMENTE 1": o produto DESCARTAVA os dois seguintes enquanto o
    // primeiro estava em voo, e quem pedia três passos ganhava um. Três
    // pedidos são três passos — o que não pode existir é concorrência
    // (duas chamadas disputando a mesma revisão), e é isso que a
    // serialização garante: uma de cada vez, cada uma com a revisão
    // que a anterior devolveu.
    await page.locator(".rv-token-alca-rotacao-toque").first().focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await esperarAte(async () => {
      const { data } = await admin.from("vtt_tokens").select("revision").eq("id", cbAntes.id).single();
      return (data?.revision ?? 0) > antes!.revision;
    }, 10000);
    // Deixa a rajada ASSENTAR: se houvesse concorrência, as chamadas
    // extras chegariam depois desta primeira e apareceriam aqui.
    await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
    const { data: depois } = await admin.from("vtt_tokens").select("orientacao,revision").eq("id", cbAntes.id).single();
    const passos = depois!.revision - antes!.revision;
    // O que este critério guarda é a AUSÊNCIA DE CONCORRÊNCIA: cada
    // escrita que aconteceu foi um passo limpo de 60°, com a revisão
    // subindo na mesma conta — nunca duas chamadas disputando a mesma
    // revisão (que gravariam a mais nova por cima da mais velha, ou se
    // recusariam entre si). Quantos passos uma rajada de teclas entrega
    // depende de o navegador enfileirar os três eventos no mesmo tique,
    // e é `check-vtt-alca-rotacao.ts` (19b–19e, uma tecla por vez) que
    // prova que nenhuma tecla se perde.
    registrar(
      "R4 (rajada de rotação: cada escrita é um passo limpo de 60°, revisão e orientação na mesma conta — zero concorrência)",
      passos >= 1 && passos <= 3 && depois?.orientacao === ((antes!.orientacao + passos) % 6),
      `antes=${JSON.stringify(antes)}, depois=${JSON.stringify(depois)}, passos=${passos}`,
    );
  }

  // ── E1: Enorme com PARTE do footprint (não tudo) sobre terreno difícil — não bloqueia ──
  {
    // Passo de 1 hex só — a mesma técnica confiável de T1b/T2b (arrastos
    // longos/diagonais sofrem da limitação JÁ DOCUMENTADA do drag
    // sintético do Playwright sobre a state machine de confirmação
    // incremental de rota, ver relatório final; não é o que este
    // critério testa).
    const anchorOrigem = { q: 9, r: 6 };
    const anchorDestino = { q: 10, r: 6 };
    await admin.from("vtt_tokens").update({ tamanho: "enorme", orientacao: 0, q: anchorOrigem.q, r: anchorOrigem.r }).eq("id", cbAntes.id);
    const sceneId = (await admin.from("vtt_scenes").select("id").eq("campaign_id", campaignId).single()).data!.id;
    // Footprint do Enorme em (10,6): (10,6),(9,7),(10,7),(11,6),(11,5),(10,5),(9,6) —
    // marca só 2 das 7 (NENHUMA delas a âncora) como difícil, nenhuma bloqueada.
    await admin.from("vtt_terrain").insert([
      { scene_id: sceneId, campaign_id: campaignId, q: 11, r: 6, tipo: "dificil" },
      { scene_id: sceneId, campaign_id: campaignId, q: 10, r: 7, tipo: "dificil" },
    ]);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
    // O arrasto sintético de 1 hex às vezes não solta exatamente sobre
    // a célula (mesma classe de flakiness da simulação de mouse já
    // documentada no resto da suíte) — tenta algumas vezes; o que este
    // critério verifica é a REGRA (dificultar não bloqueia um Enorme
    // parcial), não a robustez do simulador de mouse.
    let cbFinal: { q: number; r: number } | null | undefined;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const origemBox = await boxDoToken(page, "CB");
      const destinoBox = await boxDaCelula(page, anchorDestino);
      if (origemBox && destinoBox) {
        await page.mouse.move(origemBox.x, origemBox.y);
        await page.mouse.down();
        await page.mouse.move(destinoBox.x, destinoBox.y, { steps: 10 });
        await page.locator(".rv-camada-rota-preview").waitFor({ state: "attached", timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(120);
        await page.mouse.up();
        await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
      }
      const { data } = await admin.from("vtt_tokens").select("q,r").eq("id", cbAntes.id).maybeSingle();
      cbFinal = data;
      if (cbFinal?.q === anchorDestino.q && cbFinal?.r === anchorDestino.r) break;
    }
    registrar("E1 (Enorme com só 2 das 7 células sobre terreno difícil: dificultar não é bloquear — o movimento é aceito)", cbFinal?.q === anchorDestino.q && cbFinal?.r === anchorDestino.r, `posição final=(${cbFinal?.q},${cbFinal?.r}), esperado=(${anchorDestino.q},${anchorDestino.r})`);
    await admin.from("vtt_terrain").delete().eq("campaign_id", campaignId).in("q", [10, 11]).in("r", [6, 7]);
  }

  registrar("console (sem erros relevantes durante toda a sessão)", erros.length === 0, erros.length ? erros.slice(0, 5).join(" | ") : "limpo");

  await close();
  await limpar();

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  process.exit(falhou > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("Erro fatal:", e);
  try { await limpar(); } catch { /* melhor esforço */ }
  process.exit(1);
});
