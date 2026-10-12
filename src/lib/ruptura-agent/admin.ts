import "server-only";
import { getScopedTableClient } from "../auth/scopedClient";

export type FindingStatus = "open" | "acknowledged" | "stale" | "resolved" | "ignored";

export interface AdminFinding {
  id: string;
  fingerprint: string;
  category: string;
  detector: string;
  severity: string;
  status: FindingStatus;
  confidence: number;
  source_id: string;
  source_revision: string;
  block_id: string | null;
  related_source_ids: string[];
  title: string;
  description: string;
  rationale: string;
  evidence: unknown;
  suggested_action: string | null;
  first_seen_at: string;
  last_seen_at: string;
  occurrences: number;
  updated_at: string;
}

export interface AdminSourceSummary {
  id: string;
  notion_id: string;
  title: string;
  path: string[];
  role: string;
  active: boolean;
  snapshot_hash: string;
}

const FINDING_COLUMNS = "id,fingerprint,category,detector,severity,status,confidence,source_id,source_revision,block_id,related_source_ids,title,description,rationale,evidence,suggested_action,first_seen_at,last_seen_at,occurrences,updated_at";

export async function listarFindingsAdmin(status: FindingStatus, page: number, pageSize = 20): Promise<{
  findings: AdminFinding[]; sources: Map<string, AdminSourceSummary>; total: number;
}> {
  const client = await getScopedTableClient();
  const from = (page - 1) * pageSize;
  const { data, count, error } = await client.from("ruptura_agent_findings")
    .select(FINDING_COLUMNS, { count: "exact" }).eq("status", status)
    .order("updated_at", { ascending: false }).range(from, from + pageSize - 1);
  if (error) throw new Error(`Falha ao ler achados do agente: ${error.message}`);
  const findings = (data ?? []) as AdminFinding[];
  const ids = [...new Set(findings.map((finding) => finding.source_id))];
  const sources = new Map<string, AdminSourceSummary>();
  if (ids.length) {
    const loaded = await client.from("ruptura_agent_sources").select("id,notion_id,title,path,role,active,snapshot_hash").in("id", ids);
    if (loaded.error) throw new Error(`Falha ao ler fontes do agente: ${loaded.error.message}`);
    for (const source of (loaded.data ?? []) as AdminSourceSummary[]) sources.set(source.id, source);
  }
  return { findings, sources, total: count ?? 0 };
}

export async function lerFindingAdmin(id: string): Promise<{ finding: AdminFinding; source: AdminSourceSummary | null; relatedSources: AdminSourceSummary[] } | null> {
  const client = await getScopedTableClient();
  const { data, error } = await client.from("ruptura_agent_findings")
    .select(FINDING_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha ao ler achado do agente: ${error.message}`);
  if (!data) return null;
  const finding = data as AdminFinding;
  const loaded = await client.from("ruptura_agent_sources").select("id,notion_id,title,path,role,active,snapshot_hash")
    .in("id", [finding.source_id, ...finding.related_source_ids]);
  if (loaded.error) throw new Error(`Falha ao ler fonte do agente: ${loaded.error.message}`);
  const sources = (loaded.data ?? []) as AdminSourceSummary[];
  return { finding, source: sources.find((source) => source.id === finding.source_id) ?? null,
    relatedSources: sources.filter((source) => source.id !== finding.source_id) };
}
