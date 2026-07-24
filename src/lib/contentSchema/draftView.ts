/**
 * Monta o modelo de leitura de um rascunho para exibição — sempre
 * re-adapta `preservado.rawOriginal` pelos adapters da Etapa 1 (nunca
 * duplica essa lógica). Também avisa (sem bloquear, sem fazer merge)
 * quando o conteúdo publicado de origem mudou desde que o rascunho foi
 * criado.
 */

import { getContentDocument } from "../content/queries";
import type { ContentType } from "../content/types";
import { adaptarRawItem, adaptarRawSpell, adaptarRawTalento } from "./draftMapping";
import { filtrarEfeitosSomenteLeitura } from "./effectDraftMapping";
import { validarConteudo } from "./validation";
import type { ContentDraftRow } from "./draftTypes";
import type { CampoDesconhecido, ConteudoCanonico, EfeitoCanonico, ResultadoValidacao } from "./types";

export interface DraftEfeitosPreservados {
  nivel?: number;
  nomeNivel?: string;
  canonico: ConteudoCanonico;
  /**
   * Só os efeitos FORA dos 6 tipos do MVP (teste_resistencia, outro, ...)
   * — os 6 tipos do MVP agora são editáveis (`camposEditaveis.efeitos`,
   * Etapa 4) e não aparecem duplicados aqui.
   */
  efeitosSomenteLeitura: EfeitoCanonico[];
  validacao: ResultadoValidacao;
  camposDesconhecidos: CampoDesconhecido[];
}

export type BaseDocumentoStatus = "sem_origem" | "atual" | "mudou" | "removido";

export interface DraftViewModel {
  draft: ContentDraftRow;
  efeitosPreservados: DraftEfeitosPreservados[];
  baseDocumentoStatus: BaseDocumentoStatus;
}

export async function construirDraftViewModel(draft: ContentDraftRow): Promise<DraftViewModel> {
  const rawOriginal = draft.payload.preservado.rawOriginal;

  let efeitosPreservados: DraftEfeitosPreservados[];
  if (draft.content_type === "spell") {
    const adaptado = adaptarRawSpell(rawOriginal);
    efeitosPreservados = [
      {
        canonico: adaptado.canonico,
        efeitosSomenteLeitura: filtrarEfeitosSomenteLeitura(adaptado.canonico.efeitos),
        validacao: validarConteudo(adaptado.canonico, adaptado.camposDesconhecidos),
        camposDesconhecidos: adaptado.camposDesconhecidos,
      },
    ];
  } else if (draft.content_type === "item") {
    const adaptado = adaptarRawItem(rawOriginal);
    efeitosPreservados = [
      {
        canonico: adaptado.canonico,
        efeitosSomenteLeitura: filtrarEfeitosSomenteLeitura(adaptado.canonico.efeitos),
        validacao: validarConteudo(adaptado.canonico, adaptado.camposDesconhecidos),
        camposDesconhecidos: adaptado.camposDesconhecidos,
      },
    ];
  } else if (draft.content_type === "capitulo") {
    // Capítulo não tem efeitos/campos legados a preservar (5º content
    // type, sem conteúdo prévio fora do Editor Universal) — nunca passa
    // pelos adapters de spell/item/talento, que assumem outra forma.
    efeitosPreservados = [];
  } else {
    const resultados = adaptarRawTalento(rawOriginal);
    efeitosPreservados = resultados.map((r) => ({
      nivel: typeof r.canonico.classificacao.nivel === "number" ? (r.canonico.classificacao.nivel as number) : undefined,
      nomeNivel: r.canonico.nome,
      canonico: r.canonico,
      efeitosSomenteLeitura: filtrarEfeitosSomenteLeitura(r.canonico.efeitos),
      validacao: validarConteudo(r.canonico, r.camposDesconhecidos),
      camposDesconhecidos: r.camposDesconhecidos,
    }));
  }

  let baseDocumentoStatus: BaseDocumentoStatus = "sem_origem";
  if (draft.base_document_id) {
    const publicado = await getContentDocument(draft.content_type as ContentType, draft.slug).catch(() => null);
    if (!publicado) baseDocumentoStatus = "removido";
    else baseDocumentoStatus = publicado.payload_hash === draft.base_payload_hash ? "atual" : "mudou";
  }

  return { draft, efeitosPreservados, baseDocumentoStatus };
}
