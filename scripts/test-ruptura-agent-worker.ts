import assert from "node:assert/strict";
import { executarCiclo, processarJobsPendentes } from "../src/lib/ruptura-agent/worker";
import { ROOT_PAGE_ID } from "../src/lib/ruptura-agent/config";
import type { AgentNotionReader, AgentSource, NotionObject } from "../src/lib/ruptura-agent/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const root = ROOT_PAGE_ID;
const chapter = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
let revision = 1;
const rich = (text: string) => ({ type: "text", plain_text: text, text: { content: text } });
const page = (id: string, title: string): NotionObject => ({ id, last_edited_time: `2026-10-07T0${revision}:00:00Z`,
  properties: { Name: { type: "title", title: [rich(title)] } } });
const notion: AgentNotionReader = {
  async page(id) { return page(id, id === root ? "RUPTURA (1.2)" : "CENAS DE COMBATE"); },
  async database() { throw new Error("unexpected database"); },
  async dataSource() { throw new Error("unexpected data source"); },
  async rows() { return []; },
  async blockChildren(id) {
    if (id === root) return [
      { id: "cccccccccccccccccccccccccccccccc", type: "heading_3", heading_3: { rich_text: [rich("O JOGO EM MOVIMENTO")] } },
      { id: chapter, type: "child_page", child_page: { title: "CENAS DE COMBATE" } },
    ];
    if (id === chapter) return [{ id: "dddddddddddddddddddddddddddddddd", type: "paragraph",
      paragraph: { rich_text: [rich(revision === 1 ? "Custa 1 PA." : "Custa 1PA.")] } }];
    return [];
  },
  requisicoes() { return 0; },
};

const sources = new Map<string, AgentSource>();
const calls: string[] = [];
const pending: { id: string; kind: string; source_revision: string; input: Record<string, unknown>; attempts: number }[] = [];
const client = {
  from(table: string) {
    assert.equal(table, "ruptura_agent_sources");
    return { select() { return { order() { return { range: async () => ({ data: [...sources.values()], error: null }) }; } }; } };
  },
  async rpc(name: string, args: Record<string, unknown>) {
    calls.push(name);
    if (name === "start_ruptura_agent_crawl") return { data: { id: `crawl-${calls.length}` }, error: null };
    if (name === "persist_ruptura_agent_batch") {
      let jobs = 0;
      for (const item of args.p_items as { source: AgentSource }[]) {
        const old = sources.get(item.source.notion_id);
        sources.set(item.source.notion_id, item.source);
        if (old?.snapshot_hash !== item.source.snapshot_hash) {
          jobs++;
          pending.push({ id: `job-${pending.length}`, kind: old ? "source_changed" : "source_created",
            source_revision: item.source.snapshot_hash, input: { notion_id: item.source.notion_id }, attempts: 1 });
        }
      }
      return { data: jobs, error: null };
    }
    if (name === "sweep_ruptura_agent_sources") return { data: 0, error: null };
    if (name === "claim_ruptura_agent_job") return { data: pending.shift() ?? null, error: null };
    if (name === "record_ruptura_agent_findings") return { data: (args.p_findings as unknown[]).length, error: null };
    if (name === "finish_ruptura_agent_job") return { data: { id: args.p_job_id, status: args.p_status }, error: null };
    throw new Error(`unexpected rpc ${name}`);
  },
} as unknown as SupabaseClient;

const first = await executarCiclo({ client, notion, workerId: "worker-test", modelFactory: () => null });
assert.equal(first.bootstrap, true);
assert.equal(first.crawl.sources.length, 2);
assert.equal(calls.includes("claim_ruptura_agent_job"), false);
revision = 2;
const second = await executarCiclo({ client, notion, workerId: "worker-test", modelFactory: () => null });
assert.equal(second.bootstrap, false);
assert.equal(second.jobsCreated, 1);
assert.equal(second.jobsCompleted >= 2, true);
assert.equal(calls.includes("record_ruptura_agent_findings"), true);
const current = sources.get(chapter)!;
pending.push({ id: "manual-bootstrap-job", kind: "source_created", source_revision: current.snapshot_hash,
  input: { notion_id: chapter }, attempts: 1 });
const crawlCallsBefore = calls.filter((name) => name === "start_ruptura_agent_crawl").length;
const drained = await processarJobsPendentes({ client, sources: [...sources.values()], workerId: "worker-manual", maxJobs: 1 });
assert.deepEqual(drained, { jobsCompleted: 1, jobsRetried: 0, jobsIncomplete: 0 });
assert.equal(calls.filter((name) => name === "start_ruptura_agent_crawl").length, crawlCallsBefore,
  "processar jobs existentes não dispara novo crawl");

console.log("test-ruptura-agent-worker — bootstrap, mudança, claim e validator: OK");
