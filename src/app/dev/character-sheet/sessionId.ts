/**
 * Id de sessão de navegador (NÃO é autenticação) usado pelo heartbeat
 * dev de perfil (checkpoint v0.9). Gerado uma vez por navegador via
 * `crypto.randomUUID()` e guardado em localStorage — qualquer aba do
 * mesmo navegador reusa o mesmo id; abas de navegadores/perfis
 * diferentes (ou modo anônimo) geram ids diferentes, o que é
 * suficiente para simular "duas sessões distintas" durante o teste
 * manual sem precisar de login real.
 */

const SESSION_ID_KEY = "ruptura_vtt_session_id";

export function getOrCreateBrowserSessionId(): string {
  const existing = window.localStorage.getItem(SESSION_ID_KEY);
  if (existing) return existing;
  const fresh = crypto.randomUUID();
  window.localStorage.setItem(SESSION_ID_KEY, fresh);
  return fresh;
}
