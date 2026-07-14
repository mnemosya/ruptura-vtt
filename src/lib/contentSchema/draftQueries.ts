/**
 * Leitura de `content_drafts` — sempre via o client "scoped" já existente
 * (`getScopedTableClient`, anexa a sessão do admin logado). A tabela tem
 * RLS restrita a `is_content_admin()` (migration 0021), então qualquer
 * chamada sem sessão de admin simplesmente não retorna linha nenhuma —
 * nunca dependemos só da checagem em `src/lib/auth/contentAdmin.ts` para
 * a segurança em si, ela é reforçada pelo banco.
 */

import { getScopedTableClient } from "../auth/scopedClient";
import type { ContentDraftRow, DraftContentType } from "./draftTypes";

export class DraftQueryError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "DraftQueryError";
  }
}

export async function listDrafts(): Promise<ContentDraftRow[]> {
  const client = await getScopedTableClient();
  const { data, error } = await client.from("content_drafts").select("*").order("updated_at", { ascending: false });
  if (error) throw new DraftQueryError(`Falha ao listar rascunhos: ${error.message}`, error);
  return (data ?? []) as ContentDraftRow[];
}

export async function getDraftById(id: string): Promise<ContentDraftRow | null> {
  const client = await getScopedTableClient();
  const { data, error } = await client.from("content_drafts").select("*").eq("id", id).maybeSingle();
  if (error) throw new DraftQueryError(`Falha ao buscar rascunho ${id}: ${error.message}`, error);
  return (data as ContentDraftRow | null) ?? null;
}

export async function findDraftBySlug(contentType: DraftContentType, slug: string): Promise<ContentDraftRow | null> {
  const client = await getScopedTableClient();
  const { data, error } = await client.from("content_drafts").select("*").eq("content_type", contentType).eq("slug", slug).maybeSingle();
  if (error) throw new DraftQueryError(`Falha ao buscar rascunho por slug (${contentType}:${slug}): ${error.message}`, error);
  return (data as ContentDraftRow | null) ?? null;
}
