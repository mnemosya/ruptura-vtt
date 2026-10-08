import { SourceGraph } from "../graph";
import { SourceSearch, type SearchDomain } from "../search";
import type { AgentBlock, AgentSource, SourceRole } from "../types";
import { notionId } from "../config";
import type { DomainToolName } from "./types";

function arg(args: Record<string, unknown>, key: string, max = 200): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`Argumento inválido: ${key}`);
  return value.trim();
}

function blockText(block: AgentBlock): string {
  const data = block.data as Record<string, unknown> | null;
  const rich = data?.rich_text;
  return Array.isArray(rich) ? rich.map((part) => String((part as Record<string, unknown>).plain_text ?? "")).join("") : "";
}

function findBlock(blocks: AgentBlock[], id: string): AgentBlock | undefined {
  for (const block of blocks) {
    if (block.id === id) return block;
    const child = findBlock(block.children, id);
    if (child) return child;
  }
  return undefined;
}

export class DomainTools {
  private readonly corpus: Map<string, AgentSource>;
  private readonly search: SourceSearch;
  private readonly graph: SourceGraph;

  constructor(sources: AgentSource[]) {
    this.corpus = new Map(sources.map((source) => [source.notion_id, source]));
    this.search = new SourceSearch(sources);
    this.graph = new SourceGraph(sources);
  }

  execute(name: DomainToolName, args: Record<string, unknown>): unknown {
    switch (name) {
      case "searchSources": {
        const domain = args.domain ?? "rules";
        if (!["rules", "editorial", "design", "historical", "all"].includes(String(domain))) throw new Error("Domínio inválido");
        return this.search.search(arg(args, "query"), { domain: domain as SearchDomain, limit: 10 });
      }
      case "findOccurrences": return this.search.search(arg(args, "term"), { domain: "rules", limit: 20 });
      case "readSource": {
        const source = this.source(arg(args, "sourceId", 64));
        return { id: source.notion_id, title: source.title, role: source.role, path: source.path,
          revision: source.snapshot_hash, properties: source.properties,
          text: source.plain_text.slice(0, 12_000), truncated: source.plain_text.length > 12_000 };
      }
      case "readBlocks": {
        const source = this.source(arg(args, "sourceId", 64));
        const ids = args.blockIds;
        if (!Array.isArray(ids) || ids.length > 5 || ids.some((id) => typeof id !== "string" || id.length > 64))
          throw new Error("blockIds inválidos");
        return ids.map((id) => {
          const block = findBlock(source.structure.blocks ?? [], notionId(id));
          return block ? { id: block.id, type: block.type, text: blockText(block), data: block.data, children: block.children.map((child) => child.id) } : { id, missing: true };
        });
      }
      case "incomingLinks": return this.graph.incomingLinks(arg(args, "sourceId", 64));
      case "outgoingLinks": return this.graph.outgoingLinks(arg(args, "sourceId", 64));
      case "readEditorialGuide": return this.guide("editorial_guide", args);
      case "readDesignGuide": return this.guide("design_guide", args);
      case "compareSources": {
        const first = this.source(arg(args, "firstSourceId", 64));
        const second = this.source(arg(args, "secondSourceId", 64));
        return [first, second].map((source) => ({ id: source.notion_id, title: source.title,
          role: source.role, path: source.path, revision: source.snapshot_hash,
          text: source.plain_text.slice(0, 8_000) }));
      }
      default: throw new Error(`Ferramenta não permitida: ${name}`);
    }
  }

  private source(id: string): AgentSource {
    const source = this.corpus.get(notionId(id));
    if (!source || !source.active) throw new Error("Fonte ausente ou inativa");
    return source;
  }

  private guide(role: SourceRole, args: Record<string, unknown>): unknown {
    const query = typeof args.query === "string" ? args.query.trim().slice(0, 200) : "";
    const guides = [...this.corpus.values()].filter((source) => source.active && source.role === role);
    if (!query) return guides.map((source) => ({ id: source.notion_id, title: source.title, path: source.path }));
    const hits = this.search.search(query, { domain: role === "editorial_guide" ? "editorial" : "design", limit: 20 });
    return hits.filter((hit) => hit.role === role);
  }
}
