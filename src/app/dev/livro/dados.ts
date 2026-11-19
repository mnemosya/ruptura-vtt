import "server-only";

/**
 * Leitura do livro para o estudo `/dev/livro`: os mesmos capítulos
 * publicados que o Compêndio lê, pelo cliente público da Biblioteca
 * (a RLS só entrega o que está publicado). Sem sessão: a rota é de
 * desenvolvimento e passa por `assertDevRouteAllowed`.
 */
import { getContentClient } from "../../../lib/content/client";
import { PACK_COMPENDIO } from "../../../lib/compendio/sincronizar";
import type { BlocoCompendio, CapituloCompendio } from "../../../lib/compendio/tipos";
import { posicaoDaCapa } from "../../mesas/[campaignId]/vtt/_compendio/enquadramento";
import type { LinhaLivro } from "./modelo";

let memo: { quando: number; capitulos: CapituloCompendio[] } | null = null;

async function todos(): Promise<CapituloCompendio[]> {
  if (memo && Date.now() - memo.quando < 60_000) return memo.capitulos;
  const { data, error } = await getContentClient()
    .from("content_documents")
    .select("payload")
    .eq("content_type", "capitulo")
    .eq("source_pack_id", PACK_COMPENDIO)
    .eq("status", "published");
  if (error) throw new Error(error.message);
  const capitulos = (data ?? []).map((d) => d.payload as CapituloCompendio);
  memo = { quando: Date.now(), capitulos };
  return capitulos;
}

export async function carregarIndice(): Promise<LinhaLivro[]> {
  return (await todos()).map((p) => ({
    pageId: p.notionPageId,
    numero: p.numero,
    titulo: p.titulo,
    secao: p.secao,
    ordem: p.ordem,
    paiPageId: p.paiPageId ?? null,
    editadoEm: p.notionEditadoEm,
    peso: JSON.stringify(p.blocos).length,
    capa: p.capa ? { url: p.capa.url, largura: p.capa.largura, altura: p.capa.altura, posicao: posicaoDaCapa(p.notionPageId) ?? p.capa.posicao } : null,
    verbetes: p.verbetes,
  })).sort((a, b) => a.ordem - b.ordem);
}

export async function carregarBlocos(): Promise<[string, BlocoCompendio[]][]> {
  return (await todos()).map((p) => [p.notionPageId, p.blocos]);
}
