/**
 * Sessão de Auth dev do narrador, guardada num cookie httpOnly.
 *
 * Server-only (usa next/headers). NÃO é "use server" — `getCurrentUser`
 * é um util de leitura chamado por Server Components (RSC) para mostrar
 * quem está logado; as MUTAÇÕES (login/logout, que escrevem/limpam o
 * cookie) ficam em actions.ts ("use server").
 *
 * Limitação dev documentada: a leitura usa `getUser(access_token)`, que
 * valida o JWT direto no Supabase sem rotacionar refresh token. Quando o
 * access token expira (~1h por padrão), a sessão é considerada
 * encerrada até novo login — não há refresh automático server-side nesta
 * etapa (isso é o que o @supabase/ssr automatiza; ver pendência no
 * relatório). Suficiente para a base de auth dev deste checkpoint.
 */

import { cookies } from "next/headers";
import { createAnonAuthClient } from "./anonClient";

const AUTH_COOKIE = "ruptura_auth";

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export interface AuthUser {
  id: string;
  email: string | null;
  /**
   * Nome de exibição (aditivo §3.1/§4.3 "Conta e preferências") — vive
   * em `user_metadata` do próprio Supabase Auth (`display_name`), sem
   * tabela nova nem migration: é a conta autenticando a si mesma via
   * `auth.updateUser`, nunca uma escrita administrativa. Null quando a
   * conta ainda não definiu um.
   */
  displayName: string | null;
}

export async function readAuthTokens(): Promise<AuthTokens | null> {
  const store = await cookies();
  const raw = store.get(AUTH_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthTokens;
    if (typeof parsed.access_token === "string" && typeof parsed.refresh_token === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function writeAuthTokens(tokens: AuthTokens): Promise<void> {
  const store = await cookies();
  store.set(AUTH_COOKIE, JSON.stringify(tokens), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearAuthTokens(): Promise<void> {
  const store = await cookies();
  store.delete(AUTH_COOKIE);
}

/** Usuário logado atual (ou null). Valida o access token no Supabase. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const tokens = await readAuthTokens();
  if (!tokens?.access_token) return null;
  try {
    const supabase = createAnonAuthClient();
    const { data, error } = await supabase.auth.getUser(tokens.access_token);
    if (error || !data.user) return null;
    const displayName = data.user.user_metadata?.display_name;
    return {
      id: data.user.id,
      email: data.user.email ?? null,
      displayName: typeof displayName === "string" && displayName.trim() ? displayName.trim() : null,
    };
  } catch {
    return null;
  }
}
