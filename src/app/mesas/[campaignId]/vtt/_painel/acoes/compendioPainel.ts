"use server";

/**
 * Aba Compêndio do painel — diretório pesquisável do conteúdo EFETIVO
 * da campanha (`resolveEffectiveList`/`resolveEffectiveOne`): oficial
 * publicado, substituído por override da mesa quando houver, mais o
 * homebrew publicado da mesa como entradas adicionais. Nenhuma
 * resolução nova, nenhum acesso a `content_documents` por fora.
 *
 * CARREGAMENTO SOB DEMANDA — três ações, três tamanhos:
 *   1. `lerResumoCompendioAction`: só as CONTAGENS por categoria. É o
 *      que roda ao abrir a aba.
 *   2. `buscarCompendioAction`: linhas leves (slug, nome, origem,
 *      categoria) de UMA categoria, já filtradas pela consulta e
 *      limitadas — nunca o payload dos documentos.
 *   3. `abrirCompendioAction`: o documento COMPLETO de UM slug, só
 *      quando o detalhe é aberto.
 *
 * O primeiro render do VTT não chama nenhuma das três: a página
 * (`vtt/page.tsx`) segue entregando só o que o HUD precisa.
 *
 * A projeção para linha leve acontece no SERVIDOR — `resolveEffectiveList`
 * lê os payloads de qualquer jeito (é assim que a resolução funciona),
 * mas o que atravessa a fronteira Server Action → browser é só o
 * essencial da linha.
 */

import { resolveEffectiveList, resolveEffectiveOne } from "../../../../../../lib/campaignContent/resolveEffectiveContent";
import type { ContentType } from "../../../../../../lib/content/types";
import { addLog } from "../../../../../../lib/table/storage";
import { exigirAcessoPainel, mensagemDeErro, type ResultadoPainel } from "./comum";
import {
  CATEGORIAS_COMPENDIO,
  ehCategoriaCompendio,
  resumoDoPayload,
  rotuloDaCategoria,
  rotuloDaOrigem,
  termosDeBusca,
  type CategoriaCompendio,
  type LinhaCompendio,
  type OrigemCompendio,
} from "../compendioModelo";

/** Teto de linhas por consulta — o painel é uma coluna estreita, não uma tela de catálogo. */
const MAX_RESULTADOS = 60;

const CONTENT_TYPE_POR_CATEGORIA: Record<CategoriaCompendio, ContentType> = {
  magias: "spell",
  talentos: "talent",
  itens: "item",
  runas: "rune",
  condicoes: "condition",
  companheiros: "companion_model",
};

function origemDe(origem: string): OrigemCompendio {
  if (origem === "modificado_pela_mesa") return "modificado";
  if (origem === "homebrew_da_mesa") return "homebrew";
  return "oficial";
}

export interface ResumoCompendio {
  categoria: CategoriaCompendio;
  rotulo: string;
  total: number;
  /** Quantas entradas desta categoria NÃO são oficiais puras (override ou homebrew da mesa). */
  daMesa: number;
}

/**
 * Contagens reais por categoria. Uma categoria que falhar ao ser
 * resolvida NÃO vira "0": a ação inteira falha e a aba mostra erro com
 * retry — um zero mentiroso é indistinguível de "esta campanha não tem
 * magias".
 */
export async function lerResumoCompendioAction(campaignId: string): Promise<ResultadoPainel<ResumoCompendio[]>> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    const resumos = await Promise.all(
      CATEGORIAS_COMPENDIO.map(async (categoria): Promise<ResumoCompendio> => {
        const lista = await resolveEffectiveList(campaignId, CONTENT_TYPE_POR_CATEGORIA[categoria]);
        return {
          categoria,
          rotulo: rotuloDaCategoria(categoria),
          total: lista.length,
          daMesa: lista.filter((c) => c.origem !== "oficial").length,
        };
      }),
    );
    return { ok: true, dados: resumos };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao carregar o resumo do Compêndio.") };
  }
}

export interface ResultadoBuscaCompendio {
  linhas: LinhaCompendio[];
  /** `true` quando o teto de resultados cortou a lista — a interface diz isso em vez de fingir que acabou. */
  truncado: boolean;
}

