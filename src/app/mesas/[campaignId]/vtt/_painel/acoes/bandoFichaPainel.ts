"use server";

/**
 * Ficha do Bando Refratário v1.2 (`campaign_crews`) na aba Bando.
 *
 * Todos os participantes leem e editam (decisão de 01/10/2026). As regras
 * do capítulo 10 rodam no motor puro (`lib/rulesetV12/crew.ts`) na
 * interface; o banco garante os invariantes (CHECKs) e a revisão otimista.
 * O catálogo é a transcrição `content/v12/db_bando_v1_2.json` — ainda não
 * é conteúdo publicado.
 */

import catalogoBando from "../../../../../../../content/v12/db_bando_v1_2.json";
import { getCampaignCrew, saveCampaignCrew } from "../../../../../../lib/table/crewState";
import type { CrewCatalogV12, CrewStateV12 } from "../../../../../../lib/rulesetV12";
import { exigirAcessoPainel, mensagemDeErro, type ResultadoPainel } from "./comum";

export interface CatalogoBandoPainel extends CrewCatalogV12 {
  coberturas: Array<{ slug: string; nome: string; custo: number; requisito: string; efeito: string }>;
  areas_de_apoio: Array<{ slug: string; nome: string; qualificacao: string }>;
}

export interface FichaBandoPainel {
  catalogo: CatalogoBandoPainel;
  /** `null` quando a campanha ainda não fundou um bando. */
  registro: { state: CrewStateV12; revision: number } | null;
}

export async function lerFichaBandoAction(campaignId: string): Promise<ResultadoPainel<FichaBandoPainel>> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    const registro = await getCampaignCrew(campaignId);
    return {
      ok: true,
      dados: {
        catalogo: catalogoBando as unknown as CatalogoBandoPainel,
        registro: registro ? { state: registro.state, revision: registro.revision } : null,
      },
    };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao carregar a ficha do bando.") };
  }
}

/** `revisao` 0 funda o bando. Conflito (outra janela gravou antes) volta como `conflito: true`. */
export async function salvarFichaBandoAction(
  campaignId: string,
  state: CrewStateV12,
  revisao: number,
): Promise<ResultadoPainel<{ revisao: number } | { conflito: true }>> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    const r = await saveCampaignCrew(campaignId, state, revisao);
    return { ok: true, dados: "conflict" in r ? { conflito: true } : { revisao: r.revision } };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao salvar a ficha do bando.") };
  }
}
