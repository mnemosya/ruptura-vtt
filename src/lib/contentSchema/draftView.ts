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
import { validarConteudo } from "./validation";
import type { ContentDraftRow } from "./draftTypes";
import type { CampoDesconhecido, ConteudoCanonico, ResultadoValidacao } from "./types";

export interface DraftEfeitosPreservados {
  nivel?: number;
  nomeNivel?: string;
  canonico: ConteudoCanonico;
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
        validacao: validarConteudo(adaptado.canonico, adaptado.camposDesconhecidos),
        camposDesconhecidos: adaptado.camposDesconhecidos,
      },
    ];
  } else if (draft.content_type === "item") {
    const adaptado = adaptarRawItem(rawOriginal);
    efeitosPreservados = [
      {
        canonico: adaptado.canonico,
        validacao: validarConteudo(adaptado.canonico, adaptado.camposDesconhecidos),
        camposDesconhecidos: adaptado.camposDesconhecidos,
      },
    ];
  } else {
    const resultados = adaptarRawTalento(rawOriginal);
    efeitosPreservados = resultados.map((r) => ({
      nivel: typeof r.canonico.classificacao.nivel === "number" ? (r.canonico.classificacao.nivel as number) : undefined,
      nomeNivel: r.canonico.nome,
      canonico: r.canonico,
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
