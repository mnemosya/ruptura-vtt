/**
 * Logger central in-house (checkpoint fechamento de produção) —
 * substitui `console.error` disperso por uma linha JSON estruturada
 * (timestamp, escopo, nível, mensagem, contexto explícito). Nunca loga
 * stack trace nem payload de personagem/usuário — só o que quem chama
 * passar explicitamente em `context`, mesma disciplina já usada pelo
 * `error.tsx` raiz desde antes desta fase. Sem integração com serviço
 * externo pago (Sentry/Datadog/etc.) — decisão de PRD, "observabilidade
 * mínima".
 */

type LogContext = Record<string, unknown>;

function emit(level: "error" | "warn" | "info", scope: string, message: string, context?: LogContext): void {
  const entry = { ts: new Date().toISOString(), level, scope, message, ...context };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** `error` pode ser qualquer coisa lançada — extrai só `message` (e `digest`, se vier de um error boundary do Next), nunca a stack. */
export function logError(scope: string, error: unknown, context?: LogContext): void {
  const message = error instanceof Error ? error.message : String(error);
  const digest = typeof error === "object" && error !== null && "digest" in error ? (error as { digest?: string }).digest : undefined;
  emit("error", scope, message, digest ? { digest, ...context } : context);
}

export function logWarn(scope: string, message: string, context?: LogContext): void {
  emit("warn", scope, message, context);
}

export function logInfo(scope: string, message: string, context?: LogContext): void {
  emit("info", scope, message, context);
}
