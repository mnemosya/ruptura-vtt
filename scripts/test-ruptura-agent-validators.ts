import assert from "node:assert/strict";
import { criarSnapshot, normalizarBloco } from "../src/lib/ruptura-agent/snapshot";
import { auditarCorpus, persistirAuditoriaDeterministica } from "../src/lib/ruptura-agent/findings";
import type { AgentSource, SourceRole } from "../src/lib/ruptura-agent/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const sourceId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const targetId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const blockId = "cccccccccccccccccccccccccccccccc";
function make(role: SourceRole, text: string, targetActive: boolean): AgentSource[] {
  const source = criarSnapshot({ notionId: sourceId, sourceType: "page", role, title: "CENAS DE COMBATE",
    path: ["O JOGO EM MOVIMENTO", "CENAS DE COMBATE"], rootSection: "O JOGO EM MOVIMENTO", parentNotionId: null,
    structure: { blocks: [normalizarBloco({ id: blockId, type: "paragraph", paragraph: { rich_text: [
      { type: "text", plain_text: text, text: { content: text } },
      { type: "mention", plain_text: "regra antiga", mention: { type: "page", page: { id: targetId } } },
    ] } })] } });
  const target = criarSnapshot({ notionId: targetId, sourceType: "page", role: "book", title: "REGRA ANTIGA",
    path: ["REGRA ANTIGA"], rootSection: null, parentNotionId: null, structure: { blocks: [] } });
  return [source, { ...target, active: targetActive }];
}

const corpus = make("book", "Custa 1PA para agir.", false);
const audit = auditarCorpus(corpus);
assert.equal(audit.findings.length, 2);
assert.equal(audit.findings.find((finding) => finding.detector === "deterministic:pa_spacing")?.evidence[0].blockId, blockId);
assert.equal(audit.findings.find((finding) => finding.detector === "deterministic:inactive_link")?.evidence[0].targetSourceId, targetId);
assert.equal(auditarCorpus(make("book", "Custa 1 PA para agir.", true)).findings.length, 0);
assert.equal(auditarCorpus(make("historical_version", "Custa 1PA para agir.", false)).findings.length, 0);

const calls: { name: string; args: Record<string, unknown> }[] = [];
const client = { rpc: async (name: string, args: Record<string, unknown>) => {
  calls.push({ name, args }); return { data: (args.p_findings as unknown[]).length, error: null };
} } as unknown as SupabaseClient;
assert.equal(await persistirAuditoriaDeterministica(client, corpus), 2);
assert.equal(calls.length, 1);
assert.equal(calls[0].args.p_revision, corpus[0].snapshot_hash);
assert.deepEqual(calls[0].args.p_detectors, ["deterministic:pa_spacing", "deterministic:inactive_link"]);

console.log("test-ruptura-agent-validators — contexto, evidências, links e persistência: OK");
