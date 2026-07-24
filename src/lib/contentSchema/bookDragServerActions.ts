"use server";

/**
 * Origem do drag-and-drop editorial (Etapa 11, correção): busca mínima
 * de conteúdo PUBLICADO da Biblioteca para arrastar/vincular a um
 * capítulo. Reaproveita a mesma leitura administrativa já existente
 * (`listContentDocumentsForAdmin`, Etapa 2) — nenhuma policy nova,
 * nenhum acesso além do que a tela de listagem da Biblioteca já
 * concede ao mesmo admin. Devolve só o mínimo necessário para o
 * contrato de drag (tipo + slug + nome) — nunca o payload inteiro.
 */

import { getContentAdminStatus } from "../auth/contentAdmin";
import { listContentDocumentsForAdmin } from "./adminQueries";
import type { ContentType } from "../content/types";

export interface ItemBuscaVinculo {
  contentType: ContentType;
  slug: string;
  nome: string;
}

/**
 * Busca por nome/slug entre conteúdo publicado, para a picker de drag
 * embutida no editor de capítulo. Sempre admin-only; nunca devolve
 * rascunho/arquivado (só `status='published'`, mesmo default de
 * `listContentDocumentsForAdmin`).
 */
export async function buscarConteudoParaVinculoCapitulo(query: string, contentType?: ContentType): Promise<ItemBuscaVinculo[]> {
  const status = await getContentAdminStatus();
  if (!status.user || !status.isAdmin) return [];

  const termo = query.trim();
  if (termo.length < 2) return [];

  const resultado = await listContentDocumentsForAdmin({
    search: termo,
    contentType,
    page: 1,
    pageSize: 20,
  });

  return resultado.items.map((doc) => ({
    contentType: doc.content_type,
    slug: doc.slug,
    nome: doc.nome ?? doc.slug,
  }));
}
