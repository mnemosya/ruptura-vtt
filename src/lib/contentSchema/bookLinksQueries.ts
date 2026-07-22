/**
 * Leitura/escrita de `content_book_links` (migration 0024) — vínculo
 * estruturado entre um `content_documents` PUBLICADO e uma citação de
 * capítulo/seção/âncora do livro (texto livre — não existe tabela de
 * capítulos real, ver checkpoint da Etapa 11). Leitura é pública (mesma
 * policy de `content_documents` publicado); escrita é admin-only via
 * RLS (`content_book_links_admin_write`) — cada mutação também
 * reverifica admin no client "scoped" antes de tentar.
 */

import { getContentClient } from "../content/client";
import { getScopedTableClient } from "../auth/scopedClient";

export const TIPOS_VINCULO_EDITORIAL = ["origem_editorial", "regra_principal", "referencia", "exemplo", "conteudo_relacionado"] as const;
export type TipoVinculoEditorial = (typeof TIPOS_VINCULO_EDITORIAL)[number];

export interface ContentBookLinkRow {
  id: string;
  document_id: string;
  capitulo: string;
  secao: string | null;
  ancora: string | null;
  rotulo: string | null;
  tipo_vinculo: TipoVinculoEditorial;
  principal: boolean;
  url_externa: string | null;
  ordem: number;
  created_by: string | null;
  created_at: string;
}

/** Vínculos de UM documento, em ordem — leitura pública (usada por "Ver no livro" e pela exportação). */
export async function listBookLinksForDocument(documentId: string): Promise<ContentBookLinkRow[]> {
  const client = getContentClient();
  const { data, error } = await client.from("content_book_links").select("*").eq("document_id", documentId).order("ordem", { ascending: true });
  if (error) throw new Error(`Falha ao listar vínculos editoriais: ${error.message}`);
  return (data ?? []) as ContentBookLinkRow[];
}

/** O vínculo PRINCIPAL de um documento (no máximo 1 — índice único parcial garante isso no banco), ou null. */
export async function getPrincipalBookLink(documentId: string): Promise<ContentBookLinkRow | null> {
  const client = getContentClient();
  const { data, error } = await client.from("content_book_links").select("*").eq("document_id", documentId).eq("principal", true).maybeSingle();
  if (error) return null;
  return (data as ContentBookLinkRow | null) ?? null;
}

export interface NovoVinculoEditorial {
  documentId: string;
  capitulo: string;
  secao?: string;
  ancora?: string;
  rotulo?: string;
  tipoVinculo: TipoVinculoEditorial;
  principal: boolean;
  urlExterna?: string;
  ordem?: number;
}

/** Cria um vínculo — RLS admin-only reforça no banco; `principal` duplicado para o mesmo documento é rejeitado pelo índice único parcial. */
export async function criarBookLink(admin: { id: string }, dados: NovoVinculoEditorial): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from("content_book_links")
    .insert({
      document_id: dados.documentId,
      capitulo: dados.capitulo,
      secao: dados.secao ?? null,
      ancora: dados.ancora ?? null,
      rotulo: dados.rotulo ?? null,
      tipo_vinculo: dados.tipoVinculo,
      principal: dados.principal,
      url_externa: dados.urlExterna ?? null,
      ordem: dados.ordem ?? 0,
      created_by: admin.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, erro: `Falha ao criar vínculo editorial: ${error.message}` };
  return { ok: true, id: data.id as string };
}

export async function removerBookLink(id: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const client = await getScopedTableClient();
  const { error } = await client.from("content_book_links").delete().eq("id", id);
  if (error) return { ok: false, erro: `Falha ao remover vínculo editorial: ${error.message}` };
  return { ok: true };
}
