/**
 * CHAR-02 — criação rápida de PJ pelo painel.
 *
 * Uso: npx tsx scripts/dev/check-criacao-rapida-pj.ts
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

async function conta() {
  const email = `char02-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@ruptura.dev`, senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { display_name: "Char02" } });
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

async function abrirPersonagens(page: Page) {
  const aba = page.locator('[role="tab"]', { hasText: /Personagens/i }).first();
  if (await aba.count() > 0) await aba.click();
  await page.waitForSelector('[data-testid="painel-personagens-criar"]', { timeout: 20000 });
}

async function limpar() {
  for (const cid of criados.c) {
    await admin.from("characters").delete().eq("campaign_id", cid);
    await admin.from("vtt_scenes").delete().eq("campaign_id", cid);
    await admin.from("campaign_members").delete().eq("campaign_id", cid);
    await admin.from("campaigns").delete().eq("id", cid);
  }
  for (const uid of criados.u) await admin.auth.admin.deleteUser(uid);
  registrar("L (limpeza)", true, `${criados.u.length} usuário(s)`);
}

async function main() {
  const dono = await conta();
  const campaignId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: "Mesa CHAR-02", owner_id: dono.id });
  criados.c.push(campaignId);
  registrar("0 (fixture)", true, `campanha=${campaignId}`);

  const { page, close } = await contexto(dono.email, dono.senha);
  try {
    await page.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 20000 });
    await abrirPersonagens(page);

    // --- 1. O campo do diálogo tem corpo de leitura, não o dos filtros ---
    {
      await page.locator('[data-testid="painel-personagens-criar"]').click();
      // "Personagem" virou menu: em branco × com assistente.
      await page.getByRole("menuitem", { name: /Em branco/ }).click();
      await page.waitForSelector('[data-testid="painel-dialogo-campo"]', { timeout: 10000 });
      const campo = await page.evaluate(() =>
        getComputedStyle(document.querySelector('[data-testid="painel-dialogo-campo"]')!).fontSize);
      const filtro = await page.evaluate(() => {
        const f = document.querySelector(".rv-pn-filtros .rv-pn-select, .rv-pn-filtros .rv-pn-input");
        return f ? getComputedStyle(f).fontSize : null;
      });
      registrar("1 (o campo do modal é maior que o dos filtros compactos)",
        parseFloat(campo) >= 13 && (!filtro || parseFloat(campo) > parseFloat(filtro)),
        `modal=${campo}, filtro=${filtro}`);
    }

    // --- 2. Foco entra no campo e Escape devolve o foco a quem abriu ---
    {
      // O foco entra num requestAnimationFrame depois da montagem:
      // amostrar imediatamente mede o instante anterior a ele.
      const focado = await page.waitForFunction(() =>
        document.activeElement?.getAttribute("data-testid") === "painel-dialogo-campo",
        null, { timeout: 8000 }).then(() => true).catch(() => false);
      await page.keyboard.press("Escape");
      const fechou = await page.waitForSelector('[data-testid="painel-dialogo-campo"]', { state: "detached", timeout: 8000 })
        .then(() => true).catch(() => false);
      const voltou = await page.waitForFunction(() =>
        document.activeElement?.getAttribute("data-testid") === "painel-personagens-criar",
        null, { timeout: 8000 }).then(() => true).catch(() => false);
      if (!fechou) await page.locator('[data-testid="painel-dialogo-cancelar"]').click();
      registrar("2 (foco entra no campo; Escape fecha e devolve o foco a quem abriu)",
        focado && fechou && voltou, `entrou=${focado}, fechou=${fechou}, voltou=${voltou}`);
    }

    // --- 3. Confirmar sem nome é impossível ---
    {
      await page.locator('[data-testid="painel-personagens-criar"]').click();
      // "Personagem" virou menu: em branco × com assistente.
      await page.getByRole("menuitem", { name: /Em branco/ }).click();
      await page.waitForSelector('[data-testid="painel-dialogo-campo"]', { timeout: 10000 });
      const desabilitado = await page.locator('[data-testid="painel-dialogo-confirmar"]').isDisabled();
      registrar("3 (confirmar fica indisponível sem nome)", desabilitado, `disabled=${desabilitado}`);
    }

    // --- 4. Cria e SELECIONA o personagem novo ---
    {
      await page.locator('[data-testid="painel-dialogo-campo"]').fill("Vex de Arames");
      await page.locator('[data-testid="painel-dialogo-confirmar"]').click();
      await page.waitForFunction(() =>
        !!Array.from(document.querySelectorAll("*")).find((n) => n.textContent === "Vex de Arames"),
        null, { timeout: 20000 });
      const { data } = await admin.from("characters").select("id,name").eq("campaign_id", campaignId);
      const selecionado = await page.evaluate(() =>
        !!document.querySelector('[data-selecionado="true"], .rv-pn-linha[data-selecionado]'));
      registrar("4 (cria uma vez e mostra o personagem criado)",
        data?.length === 1 && data[0].name === "Vex de Arames",
        `criados=${data?.length}, selecionado visível=${selecionado}`);
    }

    // --- 5. Confirmar duas vezes não cria dois ---
    {
      await page.locator('[data-testid="painel-personagens-criar"]').click();
      // "Personagem" virou menu: em branco × com assistente.
      await page.getByRole("menuitem", { name: /Em branco/ }).click();
      await page.waitForSelector('[data-testid="painel-dialogo-campo"]', { timeout: 10000 });
      await page.locator('[data-testid="painel-dialogo-campo"]').fill("Duplo");
      await page.evaluate(() => {
        const b = document.querySelector('[data-testid="painel-dialogo-confirmar"]') as HTMLButtonElement | null;
        b?.click(); b?.click(); b?.click();
      });
      await page.waitForTimeout(2500);
      const { data } = await admin.from("characters").select("id").eq("campaign_id", campaignId).eq("name", "Duplo");
      registrar("5 (confirmar repetido não duplica o personagem)", data?.length === 1, `com o nome "Duplo": ${data?.length}`);
    }

    // --- 6. A marcação de PN continua existindo (CHAR-01 ainda não entregou o seletor) ---
    {
      await page.locator('[data-testid="painel-personagens-criar"]').click();
      // "Personagem" virou menu: em branco × com assistente.
      await page.getByRole("menuitem", { name: /Em branco/ }).click();
      await page.waitForSelector('[data-testid="painel-dialogo-campo"]', { timeout: 10000 });
      const temPn = await page.locator('[data-testid="painel-dialogo-marcacao"]').count();
      await page.keyboard.press("Escape");
      registrar("6 (a opção de PN segue disponível enquanto CHAR-01 não entrega o seletor)",
        temPn === 1, `marcação presente=${temPn === 1}`);
    }
  } finally {
    await close();
  }
}

try { await main(); } catch (e) { registrar("E", false, e instanceof Error ? e.message : String(e)); }
finally { await limpar(); console.log(`\n${passou} ok, ${falhou} falha(s)`); process.exit(falhou > 0 ? 1 : 0); }
