/**
 * Teste DEDICADO de cor e opacidade de áreas — nascido da rodada de
 * auditoria pós-0081 (o relatório anterior só confirmava que os
 * CAMPOS existiam, nunca que o valor realmente ida e volta pelo
 * banco/Realtime e aparece no SVG). Interações reais de Playwright.
 *
 * Cobre:
 *  1. alterar cor na prévia (antes de persistir) — o preenchimento do
 *     SVG muda;
 *  2. persistir cor — a linha em `vtt_areas` grava o slug certo;
 *  3. outra sessão recebe a cor persistida sem reload;
 *  4. editar cor de uma área existente — persiste e reflete no SVG;
 *  5. opacidade: mesmo ciclo (prévia → persiste → outra sessão → edita);
 *  6. valor de opacidade fora do intervalo é recusado pelo SERVIDOR
 *     (não só escondido pela interface — chamada direta à RPC);
 *  7. cor fora do enum é recusada pelo servidor;
 *  8. a área desenhada usa o MESMO valor persistido, nunca um padrão
 *     diferente (fill/fillOpacity do path batem com `cor`/`opacidade`
 *     da linha do banco).
 *
 * Uso: npx tsx scripts/dev/check-vtt-areas-cor-opacidade.ts
 * (servidor dev já rodando em localhost:3000)
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { ConsoleMessage } from "playwright";
import { chromium, type BrowserContext, type Page } from "playwright";
import { Client } from "pg";
import { BASE_URL } from "./authSession";

loadDotenv({ path: ".env.local" });

function requireEnv(nome: string): string {
  const v = process.env[nome];
  if (!v) { console.error(`Variável de ambiente ausente: ${nome}`); process.exit(1); }
  return v;
}
const admin = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const anonKey = requireEnv("SUPABASE_ANON_KEY");
const supabaseUrl = requireEnv("SUPABASE_URL");

let passou = 0, falhou = 0;
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

let campaignId: string | null = null;
let narradorEmail: string | null = null, narradorSenha: string | null = null;
let jogadorEmail: string | null = null, jogadorSenha: string | null = null;
const criados = { usuarios: [] as string[], campanhas: [] as string[] };

async function criarUsuario(prefixo: string, nome: string) {
  const email = `${prefixo}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { display_name: nome } });
  if (error) throw new Error(`Falha ao criar usuário ${prefixo}: ${error.message}`);
  criados.usuarios.push(data.user.id);
  return { id: data.user.id, email, senha };
}

async function configurarFixture() {
  const narrador = await criarUsuario("check-vtt-areas-cor-narrador", "Narrador Cor");
  narradorEmail = narrador.email; narradorSenha = narrador.senha;
  campaignId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: "VTT Cor/Opacidade", owner_id: narrador.id });
  criados.campanhas.push(campaignId);
  const jogador = await criarUsuario("check-vtt-areas-cor-jogador", "Jogador Cor");
  jogadorEmail = jogador.email; jogadorSenha = jogador.senha;
  await admin.from("campaign_members").insert({ campaign_id: campaignId, user_id: jogador.id, role: "player", status: "active", origem: "fixture" });
}

async function contextoDe(email: string, senha: string) {
  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) throw new Error(`Falha ao logar ${email}: ${error?.message}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1367, height: 953 } });
  await context.addCookies([{
    name: "ruptura_auth",
    value: JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }),
    domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  }]);
  const page = await context.newPage();
  const erros: string[] = [];
  page.on("console", (m) => { if (erroRelevante(m)) erros.push(m.text().slice(0, 400)); });
  return { context, page, close: () => browser.close(), erros };
}

async function limpar() {
  for (const cid of criados.campanhas) {
    await admin.from("vtt_areas").delete().eq("campaign_id", cid);
    await admin.from("vtt_area_permissoes").delete().eq("campaign_id", cid);
    await admin.from("vtt_scenes").delete().eq("campaign_id", cid);
    await admin.from("campaign_members").delete().eq("campaign_id", cid);
    await admin.from("campaigns").delete().eq("id", cid);
  }
  for (const uid of criados.usuarios) await admin.auth.admin.deleteUser(uid);
  registrar("L (limpeza de fixtures)", true, `${criados.usuarios.length} usuário(s), ${criados.campanhas.length} campanha(s)`);
}

async function celula(page: Page, col: number, row: number) {
  const largura = await page.locator(".rv-mapa").getAttribute("aria-label").then((r) => Number(/de (\d+) por/.exec(r ?? "")?.[1] ?? 26));
  const caixa = await page.locator(".rv-camada-grade path").nth(row * largura + col).boundingBox();
  if (!caixa) throw new Error(`Célula (${col},${row}) sem caixa`);
  return { x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 };
}
async function arrastar(page: Page, de: { x: number; y: number }, ate: { x: number; y: number }) {
  await page.mouse.move(de.x, de.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(de.x + ((ate.x - de.x) * i) / 8, de.y + ((ate.y - de.y) * i) / 8);
  await page.mouse.up();
}
async function areaDoBanco() {
  const { data } = await admin.from("vtt_areas").select("*").eq("campaign_id", campaignId).limit(1).maybeSingle();
  return data as Record<string, unknown> | null;
}

async function main() {
  await configurarFixture();
  registrar("0 (fixture: campanha + narrador + jogador)", true, `campanha=${campaignId}`);

  const narrador = await contextoDe(narradorEmail!, narradorSenha!);
  const P = narrador.page;
  await P.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
  await P.waitForSelector(".rv-ferramentas", { timeout: 20000 });
  await P.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Áreas"]').click();
  await P.waitForSelector('[data-testid="painel-areas"]', { timeout: 8000 });

  // ── 1. Alterar cor NA PRÉVIA ─────────────────────────────────────
  // Cor e opacidade vivem na seção recolhível "Aparência" (revisão de
  // UX): parâmetros PRINCIPAIS têm prioridade visual, aparência é
  // secundária. A seção lembra o estado por preferência local, então
  // abrir aqui é idempotente.
  await P.locator('[data-testid="area-tipo-esfera"]').click();
  async function garantirAparenciaAberta() {
    const aberta = await P.locator('[data-testid="area-secao-aparencia"]').getAttribute("aria-expanded");
    if (aberta !== "true") await P.locator('[data-testid="area-secao-aparencia"]').click();
    await P.waitForSelector('[data-testid="area-cor-roxo"]', { timeout: 5000 });
  }
  await garantirAparenciaAberta();
  await P.locator('[data-testid="area-cor-roxo"]').click();
  await P.locator('[data-testid="area-campo-opacidade"]').fill("0.6");
  const c0 = await celula(P, 10, 5), c1 = await celula(P, 14, 5);
  await arrastar(P, c0, c1);
  const fillPrevia = await P.locator('.rv-camada-areas .rv-area--previa path').first().getAttribute("fill");
  const opacidadePrevia = await P.locator('.rv-camada-areas .rv-area--previa path').first().getAttribute("fill-opacity");
  registrar("1 (cor escolhida ANTES de soltar já aparece na prévia)", fillPrevia === "#8b5cf6", `fill=${fillPrevia}`);
  registrar("1b (opacidade escolhida já aparece na prévia — 0,6 × fator de prévia)", !!opacidadePrevia && Number(opacidadePrevia) > 0 && Number(opacidadePrevia) < 0.6, `opacidade=${opacidadePrevia}`);

  // ── 2. Persistir ─────────────────────────────────────────────────
  await P.locator('[data-testid="area-manter"]').click();
  await P.waitForFunction(() => document.querySelector('[data-testid="painel-areas"]')?.getAttribute("data-fase") === "ociosa", null, { timeout: 10000 });
  const linha1 = await areaDoBanco();
  registrar("2 (cor persistida no banco com o slug certo)", linha1?.cor === "roxo", `cor=${linha1?.cor}`);
  registrar("2b (opacidade persistida no banco)", Math.abs(Number(linha1?.opacidade) - 0.6) < 1e-6, `opacidade=${linha1?.opacidade}`);

  const fillPersistido = await P.locator('.rv-camada-areas .rv-area path').first().getAttribute("fill");
  const opPersistido = Number(await P.locator('.rv-camada-areas .rv-area path').first().getAttribute("fill-opacity"));
  registrar("8 (a área desenhada usa a cor PERSISTIDA, não um padrão)", fillPersistido === "#8b5cf6", `fill=${fillPersistido}`);
  registrar("8b (a área desenhada usa a opacidade PERSISTIDA — 0,6 exatamente, fase persistida usa fator 1)", Math.abs(opPersistido - 0.6) < 1e-6, `opacidade renderizada=${opPersistido}`);

  // ── 3. Outra sessão recebe a cor/opacidade sem reload ────────────
  const jogador = await contextoDe(jogadorEmail!, jogadorSenha!);
  await jogador.page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
  await jogador.page.waitForSelector(".rv-camada-areas .rv-area", { timeout: 20000 });
  const fillJogador = await jogador.page.locator('.rv-camada-areas .rv-area path').first().getAttribute("fill");
  registrar("3 (outra sessão recebe a MESMA cor persistida)", fillJogador === "#8b5cf6", `fill=${fillJogador}`);

  // ── 4/5. Editar cor E opacidade de uma área existente ────────────
  const id = linha1!.id as string;
  // Com a seção Aparência aberta o painel fica alto; a lista de áreas
  // rola dentro do corpo. Rolar até o item ANTES de clicar é o que
  // torna o clique determinístico (em vez de depender de o item já
  // estar na faixa visível).
  await P.locator(`[data-testid="area-editar-${id}"]`).scrollIntoViewIfNeeded();
  await P.locator(`[data-testid="area-editar-${id}"]`).click();
  await P.waitForFunction(() => document.querySelector('[data-testid="painel-areas"]')?.getAttribute("data-fase") === "editando", null, { timeout: 6000 });
  await garantirAparenciaAberta();
  await P.locator('[data-testid="area-cor-verde"]').click();
  await P.locator('[data-testid="area-campo-opacidade"]').fill("0.9");
  await P.locator('[data-testid="area-salvar"]').click();
  await P.waitForFunction(() => document.querySelector('[data-testid="painel-areas"]')?.getAttribute("data-fase") === "ociosa", null, { timeout: 10000 });
  const linha2 = await areaDoBanco();
  registrar("4 (editar cor persiste)", linha2?.cor === "verde" && Number(linha2?.revision) > Number(linha1?.revision), `cor=${linha2?.cor} revisão ${linha1?.revision}→${linha2?.revision}`);
  registrar("5 (editar opacidade persiste)", Math.abs(Number(linha2?.opacidade) - 0.9) < 1e-6, `opacidade=${linha2?.opacidade}`);

  await jogador.page.waitForFunction(
    () => document.querySelector(".rv-camada-areas .rv-area path")?.getAttribute("fill") === "#22d3aa",
    null, { timeout: 12000 },
  ).catch(() => {});
  const fillJogadorDepois = await jogador.page.locator('.rv-camada-areas .rv-area path').first().getAttribute("fill");
  registrar("5b (a OUTRA sessão recebe a edição de cor/opacidade sem reload)", fillJogadorDepois === "#22d3aa", `fill=${fillJogadorDepois}`);

  // ── 6/7. Valores inválidos são recusados pelo SERVIDOR ───────────
  // Precisa ser o NARRADOR de verdade (impersonado via `pg` +
  // `request.jwt.claims`, dentro de BEGIN/ROLLBACK) — chamar com a
  // service role bypassaria `auth.uid()` e a RPC recusaria por
  // AUTORIZAÇÃO antes mesmo de chegar na constraint de cor/opacidade,
  // testando a coisa errada.
  const { data: narradorRow } = await admin.from("campaigns").select("owner_id").eq("id", campaignId).single();
  const pgClient = new Client({ connectionString: requireEnv("SUPABASE_DB_URL"), ssl: { rejectUnauthorized: false } });
  await pgClient.connect();
  async function rpcInvalidaComoNarrador(patch: Record<string, unknown>) {
    await pgClient.query("begin");
    try {
      await pgClient.query("set local role authenticated");
      await pgClient.query(`set local request.jwt.claims = '${JSON.stringify({ sub: narradorRow!.owner_id, role: "authenticated" })}'`);
      const p = {
        p_origem_q: linha2!.origem_q, p_origem_r: linha2!.origem_r, p_direcao_graus: null,
        p_raio_m: linha2!.raio_m, p_comprimento_m: null, p_largura_m: null, p_altura_m: null, p_lado_m: null,
        p_nivel_origem_m: null, p_modo_linha: null, p_pontos: null, p_token_id: null,
        p_cor: "ciano", p_opacidade: 0.5, p_rotulo: null, p_visivel: true, p_expected_revision: Number(linha2!.revision),
        ...patch,
      };
      await pgClient.query(
        `select * from update_vtt_area($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [id, p.p_origem_q, p.p_origem_r, p.p_direcao_graus, p.p_raio_m, p.p_comprimento_m, p.p_largura_m, p.p_altura_m, p.p_lado_m, p.p_nivel_origem_m, p.p_modo_linha, p.p_pontos, p.p_token_id, p.p_cor, p.p_opacidade, p.p_rotulo, p.p_visivel, p.p_expected_revision],
      );
      return null;
    } catch (e) {
      return e as Error;
    } finally {
      await pgClient.query("rollback");
    }
  }
  const erroOpacidade = await rpcInvalidaComoNarrador({ p_opacidade: 5 });
  registrar("6 (opacidade fora de [0,05, 1,0] é recusada pelo banco)", !!erroOpacidade && /check constraint/i.test(erroOpacidade.message), erroOpacidade?.message.slice(0, 100) ?? "SEM ERRO — falha grave");
  const erroCor = await rpcInvalidaComoNarrador({ p_cor: "invisivel-nao-existe" });
  registrar("7 (cor fora do enum é recusada pelo banco)", !!erroCor && /check constraint/i.test(erroCor.message), erroCor?.message.slice(0, 100) ?? "SEM ERRO — falha grave");
  await pgClient.end();
  const confereInalterado = await areaDoBanco();
  registrar("6b/7b (tentativas inválidas — mesmo dentro de transação revertida — não alteraram a linha real)", confereInalterado?.cor === "verde" && Math.abs(Number(confereInalterado?.opacidade) - 0.9) < 1e-6, `cor=${confereInalterado?.cor} opacidade=${confereInalterado?.opacidade}`);

  registrar("console (narrador)", narrador.erros.length === 0, narrador.erros.slice(0, 2).join(" | ") || "limpo");
  registrar("console (jogador)", jogador.erros.length === 0, jogador.erros.slice(0, 2).join(" | ") || "limpo");

  await narrador.close();
  await jogador.close();
  await limpar();
  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  process.exit(falhou > 0 ? 1 : 0);
}

main().catch(async (e) => { console.error("ERRO:", e); await limpar().catch(() => {}); process.exit(1); });
