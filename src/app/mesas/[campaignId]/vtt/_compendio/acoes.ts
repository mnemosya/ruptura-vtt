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

import { after } from "next/server";
import { getContentAdminStatus } from "../../../../../lib/auth/contentAdmin";
import { getContentClient } from "../../../../../lib/content/client";
import { sincronizarAgora, talvezSincronizar } from "../../../../../lib/compendio/sincronizacaoAutomatica";
import { descreverPendencia } from "../../../../../lib/compendio/revisao";
import { PACK_COMPENDIO, pendenciasDeRevisao } from "../../../../../lib/compendio/sincronizar";
import type { CapituloCompendio } from "../../../../../lib/compendio/tipos";
import { addLog } from "../../../../../lib/table/storage";
import type { BlocoCompendio } from "../../../../../lib/compendio/tipos";
import { exigirAcessoPainel, mensagemDeErro, type ResultadoPainel } from "../_painel/acoes/comum";
import { rotuloCapitulo, textoDe, textoPlanoDosBlocos, type LinhaCapitulo } from "./modelo";

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
      return { pageId: p.notionPageId, numero: p.numero, titulo: p.titulo, secao: p.secao, ordem: p.ordem, verbetes: p.verbetes, editadoEm: p.notionEditadoEm, paiPageId: p.paiPageId ?? null };
    });
    // Usar o Compêndio é o que mantém o livro em dia: checa o Notion em segundo
    // plano, no máximo a cada 12 horas (Fase 3, sincronizacaoAutomatica.ts).
    after(() => talvezSincronizar());
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

/** Resumo de uma sincronização manual, para a mensagem na tela. */
export interface ResumoSincronizacao {
  criados: number;
  atualizados: number;
  arquivados: number;
  falhas: string[];
}

/** Só administradoras de conteúdo veem o botão "Sincronizar agora". */
export async function podeSincronizarAction(): Promise<boolean> {
  return (await getContentAdminStatus()).isAdmin;
}

export async function sincronizarAgoraAction(): Promise<ResultadoPainel<ResumoSincronizacao>> {
  if (!(await getContentAdminStatus()).isAdmin) return { ok: false, erro: "Só administradoras de conteúdo podem sincronizar o livro." };
  try {
    const rel = await sincronizarAgora();
    if (!rel) return { ok: false, erro: "Sincronização indisponível: falta NOTION_TOKEN ou a chave de serviço no servidor." };
    return {
      ok: true,
      dados: {
        criados: rel.criados.length,
        atualizados: rel.atualizados.length,
        arquivados: rel.arquivados.length,
        falhas: rel.falhas.map((f) => `${f.capitulo}: ${f.erro}`),
      },
    };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "A sincronização falhou.") };
  }
}

/** Teto do texto gravado no cartão do chat — o cartão é uma referência, não o capítulo inteiro. */
const MAX_TEXTO_CARTAO = 1500;

function acharVerbete(blocos: BlocoCompendio[], ancora: string): Extract<BlocoCompendio, { tipo: "verbete" }> | null {
  for (const b of blocos) {
    if (b.tipo === "verbete" && b.ancora === ancora) return b;
    const filhos = "filhos" in b ? b.filhos : b.tipo === "lista" ? b.itens.flatMap((i) => i.filhos) : [];
    const achado = acharVerbete(filhos, ancora);
    if (achado) return achado;
  }
  return null;
}

/**
 * "Enviar ao chat" de um verbete (ou de uma página inteira, sem âncora).
 * Grava o mesmo evento `compendio_compartilhado` de antes, com o texto relido
 * AQUI do livro publicado — o browser só diz qual trecho. O cartão guarda o
 * texto daquele momento e o destino para "Abrir no livro".
 */
export async function enviarTrechoAoChatAction(campaignId: string, pageId: string, ancora: string | null): Promise<ResultadoPainel> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    const { data, error } = await consultaBase().eq("slug", pageId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { ok: false, erro: "Página não encontrada no livro." };
    const p = data.payload as CapituloCompendio;
    const verbete = ancora ? acharVerbete(p.blocos, ancora) : null;
    if (ancora && !verbete) return { ok: false, erro: "Verbete não encontrado." };
    const nome = verbete ? textoDe(verbete.titulo).trim() : p.titulo;
    let texto = textoPlanoDosBlocos(verbete ? verbete.filhos : p.blocos).trim();
    if (texto.length > MAX_TEXTO_CARTAO) texto = `${texto.slice(0, MAX_TEXTO_CARTAO).trimEnd()}…`;
    await addLog({
      campaignId,
      type: "compendio_compartilhado",
      visibility: "public",
      payload: {
        categoria: "livro",
        categoriaRotulo: `Compêndio · ${p.paiPageId ? p.secao : rotuloCapitulo(p)}`,
        slug: ancora ? `${pageId}#${ancora}` : pageId,
        nome,
        origem: "oficial",
        origemRotulo: "Livro RUPTURA v1.2",
        resumo: texto.split("\n")[0] ?? "",
        descricao: texto || null,
        pageId,
        ancora,
        source: "vtt_compendio_livro",
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao enviar ao chat.") };
  }
}

/**
 * Regras a revisar (Fase 5): arquivos de regras cuja página no livro mudou
 * depois da revisão. Só para administradoras de conteúdo; lê o livro
 * publicado (cliente público) e o manifesto de revisão do repositório.
 */
export async function regrasARevisarAction(): Promise<ResultadoPainel<{ chave: string; texto: string; arquivo: string }[]>> {
  if (!(await getContentAdminStatus()).isAdmin) return { ok: false, erro: "Só administradoras de conteúdo." };
  try {
    return {
      ok: true,
      dados: (await pendenciasDeRevisao(getContentClient())).map((p) => ({ chave: p.chave, texto: descreverPendencia(p), arquivo: p.arquivo })),
    };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Não foi possível conferir as regras.") };
  }
}
