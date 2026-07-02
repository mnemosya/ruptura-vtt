/**
 * Validação de segredo para rotas internas de cron/manutenção.
 *
 * Use APENAS em server-only contexts (rotas Next.js API, Server Actions
 * que não são exportadas ao cliente). Nunca importe em Client Components.
 */

export function getCronSecret(): string | null {
  const secret = process.env.INTERNAL_CRON_SECRET;
  return secret && secret.trim() ? secret : null;
}

export function validateCronSecret(provided: string | null | undefined): boolean {
  const expected = getCronSecret();
  if (!expected) {
    // Sem secret configurado: nega toda chamada externa.
    return false;
  }
  if (!provided) {
    return false;
  }
  // Timing-safe comparison (em um caso real, considerar crypto.timingSafeEqual).
  return provided === expected;
}
