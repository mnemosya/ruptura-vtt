import { createHash } from "node:crypto";
import type { AgentBlock, AgentSource, NotionBlock, SourceRole, SourceType } from "./types";
import { notionId } from "./config";

const VOLATEIS = new Set(["created_time", "last_edited_time", "created_by", "last_edited_by", "expiry_time", "avatar_url", "request_id"]);

/** Retém dados editoriais e mecânicos, sem URLs assinadas nem metadados voláteis. */
export function normalizarValor(valor: unknown, chavePai = ""): unknown {
  if (Array.isArray(valor)) return valor.map((item) => normalizarValor(item));
  if (!valor || typeof valor !== "object") return valor;
  const objeto = valor as Record<string, unknown>;
  if (chavePai === "file") {
    const url = typeof objeto.url === "string" ? objeto.url.split("?")[0] : null;
    const assetHash = url ? createHash("sha256").update(url).digest("hex") : objeto.assetHash;
    return { sourceType: "file", ...(typeof assetHash === "string" ? { assetHash } : {}) };
  }
  const saida: Record<string, unknown> = {};
  for (const chave of Object.keys(objeto).sort()) {
    if (VOLATEIS.has(chave)) continue;
    if (chave === "url" && (chavePai === "custom_emoji" || chavePai === "file_upload")) continue;
    const item = objeto[chave];
    if (item !== undefined) saida[chave] = normalizarValor(item, chave);
  }
  return saida;
}

export function normalizarBloco(bloco: NotionBlock, children: AgentBlock[] = []): AgentBlock {
  return {
    id: notionId(bloco.id),
    type: bloco.type,
    hasChildren: !!bloco.has_children,
    data: normalizarValor(bloco[bloco.type] ?? {}),
    children,
  };
}

function strings(valor: unknown, saida: string[]): void {
  if (Array.isArray(valor)) {
    if (valor.every((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).plain_text === "string")) {
      saida.push(valor.map((item) => String((item as Record<string, unknown>).plain_text)).join(""));
      return;
    }
    for (const item of valor) strings(item, saida);
    return;
  }
  if (!valor || typeof valor !== "object") return;
  const objeto = valor as Record<string, unknown>;
  if (typeof objeto.plain_text === "string") {
    saida.push(objeto.plain_text);
    return;
  }
  if (typeof objeto.content === "string" && !objeto.plain_text) {
    saida.push(objeto.content);
    return;
  }
  if (typeof objeto.expression === "string") saida.push(objeto.expression);
  if (typeof objeto.name === "string") saida.push(objeto.name);
  if (typeof objeto.title === "string") saida.push(objeto.title);
  for (const [chave, item] of Object.entries(objeto)) {
    if (["annotations", "href", "url", "link", "id", "color", "type", "name", "title", "expression"].includes(chave)) continue;
    strings(item, saida);
  }
}

export function textoDoSnapshot(structure: AgentSource["structure"]): string {
  const partes: string[] = [];
  for (const bloco of structure.blocks ?? []) strings(bloco, partes);
  return partes.filter(Boolean).join("\n");
}

function semTexto(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(semTexto);
  if (!valor || typeof valor !== "object") return valor;
  const saida: Record<string, unknown> = {};
  for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
    if (["plain_text", "content", "expression", "title", "name"].includes(chave) && typeof item === "string") saida[chave] = "";
    else saida[chave] = semTexto(item);
  }
  return saida;
}

function hash(valor: unknown): string {
  return createHash("sha256").update(JSON.stringify(normalizarValor(valor))).digest("hex");
}

export interface SourceInput {
  notionId: string;
  sourceType: SourceType;
  role: SourceRole;
  title: string;
  path: string[];
  rootSection: string | null;
  parentNotionId: string | null;
  dataSourceNotionId?: string | null;
  notionLastEditedAt?: string | null;
  properties?: unknown;
  structure?: AgentSource["structure"];
}

export function criarSnapshot(input: SourceInput): AgentSource {
  const properties = normalizarValor(input.properties ?? {});
  const structure = normalizarValor(input.structure ?? {}) as AgentSource["structure"];
  const propriedadeTextos: string[] = [];
  strings(properties, propriedadeTextos);
  const plainText = [input.title, ...propriedadeTextos, textoDoSnapshot(structure)].filter(Boolean).join("\n");
  const contentHash = hash({ title: input.title, properties, plainText });
  const structureHash = hash(semTexto(structure));
  const snapshotHash = hash({ contentHash, structureHash, structure, properties, role: input.role, path: input.path, rootSection: input.rootSection, sourceType: input.sourceType, parentNotionId: input.parentNotionId, dataSourceNotionId: input.dataSourceNotionId ?? null });
  return {
    notion_id: notionId(input.notionId), source_type: input.sourceType, role: input.role,
    title: input.title, path: input.path, root_section: input.rootSection,
    parent_notion_id: input.parentNotionId ? notionId(input.parentNotionId) : null,
    data_source_notion_id: input.dataSourceNotionId ? notionId(input.dataSourceNotionId) : null,
    notion_last_edited_at: input.notionLastEditedAt ?? null,
    content_hash: contentHash, structure_hash: structureHash, snapshot_hash: snapshotHash,
    plain_text: plainText, properties, structure, active: true,
  };
}

export function tituloNotion(propriedades: unknown, fallback = ""): string {
  if (!propriedades || typeof propriedades !== "object") return fallback;
  for (const prop of Object.values(propriedades as Record<string, unknown>)) {
    if (!prop || typeof prop !== "object") continue;
    const p = prop as Record<string, unknown>;
    if (p.type !== "title" || !Array.isArray(p.title)) continue;
    return p.title.map((item) => (item && typeof item === "object" ? String((item as Record<string, unknown>).plain_text ?? "") : "")).join("").trim() || fallback;
  }
  return fallback;
}

export function textoRich(valor: unknown): string {
  return Array.isArray(valor) ? valor.map((item) => (item && typeof item === "object" ? String((item as Record<string, unknown>).plain_text ?? "") : "")).join("").trim() : "";
}
