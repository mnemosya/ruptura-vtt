/**
 * Browser check da RENOVAÇÃO SILENCIOSA do Realtime — os caminhos de
 * borda que o check da Fase 3 não cobre porque exigem manipular a
 * sessão ou abrir duas abas.
 *
 * Contexto (auditoria da Fase 3): o WebSocket de Realtime é autenticado
 * com o access token da conta (`setBrowserSupabaseRealtimeAuth`), que
 * expira em ~1h. Sem renovação, uma sessão de RPG longa fica muda; com
 * renovação mal classificada, uma conta perfeitamente válida é chutada
 * pra tela de login.
 *
 * Cobre:
 *   1. CORRIDA ENTRE ABAS: duas abas da MESMA sessão (mesmo cookie jar)
 *      renovando ao mesmo tempo. Nenhuma pode acabar em `precisa_login`
 *      — a perdedora apresenta um refresh token que a vencedora acabou
 *      de rotacionar, mas a sessão continua viva. A classificação
 *      anterior tratava qualquer HTTP 400 como "refresh token inválido"
 *      e mandava pro login uma conta autenticada.
 *   2. REFRESH TOKEN GENUINAMENTE MORTO: access token válido (a página
 *      carrega via SSR) + refresh token inválido. Precisa chegar em
 *      `precisa_login`, com link "Entrar" e SEM botão de retry —
 *      insistir não resolveria e só queimaria requisição.
 *   3. SESSÃO SALVA REGRAVADA COM SUCESSO: o critério 1 renova de
 *      verdade contra a sessão salva de verdade, rotacionando o refresh
 *      token — sem regravar `.auth/admin-session.json`, a PRÓXIMA
 *      execução falharia com um token já consumido. Reprova o check se
 *      a regravação falhar, em vez de só avisar no console.
 *
 * Os dois casos juntos são o que separa "não incomodar quem está bem" de
 * "avisar de verdade quem precisa agir": medido contra o Supabase real,
 * o código de erro NÃO distingue os dois (token rotacionado fora da
 * janela de tolerância e token morto respondem igual), então a
 * desambiguação é comportamental — reler o cookie e tentar de novo.
 *
 * Uso: npx tsx scripts/dev/check-realtime-auth-renovacao.ts
 * (precisa de `npm run dev` e de sessão salva —
 * npx tsx scripts/dev/refresh-admin-session.ts se necessário)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { chromium, type BrowserContext, type Page } from "playwright";
import { BASE_URL, SESSION_FILE, requireSessaoSalva } from "./authSession";

let passou = 0;
let falhou = 0;

function registrar(criterio: string, ok: boolean, detalhe: string) {
  if (ok) {
    passou++;
    console.log(`ok - ${criterio}: ${detalhe}`);
  } else {
    falhou++;
    console.error(`FALHA - ${criterio}: ${detalhe}`);
  }
}

/**
 * Regrava `.auth/admin-session.json` com o cookie `ruptura_auth` ATUAL
 * do contexto — necessário depois de qualquer critério que exercite
 * renovação de verdade contra a sessão salva de verdade, já que o
 * Supabase rotaciona o refresh token a cada uso (mesma necessidade e
 * mesmo padrão de `check-campanha-painel-turndock-fase3.ts`).
 */
async function persistirCookiesRotacionados(context: BrowserContext): Promise<{ ok: boolean; detalhe: string }> {
  try {
    const estadoAtual = await context.storageState();
    const novoCookie = estadoAtual.cookies.find((c) => c.name === "ruptura_auth");
    if (!novoCookie) {
      return { ok: false, detalhe: "cookie ruptura_auth ausente no contexto após a renovação — sessão salva NÃO atualizada" };
    }
    const salvo = JSON.parse(readFileSync(SESSION_FILE, "utf8")) as { cookies: { name: string }[]; origins: unknown[] };
    salvo.cookies = salvo.cookies.map((c) => (c.name === "ruptura_auth" ? novoCookie : c));
    writeFileSync(SESSION_FILE, JSON.stringify(salvo, null, 2));
    return { ok: true, detalhe: "sessão salva atualizada com o refresh token rotacionado pela renovação" };
  } catch (e) {
    return { ok: false, detalhe: `falha ao regravar a sessão salva: ${e instanceof Error ? e.message : e}` };
  }
}

async function descobrirCampanha(page: Page): Promise<string | null> {
  await page.goto(`${BASE_URL}/mesas`, { waitUntil: "networkidle" });
  const hrefs = await page.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  return (
    hrefs
      .map((h) => h.match(/^\/mesas\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)?.[1])
      .find(Boolean) ?? null
  );
}

