/**
 * Leitura do histórico de importação (`content_import_sessions`,
 * migration 0024) — admin-only via RLS (`content_import_sessions_admin_all`).
 * Nunca guarda o arquivo original; só o resumo suficiente para
 * auditoria (ver `packageImport.ts::confirmarImportacao`).
 */

import { getScopedTableClient } from "../auth/scopedClient";

export interface ContentImportSessionRow {
  id: string;
  nome_arquivo: string;
  hash_pacote: string;
  versao_formato: number;
  status: "previa" | "confirmada" | "cancelada";
  resumo_documentos: { contentType: string; slug: string; classificacao: string }[];
  decisoes: Record<string, string>;
  conflitos: unknown[];
  avisos: string[];
  rascunhos_criados: string[];
  manifest: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  confirmada_em: string | null;
}

export async function listImportSessions(): Promise<ContentImportSessionRow[]> {
  const client = await getScopedTableClient();
  const { data, error } = await client.from("content_import_sessions").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(`Falha ao listar histórico de importação: ${error.message}`);
  return (data ?? []) as ContentImportSessionRow[];
}

export async function getImportSessionById(id: string): Promise<ContentImportSessionRow | null> {
  const client = await getScopedTableClient();
  const { data, error } = await client.from("content_import_sessions").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha ao buscar sessão de importação ${id}: ${error.message}`);
  return (data as ContentImportSessionRow | null) ?? null;
}

/** Reimportação idempotente: já existe sessão CONFIRMADA com este hash de pacote? */
export async function findConfirmedSessionByHash(hashPacote: string): Promise<ContentImportSessionRow | null> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from("content_import_sessions")
    .select("*")
    .eq("hash_pacote", hashPacote)
    .eq("status", "confirmada")
    .order("created_at", { ascending: false })
    .maybeSingle();
  if (error) return null;
  return (data as ContentImportSessionRow | null) ?? null;
}
