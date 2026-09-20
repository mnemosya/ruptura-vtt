/**
 * CON-02 — paleta do Console sem cores mágicas duplicadas.
 *
 * O critério "tokens sem cores mágicas duplicadas" é mensurável: uma
 * cor que já tem token escrita à mão em dezenas de lugares significa
 * que mudá-la exige achar todas. Este check conta os literais que
 * COINCIDEM com um token existente — esses são, por definição,
 * duplicação — e confirma que a troca não mexeu em nenhuma cor
 * renderizada.
 *
 * Uso: npx tsx scripts/dev/check-console-paleta.ts
 */

import { readFileSync } from "node:fs";
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
const criados = { u: [] as string[], c: [] as string[], ch: [] as string[] };

async function limpar() {
  for (const id of criados.ch) await admin.from("characters").delete().eq("id", id);
  for (const cid of criados.c) {
    await admin.from("vtt_scenes").delete().eq("campaign_id", cid);
    await admin.from("campaigns").delete().eq("id", cid);
  }
  for (const uid of criados.u) await admin.auth.admin.deleteUser(uid);
  registrar("L (limpeza)", true, `${criados.u.length} usuário(s)`);
}

async function main() {
  const css = readFileSync("src/app/_design/console.css", "utf8");

  // --- 1. Nenhum literal repete uma cor que já tem token ---
  {
    /* Tokens CONTEXTUAIS ficam de fora: `--rc-skill-cor` vale verde em
       Corpo e roxo em Mente, e só recebe valor dentro de `.rc-skill`.
       Uma cor que coincide com um deles não é duplicação — trocar o
       literal pelo token levaria a um `var()` que não resolve no lugar
       errado, que foi o que aconteceu com `.rc-nric-badge`. Um token é
       contextual quando aparece declarado com mais de um valor. */
    const valoresPorToken = new Map<string, Set<string>>();
    for (const m of css.matchAll(/(--rc-[a-z0-9-]+|--cy|--am):\s*(#[0-9a-fA-F]{6})/g)) {
      const nome = m[1];
      if (!valoresPorToken.has(nome)) valoresPorToken.set(nome, new Set());
      valoresPorToken.get(nome)!.add(m[2].toLowerCase());
    }
    const tokens = new Map<string, string>();
    for (const [nome, valores] of valoresPorToken) {
      if (valores.size !== 1) continue;
      const hexa = [...valores][0];
      if (!tokens.has(hexa)) tokens.set(hexa, nome);
    }
    /* Fora de contagem: as próprias declarações (definição, não uso) e
       os COMENTÁRIOS — uma cor citada em comentário para explicar de
       onde ela veio não é duplicação, e contá-la marcava como dívida um
       texto que existe justamente para evitar dívida. */
    const corpo = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(--[a-z0-9-]+):\s*#[0-9a-fA-F]{6};/g, "");
    const duplicados: string[] = [];
    for (const [hexa, token] of tokens) {
      const n = (corpo.match(new RegExp(hexa, "gi")) ?? []).length;
      if (n > 0) duplicados.push(`${hexa} (=${token}) ×${n}`);
    }
    registrar("1 (nenhuma cor com token é reescrita à mão)",
      duplicados.length === 0, duplicados.length ? duplicados.join(", ") : `${tokens.size} tokens de cor`);
  }

  // --- 2. Os tokens alcançam o cabeçalho, que é irmão da janela ---
  {
    const declara = /\.rc-fichaheader\s*\{[^}]*--rc-text:/.test(css);
    registrar("2 (o cabeçalho de /ficha enxerga os tokens)", declara,
      `declara=${declara}`);
  }

  // --- 3. Nada mudou na tela ---
  const dono = { email: `con02-${Date.now()}@ruptura.dev`, senha: randomUUID() };
  const { data: u, error: eU } = await admin.auth.admin.createUser({
    email: dono.email, password: dono.senha, email_confirm: true, user_metadata: { display_name: "Con02" } });
  if (eU) throw new Error(eU.message);
  criados.u.push(u.user.id);
  const campaignId = randomUUID(), characterId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: "Mesa CON-02", owner_id: u.user.id });
  criados.c.push(campaignId);
  await admin.from("characters").insert({
    id: characterId, name: "PJ", status: "draft", campaign_id: campaignId, owner_id: u.user.id,
    payload: { nome: "PJ", atributos: { corpo: 3, mente: 2, animo: 3 }, metadados: { schema_version: 1 } },
  });
  criados.ch.push(characterId);

  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data: sess } = await anon.auth.signInWithPassword({ email: dono.email, password: dono.senha });
  const b = await chromium.launch({ headless: true });
  try {
    const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
    await ctx.addCookies([{ name: "ruptura_auth", value: JSON.stringify({ access_token: sess!.session!.access_token, refresh_token: sess!.session!.refresh_token }), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax", expires: Math.floor(Date.now()/1000)+86400 }]);
    const page: Page = await ctx.newPage();
    await page.goto(`${BASE_URL}/ficha?campaignId=${campaignId}&characterId=${characterId}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".rc-window", { timeout: 25000 });
    await page.waitForTimeout(1000);

    /* Em vez de adivinhar "cor de fallback" — branco pode ser escolha
       deliberada, e um invólucro sem cor própria herda do body — o que
       se verifica é DIRETO: os elementos que declaram `var(--rc-*)`
       resolvem para o valor do token. Um `var()` fora de escopo não
       resolve, e é assim que ele aparece. */
    const resolucao = await page.evaluate(() => {
      const esperado: Record<string, string> = {
        ".rc-window": "rgb(28, 43, 69)",       // --rc-line, na borda
        ".rc-topbar": "rgb(28, 43, 69)",       // --rc-line, no fio de baixo
      };
      const out: { alvo: string; obtido: string | null; esperado: string }[] = [];
      for (const [sel, esp] of Object.entries(esperado)) {
        const el = document.querySelector(sel);
        const c = el ? getComputedStyle(el) : null;
        out.push({ alvo: sel, obtido: c ? (sel === ".rc-topbar" ? c.borderBottomColor : c.borderTopColor) : null, esperado: esp });
      }
      return out;
    });
    const todosOk = resolucao.every((r) => r.obtido === r.esperado);
    registrar("3 (os `var(--rc-*)` resolvem para o valor do token)",
      todosOk, JSON.stringify(resolucao));

    // --- 4. O cabeçalho continua com a tinta do Console ---
    {
      const cor = await page.evaluate(() => {
        const h = document.querySelector(".rc-fichaheader");
        return h ? getComputedStyle(h).color : null;
      });
      registrar("4 (o cabeçalho usa a tinta do Console, não a do navegador)",
        cor === "rgb(214, 228, 245)", `color=${cor}`);
    }
  } finally {
    await b.close();
  }
}

try { await main(); } catch (e) { registrar("E", false, e instanceof Error ? e.message : String(e)); }
finally { await limpar(); console.log(`\n${passou} ok, ${falhou} falha(s)`); process.exit(falhou > 0 ? 1 : 0); }
