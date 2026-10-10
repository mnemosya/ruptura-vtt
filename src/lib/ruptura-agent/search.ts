import type { AgentBlock, AgentSource, SourceRole } from "./types";

export type SearchDomain = "rules" | "editorial" | "design" | "historical" | "all";

export interface SearchHit {
  sourceId: string;
  blockId: string | null;
  headingPath: string[];
  snippet: string;
  role: SourceRole;
  score: number;
  path: string[];
}

interface Segment {
  source: AgentSource;
  blockId: string | null;
  headingPath: string[];
  text: string;
  code: string[];
  heading: string;
}

export function normalizarBusca(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function textOf(value: unknown): string {
  if (Array.isArray(value)) return value.map(textOf).join("");
  if (!value || typeof value !== "object") return "";
  const object = value as Record<string, unknown>;
  if (typeof object.plain_text === "string") return object.plain_text;
  if (typeof object.content === "string") return object.content;
  if (typeof object.title === "string") return object.title;
  return Object.entries(object).filter(([key]) => !["annotations", "children", "url", "href", "id", "link", "color"].includes(key))
    .map(([, item]) => textOf(item)).join(" ");
}

function codeTerms(value: unknown, result: string[] = []): string[] {
  if (Array.isArray(value)) { value.forEach((item) => codeTerms(item, result)); return result; }
  if (!value || typeof value !== "object") return result;
  const object = value as Record<string, unknown>;
  const annotation = object.annotations as Record<string, unknown> | undefined;
  if (annotation?.code && typeof object.plain_text === "string") result.push(object.plain_text);
  for (const item of Object.values(object)) codeTerms(item, result);
  return result;
}

function segmentsOf(source: AgentSource): Segment[] {
  const segments: Segment[] = [{ source, blockId: null, headingPath: [],
    text: [source.title, source.path.join(" "), textOf(source.properties)].join(" "), code: [], heading: "" }];
  const headings: string[] = [];
  function visit(blocks: AgentBlock[]): void {
    for (const block of blocks) {
      const text = textOf(block.data).trim();
      const previous = block.type === "toggle" ? [...headings] : null;
      if (/^heading_[1-4]$/.test(block.type)) {
        const level = Number(block.type.slice(-1));
        headings.splice(level - 1);
        headings[level - 1] = text;
      } else if (block.type === "toggle" && text) {
        headings.push(text);
      }
      if (text) segments.push({ source, blockId: block.id, headingPath: headings.filter(Boolean), text,
        code: codeTerms(block.data), heading: /^heading_[1-4]$/.test(block.type) || block.type === "toggle" ? text : "" });
      visit(block.children);
      if (previous) { headings.length = 0; headings.push(...previous); }
    }
  }
  visit(source.structure.blocks ?? []);
  return segments;
}

function roleAllowed(role: SourceRole, domain: SearchDomain): boolean {
  if (domain === "all") return true;
  if (domain === "historical") return role === "historical_version" || role === "patch_notes";
  if (domain === "editorial") return role === "editorial_guide" || role === "book";
  if (domain === "design") return role === "design_guide" || role === "book";
  return role === "book";
}

function score(segment: Segment, query: string, words: string[], domain: SearchDomain): number {
  const text = normalizarBusca(segment.text);
  const title = normalizarBusca(segment.source.title);
  const heading = normalizarBusca(segment.heading);
  const code = segment.code.map(normalizarBusca);
  const path = normalizarBusca(segment.source.path.join(" "));
  const headingPath = normalizarBusca(segment.headingPath.join(" "));
  let score = 0;
  if (title === query) score = 120;
  else if (code.includes(query)) score = 110;
  else if (heading === query) score = 100;
  else if (text.includes(query)) score = 75;
  else if (words.every((word) => text.includes(word))) score = 55;
  else {
    const matched = words.filter((word) => text.includes(word)).length;
    if (matched) score = Math.round(25 * matched / words.length);
  }
  if (!score && headingPath.includes(query)) score = 18;
  if (!score && path.includes(query)) score = 15;
  if (score && title.includes(query)) score += 12;
  if (score && headingPath.includes(query)) score += 8;
  if (score && domain === "editorial" && segment.source.role === "editorial_guide") score += 20;
  if (score && domain === "design" && segment.source.role === "design_guide") score += 20;
  return score;
}

export class SourceSearch {
  private readonly segments: Segment[];

  constructor(sources: AgentSource[]) {
    this.segments = sources.filter((source) => source.active).flatMap(segmentsOf);
  }

  search(query: string, options: { domain?: SearchDomain; limit?: number } = {}): SearchHit[] {
    const normalized = normalizarBusca(query);
    if (!normalized) return [];
    const domain = options.domain ?? "rules";
    const words = normalized.split(" ");
    const hits = this.segments.filter((segment) => roleAllowed(segment.source.role, domain))
      .map((segment) => ({ segment, score: score(segment, normalized, words, domain) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.segment.source.path.join("/").localeCompare(b.segment.source.path.join("/")));
    return hits.slice(0, options.limit ?? 20).map(({ segment, score }) => ({
      sourceId: segment.source.notion_id, blockId: segment.blockId,
      headingPath: segment.headingPath, snippet: segment.text.slice(0, 300),
      role: segment.source.role, score, path: segment.source.path,
    }));
  }
}
