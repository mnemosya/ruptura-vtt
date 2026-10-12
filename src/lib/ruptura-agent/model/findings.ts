import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validarFinding } from "../agent";
import type { AgentSource } from "../types";
import type { SemanticFinding } from "./types";

export function semanticFingerprint(target: AgentSource, finding: SemanticFinding): string {
  const block = finding.evidence.find((item) => item.sourceId === target.notion_id)?.blockId ?? finding.evidence[0].blockId;
  const issue = finding.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return createHash("sha256").update(JSON.stringify(["semantic:v1", target.notion_id, block, finding.category, issue])).digest("hex");
}

export async function persistirFindingsSemanticos(
  client: SupabaseClient, target: AgentSource, findings: SemanticFinding[], sources: AgentSource[], jobId: string | null = null,
): Promise<number> {
  const corpus = new Map(sources.map((source) => [source.notion_id, source]));
  if (!target.active || findings.some((finding) => !validarFinding(finding, corpus)))
    throw new Error("Achado semântico sem evidência verificável.");
  const unique = new Map(findings.map((finding) => {
    const fingerprint = semanticFingerprint(target, finding);
    const blockId = finding.evidence.find((item) => item.sourceId === target.notion_id)?.blockId ?? finding.evidence[0].blockId;
    const relatedSources = [...new Set([...finding.relatedSources, ...finding.evidence.map((item) => item.sourceId)])]
      .filter((id) => id !== target.notion_id);
    return [fingerprint, { ...finding, relatedSources, fingerprint, blockId }];
  }));
  const { data, error } = await client.rpc("record_ruptura_agent_semantic_findings", {
    p_source_notion_id: target.notion_id, p_revision: target.snapshot_hash,
    p_findings: [...unique.values()], p_job_id: jobId,
  });
  if (error) throw new Error(`Falha ao persistir achados semânticos: ${error.message}`);
  return Number(data ?? 0);
}
