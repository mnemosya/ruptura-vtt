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

/**
 * Token real de sessão de perfil (checkpoint v0.30) — gerado
 * server-side por `enterCampaignProfile` (256 bits, `randomBytes(32)`,
 * mesmo padrão do token de convite desde v0.18). O banco só guarda o
 * hash SHA-256 (`profile_sessions.session_token_hash`); o token BRUTO
 * só existe aqui, no localStorage do navegador que entrou — nunca
 * volta para o servidor a não ser para ser comparado com o hash
 * salvo. Diferente de `getOrCreateBrowserSessionId()` (um id local
 * auxiliar, não secreto, usado só para UI de concorrência como "Em uso
 * por esta aba") — este token É o segredo que autoriza heartbeat,
 * sair do perfil, e ler/salvar o personagem ativo da sessão
 * (validateProfileSessionToken, table/storage.ts;
 * get_character_for_profile_session/save_character_for_profile_session,
 * migration 0016).
 *
 * Guardado por perfil (não um valor único global) — um navegador pode
 * ter entrado em perfis diferentes de convites diferentes ao longo do
 * tempo; cada um com seu próprio token.
 */
export interface StoredProfileSessionToken {
  profileSessionId: string;
  rawSessionToken: string;
}

function profileSessionTokenKey(profileId: string): string {
  return `ruptura_vtt_profile_session_token:${profileId}`;
}

export function saveProfileSessionToken(profileId: string, token: StoredProfileSessionToken): void {
  window.localStorage.setItem(profileSessionTokenKey(profileId), JSON.stringify(token));
}

/** Lê o token guardado para este perfil, ou `null` se nunca entrou (ou já saiu/limpou). */
export function readProfileSessionToken(profileId: string): StoredProfileSessionToken | null {
  const raw = window.localStorage.getItem(profileSessionTokenKey(profileId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredProfileSessionToken>;
    if (typeof parsed.profileSessionId !== "string" || typeof parsed.rawSessionToken !== "string") return null;
    return { profileSessionId: parsed.profileSessionId, rawSessionToken: parsed.rawSessionToken };
  } catch {
    return null;
  }
}

/** Remove o token guardado deste perfil (ao sair do perfil, ou quando a sessão é rejeitada pelo servidor). */
export function clearProfileSessionToken(profileId: string): void {
  window.localStorage.removeItem(profileSessionTokenKey(profileId));
}
