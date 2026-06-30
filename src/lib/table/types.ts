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
