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

import { getScopedTableClient } from "../auth/scopedClient";
import { getContentClient } from "../content/client";
import type { ContentDocument, ContentType } from "../content/types";

const PUBLISHED = "published";

export type AdminStatusFiltro = "published" | "archived";

export interface AdminListFilters {
  contentType?: ContentType;
  categoria?: string;
  search?: string;
  /** Filtra por status (Etapa 5). Ausente = só publicado (comportamento padrão da Etapa 2). */
  status?: AdminStatusFiltro;
  /**
   * Filtra por presença de `content_editor_metadata` (Etapa 6) — "com"
   * = já foi editado pelo Editor Universal pelo menos uma vez (qualquer
   * versão); "sem" = ainda só existe pelo payload legado importado.
   * Ausente = sem filtro.
   */
  comMetadataEditorial?: boolean;
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
  // Client scoped (sessão do admin) — enxerga 'archived' pela policy
  // content_documents_admin_read (migration 0022). O client anon só veria
  // 'published'. Filtro de status: ausente = só publicado (padrão Etapa 2).
  const supabase = await getScopedTableClient();
  const page = Math.max(1, options.page);
  const pageSize = Math.min(Math.max(1, options.pageSize), 200);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from("content_documents").select("*", { count: "exact" }).eq("status", options.status ?? PUBLISHED);

  if (options.contentType) query = query.eq("content_type", options.contentType);
  if (options.categoria) query = query.eq("categoria", options.categoria);

  const termo = options.search ? sanitizeParaFiltro(options.search) : "";
  if (termo) {
    query = query.or(`nome.ilike.%${termo}%,slug.ilike.%${termo}%,categoria.ilike.%${termo}%,subtipo.ilike.%${termo}%`);
  }

  if (options.comMetadataEditorial !== undefined) {
    // PostgREST não faz subquery arbitrária — busca os document_id com
    // metadata numa consulta separada (tabela pequena) e filtra por `.in`/`.not.in`.
    const { data: comMetadata } = await supabase.from("content_editor_metadata").select("document_id");
    const idsComMetadata = Array.from(new Set((comMetadata ?? []).map((r) => (r as { document_id: string }).document_id)));
    if (options.comMetadataEditorial) {
      query = idsComMetadata.length > 0 ? query.in("id", idsComMetadata) : query.eq("id", "__nenhum__");
    } else if (idsComMetadata.length > 0) {
      query = query.not("id", "in", `(${idsComMetadata.map((id) => `"${id}"`).join(",")})`);
    }
  }

  query = query.order("content_type", { ascending: true }).order("slug", { ascending: true }).range(from, to);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(`Falha ao listar conteúdo administrativo: ${error.message}`);
  }

  return { items: (data ?? []) as ContentDocument[], total: count ?? 0, page, pageSize };
}

/**
 * Lê UM documento por (tipo, slug) para o admin — qualquer status,
 * inclusive 'archived' (via client scoped + policy admin_read). A
 * página pública/consumo continua usando `getContentDocument` (só
 * published). Retorna null se não existir.
 */
export async function getContentDocumentForAdmin(contentType: ContentType, slug: string): Promise<ContentDocument | null> {
  const supabase = await getScopedTableClient();
  const { data, error } = await supabase.from("content_documents").select("*").eq("id", `${contentType}:${slug}`).maybeSingle();
  if (error) throw new Error(`Falha ao carregar conteúdo administrativo: ${error.message}`);
  return (data as ContentDocument | null) ?? null;
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
