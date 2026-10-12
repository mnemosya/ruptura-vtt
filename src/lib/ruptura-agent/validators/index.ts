import { createHash } from "node:crypto";
import type { AgentBlock, AgentSource } from "../types";

export const DETERMINISTIC_DETECTORS = ["deterministic:pa_spacing", "deterministic:inactive_link"] as const;
export type DeterministicDetector = typeof DETERMINISTIC_DETECTORS[number];

export interface FindingEvidence {
  sourceId: string;
  blockId: string;
  excerpt: string;
  targetSourceId?: string;
}

export interface CandidateFinding {
  fingerprint: string;
  category: "editorial" | "cross_reference";
  detector: DeterministicDetector;
  severity: "low" | "medium";
  confidence: number;
  blockId: string;
  title: string;
  description: string;
  rationale: string;
  evidence: FindingEvidence[];
  suggestedAction: string;
}

function fingerprint(detector: string, sourceId: string, blockId: string, detail: string): string {
  return createHash("sha256").update(JSON.stringify([detector, sourceId, blockId, detail])).digest("hex");
}

function richText(block: AgentBlock): string {
  const data = block.data as Record<string, unknown> | null;
  const rich = data?.rich_text;
  return Array.isArray(rich) ? rich.map((item) => {
    const piece = item as Record<string, unknown>;
    return String(piece.plain_text ?? (piece.text as Record<string, unknown> | undefined)?.content ?? "");
  }).join("") : "";
}

function scanLinks(value: unknown, targets: Set<string>): void {
  if (Array.isArray(value)) { value.forEach((item) => scanLinks(item, targets)); return; }
  if (!value || typeof value !== "object") return;
  const item = value as Record<string, unknown>;
  if (item.type === "mention" && item.mention && typeof item.mention === "object") {
    const page = (item.mention as Record<string, unknown>).page as Record<string, unknown> | undefined;
    if (typeof page?.id === "string") targets.add(page.id.replace(/-/g, "").toLowerCase());
  }
  for (const [key, child] of Object.entries(item)) {
    if ((key === "page_id" || key === "database_id") && typeof child === "string") targets.add(child.replace(/-/g, "").toLowerCase());
    if ((key === "href" || key === "url") && typeof child === "string" && /notion\.so|notion\.site/.test(child)) {
      for (const match of child.matchAll(/[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi))
        targets.add(match[0].replace(/-/g, "").toLowerCase());
    } else scanLinks(child, targets);
  }
}

/** Regras aplicadas somente ao livro atual, inclusive rows canônicas. */
export function auditarFonte(source: AgentSource, corpus: ReadonlyMap<string, AgentSource>): CandidateFinding[] {
  if (!source.active || source.role !== "book") return [];
  const findings: CandidateFinding[] = [];
  function visit(blocks: AgentBlock[]): void {
    for (const block of blocks) {
      const text = richText(block);
      const pa = /(?<![\p{L}\p{N}])(\d+)PA\b/gu;
      for (const match of text.matchAll(pa)) {
        const excerpt = text.slice(Math.max(0, match.index - 35), Math.min(text.length, match.index + match[0].length + 35));
        findings.push({
          fingerprint: fingerprint("pa_spacing", source.notion_id, block.id, match[0]),
          category: "editorial", detector: "deterministic:pa_spacing", severity: "low", confidence: 1,
          blockId: block.id, title: `Espaço ausente em ${match[0]}`,
          description: `O bloco usa “${match[0]}”; a forma esperada é “${match[1]} PA”.`,
          rationale: "A abreviação PA deve ser separada do número.",
          evidence: [{ sourceId: source.notion_id, blockId: block.id, excerpt }],
          suggestedAction: `Substituir “${match[0]}” por “${match[1]} PA” no Notion após revisão editorial.`,
        });
      }
      const targets = new Set<string>();
      scanLinks(block.data, targets);
      for (const target of targets) {
        const linked = corpus.get(target);
        if (!linked || linked.active) continue; // Destino externo ao corpus não é presumido quebrado.
        findings.push({
          fingerprint: fingerprint("inactive_link", source.notion_id, block.id, target),
          category: "cross_reference", detector: "deterministic:inactive_link", severity: "medium", confidence: 1,
          blockId: block.id, title: "Referência a fonte inativa",
          description: `O bloco aponta para “${linked.title}”, que não foi encontrado no último crawl completo.`,
          rationale: "A fonte de destino está marcada como inativa no corpus.",
          evidence: [{ sourceId: source.notion_id, blockId: block.id, excerpt: text || block.type, targetSourceId: target }],
          suggestedAction: "Conferir o destino no Notion e atualizar a referência se necessário.",
        });
      }
      visit(block.children);
    }
  }
  visit(source.structure.blocks ?? []);
  return [...new Map(findings.map((finding) => [finding.fingerprint, finding])).values()];
}
