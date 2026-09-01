/**
 * Prova que `refreshAccessToken()` NÃO gira o refresh token duas vezes
 * quando `src/middleware.ts` já acabou de renová-lo na MESMA
 * requisição.
 *
 * Achado de auditoria (real, não hipotético): `refreshAccessToken` é
 * uma Server Action — uma chamada dela passa pelo MESMO middleware que
 * qualquer rota. `CampaignRealtimeProvider` agenda sua própria chamada
 * com a MESMA margem de ~60s antes do access token vencer que o
 * middleware usa pra decidir renovar. As duas coisas disparavam pro
 * mesmo instante: o middleware renova primeiro (roda antes da action),
 * e sem uma checagem de "já foi renovado agora mesmo" a action girava
 * o refresh token de NOVO em cima de um token que acabou de ganhar
 * ~1h de validade — duas rotações por renovação, e dois `Set-Cookie`
 * na mesma resposta arriscando o navegador guardar o par ERRADO.
 *
 * A corrida em si é servidor↔servidor (esta função↔Supabase),
 * invisível a qualquer inspeção de rede do lado do navegador — por
 * isso a prova usa `/dev/auth/double-refresh-test`, uma rota DEV-only
 * que chama `refreshAccessToken()` duas vezes seguidas na MESMA
 * requisição e devolve os dois resultados. Preparo: cookie com access
 * token deliberadamente inválido (força o middleware a renovar ao
 * processar ESTA MESMA requisição) + refresh token real.
 *
 * Critérios:
 *   1. As duas chamadas devolvem o MESMO access token — se a segunda
 *      tivesse rotacionado de novo, seriam diferentes.
 *   2. Esse access token é DIFERENTE do que estava no cookie antes —
 *      prova que uma renovação de verdade aconteceu (não é um
 *      caminho morto que nunca chama o Supabase).
 *
 * Uso: npx tsx scripts/dev/check-refresh-token-dedup.ts
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

interface ResultadoRenovacao {
  ok: boolean;
  accessToken?: string;
  expiresAtMs?: number;
  needsLogin?: boolean;
  error?: string;
}

async function main() {
  requireSessaoSalva();
  const browser = await chromium.launch({ headless: true });

  try {
    const tokensReais = lerTokensSalvos();
    const context = await browser.newContext();
    const tokenOriginal = "cabecalho.invalido.vencido";
    await context.addCookies([{
      name: "ruptura_auth",
      value: JSON.stringify({ access_token: tokenOriginal, refresh_token: tokensReais.refresh_token }),
      domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    }]);

    // Uma ÚNICA requisição: o middleware renova ao processá-la (o
    // access token do cookie é inválido), e DENTRO dela a rota chama
    // `refreshAccessToken()` duas vezes.
    const resposta = await context.request.get(`${BASE_URL}/dev/auth/double-refresh-test`);
    if (!resposta.ok()) {
      registrar("0 (requisição de teste respondeu ok)", false, `status ${resposta.status()}`);
      await context.close();
      await browser.close();
      console.log(`\n${passou} ok, ${falhou} falha(s).`);
      process.exit(1);
    }
    const corpo = (await resposta.json()) as { primeira: ResultadoRenovacao; segunda: ResultadoRenovacao };

    registrar(
      "1 (as duas chamadas na mesma requisição devolvem o MESMO access token)",
      corpo.primeira.ok && corpo.segunda.ok && !!corpo.primeira.accessToken && corpo.primeira.accessToken === corpo.segunda.accessToken,
      `primeira=${corpo.primeira.accessToken?.slice(-16)}, segunda=${corpo.segunda.accessToken?.slice(-16)}`,
    );
    registrar(
      "2 (o token devolvido é novo de verdade — renovação real aconteceu)",
      !!corpo.primeira.accessToken && corpo.primeira.accessToken !== tokenOriginal,
      `mudou=${corpo.primeira.accessToken !== tokenOriginal}`,
    );

    const persistencia = await persistirCookiesRotacionados(context);
    registrar("3 (sessão salva regravada com o token rotacionado por este teste)", persistencia.ok, persistencia.detalhe);

    await context.close();
    await browser.close();
  } catch (e) {
    await browser.close().catch(() => {});
    throw e;
  }

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  if (falhou > 0) process.exit(1);
}

main().catch((e) => { console.error("Erro fatal:", e); process.exit(1); });
