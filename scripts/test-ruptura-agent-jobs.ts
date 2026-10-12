import assert from "node:assert/strict";
import { criarSnapshot, normalizarBloco } from "../src/lib/ruptura-agent/snapshot";
import { diferenciarFonte, finalizarJob, persistirCorpusComJobs, reivindicarJob } from "../src/lib/ruptura-agent/jobs";
import type { SupabaseClient } from "@supabase/supabase-js";

const id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const blockId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
function source(text: string, code: boolean, position = 0) {
  const block = normalizarBloco({ id: blockId, type: "paragraph", has_children: false,
    paragraph: { rich_text: [{ type: "text", plain_text: text, text: { content: text }, annotations: { code } }] } });
  const other = normalizarBloco({ id: "cccccccccccccccccccccccccccccccc", type: "heading_2", heading_2: { rich_text: [] } });
  return criarSnapshot({ notionId: id, sourceType: "page", role: "book", title: "Livro", path: ["Livro"],
    rootSection: "Livro", parentNotionId: null, properties: {},
    structure: { blocks: position ? [other, block] : [block, other] } });
}

const original = source("1 PA", false);
const formatted = source("1 PA", true);
const textChanged = source("2 PA", false);
assert.notEqual(original.snapshot_hash, formatted.snapshot_hash);
assert.deepEqual(diferenciarFonte(original, formatted).formatChangedBlocks, [blockId]);
assert.deepEqual(diferenciarFonte(original, textChanged).textChangedBlocks, [blockId]);
assert.deepEqual(diferenciarFonte(original, source("1 PA", false, 1)).movedBlocks.sort(), [blockId, "cccccccccccccccccccccccccccccccc"].sort());
assert.equal(diferenciarFonte(original, original).kind, "unchanged");
assert.equal(diferenciarFonte(undefined, original).kind, "created");
assert.equal(diferenciarFonte({ ...original, active: false }, original).kind, "reactivated");

const calls: { name: string; args: Record<string, unknown> }[] = [];
const client = { rpc: async (name: string, args: Record<string, unknown>) => {
  calls.push({ name, args });
  if (name === "persist_ruptura_agent_batch") return { data: 1, error: null };
  if (name === "sweep_ruptura_agent_sources") return { data: 2, error: null };
  if (name === "claim_ruptura_agent_job") return { data: { id: "job", attempts: 1 }, error: null };
  return { data: { id: "job", status: "completed" }, error: null };
} } as unknown as SupabaseClient;

const persisted = await persistirCorpusComJobs(client, [formatted], new Map([[id, original]]), "2026-10-07T12:00:00.000Z");
assert.deepEqual(persisted, { jobs: 1, removed: 2 });
assert.deepEqual(calls.map((call) => call.name), ["persist_ruptura_agent_batch", "sweep_ruptura_agent_sources"]);
const items = calls[0].args.p_items as { diff: ReturnType<typeof diferenciarFonte> }[];
assert.deepEqual(items[0].diff.formatChangedBlocks, [blockId]);
assert.equal((await reivindicarJob(client, "worker-1"))?.attempts, 1);
assert.equal((await finalizarJob(client, "job", "worker-1", "completed"))?.status, "completed");
const emptyQueueClient = { rpc: async () => ({ data: { id: null, kind: null, input: null }, error: null }) } as unknown as SupabaseClient;
assert.equal(await reivindicarJob(emptyQueueClient, "worker-1"), null, "PostgREST retorna rowtype com colunas nulas para fila vazia");

const failingCalls: string[] = [];
const failingClient = { rpc: async (name: string) => {
  failingCalls.push(name); return { data: null, error: { message: "falha" } };
} } as unknown as SupabaseClient;
await assert.rejects(() => persistirCorpusComJobs(failingClient, [original], new Map(), "2026-10-07T12:00:00.000Z"), /falha/);
assert.deepEqual(failingCalls, ["persist_ruptura_agent_batch"]); // falha parcial jamais faz sweep

console.log("test-ruptura-agent-jobs — diff, persistência, claim e falha: OK");
