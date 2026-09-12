/**
 * Browser check da ROLAGEM REAL na mesa — a ferramenta "Rolar Dados"
 * usando a FICHA do personagem e gravando no `table_logs`.
 *
 * Existe porque o rolador do VTT nasceu maquete: cinco atributos
 * inventados, seis perícias fixas, resultado que morria no estado do
 * componente. Cada critério abaixo trava um pedaço dessa correção.
 *
 *  1  o seletor de atributo mostra os atributos REAIS da ficha
 *     (Corpo/Mente/Ânimo com os valores do banco), não os inventados
 *  2  o seletor de perícia mostra as perícias da ficha
 *  3  o pool desenha exatamente `atributo` dados
 *  4  rolar GRAVA em `table_logs` como `rolagem_pericia`
 *  5  o payload gravado tem os números da ficha (não os do cliente) e
 *     a regra do sistema aplicada (maior dado + perícia + mod)
 *  6  com CD, o servidor classifica a margem nas SEIS faixas reais
 *  7  a rolagem aparece no Chat da mesa (o feed já sabia desenhar)
 *  8  a rolagem livre grava como `rolagem_expressao`
 *  9  sem token/personagem selecionado, o teste não finge: explica
 * 10  console limpo
 *
 * Uso: npx tsx scripts/dev/check-vtt-rolagem-real.ts
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium, type ConsoleMessage, type Page } from "playwright";
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
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

function erroRelevante(msg: ConsoleMessage): boolean {
  if (msg.type() !== "error") return false;
  const t = msg.text();
  if (t.includes("favicon") || t.includes("Download the React DevTools")) return false;
  if (t.includes("Cannot update a component") && t.includes("while rendering a different component")) return false;
  return true;
}

const criados = { usuarios: [] as string[], campanhas: [] as string[] };

// Valores da FICHA — os números que o servidor tem que usar, e que o
// cliente não pode inventar.
const CORPO = 4;
const MENTE = 2;
const ANIMO = 3;
const PERICIA_SLUG = "balistica"; // slug REAL do catálogo publicado (`regras_personagem`)
const PERICIA_VALOR = 3;

let campaignId = "";
let narradorEmail = "";
let narradorSenha = "";
let narradorId = "";
let personagemId = "";

async function configurarFixture() {
  const email = `check-rolagem-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true, user_metadata: { display_name: "Narradora Gabs" },
  });
  if (error || !data.user) throw new Error(`criar conta: ${error?.message}`);
  narradorId = data.user.id;
  narradorEmail = email;
  narradorSenha = senha;
  criados.usuarios.push(narradorId);

  campaignId = randomUUID();
  const { error: e1 } = await admin.from("campaigns").insert({ id: campaignId, name: "Rolagem real", owner_id: narradorId });
  if (e1) throw new Error(`criar campanha: ${e1.message}`);
  criados.campanhas.push(campaignId);

  personagemId = randomUUID();
  const { error: e2 } = await admin.from("characters").insert({
    id: personagemId,
    name: "Mara Venn",
    status: "draft",
    campaign_id: campaignId,
    owner_id: narradorId,
    payload: {
      nome: "Mara Venn",
      atributos: { corpo: CORPO, mente: MENTE, animo: ANIMO },
      pericias: { [PERICIA_SLUG]: PERICIA_VALOR },
      metadados: { schema_version: 1 },
    },
  });
  if (e2) throw new Error(`criar personagem: ${e2.message}`);

  const sceneId = randomUUID();
  const { error: e3 } = await admin.from("vtt_scenes").insert({
    id: sceneId, campaign_id: campaignId, nome: "Cena Rolagem", largura: 20, altura: 16, ativa: true,
  });
  if (e3) throw new Error(`criar cena: ${e3.message}`);

  const { error: e4 } = await admin.from("vtt_tokens").insert({
    id: randomUUID(), scene_id: sceneId, campaign_id: campaignId, character_id: personagemId,
    nome: "Mara Venn", sigla: "MV", lado: "pj", vertente: "nenhuma",
    q: 8, r: 6, tamanho: "medio", orientacao: 0, visivel: true,
  });
  if (e4) throw new Error(`criar token: ${e4.message}`);
}

async function limpar() {
  for (const cid of criados.campanhas) {
    await admin.from("table_logs").delete().eq("campaign_id", cid);
    await admin.from("vtt_tokens").delete().eq("campaign_id", cid);
    await admin.from("vtt_scenes").delete().eq("campaign_id", cid);
    await admin.from("characters").delete().eq("campaign_id", cid);
    await admin.from("campaign_members").delete().eq("campaign_id", cid);
    await admin.from("campaigns").delete().eq("id", cid);
  }
  for (const uid of criados.usuarios) await admin.auth.admin.deleteUser(uid);
  ok("L (limpeza de fixtures)", true, `${criados.usuarios.length} conta(s), ${criados.campanhas.length} campanha(s)`);
}

async function contextoDe(email: string, senha: string) {
  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) throw new Error(`login: ${error?.message}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await context.addCookies([{
    name: "ruptura_auth",
    value: JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }),
    domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  }]);
  const page = await context.newPage();
  return { page, close: () => browser.close() };
}

/** Espera até `cond` virar verdade (ou estourar) — o log chega por Server Action + Realtime. */
async function esperarAte(cond: () => Promise<boolean>, ms = 12000): Promise<boolean> {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    if (await cond()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function logsDoTipo(tipo: string) {
  const { data } = await admin.from("table_logs").select().eq("campaign_id", campaignId).eq("type", tipo);
  return data ?? [];
}

/** Abre a ferramenta de dados (atalho L) e espera a janela. */
async function abrirRolador(page: Page) {
  await page.keyboard.press("l");
  await page.locator('[data-testid="painel-dados"]').waitFor({ timeout: 8000 });
}

async function main() {
  await configurarFixture();
  const { page, close } = await contextoDe(narradorEmail, narradorSenha);
  const errosConsole: string[] = [];
  page.on("console", (m) => { if (erroRelevante(m)) errosConsole.push(m.text()); });

  try {
    await page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="painel-vtt"]', { timeout: 20000 });

    // ── 9 — sem token selecionado, o teste não inventa ficha ────────
    await abrirRolador(page);
    const janela = page.locator('[data-testid="painel-dados"]');
    const semFicha = await janela.getByText("Sem personagem").count();
    ok("9 (sem token selecionado o teste explica, não inventa atributo)", semFicha > 0, `aviso=${semFicha}`);

    // ── seleciona o token do personagem ────────────────────────────
    await page.locator(".rv-token").first().click();
    // Espera a FICHA chegar, não um relógio: `lerContextoRolagemAction`
    // é uma ida ao servidor e, com a rota recém-compilada, passa muito
    // dos 900ms fixos que estavam aqui — os seletores ainda nem
    // existiam quando os critérios abaixo liam as opções.
    // A linha "Pool · Nd8" só existe quando a ficha chegou — e, ao
    // contrário de um `<option>`, é um alvo que o Playwright consegue
    // esperar ficar visível.
    await page.locator('[data-testid="painel-dados"]').getByText(/POOL/i).first().waitFor({ timeout: 30000 });

    // ── 1/2 — os seletores mostram a FICHA, não a maquete ───────────
    const selects = janela.locator("select");
    const opcoesAtributo = await selects.nth(1).locator("option").allTextContents();
    const temReais = opcoesAtributo.some((o) => /corpo/i.test(o)) && opcoesAtributo.some((o) => /mente/i.test(o)) && opcoesAtributo.some((o) => /ânimo|animo/i.test(o));
    const temFalsos = opcoesAtributo.some((o) => /potência|reflexos|intelecto|presença/i.test(o));
    ok("1 (atributos são os REAIS da ficha, e os inventados sumiram)", temReais && !temFalsos, opcoesAtributo.join(" | "));
    const valorCorpo = opcoesAtributo.find((o) => /corpo/i.test(o)) ?? "";
    ok("1b (o atributo traz o valor do banco)", valorCorpo.includes(`${CORPO}d8`), valorCorpo);

    const opcoesPericia = await selects.nth(2).locator("option").allTextContents();
    // O catálogo publicado nomeia as perícias; a FICHA dá o valor.
    const balistica = opcoesPericia.find((o) => /bal[íi]stica/i.test(o)) ?? "";
    ok(
      "2 (perícias vêm do catálogo com o valor da ficha)",
      balistica.includes(`+${PERICIA_VALOR}`) && opcoesPericia.some((o) => /arcanismo/i.test(o)),
      `${balistica} · total=${opcoesPericia.length}`,
    );

    // ── 3 — o pool desenha `atributo` dados ────────────────────────
    await page.screenshot({ path: "scripts/dev/.artefatos-visuais/rolagem-real-ficha.png" });
    const poolLabel = await janela.getByText(/POOL/i).first().textContent();
    ok("3 (pool anuncia Nd8 do atributo real)", (poolLabel ?? "").includes(`${CORPO}d8`), poolLabel ?? "");

    // ── 4/5/6 — rola com CD e confere o que foi GRAVADO ────────────
    await janela.getByRole("button", { name: /Definir CD/i }).click();
    await janela.locator('input[type="number"]').fill("10");
    // Perícia real COM valor na ficha, pra provar que o bônus vem do banco.
    await selects.nth(2).selectOption({ label: balistica });
    await page.waitForTimeout(200);

    const botaoRolar = janela.locator("button").filter({ hasText: /Rolar/ }).first();
    await botaoRolar.click();
    const gravou = await esperarAte(async () => (await logsDoTipo("rolagem_pericia")).length > 0, 15000);
    ok("4 (rolar grava `rolagem_pericia` no table_logs)", gravou, gravou ? "1 linha" : "nenhuma linha em 15s");

    const linhas = await logsDoTipo("rolagem_pericia");
    const p = (linhas[0]?.payload ?? {}) as Record<string, unknown>;
    const dados = Array.isArray(p.dados) ? (p.dados as number[]) : [];
    const maior = typeof p.maiorDado === "number" ? p.maiorDado : -1;
    const total = typeof p.total === "number" ? p.total : -1;
    const periciaValor = typeof p.periciaValor === "number" ? p.periciaValor : -1;
    const regraOk =
      dados.length === CORPO &&
      dados.every((d) => Number.isInteger(d) && d >= 1 && d <= 8) &&
      maior === Math.max(...dados) &&
      periciaValor === PERICIA_VALOR &&
      total === maior + PERICIA_VALOR + 0;
    ok(
      "5 (payload usa os números da FICHA e a regra do sistema: maior + perícia + mod)",
      regraOk,
      `dados=${JSON.stringify(dados)} maior=${maior} pericia=${periciaValor} total=${total}`,
    );
    ok("5b (autoria é o personagem, resolvida no servidor)", p.characterNome === "Mara Venn" && p.characterId === personagemId, `${p.characterNome}`);

    const faixas = ["falha_critica", "falha", "falha_limitada", "sucesso_limitado", "sucesso_padrao", "sucesso_critico"];
    const classificacao = typeof p.classificacaoMargem === "string" ? p.classificacaoMargem : "";
    const margem = typeof p.margem === "number" ? p.margem : NaN;
    ok(
      "6 (margem classificada nas SEIS faixas reais, e coerente com total − CD)",
      faixas.includes(classificacao) && margem === total - 10,
      `cd=${p.cd} margem=${margem} faixa=${classificacao}`,
    );

    // ── 7 — a rolagem aparece no Chat ──────────────────────────────
    await page.locator('[data-testid="painel-aba-chat"]').click();
    const apareceu = await esperarAte(async () => (await page.locator('[data-testid="painel-feed-rolagem"]').count()) > 0, 12000);
    ok("7 (a rolagem vira card no Chat da mesa)", apareceu, apareceu ? "card presente" : "nenhum card em 12s");
    await page.screenshot({ path: "scripts/dev/.artefatos-visuais/rolagem-real-chat.png" });

    // ── 8 — rolagem livre grava como expressão ─────────────────────
    await abrirRolador(page);
    await janela.getByRole("tab", { name: /Livre/i }).click();
    await page.waitForTimeout(300);
    await janela.screenshot({ path: "scripts/dev/.artefatos-visuais/rolagem-real-livre.png" });
    await page.waitForTimeout(300);
    const rolarLivre = janela.locator("button").filter({ hasText: /Rolar \d+ dado/ }).first();
    await rolarLivre.click();
    const gravouLivre = await esperarAte(async () => (await logsDoTipo("rolagem_expressao")).length > 0, 15000);
    ok("8 (rolagem livre grava `rolagem_expressao`)", gravouLivre, gravouLivre ? "1 linha" : "nenhuma linha em 15s");

    // 8c — modo padrão da bandeja livre é SOMAR: no Chat, nenhum dado
    // pode sair destacado (todos entram na soma, nenhum "venceu").
    await page.locator('[data-testid="painel-aba-chat"]').click();
    await page.waitForTimeout(600);
    const cartaoLivre = page.locator('[data-testid="painel-feed-rolagem"]').first();
    const chipsDestacados = await cartaoLivre.locator('.pn-chip[data-acento="cy"]').count();
    await page.screenshot({ path: "scripts/dev/.artefatos-visuais/rolagem-livre-somar-chat.png" });
    ok("8c (modo Somar não destaca dado nenhum no card do Chat)", chipsDestacados === 0, `chips destacados=${chipsDestacados}`);
    if (gravouLivre) {
      const pl = ((await logsDoTipo("rolagem_expressao"))[0]?.payload ?? {}) as Record<string, unknown>;
      ok("8b (expressão canônica e dados numéricos no payload)", typeof pl.expressao === "string" && /\d+d\d+/.test(pl.expressao as string) && Array.isArray(pl.dados), `${pl.expressao} ${JSON.stringify(pl.dados)}`);
    }

    // ── 9-d100 — um d100 são DOIS d10 na mesa ──────────────────────
    //
    // Não existe peça de cem faces: percentil se rola com um d10 de
    // dezenas (00…90) e um d10 comum (1…10). A mesa lança os DOIS
    // corpos, e a janela mostra UMA peça com a soma — o número de 1 a
    // 100 que a pessoa pediu.
    //
    // O que se prova: o log guarda `1d100` com UM valor, dentro de
    // 1–100. A primeira tentativa usava um corpo só, com faces 00…90:
    // registrava 0 e nunca alcançava 91–100 — um erro que passaria
    // despercebido por muitas rolagens antes de alguém desconfiar.
    {
      await abrirRolador(page);
      await janela.getByRole("tab", { name: /Livre/i }).click();
      await page.waitForTimeout(300);
      // Bandeja limpa: o conjunto da rolagem anterior ainda está lá, e
      // a expressão sairia "1d8+1d100".
      const limpar = janela.locator("button").filter({ hasText: /^Limpar$/i });
      if (await limpar.count()) await limpar.first().click();
      await janela.locator('button[aria-label="Adicionar d100"]').click();
      await page.waitForTimeout(200);
      await janela.locator("button").filter({ hasText: /Rolar \d+ dado/ }).first().click();

      const achar = async () => {
        const linhas = await logsDoTipo("rolagem_expressao");
        return linhas.find((l) => (l.payload as Record<string, unknown>)?.expressao === "1d100") ?? null;
      };
      const gravou = await esperarAte(async () => (await achar()) !== null, 15000);
      const pl = ((await achar())?.payload ?? {}) as Record<string, unknown>;
      const dados = Array.isArray(pl.dados) ? (pl.dados as number[]) : [];
      const valor = dados[0];
      ok(
        "9-d100 (um d100 vira UMA leitura de 1 a 100, somando dezena e unidade)",
        gravou && dados.length === 1 && Number.isInteger(valor) && valor >= 1 && valor <= 100,
        `expressao=${String(pl.expressao)} dados=${JSON.stringify(dados)} total=${String(pl.total)}`,
      );
    }

    ok("10 (console sem erro novo)", errosConsole.length === 0, errosConsole.slice(0, 2).join(" | ") || "limpo");
  } finally {
    await close();
    await limpar();
  }

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  if (falhou > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await limpar(); process.exit(1); });
