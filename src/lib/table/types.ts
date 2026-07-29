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
  /** Estado da trilha de turnos (migration 0036) — ver TurnTrackState em turnTrack.ts. Vem como JSON bruto do banco. */
  turn_track: import("./turnTrack").TurnTrackState;
  /** Versão para concorrência otimista das Server Actions de turno (migration 0036). */
  turn_track_version: number;
}

/** Visibilidade de uma entrada de log — hoje é só um campo de dados, sem filtro de RLS (ver migration). */
export const TABLE_LOG_VISIBILITIES = ["public", "private", "gm"] as const;
export type TableLogVisibility = (typeof TABLE_LOG_VISIBILITIES)[number];

/**
 * Linha completa de `table_logs`. payload guarda o conteúdo do evento.
 *
 * Fase 1 (revisão 4): `profile_id`/`profile_session_id` foram removidas
 * (migration 0057, junto com a remoção de `campaign_profiles`/
 * `profile_sessions`) — `created_by_user_id` (sempre = auth.uid() de
 * quem registrou, via a RPC `append_table_log`) é agora a única forma
 * de identificar o autor de um log, inclusive para o filtro de "private"
 * em listLogsForViewer.
 */
export interface TableLogEntry {
  id: string;
  campaign_id: string;
  character_id: string | null;
  type: string;
  visibility: TableLogVisibility;
  payload: Record<string, unknown>;
  created_at: string;
  /** Conta autenticada que gerou o evento. Null em logs antigos anteriores ao login obrigatório. */
  created_by_user_id: string | null;
}

/** Tipo de convite (Fase 2, revisão 4, aditivo §6/§7): "email" (associado a uma conta específica) ou "clean" (reutilizável, sempre concede Jogador). */
export type CampaignInviteKind = "email" | "clean";

/**
 * Convite de mesa (tabela `campaign_invites`, migration 0008; `kind`/
 * `email`/`activated_by`/`activated_at` desde a migration 0059). Tipo
 * PÚBLICO seguro: NÃO inclui `token_hash` (nem o token bruto) — o hash
 * fica só no banco, o token bruto só aparece no momento da criação. Ver
 * createCampaignInvite/createCampaignEmailInvite/resolveCampaignInvite
 * em storage.ts.
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
  kind: CampaignInviteKind;
  /** Só preenchido quando kind="email". */
  email: string | null;
  /** Conta que ativou o convite por e-mail (null = ainda pendente). */
  activated_by: string | null;
  /** Quando o convite por e-mail foi ativado (null = ainda pendente). */
  activated_at: string | null;
}

/** Colunas seguras de `campaign_invites` (nunca token_hash) — usado nos selects. */
export const CAMPAIGN_INVITE_SAFE_COLUMNS =
  "id, campaign_id, label, is_active, expires_at, created_by, created_at, revoked_at, kind, email, activated_by, activated_at";

/**
 * Estado de participação em campanha (`campaign_members.status`).
 * Fase 1 (revisão 4): "pendente" NÃO é um destes estados — convite por
 * e-mail pendente vive inteiramente em `campaign_invites` (Fase 2), não
 * em `campaign_members`. Uma linha só existe aqui depois que a conta se
 * autentica.
 */
export type CampaignMemberStatus = "active" | "removed";
export type CampaignMemberRole = "owner" | "player";

/** Linha completa de `campaign_members` — participação de uma CONTA existente numa campanha. */
export interface CampaignMember {
  id: string;
  campaign_id: string;
  user_id: string;
  role: CampaignMemberRole;
  status: CampaignMemberStatus;
  created_at: string;
  updated_at: string;
  joined_at: string | null;
}
