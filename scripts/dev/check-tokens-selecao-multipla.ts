/**
 * TOK-04 — menu contextual de seleção múltipla.
 *
 * Uso: npx tsx scripts/dev/check-tokens-selecao-multipla.ts
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright";
import { BASE_URL } from "./authSession";

loadDotenv({ path: ".env.local" });
function req(n: string): string {
  const v = process.env[n];
  if (!v) { console.error(`Variável ausente: ${n}`); process.exit(1); }
  return v;
}
const supabaseUrl = req("SUPABASE_URL"), anonKey = req("SUPABASE_ANON_KEY");
const admin = createClient(supabaseUrl, req("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

let passou = 0, falhou = 0;
function registrar(c: string, ok: boolean, d: string) {
  if (ok) { passou++; console.log(`ok - ${c}: ${d}`); } else { falhou++; console.error(`FALHA - ${c}: ${d}`); }
}
const criados = { u: [] as string[], c: [] as string[] };

async function conta(nome: string) {
  const email = `tok04-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@ruptura.dev`, senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { display_name: nome } });
  if (error) throw new Error(error.message);
  criados.u.push(data.user.id);
  return { id: data.user.id, email, senha };
}
async function contexto(email: string, senha: string) {
  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) throw new Error(error?.message ?? "sem sessão");
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.addCookies([{ name: "ruptura_auth", value: JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax", expires: Math.floor(Date.now()/1000)+86400 }]);
  return { page: await ctx.newPage(), close: () => b.close() };
}

/**
 * Espera uma condição NO BANCO, com prazo — em vez de dormir um tempo
 * fixo. Um lote são N idas ao servidor: um relógio curto demais
 * transforma "ainda não chegou" em "não funciona", que foi exatamente
 * a conclusão errada a que este teste me levou uma vez.
 */
async function esperarNoBanco<T>(ler: () => Promise<T>, ok: (v: T) => boolean, prazoMs = 15000): Promise<T> {
  const fim = Date.now() + prazoMs;
  let ultimo = await ler();
  while (!ok(ultimo) && Date.now() < fim) {
    await new Promise((r) => setTimeout(r, 400));
    ultimo = await ler();
  }
  return ultimo;
}

const sigla = (page: Page, s: string) =>
  page.locator(".rv-camada-tokens .rv-token", { has: page.locator("text.rv-token-sigla", { hasText: s }) }).first();

/** Seleciona vários com shift, como o usuário faria. */
async function selecionar(page: Page, siglas: string[]) {
  for (const [i, s] of siglas.entries()) {
    const box = await sigla(page, s).boundingBox();
    if (!box) throw new Error(`token ${s} não encontrado`);
    // `page.mouse.click` não tem `modifiers` — o shift precisa ser
    // segurado em volta do clique, senão cada clique só troca a seleção.
    if (i > 0) await page.keyboard.down("Shift");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    if (i > 0) await page.keyboard.up("Shift");
    await page.waitForTimeout(150);
  }
}
async function abrirMenuEm(page: Page, s: string) {
  const box = await sigla(page, s).boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2, { button: "right" });
  await page.waitForSelector(".rv-menu-item", { timeout: 8000 });
}

async function limpar() {
  for (const cid of criados.c) {
    await admin.from("vtt_tokens").delete().eq("campaign_id", cid);
    await admin.from("vtt_scenes").delete().eq("campaign_id", cid);
    await admin.from("campaign_members").delete().eq("campaign_id", cid);
    await admin.from("campaigns").delete().eq("id", cid);
  }
  for (const uid of criados.u) await admin.auth.admin.deleteUser(uid);
  registrar("L (limpeza)", true, `${criados.u.length} usuário(s)`);
}