/**
 * Busca dentro de UMA categoria. `consulta` vazia devolve a categoria
 * inteira (até o teto), que é o comportamento de "abri a categoria".
 * O casamento é por nome, slug e termos relevantes do payload —
 * `termosDeBusca` (puro, testável) decide quais.
 */
export async function buscarCompendioAction(
  campaignId: string,
  categoria: string,
  consulta: string,
): Promise<ResultadoPainel<ResultadoBuscaCompendio>> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  if (!ehCategoriaCompendio(categoria)) return { ok: false, erro: "Categoria desconhecida." };

  try {
    const lista = await resolveEffectiveList(campaignId, CONTENT_TYPE_POR_CATEGORIA[categoria]);
    const alvo = consulta.trim().toLocaleLowerCase("pt-BR");
    const casaram = lista.filter((c) => {
      if (!alvo) return true;
      return termosDeBusca({ slug: c.slug, nome: c.nome, payload: c.payload }).some((t) => t.includes(alvo));
    });
    const ordenadas = casaram.sort((a, b) =>
      (a.nome ?? a.slug).localeCompare(b.nome ?? b.slug, "pt-BR", { sensitivity: "base" }),
    );
    return {
      ok: true,
      dados: {
        truncado: ordenadas.length > MAX_RESULTADOS,
        linhas: ordenadas.slice(0, MAX_RESULTADOS).map((c) => ({
          categoria,
          slug: c.slug,
          nome: c.nome ?? c.slug,
          origem: origemDe(c.origem),
          subtitulo: resumoDoPayload(c.payload) || null,
        })),
      },
    };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao buscar no Compêndio.") };
  }
}

export interface DetalheCompendio {
  categoria: CategoriaCompendio;
  slug: string;
  nome: string;
  origem: OrigemCompendio;
  /** Payload EFETIVO completo — só desce quando o detalhe é aberto de verdade. */
  payload: Record<string, unknown>;
}

/** Documento completo de um slug. Nunca cria instância de nada — só lê. */
export async function abrirCompendioAction(
  campaignId: string,
  categoria: string,
  slug: string,
): Promise<ResultadoPainel<DetalheCompendio>> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  if (!ehCategoriaCompendio(categoria)) return { ok: false, erro: "Categoria desconhecida." };
  try {
    const doc = await resolveEffectiveOne(campaignId, CONTENT_TYPE_POR_CATEGORIA[categoria], slug);
    if (!doc) return { ok: false, erro: "Conteúdo não encontrado nesta campanha." };
    return {
      ok: true,
      dados: {
        categoria,
        slug: doc.slug,
        nome: doc.nome ?? doc.slug,
        origem: origemDe(doc.origem),
        payload: doc.payload,
      },
    };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao abrir o conteúdo.") };
  }
}

/**
 * "Enviar ao Chat" — grava um EVENTO estruturado
 * (`compendio_compartilhado`), não uma mensagem de texto montada no
 * cliente. Nome, categoria, origem e resumo são relidos aqui, do
 * conteúdo efetivo, então o cartão continua correto mesmo que o
 * browser tivesse mandado outra coisa — e continua legível no futuro
 * sem reler a Biblioteca.
 *
 * Visibilidade `public`: compartilhar é um gesto deliberado de mostrar
 * ao grupo. Nada é instanciado — nenhum item entra em inventário
 * nenhum por causa disto.
 */
export async function enviarCompendioAoChatAction(
  campaignId: string,
  categoria: string,
  slug: string,
): Promise<ResultadoPainel> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  if (!ehCategoriaCompendio(categoria)) return { ok: false, erro: "Categoria desconhecida." };
  try {
    const doc = await resolveEffectiveOne(campaignId, CONTENT_TYPE_POR_CATEGORIA[categoria], slug);
    if (!doc) return { ok: false, erro: "Conteúdo não encontrado nesta campanha." };
    const origem = origemDe(doc.origem);
    await addLog({
      campaignId,
      type: "compendio_compartilhado",
      visibility: "public",
      payload: {
        categoria,
        categoriaRotulo: rotuloDaCategoria(categoria),
        slug: doc.slug,
        nome: doc.nome ?? doc.slug,
        origem,
        origemRotulo: rotuloDaOrigem(origem),
        resumo: resumoDoPayload(doc.payload),
        source: "vtt_painel_compendio",
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao enviar ao Chat.") };
  }
}
