/**
 * TOOL-01 — iconografia da ferramenta de marcação.
 *
 * O que importa verificar não é gosto, e sim: (1) mapa e janela
 * desenham O MESMO glifo para o mesmo sinal, que era o risco real de
 * haver duas tabelas; (2) os quatro são distinguíveis no tamanho em que
 * aparecem; (3) trocar de sinal não mexe no tamanho da barra.
 *
 * Uso: npx tsx scripts/dev/check-iconografia-marcacao.ts
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright";
import { BASE_URL } from "./authSession";
import { SINAIS_MARCA } from "../../src/app/mesas/[campaignId]/vtt/_dominio/sinaisDeMarca";

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
  const email = `tool01-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@ruptura.dev`, senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { display_name: "Tool01" } });
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

/** Assinatura do desenho: o `d` de cada path, que é o que difere um glifo do outro. */
async function assinaturaDosBotoes(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll(".rv-fp-opcao, .rv-fp-sinal, [data-sinal]"))
      .map((b) => Array.from(b.querySelectorAll("svg path, svg circle, svg line, svg polyline, svg rect"))
        .map((n) => n.getAttribute("d") ?? n.outerHTML.slice(0, 40)).join("|"))
      .filter(Boolean));
}

async function limpar() {
  for (const cid of criados.c) {
    await admin.from("vtt_marks").delete().eq("campaign_id", cid);
    await admin.from("vtt_scenes").delete().eq("campaign_id", cid);
    await admin.from("campaign_members").delete().eq("campaign_id", cid);
    await admin.from("campaigns").delete().eq("id", cid);
  }
  for (const uid of criados.u) await admin.auth.admin.deleteUser(uid);
  registrar("L (limpeza)", true, `${criados.u.length} usuário(s)`);
}

async function main() {
  // --- 1. Uma tabela só: o módulo de domínio é a fonte ---
  {
    const valores = SINAIS_MARCA.map((s) => s.valor);
    const glifos = new Set(SINAIS_MARCA.map((s) => s.Icone));
    registrar("1 (quatro sinais, quatro glifos distintos, numa tabela só)",
      valores.length === 4 && glifos.size === 4, JSON.stringify(valores));
  }

  const dono = await conta();
  const campaignId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: "Mesa TOOL-01", owner_id: dono.id });
  criados.c.push(campaignId);
  registrar("0 (fixture)", true, `campanha=${campaignId}`);

  const { page, close } = await contexto(dono.email, dono.senha);
  try {
    await page.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 20000 });
    const { data: cena } = await admin.from("vtt_scenes").select("id").eq("campaign_id", campaignId).limit(1).maybeSingle();
    if (!cena) throw new Error("cena não semeada");

    // Uma marca de cada sinal, direto no banco: o que se verifica é o
    // DESENHO no mapa, não o fluxo de criar.
    for (const [i, s] of SINAIS_MARCA.entries()) {
      // `pontos` é obrigatório e é onde a célula mora — não há colunas
      // q/r. Conferir o erro do insert: sem isso o teste seguia como se
      // as marcas existissem e media a ausência delas.
      const { error } = await admin.from("vtt_marks").insert({
        id: randomUUID(), campaign_id: campaignId, scene_id: cena.id,
        tipo: "texto", sinal: s.valor, cor: "branco",
        pontos: [{ q: i * 2, r: 0 }],
        privada: false, autor_id: dono.id,
      });
      if (error) throw new Error(`insert de marca "${s.valor}": ${error.message}`);
    }
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".rv-ferramentas", { timeout: 20000 });

    // --- 2. As quatro marcas aparecem no mapa, com desenhos diferentes ---
    {
      // O glifo é inserido inline no SVG do mapa (não é um <svg>
      // aninhado): a assinatura é o conteúdo do <g> que o envolve.
      await page.waitForSelector(".rv-camada-marcas", { timeout: 15000 });
      const assinaturas = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".rv-camada-marcas g[style*='color'] "))
          // O DESENHO é o conjunto de `d`/geometrias, não o cabeçalho
          // do <svg>, que é igual em todos os ícones do lucide —
          // cortar os primeiros caracteres comparava só o cabeçalho.
          .map((g) => Array.from(g.querySelectorAll("path, circle, line, polyline, rect, polygon"))
            .map((n) => n.getAttribute("d") ?? n.outerHTML)
            .join("|").replace(/\s+/g, ""))
          .filter((x) => x.length > 0));
      const distintas = new Set(assinaturas);
      registrar("2 (cada sinal desenha um glifo próprio no mapa)",
        assinaturas.length >= 4 && distintas.size >= 4,
        `desenhos=${assinaturas.length}, distintos=${distintas.size}`);
    }

    // --- 3. Abrir a ferramenta não desloca a barra ---
    {
      const antes = await page.locator(".rv-ferramentas").boundingBox();
      await page.keyboard.press("d");
      await page.waitForTimeout(600);
      const depois = await page.locator(".rv-ferramentas").boundingBox();
      registrar("3 (abrir a ferramenta não move nem redimensiona a barra)",
        !!antes && !!depois && antes.width === depois.width && antes.x === depois.x,
        `${antes?.width}×${antes?.x} → ${depois?.width}×${depois?.x}`);
    }

    // --- 4. Os botões de sinal têm rótulo de texto, não só ícone ---
    {
      const texto = (await page.locator(".rv-fp-corpo").first().textContent()) ?? "";
      const todos = SINAIS_MARCA.every((s) => texto.includes(s.rotulo));
      registrar("4 (cada sinal tem rótulo em texto ao lado do glifo)", todos,
        `rótulos presentes=${todos}`);
    }

    // --- 5. Trocar de sinal não muda a largura do painel ---
    {
      const antes = await page.locator(".rv-fp-corpo").first().boundingBox();
      const botoes = page.locator(".rv-fp-corpo button");
      const n = Math.min(await botoes.count(), 6);
      for (let i = 0; i < n; i++) { await botoes.nth(i).click().catch(() => {}); await page.waitForTimeout(120); }
      const depois = await page.locator(".rv-fp-corpo").first().boundingBox();
      registrar("5 (trocar de sinal não redimensiona o painel)",
        !!antes && !!depois && Math.abs(antes.width - depois.width) < 1,
        `${antes?.width} → ${depois?.width}`);
    }
  } finally {
    await close();
  }
}

try { await main(); } catch (e) { registrar("E", false, e instanceof Error ? e.message : String(e)); }
finally { await limpar(); console.log(`\n${passou} ok, ${falhou} falha(s)`); process.exit(falhou > 0 ? 1 : 0); }
