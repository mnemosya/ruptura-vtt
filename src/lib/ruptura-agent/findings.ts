import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentSource } from "./types";
import { auditarFonte, DETERMINISTIC_DETECTORS, type CandidateFinding } from "./validators";

export interface AuditResult {
  sources: number;
  findings: CandidateFinding[];
}

export function auditarCorpus(sources: AgentSource[]): AuditResult {
  const corpus = new Map(sources.map((source) => [source.notion_id, source]));
  const findings = sources.flatMap((source) => auditarFonte(source, corpus));
  return { sources: sources.filter((source) => source.active && source.role === "book").length, findings };
}

/** Uma RPC por fonte garante que resolução e upsert dos achados sejam atômicos. */
export async function persistirAuditoriaDeterministica(
  client: SupabaseClient, sources: AgentSource[], jobId: string | null = null,
): Promise<number> {
  const corpus = new Map(sources.map((source) => [source.notion_id, source]));
  let count = 0;
  for (const source of sources) {
    if (!source.active || source.role !== "book") continue;
    count += await persistirFonteDeterministica(client, source, corpus, jobId);
  }
  return count;
}

export async function persistirFonteDeterministica(
  client: SupabaseClient, source: AgentSource,
  corpus: ReadonlyMap<string, AgentSource>, jobId: string | null = null,
): Promise<number> {
  if (!source.active || source.role !== "book") return 0;
  const findings = auditarFonte(source, corpus);
  const { data, error } = await client.rpc("record_ruptura_agent_findings", {
    p_source_notion_id: source.notion_id,
    p_revision: source.snapshot_hash,
    p_findings: findings,
    p_detectors: [...DETERMINISTIC_DETECTORS],
    p_job_id: jobId,
  });
  if (error) throw new Error(`Falha ao persistir achados de ${source.title}: ${error.message}`);
  return Number(data ?? 0);
}
