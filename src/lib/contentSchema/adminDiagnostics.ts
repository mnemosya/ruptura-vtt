/**
 * Agregador usado pela lista e pelo detalhe administrativos (Etapa 2)
 * para rodar adapter + validação + diagnóstico de automação de um
 * `content_document` de uma vez, sem duplicar essa orquestração em cada
 * página. Único ponto que sabe lidar com a particularidade de `talent`
 * (um documento vira N `ConteudoCanonico`, um por nível).
 */

import { adaptarDocumento, adaptarNiveisDeTalento } from "./adapters";
import { diagnosticarDocumento, type DiagnosticoDocumento } from "./diagnostics";
import type { ContentTypeId, ModoAutomacao, ResultadoAdaptacao } from "./types";
import { validarConteudo } from "./validation";
import type { ResultadoValidacao } from "./types";

export interface ResultadoAdaptacaoValidada {
  adaptacao: ResultadoAdaptacao;
  validacao: ResultadoValidacao;
  diagnostico: DiagnosticoDocumento;
}

export interface DocumentoAdaptadoAdmin {
  contentType: ContentTypeId;
  slug: string;
  /** 1 item para a maioria dos content_types; N para talent (um por nível). */
  resultados: ResultadoAdaptacaoValidada[];
  resumoAutomacao: DiagnosticoDocumento;
  totalCamposDesconhecidos: number;
  algumInvalido: boolean;
}

const MODOS: ModoAutomacao[] = ["automatico", "assistido", "lembrete", "narrativo_rastreado", "sem_executor"];

function somarDiagnosticos(diagnosticos: DiagnosticoDocumento[]): DiagnosticoDocumento {
  const porModo = Object.fromEntries(MODOS.map((m) => [m, 0])) as Record<ModoAutomacao, number>;
  const efeitosSemExecutor: string[] = [];
  const efeitosLembrete: string[] = [];
  let totalEfeitos = 0;

  for (const d of diagnosticos) {
    totalEfeitos += d.totalEfeitos;
    for (const modo of MODOS) porModo[modo] += d.porModo[modo];
    efeitosSemExecutor.push(...d.efeitosSemExecutor);
    efeitosLembrete.push(...d.efeitosLembrete);
  }

  return { totalEfeitos, porModo, efeitosSemExecutor, efeitosLembrete };
}

export function adaptarParaAdmin(contentType: ContentTypeId, slug: string, raw: Record<string, unknown>): DocumentoAdaptadoAdmin {
  const adaptacoes = contentType === "talent" ? adaptarNiveisDeTalento(raw) : [adaptarDocumento(contentType, raw)];

  const resultados: ResultadoAdaptacaoValidada[] = adaptacoes.map((adaptacao) => ({
    adaptacao,
    validacao: validarConteudo(adaptacao.canonico, adaptacao.camposDesconhecidos),
    diagnostico: diagnosticarDocumento(adaptacao.canonico),
  }));

  return {
    contentType,
    slug,
    resultados,
    resumoAutomacao: somarDiagnosticos(resultados.map((r) => r.diagnostico)),
    totalCamposDesconhecidos: resultados.reduce((acc, r) => acc + r.adaptacao.camposDesconhecidos.length, 0),
    algumInvalido: resultados.some((r) => !r.validacao.valido),
  };
}
