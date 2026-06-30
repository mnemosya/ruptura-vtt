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
