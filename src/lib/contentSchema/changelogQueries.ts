/**
 * Leitura do histórico de versões (`content_changelog`) para a interface
 * administrativa (Etapa 5). Usa o client "scoped" (sessão do admin); a
 * policy `content_changelog_admin_read` (migration 0022) restringe a
 * leitura a `is_content_admin()` — o histórico não é público.
 */

import { getScopedTableClient } from "../auth/scopedClient";
import type { DraftContentType } from "./draftTypes";

export interface ContentChangelogRow {
  id: string;
  document_id: string;
  content_type: DraftContentType | string;
  change_type: "created" | "updated" | "deleted" | "archived";
  version_before: string | null;
  version_after: string | null;
  summary: string | null;
  author_email: string | null;
  changed_paths: unknown;
  impact: unknown;
  source_draft_id: string | null;
  payload_before: Record<string, unknown> | null;
  payload_after: Record<string, unknown> | null;
  payload_hash_before: string | null;
  payload_hash_after: string | null;
  created_at: string;
}

const COLUNAS =
  "id, document_id, content_type, change_type, version_before, version_after, summary, author_email, changed_paths, impact, source_draft_id, payload_before, payload_after, payload_hash_before, payload_hash_after, created_at";

/** Histórico de um documento, do mais recente ao mais antigo. */
export async function listarHistorico(documentId: string): Promise<ContentChangelogRow[]> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from("content_changelog")
    .select(COLUNAS)
    .eq("document_id", documentId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Falha ao carregar histórico: ${error.message}`);
  return (data ?? []) as ContentChangelogRow[];
}

/** Uma entrada específica do histórico (para abrir/comparar uma versão). */
export async function getEntradaHistorico(id: string): Promise<ContentChangelogRow | null> {
  const client = await getScopedTableClient();
  const { data, error } = await client.from("content_changelog").select(COLUNAS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha ao carregar entrada de histórico: ${error.message}`);
  return (data as ContentChangelogRow | null) ?? null;
}
