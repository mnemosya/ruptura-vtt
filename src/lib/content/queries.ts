/**
 * Funções de leitura da Biblioteca do Sistema (content_documents).
 *
 * Todas as consultas:
 *   - filtram status = 'published' (nunca expõem rascunho/depreciado);
 *   - usam a anon key via getContentClient() (ver client.ts);
 *   - retornam o payload completo, sem interpretar/reescrever mecânica;
 *   - lançam ContentQueryError com mensagem clara em caso de falha.
 */

import { getContentClient } from "./client";
import {
  ContentQueryError,
  type ContentDocument,
  type ContentType,
  type EscalpoFilters,
  type ItemFilters,
  type ListOptions,
  type RuneFilters,
  type SpellFilters,
} from "./types";

const PUBLISHED = "published";

// Slugs estáveis dos documentos singleton (ver scripts/seed-content.ts).
const SINGLETON_SLUGS = {
  character_rule: "regras_personagem",
  combat_field: "campo_combate",
  combat_flow: "fluxo_combate",
  master_table: "tabelas_mestre",
} as const;

interface Orderable {
  order(column: string, opts: { ascending: boolean }): this;
  limit(count: number): this;
  range(from: number, to: number): this;
}

function applyListOptions<T extends Orderable>(query: T, options?: ListOptions): T {
  const orderBy = options?.orderBy ?? "slug";
  const ascending = options?.ascending ?? true;
  let q = query.order(orderBy, { ascending });
  if (options?.limit != null) q = q.limit(options.limit);
  if (options?.offset != null) {
    const pageSize = options.limit ?? 1000;
    q = q.range(options.offset, options.offset + pageSize - 1);
  }
  return q;
}

// ---------------------------------------------------------------------
// Genéricas
// ---------------------------------------------------------------------

/** Lista todos os documentos publicados de um content_type. */
export async function listContentDocuments<TPayload = unknown>(
  contentType: ContentType,
  options?: ListOptions,
): Promise<ContentDocument<TPayload>[]> {
  const supabase = getContentClient();
  let query = supabase
    .from("content_documents")
    .select("*")
    .eq("content_type", contentType)
    .eq("status", PUBLISHED);
  query = applyListOptions(query, options);

  const { data, error } = await query;
  if (error) {
    throw new ContentQueryError(
      `Falha ao listar content_documents (content_type=${contentType}): ${error.message}`,
      error,
    );
  }
  return (data ?? []) as ContentDocument<TPayload>[];
}

/** Busca um único documento publicado por (content_type, slug). Retorna null se não existir. */
export async function getContentDocument<TPayload = unknown>(
  contentType: ContentType,
  slug: string,
): Promise<ContentDocument<TPayload> | null> {
  const supabase = getContentClient();
  const { data, error } = await supabase
    .from("content_documents")
    .select("*")
    .eq("content_type", contentType)
    .eq("slug", slug)
    .eq("status", PUBLISHED)
    .maybeSingle();

  if (error) {
    throw new ContentQueryError(
      `Falha ao buscar content_document (content_type=${contentType}, slug=${slug}): ${error.message}`,
      error,
    );
  }
  return (data as ContentDocument<TPayload> | null) ?? null;
}

// ---------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------

export async function getCharacterRules(): Promise<ContentDocument | null> {
  return getContentDocument("character_rule", SINGLETON_SLUGS.character_rule);
}

export async function getCombatField(): Promise<ContentDocument | null> {
  return getContentDocument("combat_field", SINGLETON_SLUGS.combat_field);
}

export async function getCombatFlow(): Promise<ContentDocument | null> {
  return getContentDocument("combat_flow", SINGLETON_SLUGS.combat_flow);
}

export async function getMasterTables(): Promise<ContentDocument | null> {
  return getContentDocument("master_table", SINGLETON_SLUGS.master_table);
}

// ---------------------------------------------------------------------
// Combat actions
// ---------------------------------------------------------------------

export async function listCombatActions(options?: ListOptions): Promise<ContentDocument[]> {
  return listContentDocuments("combat_action", options);
}

export async function getCombatAction(slug: string): Promise<ContentDocument | null> {
  return getContentDocument("combat_action", slug);
}

// ---------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------

export async function listConditions(options?: ListOptions): Promise<ContentDocument[]> {
  return listContentDocuments("condition", options);
}

export async function getCondition(slug: string): Promise<ContentDocument | null> {
  return getContentDocument("condition", slug);
}

// ---------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------

export async function listProperties(options?: ListOptions): Promise<ContentDocument[]> {
  return listContentDocuments("property", options);
}

export async function getProperty(slug: string): Promise<ContentDocument | null> {
  return getContentDocument("property", slug);
}

