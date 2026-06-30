/**
 * Status de UI de um perfil dado o heartbeat dev (checkpoint v0.9) —
 * compartilhado entre `/dev/character-sheet` e `/dev/join/[campaignId]`
 * (checkpoint v0.10) para não duplicar a lógica de "o que mostrar" em
 * cada tela.
 */

import { PROFILE_HEARTBEAT_TIMEOUT_MS } from "./types";
import type { CampaignProfile } from "./types";

export type ProfileStatus = "Livre" | "Em uso por esta aba" | "Expirado" | "Em uso";

/**
 * `now` é passado explicitamente (em vez de `Date.now()` interno) para
 * que o chamador controle quando recalcular via um tick local
 * (`setInterval`) — ver uso em CharacterSheetClient/JoinClient/TableClient.
 */
export function computeProfileStatus(perfil: CampaignProfile, sessionId: string | null, now: number): ProfileStatus {
  if (!perfil.is_locked) return "Livre";
  if (sessionId && perfil.lock_session_id === sessionId) return "Em uso por esta aba";
  const lastSeenMs = perfil.last_seen_at ? new Date(perfil.last_seen_at).getTime() : 0;
  if (now - lastSeenMs > PROFILE_HEARTBEAT_TIMEOUT_MS) return "Expirado";
  return "Em uso";
}
