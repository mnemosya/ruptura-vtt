import type { AgentSource } from "./types";
import { DomainTools } from "./model/tools";
import type { AgentModel, DomainToolName, ModelUsage, SemanticFinding, ToolResult } from "./model/types";

export interface AgentBudgets {
  maxSearches: number;
  maxSourceReads: number;
  maxToolCalls: number;
  maxAgentTurns: number;
  maxInputTokens: number;
  maxOutputTokens: number;
}

export const DEFAULT_BUDGETS: AgentBudgets = {
  maxSearches: 8, maxSourceReads: 12, maxToolCalls: 24,
  maxAgentTurns: 12, maxInputTokens: 45_000, maxOutputTokens: 8_000,
};

export interface AgentRunResult {
  status: "completed" | "incomplete";
  findings: SemanticFinding[];
  rejectedFindings: number;
  usage: ModelUsage;
  toolCalls: number;
  reason?: string;
}

function textInBlock(value: unknown): string {
  if (Array.isArray(value)) return value.map(textInBlock).join("");
  if (!value || typeof value !== "object") return "";
  const item = value as Record<string, unknown>;
  if (typeof item.plain_text === "string") return item.plain_text;
  if (typeof item.content === "string") return item.content;
  return Object.entries(item).filter(([key]) => !["annotations", "children", "id", "href", "url"].includes(key))
    .map(([, child]) => textInBlock(child)).join(" ");
}

function findBlock(source: AgentSource, id: string): string | null {
  const pending = [...(source.structure.blocks ?? [])];
  while (pending.length) {
    const block = pending.pop()!;
    if (block.id === id) return textInBlock(block.data);
    pending.push(...block.children);
  }
  return null;
}

export function validarFinding(value: unknown, corpus: ReadonlyMap<string, AgentSource>): value is SemanticFinding {
  if (!value || typeof value !== "object") return false;
  const finding = value as Record<string, unknown>;
  if (!["editorial", "rule_consistency", "cross_reference", "design_consistency", "source_conflict", "terminology"].includes(String(finding.category))) return false;
  if (!["high", "medium", "low", "info"].includes(String(finding.severity))) return false;
  if (typeof finding.confidence !== "number" || finding.confidence < 0 || finding.confidence > 1) return false;
  for (const key of ["title", "description", "rationale", "suggestedAction"])
    if (typeof finding[key] !== "string" || !finding[key] || finding[key].length > 2000) return false;
  if ((finding.rationale as string).length > 500) return false;
  if (!Array.isArray(finding.evidence) || !finding.evidence.length || finding.evidence.length > 8) return false;
  if (!Array.isArray(finding.relatedSources) || finding.relatedSources.some((id) => typeof id !== "string" || !corpus.has(id))) return false;
  const evidenceValid = finding.evidence.every((item) => {
    if (!item || typeof item !== "object") return false;
    const evidence = item as Record<string, unknown>;
    if (typeof evidence.sourceId !== "string" || typeof evidence.blockId !== "string" ||
        typeof evidence.excerpt !== "string" || evidence.excerpt.trim().length < 5 || evidence.excerpt.length > 500) return false;
    const source = corpus.get(evidence.sourceId);
    if (!source || !source.active || source.role === "historical_version") return false;
    const text = findBlock(source, evidence.blockId);
    return text !== null && text.includes(evidence.excerpt);
  });
  if (!evidenceValid) return false;
  const evidenceSources = (finding.evidence as { sourceId: string }[]).map((item) => corpus.get(item.sourceId)!);
  if (finding.category === "source_conflict" && new Set(evidenceSources.map((source) => source.notion_id)).size < 2) return false;
  if (finding.category === "rule_consistency" && !evidenceSources.some((source) => source.role === "book")) return false;
  if (finding.category === "editorial" && !evidenceSources.some((source) => source.role === "editorial_guide")) return false;
  if (finding.category === "design_consistency" && !evidenceSources.some((source) => source.role === "design_guide")) return false;
  return true;
}

const SEARCH_TOOLS = new Set<DomainToolName>(["searchSources", "findOccurrences", "readEditorialGuide", "readDesignGuide"]);
const READ_TOOLS = new Set<DomainToolName>(["readSource", "readBlocks", "compareSources"]);

/** Modelo só recebe evidência por ferramentas de domínio; nenhum cliente ou segredo é exposto. */
export async function executarAuditoriaSemantica(
  model: AgentModel, task: string, sources: AgentSource[], budgets: AgentBudgets = DEFAULT_BUDGETS,
): Promise<AgentRunResult> {
  if (!task.trim() || task.length > 4000) throw new Error("Tarefa semântica inválida");
  const tools = new DomainTools(sources);
  const corpus = new Map(sources.map((source) => [source.notion_id, source]));
  const usage = { inputTokens: 0, outputTokens: 0 };
  let searches = 0;
  let reads = 0;
  let toolCalls = 0;
  let results: ToolResult[] = [];
  const incomplete = (reason: string): AgentRunResult => ({ status: "incomplete", findings: [], rejectedFindings: 0, usage, toolCalls, reason });

  for (let turn = 0; turn < budgets.maxAgentTurns; turn++) {
    const step = await model.next(task, results);
    if (!Number.isFinite(step.usage.inputTokens) || !Number.isFinite(step.usage.outputTokens) ||
        step.usage.inputTokens < 0 || step.usage.outputTokens < 0)
      return incomplete("Modelo não informou uso de tokens válido.");
    usage.inputTokens += step.usage.inputTokens;
    usage.outputTokens += step.usage.outputTokens;
    if (usage.inputTokens > budgets.maxInputTokens || usage.outputTokens > budgets.maxOutputTokens)
      return incomplete("Limite de tokens atingido.");
    if (step.kind === "final") {
      const output = step.output as Record<string, unknown> | null;
      if (!output || !Array.isArray(output.findings)) return incomplete("Saída do modelo fora do schema.");
      const findings = output.findings.filter((item): item is SemanticFinding => validarFinding(item, corpus));
      if (output.findings.length && !findings.length)
        return { status: "incomplete", findings: [], rejectedFindings: output.findings.length, usage, toolCalls,
          reason: "Todos os achados do modelo falharam na validação de evidências." };
      return { status: "completed", findings, rejectedFindings: output.findings.length - findings.length, usage, toolCalls };
    }
    if (!step.calls.length) return incomplete("O modelo não retornou ferramentas nem resultado.");
    results = [];
    for (const call of step.calls) {
      toolCalls++;
      if (toolCalls > budgets.maxToolCalls) return incomplete("Limite de ferramentas atingido.");
      if (SEARCH_TOOLS.has(call.name) && ++searches > budgets.maxSearches) return incomplete("Limite de buscas atingido.");
      if (READ_TOOLS.has(call.name) && (reads += call.name === "compareSources" ? 2 : 1) > budgets.maxSourceReads)
        return incomplete("Limite de leituras atingido.");
      try {
        const output = tools.execute(call.name, call.arguments);
        const serialized = JSON.stringify(output);
        results.push({ id: call.id, name: call.name, output: serialized.length > 16_000 ? serialized.slice(0, 16_000) : output });
      } catch (error) {
        results.push({ id: call.id, name: call.name, output: { error: error instanceof Error ? error.message : "Falha na ferramenta" } });
      }
    }
  }
  return incomplete("Limite de turnos atingido.");
}
