/**
 * Sessão local do Playwright para browser checks autenticados, sem
 * pedir senha ao agente a cada verificação.
 *
 * Nada aqui contorna autenticação: o arquivo salvo em `.auth/` é
 * exatamente o `storageState` (cookies) que o Playwright captura DEPOIS
 * de um login manual real feito pela pessoa dona da conta em
 * `scripts/dev/save-admin-session.ts` — o mesmo fluxo de `/login` do
 * app, sem atalho, sem RLS alterada, sem service role.
 *
 * Só faz sentido contra um servidor local (`http://localhost:3000`) —
 * `BASE_URL` não é configurável para outro host de propósito.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const BASE_URL = "http://localhost:3000";

/** Fora do repositório em espírito (gitignored) — nunca commitar. */
export const SESSION_FILE = join(__dirname, "..", "..", ".auth", "admin-session.json");

export const LOGIN_URL = `${BASE_URL}/login`;

export class SessaoAusenteOuExpiradaError extends Error {
  constructor(motivo: string) {
    super(
      `${motivo}\n\nRepita o login manual:\n  npx tsx scripts/dev/save-admin-session.ts\n\n` +
        "Isso abre um navegador local — faça login com sua conta normalmente e volte ao terminal.",
    );
    this.name = "SessaoAusenteOuExpiradaError";
  }
}

export function sessaoSalvaExiste(): boolean {
  return existsSync(SESSION_FILE);
}

export function requireSessaoSalva(): void {
  if (!sessaoSalvaExiste()) {
    throw new SessaoAusenteOuExpiradaError("Nenhuma sessão salva encontrada em .auth/admin-session.json.");
  }
}

/**
 * Abre um contexto Playwright HEADLESS com a sessão salva já carregada
 * (`storageState`) e roda `fn(page)`. Fecha o browser sempre, mesmo em
 * erro. Único ponto que sabe montar/derrubar o browser — scripts de
 * verificação individuais só descrevem o que checar.
 */
export async function withAuthenticatedPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  requireSessaoSalva();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ storageState: SESSION_FILE });
    const page = await context.newPage();
    return await fn(page);
  } finally {
    await browser.close();
  }
}

/**
 * Confirma que a sessão carregada ainda dá acesso administrativo de
 * verdade — navega para uma rota real de /admin e olha o conteúdo
 * renderizado (o mesmo gate de `src/app/admin/layout.tsx` decide isso
 * no servidor; aqui só verificamos o resultado). Lança
 * `SessaoAusenteOuExpiradaError` se a sessão expirou ou nunca teve
 * acesso administrativo — nunca finge sucesso.
 */
export async function assertAdminSessionValid(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/admin/biblioteca`, { waitUntil: "domcontentloaded" });
  const texto = await page.textContent("body");
  if (texto?.includes("Esta área exige login") || texto?.includes("não tem acesso administrativo")) {
    throw new SessaoAusenteOuExpiradaError("A sessão salva expirou ou a conta não tem mais acesso administrativo.");
  }
}
