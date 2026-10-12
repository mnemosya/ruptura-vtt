import type { AgentModel, DomainToolName, ModelStep, ToolResult } from "./types";

const objectSchema = (properties: Record<string, unknown>) => ({
  type: "object", properties, required: Object.keys(properties), additionalProperties: false,
});
const string = { type: "string" };
const toolDefs: { name: DomainToolName; description: string; parameters: unknown }[] = [
  { name: "searchSources", description: "Pesquisa fontes pelo texto; domínio rules, editorial, design, historical ou all.", parameters: objectSchema({ query: string, domain: { type: "string", enum: ["rules", "editorial", "design", "historical", "all"] } }) },
  { name: "readSource", description: "Lê o texto e metadados de uma fonte ativa pelo ID Notion.", parameters: objectSchema({ sourceId: string }) },
  { name: "readBlocks", description: "Lê até cinco blocos exatos de uma fonte.", parameters: objectSchema({ sourceId: string, blockIds: { type: "array", items: string } }) },
  { name: "findOccurrences", description: "Busca ocorrências de um termo no livro atual.", parameters: objectSchema({ term: string }) },
  { name: "incomingLinks", description: "Lista fontes que apontam para esta fonte.", parameters: objectSchema({ sourceId: string }) },
  { name: "outgoingLinks", description: "Lista fontes apontadas por esta fonte.", parameters: objectSchema({ sourceId: string }) },
  { name: "readEditorialGuide", description: "Busca convenções no Guia Editorial; query vazia lista guias.", parameters: objectSchema({ query: string }) },
  { name: "readDesignGuide", description: "Busca princípios no Guia de Design; query vazia lista guias.", parameters: objectSchema({ query: string }) },
  { name: "compareSources", description: "Mostra lado a lado duas fontes, seus papéis e texto.", parameters: objectSchema({ firstSourceId: string, secondSourceId: string }) },
];
const tools = toolDefs.map((tool) => ({ ...tool, type: "function" as const, strict: true as const }));

const findingSchema = objectSchema({
  category: { type: "string", enum: ["editorial", "rule_consistency", "cross_reference", "design_consistency", "source_conflict", "terminology"] },
  severity: { type: "string", enum: ["high", "medium", "low", "info"] },
  confidence: { type: "number", minimum: 0, maximum: 1 },
  title: string, description: string, rationale: string,
  evidence: { type: "array", items: objectSchema({ sourceId: string, blockId: string, excerpt: string }) },
  relatedSources: { type: "array", items: string }, suggestedAction: string,
});

interface ResponseItem {
  type: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: { type: string; text?: string }[];
  [key: string]: unknown;
}

interface ResponseBody {
  status: string;
  output: ResponseItem[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

export interface OpenAIModelOptions {
  apiKey: string;
  model: string;
  maxOutputTokens?: number;
  fetchImpl?: typeof fetch;
}

/** Adaptador isolado da Responses API. Histórico, inclusive reasoning cifrado, só vive na instância. */
export class OpenAIResponsesModel implements AgentModel {
  private readonly history: unknown[] = [];
  private readonly fetchImpl: typeof fetch;
  private started = false;

  constructor(private readonly options: OpenAIModelOptions) {
    if (!options.apiKey || !options.model) throw new Error("MODEL_API_KEY e MODEL_NAME são necessários.");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async next(task: string, results: ToolResult[]): Promise<ModelStep> {
    if (!this.started) {
      this.history.push({ role: "user", content: task });
      this.started = true;
    } else {
      for (const result of results) this.history.push({ type: "function_call_output", call_id: result.id,
        output: JSON.stringify(result.output) });
    }
    const response = await this.fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.options.model, store: false, include: ["reasoning.encrypted_content"],
        instructions: "Você audita RUPTURA v1.2. Use somente evidências das ferramentas. Expanda as consultas com sinônimos quando a primeira busca não localizar a regra. Livro atual rege mecânica; Guia Editorial rege convenções editoriais; Guia de Design rege princípios de design. Para achados editoriais ou de design, cite o respectivo guia com trecho exato. Para conflitos, cite pelo menos duas fontes. Versões históricas não respondem perguntas sobre regras atuais. Exponha conflitos sem escolher silenciosamente. Nunca invente blocos ou evidências. Rationale breve. Responda findings vazio se não houver evidência suficiente.",
        input: this.history, tools, tool_choice: "auto", parallel_tool_calls: false,
        max_output_tokens: this.options.maxOutputTokens ?? 1500,
        text: { format: { type: "json_schema", name: "ruptura_findings", strict: true,
          schema: objectSchema({ findings: { type: "array", items: findingSchema } }) } },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) throw new Error(`Falha na API do modelo: HTTP ${response.status}`);
    const body = await response.json() as ResponseBody;
    if (body.status !== "completed" || !Array.isArray(body.output)) throw new Error(`Resposta incompleta do modelo: ${body.status}`);
    if (!Number.isFinite(body.usage?.input_tokens) || !Number.isFinite(body.usage?.output_tokens))
      throw new Error("Resposta do modelo sem medição de tokens.");
    this.history.push(...body.output);
    const usage = { inputTokens: body.usage!.input_tokens!, outputTokens: body.usage!.output_tokens! };
    const calls = body.output.filter((item) => item.type === "function_call").map((item) => {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(item.arguments ?? "{}"); } catch { args = {}; }
      return { id: item.call_id ?? "", name: item.name as DomainToolName, arguments: args };
    });
    if (calls.length) return { kind: "tools", calls, usage };
    const text = body.output.filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text")
      .map((item) => item.text ?? "").join("");
    let output: unknown;
    try { output = JSON.parse(text); } catch { output = null; }
    return { kind: "final", output, usage };
  }
}
