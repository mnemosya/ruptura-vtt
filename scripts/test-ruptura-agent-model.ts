import assert from "node:assert/strict";
import { criarSnapshot, normalizarBloco } from "../src/lib/ruptura-agent/snapshot";
import { executarAuditoriaSemantica, validarFinding } from "../src/lib/ruptura-agent/agent";
import { OpenAIResponsesModel } from "../src/lib/ruptura-agent/model/provider";
import { persistirFindingsSemanticos, semanticFingerprint } from "../src/lib/ruptura-agent/model/findings";
import type { AgentModel, ModelStep, SemanticFinding, ToolResult } from "../src/lib/ruptura-agent/model/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const sourceId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const blockId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const source = criarSnapshot({ notionId: sourceId, sourceType: "page", role: "book", title: "INVENTÁRIO",
  path: ["O JOGO EM MOVIMENTO", "INVENTÁRIO"], rootSection: "O JOGO EM MOVIMENTO", parentNotionId: null,
  structure: { blocks: [normalizarBloco({ id: blockId, type: "paragraph", paragraph: {
    rich_text: [{ type: "text", plain_text: "Sacar uma arma da mochila requer Interagir.", text: { content: "Sacar uma arma da mochila requer Interagir." } }],
  } })] } });
const finding: SemanticFinding = {
  category: "rule_consistency", severity: "medium", confidence: 0.8,
  title: "Possível impacto no inventário", description: "A regra depende de Interagir.",
  rationale: "O trecho cita Interagir ao sacar a arma.",
  evidence: [{ sourceId, blockId, excerpt: "Sacar uma arma da mochila requer Interagir." }],
  relatedSources: [sourceId], suggestedAction: "Revisar a relação com combate.",
};
assert.equal(validarFinding(finding, new Map([[sourceId, source]])), true);
assert.equal(validarFinding({ ...finding, evidence: [{ sourceId, blockId, excerpt: "trecho inventado" }] }, new Map([[sourceId, source]])), false);
assert.equal(validarFinding({ ...finding, category: "source_conflict" }, new Map([[sourceId, source]])), false);
assert.equal(validarFinding({ ...finding, category: "editorial" }, new Map([[sourceId, source]])), false);

const resultsSeen: ToolResult[][] = [];
let turn = 0;
const model: AgentModel = { async next(_task, results): Promise<ModelStep> {
  resultsSeen.push(results);
  turn++;
  if (turn === 1) return { kind: "tools", calls: [{ id: "call-1", name: "searchSources", arguments: { query: "arma mochila", domain: "rules" } }], usage: { inputTokens: 10, outputTokens: 5 } };
  if (turn === 2) return { kind: "tools", calls: [{ id: "call-2", name: "readBlocks", arguments: { sourceId, blockIds: [blockId] } }], usage: { inputTokens: 20, outputTokens: 5 } };
  return { kind: "final", output: { findings: [finding, { ...finding, evidence: [{ sourceId, blockId, excerpt: "inventado" }] }] }, usage: { inputTokens: 30, outputTokens: 10 } };
} };
const run = await executarAuditoriaSemantica(model, "Audite o inventário", [source]);
assert.equal(run.status, "completed");
assert.equal(run.findings.length, 1);
assert.equal(run.rejectedFindings, 1);
assert.equal(run.toolCalls, 2);
assert.equal(resultsSeen[1][0].id, "call-1");
assert.equal(resultsSeen[2][0].id, "call-2");
const invalidOnly = await executarAuditoriaSemantica({ next: async () => ({ kind: "final", output: {
  findings: [{ ...finding, evidence: [{ sourceId, blockId, excerpt: "inventado" }] }],
}, usage: { inputTokens: 1, outputTokens: 1 } }) }, "Audite", [source]);
assert.equal(invalidOnly.status, "incomplete");
assert.equal(invalidOnly.rejectedFindings, 1);

const limited = await executarAuditoriaSemantica({ next: async () => ({ kind: "tools", calls: [
  { id: "a", name: "searchSources", arguments: { query: "arma", domain: "rules" } },
  { id: "b", name: "searchSources", arguments: { query: "arma", domain: "rules" } },
], usage: { inputTokens: 1, outputTokens: 1 } }) }, "Busca", [source],
{ maxSearches: 1, maxSourceReads: 1, maxToolCalls: 3, maxAgentTurns: 3, maxInputTokens: 100, maxOutputTokens: 100 });
assert.equal(limited.status, "incomplete");
assert.match(limited.reason ?? "", /buscas/);

let body: Record<string, unknown> = {};
const mockFetch: typeof fetch = async (_url, init) => {
  assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer segredo-123");
  body = JSON.parse(String(init?.body));
  return new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: '{"findings":[]}' }] }],
    usage: { input_tokens: 5, output_tokens: 3 } }), { status: 200 });
};
const provider = new OpenAIResponsesModel({ apiKey: "segredo-123", model: "modelo-teste", fetchImpl: mockFetch });
const response = await provider.next("Teste", []);
assert.equal(response.kind, "final");
assert.equal(body.store, false);
assert.equal(JSON.stringify(body).includes("segredo-123"), false);
assert.equal((body.tools as unknown[]).length, 9);

const requestBodies: Record<string, unknown>[] = [];
const twoStepFetch: typeof fetch = async (_url, init) => {
  const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
  requestBodies.push(request);
  const output = requestBodies.length === 1
    ? [{ type: "reasoning", encrypted_content: "cipher" }, { type: "function_call", call_id: "call-1", name: "searchSources", arguments: '{"query":"arma","domain":"rules"}' }]
    : [{ type: "message", content: [{ type: "output_text", text: '{"findings":[]}' }] }];
  return new Response(JSON.stringify({ status: "completed", output, usage: { input_tokens: 5, output_tokens: 3 } }), { status: 200 });
};
const twoStep = new OpenAIResponsesModel({ apiKey: "segredo-123", model: "modelo-teste", fetchImpl: twoStepFetch });
assert.equal((await twoStep.next("Teste", [])).kind, "tools");
assert.equal((await twoStep.next("Teste", [{ id: "call-1", name: "searchSources", output: [] }])).kind, "final");
const history = requestBodies[1].input as Record<string, unknown>[];
assert.equal(history.some((item) => item.type === "reasoning" && item.encrypted_content === "cipher"), true);
assert.equal(history.some((item) => item.type === "function_call_output" && item.call_id === "call-1"), true);

let persisted: Record<string, unknown> = {};
const db = { rpc: async (_name: string, args: Record<string, unknown>) => {
  persisted = args; return { data: 1, error: null };
} } as unknown as SupabaseClient;
assert.equal(await persistirFindingsSemanticos(db, source, [finding], [source]), 1);
assert.equal(persisted.p_revision, source.snapshot_hash);
assert.equal((persisted.p_findings as { fingerprint: string }[])[0].fingerprint, semanticFingerprint(source, finding));
await assert.rejects(() => persistirFindingsSemanticos(db, source, [
  { ...finding, evidence: [{ sourceId, blockId, excerpt: "inventado" }] },
], [source]), /evidência/);

console.log("test-ruptura-agent-model — ferramentas, budgets, evidências e provider: OK");