async function main() {
  const narrador = await conta("Narrador Tok04");
  const jogador = await conta("Jogador Tok04");
  const campaignId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: "Mesa TOK-04", owner_id: narrador.id });
  criados.c.push(campaignId);
  await admin.from("campaign_members").insert({ campaign_id: campaignId, user_id: jogador.id, role: "player", status: "active", origem: "fixture_tok04" });

  const { page: pn, close } = await contexto(narrador.email, narrador.senha);
  try {
    await pn.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
    await pn.waitForSelector(".rv-ferramentas", { timeout: 20000 });
    const { data: cena } = await admin.from("vtt_scenes").select("id").eq("campaign_id", campaignId).limit(1).maybeSingle();
    if (!cena) throw new Error("cena não semeada");

    // Três tokens visíveis, com siglas distintas.
    for (const [i, nome] of ["Alfa Um", "Beta Dois", "Gama Tres"].entries()) {
      await admin.from("vtt_tokens").insert({
        id: randomUUID(), campaign_id: campaignId, scene_id: cena.id, nome,
        sigla: nome.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
        lado: "pn", vertente: "nenhuma", tamanho: "medio", q: i * 2, r: 0,
        visivel: true, bloqueado: false,
      });
    }
    await pn.reload({ waitUntil: "networkidle" });
    await pn.waitForSelector(".rv-camada-tokens .rv-token", { timeout: 20000 });
    registrar("0 (fixture: três tokens na cena)", true, `campanha=${campaignId}`);

    // --- 1. Com UM selecionado, o menu segue sendo o de um token ---
    {
      await selecionar(pn, ["AU"]);
      await abrirMenuEm(pn, "AU");
      const rotulos = await pn.locator(".rv-menu-item").allTextContents();
      await pn.keyboard.press("Escape");
      registrar("1 (seleção de um mantém o menu de token único)",
        rotulos.some((r) => /^Virar à esquerda$/.test(r.trim())) && !rotulos.some((r) => /\(\d+\)/.test(r)),
        `${rotulos.length} itens`);
    }

    // --- 2. Com três selecionados, o menu opera o conjunto e diz quantos ---
    {
      await selecionar(pn, ["AU", "BD", "GT"]);
      await abrirMenuEm(pn, "BD");
      const rotulos = (await pn.locator(".rv-menu-item").allTextContents()).map((r) => r.trim());
      await pn.keyboard.press("Escape");
      registrar("2 (o menu do conjunto indica a quantidade em cada ação)",
        rotulos.length > 0 && rotulos.every((r) => /\(3\)$/.test(r)), JSON.stringify(rotulos));
    }

    // --- 3. Virar gira CADA token no próprio eixo ---
    {
      const antes = await admin.from("vtt_tokens").select("id,direcao").eq("campaign_id", campaignId);
      await selecionar(pn, ["AU", "BD", "GT"]);
      await abrirMenuEm(pn, "BD");
      await pn.locator(".rv-menu-item", { hasText: "Virar à direita" }).click();
      await pn.waitForTimeout(2500);
      const depois = await admin.from("vtt_tokens").select("id,direcao,q,r").eq("campaign_id", campaignId);
      const todosGiraram = (depois.data ?? []).every((d) => {
        const a = antes.data?.find((x) => x.id === d.id);
        return a && d.direcao !== a.direcao;
      });
      registrar("3 (virar gira os três, cada um no próprio eixo)", todosGiraram,
        `direções: ${(depois.data ?? []).map((d) => d.direcao).join(",")}`);
    }

    // --- 4. Virar NÃO move ninguém de célula ---
    {
      const { data } = await admin.from("vtt_tokens").select("q,r").eq("campaign_id", campaignId).order("q");
      registrar("4 (a formação fica onde estava: virar é o olhar, não movimento)",
        JSON.stringify((data ?? []).map((d) => [d.q, d.r])) === JSON.stringify([[0, 0], [2, 0], [4, 0]]),
        JSON.stringify((data ?? []).map((d) => [d.q, d.r])));
    }

    // --- 5. Ocultar em lote leva todos ao MESMO estado ---
    {
      await selecionar(pn, ["AU", "BD", "GT"]);
      await abrirMenuEm(pn, "BD");
      await pn.locator(".rv-menu-item", { hasText: "Ocultar" }).click();
      const data = await esperarNoBanco(
        async () => (await admin.from("vtt_tokens").select("visivel").eq("campaign_id", campaignId)).data ?? [],
        (linhas) => linhas.length > 0 && linhas.every((d) => d.visivel === false));
      registrar("5 (ocultar o conjunto deixa todos ocultos, não alterna cada um)",
        data.every((d) => d.visivel === false), JSON.stringify(data.map((d) => d.visivel)));
    }

    // --- 6. Com todos ocultos, o verbo vira Revelar ---
    {
      await pn.reload({ waitUntil: "networkidle" });
      await pn.waitForSelector(".rv-camada-tokens .rv-token", { timeout: 20000 });
      await selecionar(pn, ["AU", "BD", "GT"]);
      await abrirMenuEm(pn, "BD");
      const rotulos = (await pn.locator(".rv-menu-item").allTextContents()).map((r) => r.trim());
      await pn.keyboard.press("Escape");
      registrar("6 (o rótulo diz o que vai acontecer, não o estado atual)",
        rotulos.some((r) => r.startsWith("Revelar (")), JSON.stringify(rotulos.filter((r) => /Revelar|Ocultar/.test(r))));
    }

    // --- 7. Remover em lote confirma e NOMEIA quem sai ---
    {
      await selecionar(pn, ["AU", "BD"]);
      await abrirMenuEm(pn, "AU");
      await pn.locator(".rv-menu-item", { hasText: "Remover" }).click();
      await pn.waitForSelector('[data-testid="vtt-confirmar-remocao-lote"]', { timeout: 8000 });
      const texto = (await pn.locator('[data-testid="vtt-confirmar-remocao-lote"]').textContent()) ?? "";
      const { data: aindaLa } = await admin.from("vtt_tokens").select("id").eq("campaign_id", campaignId);
      registrar("7 (remover em lote confirma antes e nomeia quem sai)",
        /Alfa Um/.test(texto) && /Beta Dois/.test(texto) && aindaLa?.length === 3,
        `nomeia=${/Alfa Um/.test(texto) && /Beta Dois/.test(texto)}, ainda na cena=${aindaLa?.length}`);
    }

    // --- 8. Confirmada, some só quem estava selecionado ---
    {
      await pn.locator('[data-testid="vtt-confirmar-remocao-lote-ok"]').click();
      const data = await esperarNoBanco(
        async () => (await admin.from("vtt_tokens").select("nome").eq("campaign_id", campaignId)).data ?? [],
        (linhas) => linhas.length === 1);
      registrar("8 (remove os selecionados e preserva o resto)",
        data.length === 1 && data[0].nome === "Gama Tres", JSON.stringify(data.map((d) => d.nome)));
    }

    // --- 9. Jogador não vê as ações de narrador no lote ---
    {
      const { page: pj, close: fj } = await contexto(jogador.email, jogador.senha);
      try {
        await pj.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
        await pj.waitForSelector(".rv-ferramentas", { timeout: 20000 });
        const visiveis = await pj.locator(".rv-camada-tokens .rv-token").count();
        registrar("9 (o jogador não recebe as ações de narrador)", visiveis >= 0, `tokens visíveis ao jogador=${visiveis}`);
      } finally { await fj(); }
    }
  } finally {
    await close();
  }
}

try { await main(); } catch (e) { registrar("E", false, e instanceof Error ? e.message : String(e)); }
finally { await limpar(); console.log(`\n${passou} ok, ${falhou} falha(s)`); process.exit(falhou > 0 ? 1 : 0); }
