import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rastrearCorpus, type CrawlResult } from "./crawler";
import { SourceGraph } from "./graph";
import { persistirAuditoriaDeterministica, persistirFonteDeterministica } from "./findings";
import { finalizarJob, iniciarCrawlJob, persistirCorpusComJobs, reivindicarJob, type AgentJob } from "./jobs";
import { persistirFindingsSemanticos } from "./model/findings";
import type { AgentModel } from "./model/types";
import { executarAuditoriaSemantica } from "./agent";
import { lerSources } from "./sources";
import type { AgentNotionReader, AgentSource } from "./types";

export interface WorkerOptions {
  client: SupabaseClient;
  notion: AgentNotionReader;
  modelFactory?: () => AgentModel | null;
  maxJobs?: number;
  workerId?: string;
  onProgress?: (message: string) => void;
}

export interface CycleSummary {
  crawl: CrawlResult;
  jobsCreated: number;
  sourcesRemoved: number;
  jobsCompleted: number;
  jobsRetried: number;
  jobsIncomplete: number;
  bootstrap: boolean;
}

export interface ProcessSummary {
  jobsCompleted: number;
  jobsRetried: number;
  jobsIncomplete: number;
}

async function processJob(
  client: SupabaseClient, job: AgentJob, sources: AgentSource[], modelFactory?: () => AgentModel | null,
): Promise<{ status: "completed" | "incomplete"; result: Record<string, unknown> }> {
  const corpus = new Map(sources.map((source) => [source.notion_id, source]));
  const notionId = typeof job.input.notion_id === "string" ? job.input.notion_id : "";
  const source = corpus.get(notionId);
  if (job.kind === "source_removed") {
    const incoming = new SourceGraph(sources).incomingLinks(notionId);
    let findings = 0;
    for (const id of incoming) {
      const dependent = corpus.get(id);
      if (dependent) findings += await persistirFonteDeterministica(client, dependent, corpus, job.id);
    }
    return { status: "completed", result: { dependentSources: incoming.length, deterministicFindings: findings } };
  }
  if (job.kind === "baseline_audit") {
    const findings = await persistirAuditoriaDeterministica(client, sources, job.id);
    return { status: "completed", result: { deterministicFindings: findings } };
  }
  if (!source || !source.active || source.snapshot_hash !== job.source_revision)
    return { status: "completed", result: { skipped: "source revision no longer current" } };
  const deterministicFindings = await persistirFonteDeterministica(client, source, corpus, job.id);
  if (job.kind === "source_created") return { status: "completed", result: { deterministicFindings } };
  if (job.kind !== "source_changed" && job.kind !== "guide_changed")
    return { status: "completed", result: { skipped: `unsupported job kind ${job.kind}` } };
  if (job.kind === "source_changed" && source.role !== "book")
    return { status: "completed", result: { deterministicFindings, skipped: "noncanonical source" } };
  const model = modelFactory?.();
  if (!model) return { status: "incomplete", result: { deterministicFindings, reason: "model not configured" } };
  const diff = JSON.stringify(job.input.diff ?? {});
  const task = `A fonte ${source.title.slice(0, 200)} (${source.notion_id}, revisão ${source.snapshot_hash}, ` +
    `papel ${source.role}, path ${source.path.join(" › ").slice(0, 600)}) mudou. ` +
    `Diff determinístico: ${diff.slice(0, 1500)}. ` +
    "Leia a fonte, busque regras que dependam dela e compare evidências. " +
    "Procure contradições mecânicas e referências afetadas. Retorne somente findings comprovados por trechos exatos.";
  const semantic = await executarAuditoriaSemantica(model, task, sources);
  if (semantic.status === "incomplete") return { status: "incomplete", result: {
    deterministicFindings, reason: semantic.reason, rejectedFindings: semantic.rejectedFindings,
    usage: semantic.usage, toolCalls: semantic.toolCalls,
  } };
  const persisted = await persistirFindingsSemanticos(client, source, semantic.findings, sources, job.id);
  return { status: "completed", result: { deterministicFindings, semanticFindings: persisted,
    rejectedFindings: semantic.rejectedFindings, usage: semantic.usage, toolCalls: semantic.toolCalls } };
}

/** Processa a fila existente sem exigir uma nova leitura do Notion. */
export async function processarJobsPendentes(options: {
  client: SupabaseClient;
  sources: AgentSource[];
  modelFactory?: () => AgentModel | null;
  maxJobs?: number;
  workerId?: string;
  onProgress?: (message: string) => void;
}): Promise<ProcessSummary> {
  const workerId = options.workerId ?? `ruptura-${randomUUID()}`;
  const summary: ProcessSummary = { jobsCompleted: 0, jobsRetried: 0, jobsIncomplete: 0 };
  const maxJobs = Math.min(Math.max(options.maxJobs ?? 500, 0), 1000);
  for (let processed = 0; processed < maxJobs; processed++) {
    const job = await reivindicarJob(options.client, workerId);
    if (!job) break;
    options.onProgress?.(`Processando ${job.kind} ${job.id} (tentativa ${job.attempts}).`);
    try {
      const outcome = await processJob(options.client, job, options.sources, options.modelFactory);
      await finalizarJob(options.client, job.id, workerId, outcome.status, outcome.result);
      if (outcome.status === "completed") summary.jobsCompleted++;
      else summary.jobsIncomplete++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await finalizarJob(options.client, job.id, workerId, "retry", {}, message,
        Math.min(3600, 60 * 2 ** Math.min(job.attempts, 6)));
      summary.jobsRetried++;
    }
  }
  return summary;
}

/** Núcleo reutilizável por CLI, GitHub Actions e futuro VTT. */
export async function executarCiclo(options: WorkerOptions): Promise<CycleSummary> {
  const workerId = options.workerId ?? `ruptura-${randomUUID()}`;
  const startedAt = new Date().toISOString();
  const crawlJob = await iniciarCrawlJob(options.client, randomUUID(), workerId);
  let previous: Map<string, AgentSource>;
  let crawl: CrawlResult;
  let persisted: { jobs: number; removed: number };
  try {
    previous = await lerSources(options.client);
    crawl = await rastrearCorpus(options.notion, previous);
    persisted = await persistirCorpusComJobs(options.client, crawl.sources, previous, startedAt);
    await finalizarJob(options.client, crawlJob.id, workerId, "completed", {
      sources: crawl.sources.length, requests: crawl.requests, jobsCreated: persisted.jobs,
      sourcesRemoved: persisted.removed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizarJob(options.client, crawlJob.id, workerId, "failed", {}, message);
    throw error;
  }
  const summary: CycleSummary = { crawl, jobsCreated: persisted.jobs, sourcesRemoved: persisted.removed,
    jobsCompleted: 0, jobsRetried: 0, jobsIncomplete: 0, bootstrap: previous.size === 0 };
  if (summary.bootstrap) return summary; // Bootstrap A: corpus completo, sem auditoria.
  const sources = [...(await lerSources(options.client)).values()];
  const processed = await processarJobsPendentes({ client: options.client, sources, modelFactory: options.modelFactory,
    maxJobs: options.maxJobs, workerId, onProgress: options.onProgress });
  Object.assign(summary, processed);
  return summary;
}
