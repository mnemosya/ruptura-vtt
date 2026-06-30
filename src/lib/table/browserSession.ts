/**
 * Id de sessão de navegador (NÃO é autenticação) usado pelo heartbeat
 * dev de perfil (checkpoint v0.9) e pela entrada dev por link de mesa
 * (checkpoint v0.10, `/dev/join/[campaignId]`). Gerado uma vez por
 * navegador via `crypto.randomUUID()` e guardado em localStorage —
 * qualquer aba do mesmo navegador reusa o mesmo id; abas de
 * navegadores/perfis diferentes (ou modo anônimo) geram ids
 * diferentes, o que é suficiente para simular "duas sessões
 * distintas" durante testes manuais sem precisar de login real.
 *
 * Movido de `src/app/dev/character-sheet/sessionId.ts` para cá nesta
 * etapa porque agora é usado por duas rotas dev diferentes
 * (`/dev/character-sheet` e `/dev/join/[campaignId]`), não só pela
 * ficha.
 */

const SESSION_ID_KEY = "ruptura_vtt_session_id";

export function getOrCreateBrowserSessionId(): string {
  const existing = window.localStorage.getItem(SESSION_ID_KEY);
  if (existing) return existing;
  const fresh = crypto.randomUUID();
  window.localStorage.setItem(SESSION_ID_KEY, fresh);
  return fresh;
}
