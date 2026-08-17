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
import { writeAuthTokens, clearAuthTokens, readAuthTokens } from "./session";

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

export interface RefreshedAccessToken {
  ok: boolean;
  /** Novo access token, só em sucesso. NUNCA acompanha o refresh token — esse fica no cookie httpOnly. */
  accessToken?: string;
  /** `exp` do novo token em ms desde epoch, para o cliente reagendar a próxima renovação sem redecodificar o JWT. */
  expiresAtMs?: number;
  /**
   * `true` quando o refresh token em si é inválido/revogado/expirado —
   * nesse caso não adianta tentar de novo, só um login novo resolve.
   * `false` (com `ok: false`) é falha transitória: rede, Supabase fora
   * do ar, corrida entre abas — vale reter o estado e oferecer "Tentar
   * novamente".
   */
  needsLogin?: boolean;
  error?: string;
}

/**
 * Renova SILENCIOSAMENTE o access token da sessão, usando o refresh
 * token que já está no cookie httpOnly — nunca pede senha, nunca expõe
 * o refresh token ao cliente.
 *
 * Existe para o Realtime da área de campanha: o WebSocket é autenticado
 * com o access token (ver `setBrowserSupabaseRealtimeAuth`), que expira
 * em ~1h; uma sessão de RPG dura várias horas, e ninguém deve precisar
 * recarregar a página no meio de uma cena. O cliente chama isto pouco
 * antes da expiração, aplica o token novo com `realtime.setAuth(...)` e
 * reagenda — sem reload, sem navegação, sem perder estado de interface
 * (o `setAuth` do realtime-js empurra o token pros canais JÁ inscritos,
 * não recria assinatura nenhuma).
 *
 * O refresh token do Supabase ROTACIONA a cada uso, por isso o cookie é
 * regravado aqui (`writeAuthTokens`) — o par novo precisa valer para as
 * próximas leituras server-side também, não só para o Realtime.
 *
 * Corrida entre abas: duas abas da mesma conta renovando quase junto
 * podem levar uma delas a usar um refresh token recém-rotacionado. O
 * Supabase tolera reuso dentro de uma janela curta, então normalmente
 * as duas passam; se uma falhar, cai em `ok: false` SEM `needsLogin`, e
 * o "Tentar novamente" da interface relê o cookie (já atualizado pela
 * outra aba) e passa. Não há perda de sessão nesse caminho.
 */
export async function refreshAccessToken(): Promise<RefreshedAccessToken> {
  try {
    const tokens = await readAuthTokens();
    if (!tokens?.refresh_token) {
      return { ok: false, needsLogin: true, error: "Sessão ausente." };
    }

    const primeira = await tentarRenovar(tokens.refresh_token);
    if (primeira.ok) return primeira;

    // Não exige login por causa de UMA recusa. Numa corrida entre abas, a
    // aba lenta apresenta um refresh token que a outra JÁ rotacionou; a
    // sessão está viva e o cookie já tem o par novo, gravado por quem
    // ganhou. A verificação é COMPORTAMENTAL, não por código de erro —
    // medido contra o Supabase real (ver `tentarRenovar`), o erro de
    // token rotacionado fora da janela de tolerância é indistinguível do
    // de token genuinamente morto. Reler o cookie e tentar uma vez com o
    // token atualizado separa os dois casos sem chutar.
    //
    // A pausa curta cobre o outro lado da corrida: a aba vencedora pode
    // estar com a requisição em voo e ainda não ter gravado o cookie no
    // instante em que esta falhou.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const tokensAtuais = await readAuthTokens();
    const rotacionadoPorOutraAba = !!tokensAtuais?.refresh_token && tokensAtuais.refresh_token !== tokens.refresh_token;
    if (rotacionadoPorOutraAba) {
      return await tentarRenovar(tokensAtuais.refresh_token);
    }

    return primeira;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro desconhecido ao renovar a sessão." };
  }
}

/**
 * Uma tentativa de renovação.
 *
 * Classificação medida contra o Supabase REAL desta instalação, não
 * suposta:
 *   - token inexistente/inválido → `status 400`, `code
 *     "validation_failed"`, mensagem "Refresh token is not valid";
 *   - token recém-rotacionado, reusado DENTRO da janela de tolerância
 *     (o caso comum da corrida entre abas) → NÃO dá erro nenhum: o
 *     Supabase devolve sessão normalmente.
 *
 * Ou seja: status 400 sozinho nunca serve como veredito (foi o bug
 * apontado na auditoria), e o código de erro também não distingue
 * "morto" de "rotacionado há muito tempo por outra aba". Por isso quem
 * chama (`refreshAccessToken`) faz a desambiguação COMPORTAMENTAL —
 * relê o cookie e tenta de novo — antes de aceitar um `needsLogin`
 * daqui.
 */
async function tentarRenovar(refreshToken: string): Promise<RefreshedAccessToken> {
  const supabase = createAnonAuthClient();
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });

  if (error || !data.session) {
    const code = (error as { code?: string } | null)?.code;
    const mensagem = (error?.message ?? "").toLowerCase();
    const tokenRecusado =
      code === "validation_failed" ||
      code === "refresh_token_not_found" ||
      code === "refresh_token_already_used" ||
      code === "session_not_found" ||
      mensagem.includes("not valid") ||
      mensagem.includes("refresh token not found") ||
      mensagem.includes("already used") ||
      mensagem.includes("revoked");
    return {
      ok: false,
      needsLogin: tokenRecusado,
      error: error?.message ?? "Renovação não retornou sessão.",
    };
  }

  await writeAuthTokens({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });

  // `expires_at` vem em SEGUNDOS desde epoch (contrato do Supabase).
  const expiresAtMs = typeof data.session.expires_at === "number" ? data.session.expires_at * 1000 : undefined;
  return { ok: true, accessToken: data.session.access_token, expiresAtMs };
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
