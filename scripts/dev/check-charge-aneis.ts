/**
 * VIS-02 — os anéis decorativos do botão de carga ("Solte para lançar")
 * deixam de ser cortados pelo container.
 *
 * Eles crescem 1,5× (`rup-charge-ring`) e nasciam dentro do botão:
 * qualquer ancestral que rolasse recortava o que passava da borda.
 * Agora são desenhados no `body`, sobre a caixa medida do botão.
 *
 * ── O QUE ESTE CHECK NÃO COBRE ──────────────────────────────────────
 *
 * Não consegui disparar a CARGA de forma automatizada. O botão só
 * habilita com `rolarNaMesa` presente, que vem do provedor de dados da
 * mesa: em `/ficha` avulso ele nasce desabilitado, e o caminho até o
 * Console aberto de dentro da campanha tem etapas demais para ser
 * estável aqui.
 *
 * Então os anéis em si — que só existem enquanto se segura o botão —
 * ficam sem verificação automática. O que está coberto é o que dá:
 * o botão existe, e a camada decorativa não rouba o clique dele. O
 * recorte precisa de conferência a olho, segurando o botão.
 *
 * Uso: npx tsx scripts/dev/check-charge-aneis.ts
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

async function conta() {
  const email = `vis02-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@ruptura.dev`, senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { display_name: "Vis02" } });
  if (error) throw new Error(error.message);
  criados.u.push(data.user.id);
  return { id: data.user.id, email, senha };
}
async function contexto(email: string, senha: string) {
  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) throw new Error(error?.message ?? "sem sessão");
  const b = await chromium.launch({ headless: true });
  // Os anéis são desligados sob `prefers-reduced-motion: reduce` (são
  // reforço, não informação). O padrão do Chromium headless é reduzir,
  // então sem isto o teste mediria a ausência deliberada, não o defeito.
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: "no-preference" });
  await ctx.addCookies([{ name: "ruptura_auth", value: JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax", expires: Math.floor(Date.now()/1000)+86400 }]);
  return { page: await ctx.newPage(), close: () => b.close() };
}

async function limpar() {
  for (const id of criados.ch) await admin.from("characters").delete().eq("id", id);
  for (const cid of criados.c) {
    await admin.from("vtt_scenes").delete().eq("campaign_id", cid);
    await admin.from("campaign_members").delete().eq("campaign_id", cid);
    await admin.from("campaigns").delete().eq("id", cid);
  }
  for (const uid of criados.u) await admin.auth.admin.deleteUser(uid);
  registrar("L (limpeza)", true, `${criados.u.length} usuário(s)`);
}

/**
 * O botão de carga vive no painel de rolagem do CONSOLE (`RollButton`
 * em `_console/panels/PainelRolagem.tsx`), não na ferramenta de dados
 * do VTT. Chega-se a ele clicando numa perícia da ficha — mesmo caminho
 * de `check-console-rolagem-visual.ts`.
 */
async function abrirRolador(page: Page): Promise<boolean> {
  await page.waitForSelector('[data-testid="console-window"]', { timeout: 30000 });
  const pericia = page.locator('[data-testid="console-pericia-balistica"]');
  if (await pericia.count() > 0) await pericia.click();
  else await page.locator('[data-testid^="console-attr-"]').first().click();
  return await page.waitForSelector('[data-testid="charge-lancar"]', { timeout: 15000 })
    .then(() => true).catch(() => false);
}

async function main() {
  const dono = await conta();
  const campaignId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: "Mesa VIS-02", owner_id: dono.id });
  criados.c.push(campaignId);
  const characterId = randomUUID();
  await admin.from("characters").insert({
    id: characterId, name: "PJ do charge", status: "draft",
    // Payload com atributos e perícias de verdade: sem eles o botão de
    // rolagem nasce desabilitado, e o teste mediria a ausência da carga
    // em vez do recorte dos anéis.
    payload: personagemV12("PJ do charge", { atributos: { corpo: 3, mente: 2, animo: 3 },
      pericias: { balistica: 2, reflexos: 1 } }),
    campaign_id: campaignId, owner_id: dono.id,
  });
  criados.ch.push(characterId);
  registrar("0 (fixture)", true, `campanha=${campaignId}`);

  const { page, close } = await contexto(dono.email, dono.senha);
  try {
    await page.goto(`${BASE_URL}/ficha?campaignId=${campaignId}&characterId=${characterId}`, { waitUntil: "networkidle" });
    const abriu = await abrirRolador(page);
    registrar("1 (a ferramenta de rolagem abre e tem o botão de carga)", abriu, `botão presente=${abriu}`);
    if (!abriu) return;

    // --- 2. O botão continua sendo o alvo do clique (área não mudou) ---
    {
      const caixa = await page.locator('[data-testid="charge-lancar"]').boundingBox();
      const cx = caixa!.x + caixa!.width / 2, cy = caixa!.y + caixa!.height / 2;
      const alcanca = await page.evaluate(([x, y]) => {
        const topo = document.elementFromPoint(x as number, y as number);
        const btn = document.querySelector('[data-testid="charge-lancar"]');
        return !!btn && (btn === topo || btn.contains(topo));
      }, [cx, cy]);
      registrar("2 (a camada decorativa não rouba o clique do botão)", alcanca, `alcança=${alcanca}`);
    }
  } finally {
    await close();
  }
}

try { await main(); } catch (e) { registrar("E", false, e instanceof Error ? e.message : String(e)); }
finally { await limpar(); console.log(`\n${passou} ok, ${falhou} falha(s)`); process.exit(falhou > 0 ? 1 : 0); }
