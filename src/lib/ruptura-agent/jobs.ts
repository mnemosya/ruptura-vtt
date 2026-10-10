import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentBlock, AgentSource } from "./types";

export const ANALYZER_VERSION = "sources-v1";

export interface SourceDiff {
  kind: "created" | "changed" | "unchanged" | "reactivated";
  beforeHash: string | null;
  afterHash: string;
  addedBlocks: string[];
  removedBlocks: string[];
  textChangedBlocks: string[];
  formatChangedBlocks: string[];
  movedBlocks: string[];
  propertiesChanged: boolean;
  metadataChanged: boolean;
}

function blockMap(source: AgentSource): Map<string, { block: AgentBlock; parent: string; position: number }> {
  const found = new Map<string, { block: AgentBlock; parent: string; position: number }>();
  function visit(blocks: AgentBlock[], parent: string): void {
    blocks.forEach((block, position) => {
      found.set(block.id, { block, parent, position });
      visit(block.children, block.id);
    });
  }
  visit(source.structure.blocks ?? [], source.notion_id);
  return found;
}

function visibleText(value: unknown): string {
  if (Array.isArray(value)) return value.map(visibleText).join("");
  if (!value || typeof value !== "object") return "";
  const item = value as Record<string, unknown>;
  if (typeof item.plain_text === "string") return item.plain_text;
  if (typeof item.content === "string") return item.content;
  return Object.entries(item)
    .filter(([key]) => !["annotations", "id", "href", "url", "link", "children"].includes(key))
    .map(([, child]) => visibleText(child)).join("");
}

export function diferenciarFonte(before: AgentSource | undefined, after: AgentSource): SourceDiff {
  const oldBlocks: ReturnType<typeof blockMap> = before ? blockMap(before) : new Map();
  const newBlocks = blockMap(after);
  const addedBlocks: string[] = [];
  const removedBlocks: string[] = [];
  const textChangedBlocks: string[] = [];
  const formatChangedBlocks: string[] = [];
  const movedBlocks: string[] = [];
  for (const [id, current] of newBlocks) {
    const old = oldBlocks.get(id);
    if (!old) { addedBlocks.push(id); continue; }
    if (visibleText(old.block.data) !== visibleText(current.block.data)) textChangedBlocks.push(id);
    else if (old.block.type !== current.block.type || JSON.stringify(old.block.data) !== JSON.stringify(current.block.data)) formatChangedBlocks.push(id);
    if (old.parent !== current.parent || old.position !== current.position) movedBlocks.push(id);
  }
  for (const id of oldBlocks.keys()) if (!newBlocks.has(id)) removedBlocks.push(id);
  return {
    kind: !before ? "created" : !before.active ? "reactivated" : before.snapshot_hash === after.snapshot_hash ? "unchanged" : "changed",
    beforeHash: before?.snapshot_hash ?? null,
    afterHash: after.snapshot_hash,
    addedBlocks, removedBlocks, textChangedBlocks, formatChangedBlocks, movedBlocks,
    propertiesChanged: !!before && JSON.stringify(before.properties) !== JSON.stringify(after.properties),
    metadataChanged: !!before && (before.title !== after.title || before.role !== after.role ||
      JSON.stringify(before.path) !== JSON.stringify(after.path) || before.parent_notion_id !== after.parent_notion_id),
  };
}

/** Cada RPC grava fontes e jobs no mesmo commit. Lotes reexecutados são idempotentes. */
export async function persistirCorpusComJobs(
  client: SupabaseClient, sources: AgentSource[], previous: ReadonlyMap<string, AgentSource>, crawlStartedAt: string,
): Promise<{ jobs: number; removed: number }> {
  let jobs = 0;
  const ordered = [...sources].sort((a, b) => a.notion_id.localeCompare(b.notion_id));
  for (let start = 0; start < ordered.length; start += 10) {
    const items = ordered.slice(start, start + 10).map((source) => ({
      source, diff: diferenciarFonte(previous.get(source.notion_id), source), analyzer_version: ANALYZER_VERSION,
    }));
    const { data, error } = await client.rpc("persist_ruptura_agent_batch", { p_items: items, p_seen_at: crawlStartedAt });
    if (error) throw new Error(`Falha ao persistir corpus e jobs: ${error.message}`);
    jobs += Number(data ?? 0);
  }
  const { data, error } = await client.rpc("sweep_ruptura_agent_sources", {
    p_seen_at: crawlStartedAt, p_analyzer_version: ANALYZER_VERSION,
  });
  if (error) throw new Error(`Falha ao detectar fontes removidas: ${error.message}`);
  return { jobs, removed: Number(data ?? 0) };
}

export interface AgentJob {
  id: string;
  job_key: string;
  kind: string;
  status: string;
  source_id: string | null;
  source_revision: string | null;
  attempts: number;
  max_attempts: number;
  input: Record<string, unknown>;
}

export async function iniciarCrawlJob(client: SupabaseClient, runId: string, workerId: string): Promise<AgentJob> {
  const { data, error } = await client.rpc("start_ruptura_agent_crawl", { p_run_id: runId, p_worker_id: workerId });
  if (error) throw new Error(`Falha ao iniciar crawl job: ${error.message}`);
  return data as AgentJob;
}

export async function reivindicarJob(client: SupabaseClient, workerId: string, leaseSeconds = 3600): Promise<AgentJob | null> {
  const { data, error } = await client.rpc("claim_ruptura_agent_job", {
    p_worker_id: workerId, p_lease_seconds: leaseSeconds,
  });
  if (error) throw new Error(`Falha ao reivindicar job: ${error.message}`);
  // PostgREST serializa uma função RETURNS rowtype sem linha como objeto
  // com todas as colunas null, em vez de JSON null.
  if (!data || typeof data.id !== "string") return null;
  return data as AgentJob;
}

export async function finalizarJob(
  client: SupabaseClient, jobId: string, workerId: string,
  status: "completed" | "retry" | "failed" | "incomplete",
  result: Record<string, unknown> = {}, errorMessage: string | null = null, retrySeconds = 60,
): Promise<AgentJob> {
  const { data, error } = await client.rpc("finish_ruptura_agent_job", {
    p_job_id: jobId, p_worker_id: workerId, p_status: status,
    p_result: result, p_error: errorMessage, p_retry_seconds: retrySeconds,
  });
  if (error) throw new Error(`Falha ao finalizar job: ${error.message}`);
  return data as AgentJob;
}
