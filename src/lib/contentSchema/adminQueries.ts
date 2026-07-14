/**
 * Consultas administrativas de listagem (Etapa 2). Reusa o mesmo
 * client/RLS de leitura pública já existente (`getContentClient`,
 * `src/lib/content/client.ts`) — não abre nenhuma policy nova nem lê
 * mais do que um visitante anônimo já poderia ler hoje (todo o
 * conteúdo é `status = 'published'`). A única coisa nova é a ROTA
 * (gated por `getContentAdminStatus`), não o alcance da leitura.
 *
 * Difere de `src/lib/content/queries.ts` por suportar busca textual e
 * filtro por `content_type` opcional (todos os 12 de uma vez) — algo
 * que a camada pública não precisa, mas a lista administrativa sim.
 */

import { getContentClient } from "../content/client";
import type { ContentDocument, ContentType } from "../content/types";

const PUBLISHED = "published";

export interface AdminListFilters {
  contentType?: ContentType;
  categoria?: string;
  search?: string;
}

export interface AdminListOptions extends AdminListFilters {
  page: number;
  pageSize: number;
}

export interface AdminListResult {
  items: ContentDocument[];
  total: number;
  page: number;
  pageSize: number;
}

/** Remove caracteres que quebrariam a sintaxe do filtro `.or()` do PostgREST em vez de tentar escapá-los. */
function sanitizeParaFiltro(valor: string): string {
  return valor.replace(/[,()%\\]/g, " ").trim();
}

export async function listContentDocumentsForAdmin(options: AdminListOptions): Promise<AdminListResult> {
  const supabase = getContentClient();
  const page = Math.max(1, options.page);
  const pageSize = Math.min(Math.max(1, options.pageSize), 200);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from("content_documents").select("*", { count: "exact" }).eq("status", PUBLISHED);

  if (options.contentType) query = query.eq("content_type", options.contentType);
  if (options.categoria) query = query.eq("categoria", options.categoria);

  const termo = options.search ? sanitizeParaFiltro(options.search) : "";
  if (termo) {
    query = query.or(`nome.ilike.%${termo}%,slug.ilike.%${termo}%,categoria.ilike.%${termo}%,subtipo.ilike.%${termo}%`);
  }

  query = query.order("content_type", { ascending: true }).order("slug", { ascending: true }).range(from, to);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(`Falha ao listar conteúdo administrativo: ${error.message}`);
  }

  return { items: (data ?? []) as ContentDocument[], total: count ?? 0, page, pageSize };
}

const CONTENT_TYPES: ContentType[] = [
  "spell",
  "talent",
  "item",
  "condition",
  "rune",
  "escalpo",
  "property",
  "combat_action",
  "character_rule",
  "combat_field",
  "combat_flow",
  "master_table",
];

/** Contagem real por content_type — insumo do diagnóstico de divergência com o manifesto. */
export async function countContentDocumentsByType(): Promise<Record<ContentType, number>> {
  const supabase = getContentClient();
  const resultado = {} as Record<ContentType, number>;

  await Promise.all(
    CONTENT_TYPES.map(async (contentType) => {
      const { count, error } = await supabase
        .from("content_documents")
        .select("*", { count: "exact", head: true })
        .eq("content_type", contentType)
        .eq("status", PUBLISHED);
      resultado[contentType] = error ? -1 : (count ?? 0);
    }),
  );

  return resultado;
}
