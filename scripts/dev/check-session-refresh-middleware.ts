/**
 * Prova que `src/middleware.ts` renova a sessão no SERVIDOR, antes de
 * qualquer página rodar — os dois cenários que uma versão anterior
 * desta correção (um timer client-side) não alcançava por construção:
 *
 *   1. Fechar o navegador e voltar depois de ~1h: o access token do
 *      cookie já está vencido na PRIMEIRA requisição, antes de
 *      qualquer JS do cliente ter chance de rodar. Simulado aqui sem
 *      esperar 1h de verdade: um contexto NOVO (equivalente a "abrir o
 *      navegador de novo"), cookie com access token deliberadamente
 *      inválido/vencido mas o REFRESH token real e válido — prova que
 *      o middleware renova a tempo da própria primeira carga.
 *   2. Layout raiz não remonta entre navegações client-side — deixou
 *      de ser relevante: o middleware roda no servidor, em TODA
 *      requisição (inclusive o fetch por trás de `router.push`), sem
 *      depender de nenhum componente cliente já ter montado.
 *
 * Também cobre os dois limites que o middleware precisa respeitar:
 *   3. Refresh token genuinamente morto não trava a requisição nem
 *      finge sessão válida — deixa passar sem tocar o cookie, e quem
 *      lê a sessão depois trata como deslogado normalmente (mesmo
 *      comportamento de sempre, só que agora nunca por um token que
 *      AINDA podia ter sido renovado).
 *   4. Token que ainda tem validade de sobra não é tocado — o
 *      middleware não gira o refresh token à toa em toda requisição.
 *
 * Uso: npx tsx scripts/dev/check-session-refresh-middleware.ts
 * (precisa de `npm run dev` e de sessão salva)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { chromium, type BrowserContext } from "playwright";
import { BASE_URL, SESSION_FILE, requireSessaoSalva } from "./authSession";

let passou = 0;
let falhou = 0;
function registrar(criterio: string, ok: boolean, detalhe: string) {
  if (ok) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

function lerTokensSalvos(): { access_token: string; refresh_token: string } {
  const salvo = JSON.parse(readFileSync(SESSION_FILE, "utf8")) as { cookies: { name: string; value: string }[] };
  const cookie = salvo.cookies.find((c) => c.name === "ruptura_auth");
  if (!cookie) throw new Error("cookie ruptura_auth ausente em .auth/admin-session.json");
  return JSON.parse(decodeURIComponent(cookie.value));
}

async function tokenAtualDoContexto(context: BrowserContext): Promise<string | null> {
  const cookies = await context.cookies();
  const c = cookies.find((x) => x.name === "ruptura_auth");
  if (!c) return null;
  return (JSON.parse(decodeURIComponent(c.value)).access_token as string) ?? null;
}

/** Regrava `.auth/admin-session.json` com o cookie ATUAL do contexto — necessário depois de exercitar renovação de verdade (o Supabase rotaciona o refresh token a cada uso). */
async function persistirCookiesRotacionados(context: BrowserContext): Promise<{ ok: boolean; detalhe: string }> {
  try {
    const estadoAtual = await context.storageState();
    const novoCookie = estadoAtual.cookies.find((c) => c.name === "ruptura_auth");
    if (!novoCookie) return { ok: false, detalhe: "cookie ruptura_auth ausente após a renovação" };
    const salvo = JSON.parse(readFileSync(SESSION_FILE, "utf8")) as { cookies: { name: string }[] };
    salvo.cookies = salvo.cookies.map((c) => (c.name === "ruptura_auth" ? novoCookie : c));
    writeFileSync(SESSION_FILE, JSON.stringify(salvo, null, 2));
    return { ok: true, detalhe: "sessão salva atualizada" };
  } catch (e) {
    return { ok: false, detalhe: `falha ao regravar: ${e instanceof Error ? e.message : e}` };
  }
}

async function main() {
  requireSessaoSalva();
  const browser = await chromium.launch({ headless: true });

  try {
    const tokensReais = lerTokensSalvos();

    // --- 1. Cold start: access token vencido/inválido, refresh token real ---
    {
      const context = await browser.newContext();
      await context.addCookies([{
        name: "ruptura_auth",
        value: JSON.stringify({ access_token: "cabecalho.invalido.vencido", refresh_token: tokensReais.refresh_token }),
        domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
        expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
      }]);
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/mesas`, { waitUntil: "networkidle" });

      const urlFinal = page.url();
      const naoRedirecionouPraLogin = !urlFinal.includes("/login");
      const tokenDepois = await tokenAtualDoContexto(context);
      const cookieFoiRenovado = !!tokenDepois && tokenDepois !== "cabecalho.invalido.vencido";

      registrar(
        "1 (cold start com access token vencido: middleware renova ANTES da primeira página)",
        naoRedirecionouPraLogin && cookieFoiRenovado,
        `url=${urlFinal}, cookie renovado=${cookieFoiRenovado}`,
      );

      const persistencia = await persistirCookiesRotacionados(context);
      registrar("1b (sessão salva regravada com o token rotacionado por este teste)", persistencia.ok, persistencia.detalhe);
      await context.close();
    }

    // --- 2. Refresh token morto: não trava, não finge sessão válida ---
    {
      const context = await browser.newContext();
      await context.addCookies([{
        name: "ruptura_auth",
        value: JSON.stringify({ access_token: "cabecalho.qualquer.coisa", refresh_token: "refresh-token-definitivamente-invalido" }),
        domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
        expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
      }]);
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/mesas`, { waitUntil: "networkidle" });
      registrar(
        "2 (refresh token morto: cai pro login normalmente, middleware não mascara)",
        page.url().includes("/login"),
        `url=${page.url()}`,
      );
      await context.close();
    }

    // --- 3. Token ainda válido por muito tempo: middleware não mexe ---
    {
      const context = await browser.newContext({ storageState: SESSION_FILE });
      const tokenAntes = await tokenAtualDoContexto(context);
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/mesas`, { waitUntil: "networkidle" });
      const tokenDepois = await tokenAtualDoContexto(context);
      registrar(
        "3 (token com validade de sobra não é rotacionado à toa)",
        tokenAntes === tokenDepois,
        `antes=${tokenAntes?.slice(-12)}, depois=${tokenDepois?.slice(-12)}`,
      );
      await context.close();
    }

    await browser.close();
  } catch (e) {
    await browser.close().catch(() => {});
    throw e;
  }

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  if (falhou > 0) process.exit(1);
}

main().catch((e) => { console.error("Erro fatal:", e); process.exit(1); });
