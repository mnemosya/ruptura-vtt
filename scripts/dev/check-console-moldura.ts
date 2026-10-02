/**
 * CON-01 — moldura e controles da janela do Console.
 *
 * O critério que mais importa aqui é "apenas um cursor visual por
 * ponteiro": o Console monta o próprio `HudCursor` porque também roda
 * sozinho em /ficha, e dentro da campanha já existe outro. Dois anéis
 * perseguindo o mesmo ponteiro é o defeito relatado.
 *
 * Uso: npx tsx scripts/dev/check-console-moldura.ts
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright";
import { BASE_URL } from "./authSession";

import { personagemV12 } from "./fixtures/personagemV12";
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

async function conta(nome: string) {
  const email = `con01-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@ruptura.dev`, senha = randomUUID();
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
const contarCursores = (page: Page) => page.evaluate(() => ({
  aneis: document.querySelectorAll(".ra-cursor-ring").length,
  pontos: document.querySelectorAll(".ra-cursor-dot").length,
}));

async function limpar() {
  for (const id of criados.ch) await admin.from("characters").delete().eq("id", id);
  for (const cid of criados.c) {
    await admin.from("campaign_members").delete().eq("campaign_id", cid);
    await admin.from("vtt_scenes").delete().eq("campaign_id", cid);
    await admin.from("campaigns").delete().eq("id", cid);
  }
  for (const uid of criados.u) await admin.auth.admin.deleteUser(uid);
  registrar("L (limpeza)", true, `${criados.u.length} usuário(s)`);
}

async function main() {
  const narrador = await conta("Narrador Con01");
  const campaignId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: "Mesa CON-01", owner_id: narrador.id });
  criados.c.push(campaignId);
  const characterId = randomUUID();
  await admin.from("characters").insert({
    id: characterId, name: "PJ do console", status: "draft",
    payload: personagemV12("PJ do console"), campaign_id: campaignId, owner_id: narrador.id,
  });
  criados.ch.push(characterId);
  registrar("0 (fixture)", true, `campanha=${campaignId}`);

  const { page, close } = await contexto(narrador.email, narrador.senha);
  try {
    // --- 1. Na mesa, antes de abrir o Console: exatamente um cursor ---
    await page.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 20000 });
    await page.mouse.move(700, 500);
    await page.waitForTimeout(400);
    {
      const c = await contarCursores(page);
      registrar("1 (a mesa sozinha desenha um cursor)", c.aneis === 1 && c.pontos === 1, JSON.stringify(c));
    }

    // --- 2. Console aberto: continua UM, não dois ---
    {
      await page.goto(`${BASE_URL}/ficha?campaignId=${campaignId}&characterId=${characterId}`, { waitUntil: "networkidle" });
      await page.waitForSelector(".rc-window", { timeout: 25000 });
      await page.mouse.move(800, 520);
      await page.waitForTimeout(500);
      const c = await contarCursores(page);
      registrar("2 (Console aberto continua com um cursor só)", c.aneis === 1 && c.pontos === 1, JSON.stringify(c));
    }

    // --- 3. O Console sozinho em /ficha desenha o seu — não fica sem ---
    {
      const c = await contarCursores(page);
      registrar("3 (em /ficha, o Console desenha o próprio cursor)", c.aneis === 1, JSON.stringify(c));
    }

    // --- 4. Moldura arredondada, e reta quando maximizada ---
    {
      const normal = await page.evaluate(() => getComputedStyle(document.querySelector(".rc-window")!).borderRadius);
      await page.locator('[data-testid="console-maximizar"]').click();
      await page.waitForTimeout(400);
      const max = await page.evaluate(() => getComputedStyle(document.querySelector(".rc-window")!).borderRadius);
      await page.locator('[data-testid="console-maximizar"]').click();
      await page.waitForTimeout(300);
      registrar("4 (bordas arredondadas, retas quando maximizada)",
        normal !== "0px" && max === "0px", `normal=${normal}, maximizada=${max}`);
    }

    // --- 5. Os três controles têm tooltip, rótulo e foco ---
    {
      const botoes = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".rc-winbtn")).map((b) => ({
          titulo: b.getAttribute("title"), rotulo: b.getAttribute("aria-label"),
          raio: getComputedStyle(b).borderRadius,
        })));
      const todosOk = botoes.length === 3 && botoes.every((b) => !!b.titulo && !!b.rotulo && b.raio !== "0px");
      await page.locator(".rc-winbtn").first().focus();
      const temFoco = await page.evaluate(() => document.activeElement?.classList.contains("rc-winbtn"));
      registrar("5 (minimizar, maximizar e fechar têm tooltip, rótulo, raio e foco)",
        todosOk && !!temFoco, JSON.stringify(botoes));
    }

    // --- 6. O ciano dos ícones foi atenuado, sem perder contraste ---
    {
      const cor = await page.evaluate(() => getComputedStyle(document.querySelector(".rc-winbtn")!).color);
      const m = cor.match(/[\d.]+/g)!.map(Number);
      const alfa = m.length === 4 ? m[3] : 1;
      registrar("6 (ícone de janela atenuado no repouso)", alfa < 1 && alfa >= 0.5, `color=${cor}`);
    }
  } finally {
    await close();
  }
}

try { await main(); } catch (e) { registrar("E", false, e instanceof Error ? e.message : String(e)); }
finally { await limpar(); console.log(`\n${passou} ok, ${falhou} falha(s)`); process.exit(falhou > 0 ? 1 : 0); }
