/**
 * Stub de `next/headers` para scripts fora de uma request.
 *
 * `cookies()` do Next 16 vive num AsyncLocalStorage de request e lança
 * fora dela. Este módulo devolve um cookie store mínimo, alimentado por
 * `RUPTURA_TEST_AUTH_COOKIE`.
 *
 * O que isto NÃO é: um bypass de autenticação. O valor da variável é o
 * MESMO JSON de tokens que o `/login` real grava no cookie, obtido de um
 * `signInWithPassword` de verdade. A sessão, o JWT e a RLS são reais —
 * só o transporte (cookie de request → variável de ambiente) é que é
 * simulado, exatamente como `authSession.ts` faz ao injetar o cookie
 * num navegador do Playwright.
 */
const NOME = "ruptura_auth";

export async function cookies() {
  const raw = process.env.RUPTURA_TEST_AUTH_COOKIE ?? "";
  return {
    get: (nome) => (nome === NOME && raw ? { name: NOME, value: raw } : undefined),
    getAll: () => (raw ? [{ name: NOME, value: raw }] : []),
    has: (nome) => nome === NOME && Boolean(raw),
    // Escrita é no-op: um script não tem resposta HTTP onde gravar.
    set: () => {},
    delete: () => {},
  };
}

export async function headers() {
  return new Headers();
}

export async function draftMode() {
  return { isEnabled: false, enable: () => {}, disable: () => {} };
}
