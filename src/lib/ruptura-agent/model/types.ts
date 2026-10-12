export type DomainToolName =
  | "searchSources" | "readSource" | "readBlocks" | "findOccurrences"
  | "incomingLinks" | "outgoingLinks" | "readEditorialGuide" | "readDesignGuide" | "compareSources";

export interface ToolCall {
  id: string;
  name: DomainToolName;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  id: string;
  name: DomainToolName;
  output: unknown;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

export type ModelStep =
  | { kind: "tools"; calls: ToolCall[]; usage: ModelUsage }
  | { kind: "final"; output: unknown; usage: ModelUsage };

/** Uma instância por auditoria. Histórico da API fica apenas em memória. */
export interface AgentModel {
  next(task: string, results: ToolResult[]): Promise<ModelStep>;
}

export interface SemanticEvidence {
  sourceId: string;
  blockId: string;
  excerpt: string;
}

export interface SemanticFinding {
  category: "editorial" | "rule_consistency" | "cross_reference" | "design_consistency" | "source_conflict" | "terminology";
  severity: "high" | "medium" | "low" | "info";
  confidence: number;
  title: string;
  description: string;
  rationale: string;
  evidence: SemanticEvidence[];
  relatedSources: string[];
  suggestedAction: string;
}

export interface SemanticOutput { findings: SemanticFinding[]; }
