export type SourceType = "page" | "database" | "data_source" | "database_row";
export type SourceRole = "book" | "patch_notes" | "editorial_guide" | "design_guide" | "working_reference" | "reference" | "historical_version";

export interface NotionObject {
  id: string;
  last_edited_time?: string;
  properties?: Record<string, Record<string, unknown>>;
  title?: unknown[];
  description?: unknown[];
  data_sources?: { id: string; name: string }[];
  parent?: Record<string, unknown>;
  icon?: unknown;
  cover?: unknown;
  [key: string]: unknown;
}

export interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
}

export interface AgentBlock {
  id: string;
  type: string;
  hasChildren: boolean;
  data: unknown;
  children: AgentBlock[];
}

export interface AgentSource {
  notion_id: string;
  source_type: SourceType;
  role: SourceRole;
  title: string;
  path: string[];
  root_section: string | null;
  parent_notion_id: string | null;
  data_source_notion_id: string | null;
  notion_last_edited_at: string | null;
  content_hash: string;
  structure_hash: string;
  snapshot_hash: string;
  plain_text: string;
  properties: unknown;
  structure: { blocks?: AgentBlock[]; [key: string]: unknown };
  active: boolean;
}

export interface AgentNotionReader {
  page(id: string): Promise<NotionObject>;
  database(id: string): Promise<NotionObject>;
  dataSource(id: string): Promise<NotionObject>;
  blockChildren(id: string): Promise<NotionBlock[]>;
  rows(id: string): Promise<NotionObject[]>;
  requisicoes(): number;
}
