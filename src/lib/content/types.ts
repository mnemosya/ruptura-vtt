/**
 * Tipos da camada de leitura da Biblioteca do Sistema (content_documents).
 *
 * Estes tipos descrevem apenas o envelope da tabela (colunas escalares
 * projetadas + payload). O conteúdo de `payload` é a fonte de verdade
 * (JSONB) e NÃO é tipado/interpretado aqui — fica como `unknown` por
 * padrão, podendo ser estreitado por quem consome (ex.: via generic
 * `TPayload`) sem que isso implique reescrever ou validar a mecânica.
 */

/** Espelha o enum `content_type` da migration 0001_content_library. */
export type ContentType =
  | "master_table"
  | "character_rule"
  | "combat_field"
  | "combat_flow"
  | "combat_action"
  | "condition"
  | "property"
  | "item"
  | "rune"
  | "escalpo"
  | "talent"
  | "spell";

/** Linha completa de content_documents, com o payload tipado genericamente. */
export interface ContentDocument<TPayload = unknown> {
  id: string;
  content_type: ContentType;
  slug: string;
  nome: string | null;
  categoria: string | null;
  subtipo: string | null;
  status: string;
  version: string | null;
  source_pack_id: string;
  source_pack_version: string | null;
  payload: TPayload;
  payload_hash: string;
  created_at: string;
  updated_at: string;
}

/** Opções genéricas de paginação/ordenação para listagens. */
export interface ListOptions {
  limit?: number;
  offset?: number;
  orderBy?: "slug" | "nome" | "created_at" | "updated_at";
  ascending?: boolean;
}

/** Filtros mínimos para listItems — categoria/subtipo são colunas projetadas. */
export interface ItemFilters {
  categoria?: string;
  subtipo?: string;
}

/**
 * Filtros mínimos para listSpells. vertente é um campo de topo do payload;
 * tipo_magia, resolucao e nivel vivem em payload.estatisticas.
 */
export interface SpellFilters {
  vertente?: string;
  tipo_magia?: string;
  resolucao?: string;
  nivel?: number;
}

/** Filtro mínimo para listRunes — slot é checado contra payload.slots_possiveis (array). */
export interface RuneFilters {
  slot?: string;
}

/** Filtro mínimo para listEscalpos — categoria é coluna projetada. */
export interface EscalpoFilters {
  categoria?: string;
}

/**
 * Erro de consulta à Biblioteca do Sistema. Envolve o erro original do
 * Supabase/PostgREST em `cause`, preservando a mensagem original para
 * depuração sem expor detalhes de conexão/credenciais.
 */
export class ContentQueryError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "ContentQueryError";
  }
}
