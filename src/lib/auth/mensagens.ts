/**
 * Tradução dos erros do Supabase Auth para o que a tela mostra.
 *
 * O Supabase devolve `message` em inglês ("Invalid login credentials").
 * As telas de acesso mostravam esse texto cru. Aqui o erro é reconhecido
 * pelo `code` (estável entre versões) e, na falta dele, por trechos da
 * mensagem. O que não for reconhecido vira a mensagem genérica passada
 * por quem chama — nunca o texto em inglês.
 *
 * Arquivo à parte (e não em `actions.ts`) porque um módulo "use server"
 * só exporta funções assíncronas, e a tela de redefinir senha traduz no
 * navegador.
 */

const POR_CODIGO: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorretos.",
  email_not_confirmed: "Confirme seu e-mail pelo link enviado antes de entrar.",
  user_already_exists: "Já existe uma conta com esse e-mail.",
  email_exists: "Já existe uma conta com esse e-mail.",
  weak_password: "Senha fraca demais. Use uma senha mais longa.",
  same_password: "A nova senha precisa ser diferente da atual.",
  email_address_invalid: "Esse endereço de e-mail não é válido.",
  email_address_not_authorized: "Esse endereço de e-mail não pode receber mensagens deste projeto.",
  signup_disabled: "A criação de contas está desativada.",
  email_provider_disabled: "O acesso por e-mail e senha está desativado.",
  user_banned: "Esta conta está bloqueada.",
  user_not_found: "Conta não encontrada.",
  over_request_rate_limit: "Muitas tentativas. Aguarde um pouco e tente de novo.",
  over_email_send_rate_limit: "Muitos e-mails enviados. Aguarde um pouco e tente de novo.",
  otp_expired: "O link expirou ou já foi usado. Peça um novo.",
  session_not_found: "Sessão expirada. Entre de novo.",
  session_expired: "Sessão expirada. Entre de novo.",
  refresh_token_not_found: "Sessão expirada. Entre de novo.",
  refresh_token_already_used: "Sessão expirada. Entre de novo.",
  request_timeout: "O servidor demorou a responder. Tente de novo.",
};

const POR_TRECHO: Array<[RegExp, string]> = [
  [/invalid login credentials/i, POR_CODIGO.invalid_credentials],
  [/email not confirmed/i, POR_CODIGO.email_not_confirmed],
  [/already registered|already exists/i, POR_CODIGO.user_already_exists],
  [/password should be at least (\d+)/i, "A senha precisa ter pelo menos $1 caracteres."],
  [/different from the old password/i, POR_CODIGO.same_password],
  [/only request this after (\d+) seconds?/i, "Aguarde $1 segundos antes de tentar de novo."],
  [/rate limit/i, POR_CODIGO.over_request_rate_limit],
  [/invalid format|is invalid|validate email/i, POR_CODIGO.email_address_invalid],
  [/signups? not allowed/i, POR_CODIGO.signup_disabled],
  [/session missing|session not found/i, POR_CODIGO.session_not_found],
  [/expired|invalid.*(token|link)/i, POR_CODIGO.otp_expired],
  [/fetch failed|failed to fetch|network|ECONNREFUSED|ENOTFOUND|timeout/i, "Sem conexão com o servidor. Tente de novo."],
];

export function traduzirErroAuth(erro: unknown, generica: string): string {
  if (!erro) return generica;
  const code = (erro as { code?: unknown }).code;
  if (typeof code === "string" && POR_CODIGO[code]) return POR_CODIGO[code];
  const mensagem = typeof erro === "string" ? erro : (erro as { message?: unknown }).message;
  if (typeof mensagem !== "string") return generica;
  for (const [padrao, texto] of POR_TRECHO) {
    const m = mensagem.match(padrao);
    if (m) return texto.replace("$1", m[1] ?? "");
  }
  return generica;
}
