"use server";

/**
 * Leitura do Compêndio (livro do Notion, `content_type = "capitulo"`).
 *
 * Três tamanhos, sob demanda:
 *   1. `listarCapitulosAction`: linhas leves (sem blocos), ao abrir a aba;
 *   2. `abrirCapituloAction`: os blocos de UM capítulo, ao lê-lo;
 *   3. `textosDoLivroAction`: o texto corrido de todos, só na primeira
 *      busca que precisar do conteúdo.
 *
 * Todo mundo da mesa lê tudo (decisão de 02/10/2026). A leitura usa o
 * cliente público da Biblioteca: a RLS só entrega documentos publicados.
 */

import { getContentClient } from "../../../../../lib/content/client";
import { PACK_COMPENDIO } from "../../../../../lib/compendio/sincronizar";
import type { CapituloCompendio } from "../../../../../lib/compendio/tipos";
import { exigirAcessoPainel, mensagemDeErro, type ResultadoPainel } from "../_painel/acoes/comum";
import { textoPlanoDosBlocos, type LinhaCapitulo } from "./modelo";

function consultaBase() {
  return getContentClient()
    .from("content_documents")
    .select("payload")
    .eq("content_type", "capitulo")
    .eq("source_pack_id", PACK_COMPENDIO)
    .eq("status", "published");
}

export async function listarCapitulosAction(campaignId: string): Promise<ResultadoPainel<LinhaCapitulo[]>> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    const { data, error } = await consultaBase();
    if (error) throw new Error(error.message);
    const linhas = (data ?? []).map(({ payload }) => {
      const p = payload as CapituloCompendio;
      return { pageId: p.notionPageId, numero: p.numero, titulo: p.titulo, secao: p.secao, ordem: p.ordem, verbetes: p.verbetes };
    });
    return { ok: true, dados: linhas.sort((a, b) => a.ordem - b.ordem) };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Não foi possível carregar o Compêndio.") };
  }
}

export async function abrirCapituloAction(campaignId: string, pageId: string): Promise<ResultadoPainel<CapituloCompendio>> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    const { data, error } = await consultaBase().eq("slug", pageId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { ok: false, erro: "Capítulo não encontrado." };
    return { ok: true, dados: data.payload as CapituloCompendio };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Não foi possível abrir o capítulo.") };
  }
}

export async function textosDoLivroAction(campaignId: string): Promise<ResultadoPainel<[string, string][]>> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    const { data, error } = await consultaBase();
    if (error) throw new Error(error.message);
    return {
      ok: true,
      dados: (data ?? []).map(({ payload }) => {
        const p = payload as CapituloCompendio;
        return [p.notionPageId, textoPlanoDosBlocos(p.blocos)];
      }),
    };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Não foi possível carregar o texto do livro.") };
  }
}
