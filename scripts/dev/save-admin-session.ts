/**
 * Captura de sessão para browser checks autenticados repetíveis, sem
 * pedir senha ao agente a cada verificação.
 *
 * O QUE FAZ: abre uma janela real do Chromium local, apontada para o
 * /login do app rodando em localhost. A PESSOA (nunca o agente) faz
 * login manualmente ali, normalmente, com a própria senha. Depois de
 * detectar a sessão, salva só o `storageState` (cookies) do Playwright
 * em `.auth/admin-session.json` — um arquivo local, ignorado pelo Git
 * (ver .gitignore), fora do repositório em espírito.
 *
 * O QUE NÃO FAZ: não lê, não recebe e não imprime email, senha, cookie
 * ou token em momento nenhum — só verifica SE um cookie de sessão
 * existe (boolean), nunca o valor dele. Não é bypass de autenticação:
 * é o mesmo cookie que qualquer navegador guardaria depois de um login
 * real pelo fluxo real de /login (src/app/LoginForm.tsx →
 * src/lib/auth/actions.ts). Não altera RLS, não usa service role, só
 * funciona contra http://localhost:3000.
 *
 * Uso:
 *   npx tsx scripts/dev/save-admin-session.ts
 *
 * (Precisa do `npm run dev` rodando em outro terminal, e do Chromium do
 * Playwright instalado uma vez: `npx playwright install chromium`.)
 */

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline/promises";
import { chromium } from "playwright";
import { BASE_URL, LOGIN_URL, SESSION_FILE } from "./authSession";

const AUTH_COOKIE_NAME = "ruptura_auth";

async function main(): Promise<void> {
  console.log("=== Captura de sessão local para browser checks autenticados ===\n");
  console.log(`Abrindo ${LOGIN_URL} em uma janela do Chromium local...`);
  console.log("Esta janela é local e temporária — nada do que você digitar nela passa por este agente.\n");

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(LOGIN_URL);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let logado = false;

  try {
    while (!logado) {
      await rl.question("Faça login manualmente na janela aberta. Quando terminar, volte aqui e pressione Enter... ");
      const cookies = await context.cookies(BASE_URL);
      logado = cookies.some((c) => c.name === AUTH_COOKIE_NAME);
      if (!logado) {
        console.log(`\nAinda não detectei a sessão (cookie "${AUTH_COOKIE_NAME}" ausente). Confirme que o login terminou (sem erro na tela) e tente de novo.\n`);
      }
    }
  } finally {
    rl.close();
  }

  mkdirSync(dirname(SESSION_FILE), { recursive: true });
  await context.storageState({ path: SESSION_FILE });
  await browser.close();

  console.log(`\nOK — sessão detectada e salva em ${SESSION_FILE}.`);
  console.log("Esse arquivo é local, ignorado pelo Git, e não foi impresso nenhum cookie/token/segredo neste terminal.");
  console.log("Browser checks autenticados agora podem carregar essa sessão sem novo login, até ela expirar.");
}

main().catch((err) => {
  console.error("save-admin-session FALHOU:", err instanceof Error ? err.message : err);
  process.exit(1);
});
