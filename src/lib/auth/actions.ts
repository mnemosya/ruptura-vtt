"use server";

/**
 * Server Actions de Auth dev do narrador. Chamadas pelos formulários
 * client de /dev/login e /dev/auth/status. Usam a anon key server-side
 * (ver anonClient.ts) e guardam a sessão num cookie httpOnly
 * (ver session.ts) — nada de chave/token chega ao bundle do navegador.
 */

import { headers } from "next/headers";
import { createAnonAuthClient } from "./anonClient";
import { getScopedTableClient } from "./scopedClient";
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
 * Cadastro de conta por email/senha — chamada tanto por /login (rota
 * real) quanto por /dev/login. Não é uma criação privilegiada: é
 * `auth.signUp` da própria anon key, o mesmo self-service signup que
 * qualquer cliente Supabase pode disparar. Não cria campanha, não
 * insere em `campaign_members`, não concede "Narrador" nem nenhum
 * outro papel — "Narrador"/"Jogador" são sempre derivados por
 * campanha (`campaigns.owner_id`), nunca por esta função.
 *
 * Se o projeto exigir confirmação de email (default do Supabase),
 * `data.session` vem null e retornamos needsConfirmation — sem gravar
 * cookie (a conta precisa confirmar antes de logar). Se a confirmação
 * estiver desativada, já loga.
 */
export async function signUpWithPassword(
  email: string,
  password: string,
  /**
   * Nome de exibição opcional, coletado no cadastro da tela de
   * autenticação. Vai direto para `user_metadata.display_name` — o mesmo
   * lugar que "Conta e preferências" edita depois (ver
   * updateDisplayName). Sem tabela nova, sem migration.
   */
  displayName?: string,
): Promise<AuthActionResult> {
  try {
    const supabase = createAnonAuthClient();
    const trimmedName = displayName?.trim();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      ...(trimmedName ? { options: { data: { display_name: trimmedName } } } : {}),
    });
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

/**
 * Recuperação de senha ("RECUPERAR SENHA" na tela de autenticação).
 * Dispara o e-mail de redefinição do próprio Supabase, apontando de
 * volta para /redefinir-senha desta instalação.
 *
 * A resposta é SEMPRE `ok: true` quando o e-mail tem formato válido —
 * mesmo que a conta não exista. Responder "essa conta não existe"
 * transformaria a tela num verificador de e-mails cadastrados
 * (enumeração de contas); a mensagem exibida é neutra de propósito.
 *
 * Requer que a URL de retorno esteja na allowlist de Redirect URLs do
 * projeto Supabase — caso contrário o Supabase manda o link para a Site
 * URL configurada, e não para /redefinir-senha.
 */
export async function requestPasswordReset(email: string): Promise<AuthActionResult> {
  const trimmed = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, error: "Informe um e-mail válido para receber o link de redefinição." };
  }
  try {
    const supabase = createAnonAuthClient();
    const headerList = await headers();
    const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
    const proto = headerList.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
    const redirectTo = host ? `${proto}://${host}/redefinir-senha` : undefined;
    await supabase.auth.resetPasswordForEmail(trimmed, redirectTo ? { redirectTo } : undefined);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro desconhecido ao pedir a redefinição de senha." };
  }
}

/**
 * Atualiza o nome de exibição da conta logada ("Conta e preferências",
 * aditivo §4.3) — grava em `user_metadata.display_name` via
 * `auth.updateUser`, a própria conta autenticando a mudança em si
 * mesma (nunca uma escrita administrativa, nunca uma tabela nova).
 * Sem sessão válida, `updateUser` falha e o erro é devolvido — não há
 * caminho para alterar o nome de outra conta por aqui.
 */
export async function updateDisplayName(displayName: string): Promise<AuthActionResult> {
  try {
    const client = await getScopedTableClient();
    const trimmed = displayName.trim();
    const { error } = await client.auth.updateUser({ data: { display_name: trimmed || null } });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro desconhecido ao atualizar nome de exibição." };
  }
}