// ---------------------------------------------------------------------
// Items (filtros: categoria, subtipo — colunas projetadas)
// ---------------------------------------------------------------------

export async function listItems(
  filters?: ItemFilters,
  options?: ListOptions,
): Promise<ContentDocument[]> {
  const supabase = getContentClient();
  let query = supabase
    .from("content_documents")
    .select("*")
    .eq("content_type", "item")
    .eq("status", PUBLISHED);

  if (filters?.categoria) query = query.eq("categoria", filters.categoria);
  if (filters?.subtipo) query = query.eq("subtipo", filters.subtipo);

  query = applyListOptions(query, options);
  const { data, error } = await query;
  if (error) {
    throw new ContentQueryError(`Falha ao listar items: ${error.message}`, error);
  }
  return (data ?? []) as ContentDocument[];
}

export async function getItem(slug: string): Promise<ContentDocument | null> {
  return getContentDocument("item", slug);
}

// ---------------------------------------------------------------------
// Runes (filtro: slot — checa payload.slots_possiveis, array de slugs)
// ---------------------------------------------------------------------

export async function listRunes(
  filters?: RuneFilters,
  options?: ListOptions,
): Promise<ContentDocument[]> {
  const supabase = getContentClient();
  let query = supabase
    .from("content_documents")
    .select("*")
    .eq("content_type", "rune")
    .eq("status", PUBLISHED);

  if (filters?.slot) {
    // .contains() formata arrays JS como literal de array nativo do Postgres
    // ("{valor}"), que não é JSON válido para um caminho jsonb. Usamos
    // .filter() com o operador "cs" (contains) e um array JSON explícito.
    query = query.filter("payload->slots_possiveis", "cs", JSON.stringify([filters.slot]));
  }

  query = applyListOptions(query, options);
  const { data, error } = await query;
  if (error) {
    throw new ContentQueryError(`Falha ao listar runes: ${error.message}`, error);
  }
  return (data ?? []) as ContentDocument[];
}

export async function getRune(slug: string): Promise<ContentDocument | null> {
  return getContentDocument("rune", slug);
}

// ---------------------------------------------------------------------
// Escalpos (filtro: categoria — coluna projetada)
// ---------------------------------------------------------------------

export async function listEscalpos(
  filters?: EscalpoFilters,
  options?: ListOptions,
): Promise<ContentDocument[]> {
  const supabase = getContentClient();
  let query = supabase
    .from("content_documents")
    .select("*")
    .eq("content_type", "escalpo")
    .eq("status", PUBLISHED);

  if (filters?.categoria) query = query.eq("categoria", filters.categoria);

  query = applyListOptions(query, options);
  const { data, error } = await query;
  if (error) {
    throw new ContentQueryError(`Falha ao listar escalpos: ${error.message}`, error);
  }
  return (data ?? []) as ContentDocument[];
}

export async function getEscalpo(slug: string): Promise<ContentDocument | null> {
  return getContentDocument("escalpo", slug);
}

// ---------------------------------------------------------------------
// Talents
// ---------------------------------------------------------------------

export async function listTalents(options?: ListOptions): Promise<ContentDocument[]> {
  return listContentDocuments("talent", options);
}

export async function getTalent(slug: string): Promise<ContentDocument | null> {
  return getContentDocument("talent", slug);
}

// ---------------------------------------------------------------------
// Spells (filtros: vertente [payload de topo], tipo_magia/resolucao/nivel
// [payload.estatisticas])
// ---------------------------------------------------------------------

export async function listSpells(
  filters?: SpellFilters,
  options?: ListOptions,
): Promise<ContentDocument[]> {
  const supabase = getContentClient();
  let query = supabase
    .from("content_documents")
    .select("*")
    .eq("content_type", "spell")
    .eq("status", PUBLISHED);

  if (filters?.vertente) query = query.eq("payload->>vertente", filters.vertente);
  if (filters?.tipo_magia) {
    query = query.eq("payload->estatisticas->>tipo_magia", filters.tipo_magia);
  }
  if (filters?.resolucao) {
    query = query.eq("payload->estatisticas->>resolucao", filters.resolucao);
  }
  if (filters?.nivel != null) {
    query = query.eq("payload->estatisticas->>nivel", String(filters.nivel));
  }

  query = applyListOptions(query, options);
  const { data, error } = await query;
  if (error) {
    throw new ContentQueryError(`Falha ao listar spells: ${error.message}`, error);
  }
  return (data ?? []) as ContentDocument[];
}

export async function getSpell(slug: string): Promise<ContentDocument | null> {
  return getContentDocument("spell", slug);
}
