import type { AgentSource } from "./types";
import { notionId } from "./config";

const NOTION_ID = /[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function refs(value: unknown, found: Set<string>): void {
  if (Array.isArray(value)) { value.forEach((item) => refs(item, found)); return; }
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  if (object.type === "mention" && object.mention && typeof object.mention === "object") {
    const mention = object.mention as Record<string, unknown>;
    const target = mention.page as Record<string, unknown> | undefined;
    if (typeof target?.id === "string") found.add(notionId(target.id));
  }
  if (object.type === "link_to_page") {
    const data = object.data as Record<string, unknown> | undefined;
    for (const candidate of [data?.page_id, data?.database_id]) {
      if (typeof candidate === "string") found.add(notionId(candidate));
    }
  }
  for (const [key, child] of Object.entries(object)) {
    if (["href", "url"].includes(key) && typeof child === "string" && /notion\.so|notion\.site/.test(child)) {
      for (const match of child.matchAll(NOTION_ID)) found.add(notionId(match[0]));
    } else refs(child, found);
  }
}

/** Grafo derivado do snapshot, limitado às fontes conhecidas e ativas. */
export class SourceGraph {
  private readonly outgoing = new Map<string, Set<string>>();
  private readonly incoming = new Map<string, Set<string>>();

  constructor(sources: AgentSource[]) {
    const known = new Set(sources.map((source) => source.notion_id));
    const active = new Map(sources.filter((source) => source.active).map((source) => [source.notion_id, source]));
    for (const source of active.values()) {
      const found = new Set<string>();
      refs(source.structure, found);
      refs(source.properties, found);
      found.delete(source.notion_id);
      const targets = new Set([...found].filter((id) => known.has(id)));
      this.outgoing.set(source.notion_id, targets);
      for (const target of targets) {
        if (!this.incoming.has(target)) this.incoming.set(target, new Set());
        this.incoming.get(target)!.add(source.notion_id);
      }
    }
  }

  outgoingLinks(sourceId: string): string[] { return [...(this.outgoing.get(notionId(sourceId)) ?? [])]; }
  incomingLinks(sourceId: string): string[] { return [...(this.incoming.get(notionId(sourceId)) ?? [])]; }
}
