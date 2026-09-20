/**
 * Casca da área autenticada — os detalhes que só aparecem renderizando
 * (AUTH-01/AUTH-02).
 *
 * O sublinhado da marca é o exemplo do porquê: `.ra2-brand` é um `<a>`,
 * e sem reset o navegador desenha o sublinhado e a tinta de link. Os
 * filhos sobrescreviam a COR DO TEXTO e não a do sublinhado — então a
 * linha ficava roxa sob texto ciano, e nenhuma leitura do CSS acusaria,
 * porque a regra que faltava não estava escrita em lugar nenhum.
 *
 * Uso: npx tsx scripts/dev/check-casca-autenticada.ts
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
const criados: string[] = [];

async function main() {
  const email = `casca-${Date.now()}@ruptura.dev`, senha = randomUUID();
  const { data: u, error } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true, user_metadata: { display_name: "Casca" } });
  if (error) throw new Error(error.message);
  criados.push(u.user.id);

  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data: sess } = await anon.auth.signInWithPassword({ email, password: senha });
  const b = await chromium.launch({ headless: true });
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addCookies([{ name: "ruptura_auth", value: JSON.stringify({ access_token: sess!.session!.access_token, refresh_token: sess!.session!.refresh_token }), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax", expires: Math.floor(Date.now()/1000)+86400 }]);
    const page: Page = await ctx.newPage();
    await page.goto(`${BASE_URL}/mesas`, { waitUntil: "networkidle" });
    await page.waitForSelector(".ra2-brand", { timeout: 20000 });

    // --- 1. A marca não usa a tinta nem o sublinhado de link ---
    {
      const m = await page.evaluate(() => {
        const c = getComputedStyle(document.querySelector(".ra2-brand")!);
        return { deco: c.textDecorationLine, cor: c.color };
      });
      registrar("1 (a marca não traz sublinhado nem tinta de link)",
        m.deco === "none" && m.cor !== "rgb(158, 158, 255)", JSON.stringify(m));
    }

    // --- 2. Nenhum descendente da marca ficou sublinhado ---
    {
      const sublinhados = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".ra2-brand, .ra2-brand *"))
          .filter((e) => getComputedStyle(e).textDecorationLine.includes("underline"))
          .map((e) => (e.className || "").toString() || e.tagName));
      registrar("2 (nem a versão nem o nome saem sublinhados)",
        sublinhados.length === 0, sublinhados.join(", ") || "nenhum");
    }

    // --- 3. Os cantos decorativos da viewport não existem mais ---
    {
      const n = await page.locator(".ra-vp-corner, .ra-vp-tl, .ra-vp-tr, .ra-vp-bl, .ra-vp-br").count();
      registrar("3 (os cantos decorativos da viewport foram removidos)", n === 0, `encontrados=${n}`);
    }

    // --- 4. A versão exibida é a do pacote ---
    {
      const texto = (await page.locator(".ra2-brand-sub").textContent())?.trim() ?? "";
      const pkg = JSON.parse(await (await import("node:fs")).promises.readFile("package.json", "utf8")).version;
      registrar("4 (a versão na tela é a do package.json)",
        texto.includes(pkg), `"${texto}" contém "${pkg}"`);
    }

    // --- 5. Contraste AA do subtítulo, que estava em 4.45 ---
    {
      // A conta fica em Node, não na página: funções nomeadas dentro de
      // `page.evaluate` fazem o esbuild do `tsx` injetar um helper
      // (`__name`) que não existe no navegador.
      const cores = await page.evaluate(() => {
        const el = document.querySelector(".ra2-brand-sub") as HTMLElement;
        let no: HTMLElement | null = el, fundo = "rgb(7, 9, 15)";
        while (no) {
          const c = getComputedStyle(no).backgroundColor;
          const partes = c.match(/[\d.]+/g);
          if (partes && (partes.length < 4 || Number(partes[3]) === 1) && c !== "rgba(0, 0, 0, 0)") { fundo = c; break; }
          no = no.parentElement;
        }
        return { frente: getComputedStyle(el).color, fundo };
      });
      const nums = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number);
      const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const [fr, fg2, fb, fa = 1] = nums(cores.frente);
      const [br, bg2, bb] = nums(cores.fundo);
      const mix = [fr * fa + br * (1 - fa), fg2 * fa + bg2 * (1 - fa), fb * fa + bb * (1 - fa)] as const;
      const l1 = lum(mix[0], mix[1], mix[2]), l2 = lum(br, bg2, bb);
      const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
      const razao = Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
      registrar("5 (contraste do subtítulo atinge o 4.5 que AA pede)", razao >= 4.5,
        `${razao}:1 (${cores.frente} sobre ${cores.fundo})`);
    }
  } finally {
    await b.close();
  }
}

try { await main(); } catch (e) { registrar("E", false, e instanceof Error ? e.message : String(e)); }
finally {
  for (const id of criados) await admin.auth.admin.deleteUser(id);
  console.log(`\n${passou} ok, ${falhou} falha(s)`);
  process.exit(falhou > 0 ? 1 : 0);
}
