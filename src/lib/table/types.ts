/**
 * Tipos da camada de Mesa/Log persistente (tabelas `campaigns` e
 * `table_logs`, migration 0003_campaigns_table_logs.sql).
 *
 * Fase 0 mínima: sem autenticação, sem realtime, sem filtragem real
 * por visibilidade — ver aviso de RLS na migration antes de tratar
 * isto como "privado" de verdade.
 */

/** Linha completa de `campaigns`. */
export interface Campaign {
  id: string;
  name: string;
  /** Dono/narrador da mesa (auth dev, migration 0006). Null para mesas criadas sem login. */
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  /** Rodada atual (checkpoint v0.39, migration 0017) — contador simples, não é trilha de iniciativa real. */
  current_round: number;
  /** Cena atual (checkpoint v0.39, migration 0017). */
  current_scene: number;
}

/** Visibilidade de uma entrada de log — hoje é só um campo de dados, sem filtro de RLS (ver migration). */
export const TABLE_LOG_VISIBILITIES = ["public", "private", "gm"] as const;
export type TableLogVisibility = (typeof TABLE_LOG_VISIBILITIES)[number];

/** Linha completa de `table_logs`. payload guarda o conteúdo do evento. */
export interface TableLogEntry {
  id: string;
  campaign_id: string;
  character_id: string | null;
  type: string;
  visibility: TableLogVisibility;
  payload: Record<string, unknown>;
  created_at: string;
  /** Perfil que gerou o log (migration 0010) — dono do 'private'. Null em logs antigos. */
  profile_id: string | null;
  /** Narrador logado que gerou (migration 0010). Null quando anon. */
  created_by_user_id: string | null;
  /** Sessão de perfil (migration 0010). Null quando não disponível. */
  profile_session_id: string | null;
}

/**
 * Linha completa de `campaign_profiles` (migrations 0004 + 0005).
 * Perfil DEV de mesa — apelido + bloqueio manual/heartbeat + personagem
 * ativo opcional. Não é conta de usuário, login nem link de convite
 * real — `lock_session_id` é só um id gerado no localStorage do
 * navegador (ver aviso completo nas migrations antes de tratar isto
 * como o fluxo final de jogador do PRD).
 */
export interface CampaignProfile {
  id: string;
  campaign_id: string;
  nickname: string;
  color_label: string | null;
  is_locked: boolean;
  active_character_id: string | null;
  /** Id de sessão (gerado no localStorage do navegador) que detém o bloqueio atual, se houver. */
  lock_session_id: string | null;
  /** Quando o bloqueio atual começou. */
  locked_at: string | null;
  /** Último heartbeat recebido — usado para decidir se o bloqueio expirou (ver PROFILE_HEARTBEAT_TIMEOUT_MS). */
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Janela de tolerância do heartbeat dev de perfil: se `last_seen_at`
 * estiver mais velho que isto, o bloqueio é considerado expirado e
 * outra sessão pode assumir o perfil. Decisão tomada no CLIENTE
 * (comparando com Date.now() local) — não há job/cron no banco (ver
 * aviso na migration 0005).
 */
export const PROFILE_HEARTBEAT_TIMEOUT_MS = 30_000;

/** Intervalo de envio de heartbeat enquanto uma sessão está "dentro" de um perfil. */
export const PROFILE_HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * Convite de mesa (tabela `campaign_invites`, migration 0008). Tipo
 * PÚBLICO seguro: NÃO inclui `token_hash` (nem o token bruto) — o hash
 * fica só no banco, o token bruto só aparece no momento da criação. Ver
 * createCampaignInvite/resolveCampaignInvite em storage.ts.
 */
export interface CampaignInvite {
  id: string;
  campaign_id: string;
  label: string | null;
  is_active: boolean;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
}

/** Colunas seguras de `campaign_invites` (nunca token_hash) — usado nos selects. */
export const CAMPAIGN_INVITE_SAFE_COLUMNS =
  "id, campaign_id, label, is_active, expires_at, created_by, created_at, revoked_at";

/** Status de uma sessão de perfil (tabela `profile_sessions`, migration 0009). */
export type ProfileSessionStatus = "active" | "exited" | "expired" | "released";

/**
 * Sessão de perfil (migration 0009). Tipo PÚBLICO seguro: NÃO inclui
 * `session_token_hash`. Rastreia o ciclo de vida de uma entrada de
 * jogador num perfil (status/last_seen/histórico).
 */
export interface ProfileSession {
  id: string;
  campaign_id: string;
  profile_id: string;
  invite_id: string | null;
  status: ProfileSessionStatus;
  created_at: string;
  last_seen_at: string;
  exited_at: string | null;
  released_at: string | null;
  user_agent: string | null;
}

/** Colunas seguras de `profile_sessions` (nunca session_token_hash). */
export const PROFILE_SESSION_SAFE_COLUMNS =
  "id, campaign_id, profile_id, invite_id, status, created_at, last_seen_at, exited_at, released_at, user_agent";
