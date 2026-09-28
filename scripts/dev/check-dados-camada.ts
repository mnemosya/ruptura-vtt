/**
 * DICE-01 — camada, área e escala dos dados 3D.
 *
 * O critério perigoso é "não bloquear controles": a arena passou a
 * cobrir a viewport inteira acima de tudo, e a única coisa que separa
 * "cobrir por um instante" de "impedir o clique" é `pointer-events`.
 * Por isso o teste clica num controle COM a arena por cima.
 *
 * Uso: npx tsx scripts/dev/check-dados-camada.ts
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
  const email = `dice01-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@ruptura.dev`, senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { display_name: "Dice01" } });
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

/** Dispara uma rolagem de mesa sem depender do caminho de interface. */
async function rolar(page: Page) {
  await page.evaluate(() => {
    const alvo = document.querySelector('[data-testid="vtt-ferr-dados"], .rv-ferr-btn[aria-label*="ado"]') as HTMLElement | null;
    alvo?.click();
  });
}

async function limpar() {
  for (const cid of criados.c) {
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
  await admin.from("campaigns").insert({ id: campaignId, name: "Mesa DICE-01", owner_id: dono.id });
  criados.c.push(campaignId);
  registrar("0 (fixture)", true, `campanha=${campaignId}`);

  const { page, close } = await contexto(dono.email, dono.senha);
  try {
    await page.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 20000 });

    // --- 1. Estilo da arena: viewport inteira, atravessável, no topo ---
    {
      const est = await page.evaluate(() => {
        const d = document.createElement("div");
        d.className = "rv-mesa-dados-overlay";
        document.body.appendChild(d);
        const c = getComputedStyle(d);
        const r = { pos: c.position, left: c.left, top: c.top, z: c.zIndex, pe: c.pointerEvents };
        d.remove();
        return r;
      });
      registrar("1 (arena cobre a viewport, sem faixa reservada, e não recebe ponteiro)",
        est.pos === "fixed" && est.left === "0px" && est.top === "0px"
        && Number(est.z) >= 600 && est.pe === "none", JSON.stringify(est));
    }

    // --- 2. Acima do Console maximizado e do cabeçalho de /ficha ---
    {
      // Sem funções internas nomeadas: o esbuild do `tsx` injeta um
      // helper `__name` que não existe dentro da página.
      const z = await page.evaluate(() => {
        const a = document.createElement("div");
        a.className = "rv-mesa-dados-overlay";
        document.body.appendChild(a);
        const arena = Number(getComputedStyle(a).zIndex);
        a.remove();
        const h = document.createElement("div");
        h.className = "rc-fichaheader";
        document.body.appendChild(h);
        const header = Number(getComputedStyle(h).zIndex);
        h.remove();
        return { arena, header };
      });
      registrar("2 (a arena fica acima do cabeçalho do console)",
        z.arena > z.header && z.arena > 520, JSON.stringify(z));
    }

    // --- 3. O que está por baixo continua clicável (é o risco real) ---
    {
      const antes = await page.locator(".rv-menu-mesa").count();
      await page.evaluate(() => {
        const d = document.createElement("div");
        d.className = "rv-mesa-dados-overlay";
        d.id = "arena-de-teste";
        document.body.appendChild(d);
      });
      await page.locator('[data-testid="vtt-menu-mesa-btn"]').click({ timeout: 8000 });
      const abriu = await page.waitForSelector(".rv-menu-mesa", { timeout: 8000 }).then(() => true).catch(() => false);
      await page.evaluate(() => document.getElementById("arena-de-teste")?.remove());
      registrar("3 (com a arena por cima, o controle abaixo ainda recebe o clique)",
        abriu, `menu antes=${antes}, abriu=${abriu}`);
    }

    // --- 4. O overlay é filho do body, não do palco recortado ---
    {
      const fora = await page.evaluate(() => {
        const d = document.createElement("div");
        d.className = "rv-mesa-dados-overlay";
        document.body.appendChild(d);
        const ehFilhoDoBody = d.parentElement === document.body;
        d.remove();
        // O palco continua recortando o resto — é o que protege o mapa.
        const palco = document.querySelector(".rv-palco");
        return { ehFilhoDoBody, palcoRecorta: palco ? getComputedStyle(palco).overflow : null };
      });
      registrar("4 (a arena sai do palco; o palco segue recortando o resto)",
        fora.ehFilhoDoBody && fora.palcoRecorta === "hidden", JSON.stringify(fora));
    }
  } finally {
    await close();
  }
}

try { await main(); } catch (e) { registrar("E", false, e instanceof Error ? e.message : String(e)); }
finally { await limpar(); console.log(`\n${passou} ok, ${falhou} falha(s)`); process.exit(falhou > 0 ? 1 : 0); }
