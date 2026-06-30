"use server";

/**
 * Server Actions de Auth dev do narrador. Chamadas pelos formulários
 * client de /dev/login e /dev/auth/status. Usam a anon key server-side
 * (ver anonClient.ts) e guardam a sessão num cookie httpOnly
 * (ver session.ts) — nada de chave/token chega ao bundle do navegador.
 */

import { createAnonAuthClient } from "./anonClient";
import { writeAuthTokens, clearAuthTokens } from "./session";

export interface AuthActionResult {
  ok: boolean;
  error?: string;
  /** signUp: true quando o Supabase exige confirmação de email antes de logar. */
  needsConfirmation?: boolean;
}

/** Login por email/senha. Em sucesso, grava a sessão no cookie httpOnly. */
export async function signInWithPassword(email: string, password: string): Promise<AuthActionResult> {
  try {
    const supabase = createAnonAuthClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.session) {
      return { ok: false, error: error?.message ?? "Login não retornou sessão." };
    }
    await writeAuthTokens({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro desconhecido no login." };
  }
}

/**
 * Cadastro dev por email/senha. Se o projeto exigir confirmação de email
 * (default do Supabase), `data.session` vem null e retornamos
 * needsConfirmation — sem gravar cookie (o usuário precisa confirmar
 * antes de logar). Se a confirmação estiver desativada, já loga.
 */
export async function signUpDevNarrator(email: string, password: string): Promise<AuthActionResult> {
  try {
    const supabase = createAnonAuthClient();
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) return { ok: false, error: error.message };
    if (!data.session) return { ok: true, needsConfirmation: true };
    await writeAuthTokens({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro desconhecido no cadastro." };
  }
}

/** Logout — limpa o cookie de sessão (não revoga o token no Supabase nesta etapa dev). */
export async function signOut(): Promise<void> {
  await clearAuthTokens();
}
