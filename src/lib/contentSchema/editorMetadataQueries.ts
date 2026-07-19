/**
 * Leitura da metadata editorial completa (`content_editor_metadata`,
 * migration 0023). Guarda o `EfeitoEditavel[]` (ou, para talento, por
 * nível) exatamente como configurado no editor — nunca embutido no
 * payload público. Usada para recuperar fidelidade total ao criar um
 * novo rascunho de edição a partir de conteúdo já publicado por esta
 * via (round-trip sem perda). Client scoped — só admin lê (policy
 * `content_editor_metadata_admin_read`).
 */

import { getScopedTableClient } from "../auth/scopedClient";

export interface EfeitoEditorMetadataNivel {
  nivel: number;
  efeitos: unknown[];
}

/** Metadata da versão ATUALMENTE publicada de um documento — null quando não existe (conteúdo nunca publicado por esta via, ou seedado antes da correção). */
export async function getEditorMetadataAtual(documentId: string, version: string): Promise<unknown[] | null> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from("content_editor_metadata")
    .select("efeitos")
    .eq("document_id", documentId)
    .eq("version", version)
    .maybeSingle();
  if (error || !data) return null;
  const efeitos = (data as { efeitos: unknown }).efeitos;
  return Array.isArray(efeitos) ? efeitos : null;
}