async function main() {
  requireSessaoSalva();
  const browser = await chromium.launch({ headless: true });

  try {
    // --- 1. Corrida entre abas não pode exigir login ---
    {
      // MESMO contexto = mesmo cookie jar; é o cenário real de duas abas
      // da mesma pessoa, não dois logins independentes.
      const context = await browser.newContext({ storageState: SESSION_FILE });
      const abaA = await context.newPage();
      const campaignId = await descobrirCampanha(abaA);

      if (!campaignId) {
        registrar("1 (corrida entre abas não exige login)", false, "nenhuma campanha encontrada em /mesas para esta conta");
      } else {
        const abaB = await context.newPage();
        for (const p of [abaA, abaB]) {
          await p.clock.install({ time: Date.now() });
          await p.goto(`${BASE_URL}/mesas/${campaignId}/personagens`, { waitUntil: "networkidle" });
        }
        await abaA.waitForTimeout(1200);

        // As duas ultrapassam a validade do token praticamente juntas.
        await Promise.all([abaA.clock.fastForward("01:00:00"), abaB.clock.fastForward("01:00:00")]);
        await abaA.waitForTimeout(3000);

        const leituras = await Promise.all(
          [abaA, abaB].map(async (p) => ({
            alerta: (await p.locator('[data-testid="campshell-sync-alerta"]').count()) > 0,
            pedeLogin: (await p.locator('[data-testid="campshell-sync-alerta-login"]').count()) > 0,
          })),
        );
        const nenhumPedeLogin = leituras.every((l) => !l.pedeLogin);
        const nenhumAlerta = leituras.every((l) => !l.alerta);

        registrar(
          "1 (corrida entre abas não exige login)",
          nenhumPedeLogin && nenhumAlerta,
          `aba A: alerta=${leituras[0].alerta} exigeLogin=${leituras[0].pedeLogin} | aba B: alerta=${leituras[1].alerta} exigeLogin=${leituras[1].pedeLogin} (esperado tudo false)`,
        );

        // Este critério exercita renovação de VERDADE contra a sessão
        // salva de verdade (`storageState: SESSION_FILE`, não uma cópia
        // em memória como o critério 2) — e o Supabase rotaciona o
        // refresh token a cada uso. Sem regravar o arquivo, ele ficaria
        // apontando pra um token já consumido, e a PRÓXIMA execução
        // (deste script ou de qualquer outro) falharia parecendo sessão
        // expirada, quando na verdade só está desatualizada. Registrado
        // como critério de verdade — uma falha aqui inutiliza sessões
        // futuras em silêncio se só virar aviso no console.
        const persistiu = await persistirCookiesRotacionados(context);
        registrar("3 (sessão salva regravada com o cookie rotacionado)", persistiu.ok, persistiu.detalhe);
      }
      await context.close();
    }

    // --- 2. Refresh token morto chega em `precisa_login`, sem retry inútil ---
    {
      const estado = JSON.parse(readFileSync(SESSION_FILE, "utf8")) as {
        cookies: { name: string; value: string; [k: string]: unknown }[];
        origins: unknown[];
      };
      const cookie = estado.cookies.find((c) => c.name === "ruptura_auth");
      if (!cookie) {
        registrar("2 (refresh token morto pede login)", false, "cookie ruptura_auth ausente na sessão salva");
      } else {
        const tokens = JSON.parse(decodeURIComponent(cookie.value)) as { access_token: string; refresh_token: string };
        // Access token VÁLIDO (a casca precisa renderizar no servidor) +
        // refresh token inválido: o estado exato de uma sessão revogada.
        // A sessão salva NÃO é alterada — só este objeto em memória.
        cookie.value = JSON.stringify({ access_token: tokens.access_token, refresh_token: "refresh-token-morto-de-proposito" });

        const context = await browser.newContext({ storageState: estado as never });
        const page = await context.newPage();
        const campaignId = await descobrirCampanha(page);

        if (!campaignId) {
          registrar("2 (refresh token morto pede login)", false, "nenhuma campanha encontrada em /mesas para esta conta");
        } else {
          await page.clock.install({ time: Date.now() });
          await page.goto(`${BASE_URL}/mesas/${campaignId}/personagens`, { waitUntil: "networkidle" });
          await page.waitForTimeout(1200);
          await page.clock.fastForward("01:00:00");
          await page.waitForTimeout(3000);

          const alerta = page.locator('[data-testid="campshell-sync-alerta"]');
          const visivel = await alerta.isVisible().catch(() => false);
          const estadoAlerta = visivel ? await alerta.getAttribute("data-estado") : null;
          const temLink = (await page.locator('[data-testid="campshell-sync-alerta-login"]').count()) > 0;
          const temRetry = (await page.locator('[data-testid="campshell-sync-alerta-retry"]').count()) > 0;

          registrar(
            "2 (refresh token morto pede login, sem retry inútil)",
            visivel && estadoAlerta === "precisa_login" && temLink && !temRetry,
            `alerta visível=${visivel}, data-estado="${estadoAlerta}", link "Entrar"=${temLink}, botão retry=${temRetry} (esperado: precisa_login, link sim, retry não)`,
          );
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main()
  .catch((err) => {
    console.error("Erro fatal no check:", err instanceof Error ? err.message : err);
    falhou++;
  })
  .finally(() => {
    console.log(`\n${passou} critérios aprovados, ${falhou} reprovados.`);
    if (falhou > 0) process.exitCode = 1;
  });
