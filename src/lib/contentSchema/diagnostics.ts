/**
 * Diagnóstico do grau de automação (aditivo §5.3/§9.4/§14.3).
 *
 * Regra invariável: o modo de automação de um efeito NUNCA é um campo
 * livre preenchido pela pessoa administradora ou pelo adapter — é
 * sempre derivado do catálogo (`effectTypeRegistry.ts`). Isso é o que
 * impede o payload de declarar automação completa sem executor
 * compatível (regra explícita desta etapa).
 */

import { getEfeitoTipoDefinition } from "./effectTypeRegistry";
import type { ConteudoCanonico, EfeitoCanonico, ModoAutomacao } from "./types";

export interface DiagnosticoEfeito {
  modoAutomacao: ModoAutomacao;
  texto: string;
}

export function diagnosticarEfeito(tipoCanonico: string): DiagnosticoEfeito {
  const definicao = getEfeitoTipoDefinition(tipoCanonico);
  return { modoAutomacao: definicao.executor.modo, texto: definicao.executor.observacao };
}

export interface DiagnosticoDocumento {
  totalEfeitos: number;
  porModo: Record<ModoAutomacao, number>;
  efeitosSemExecutor: string[];
  efeitosLembrete: string[];
}

/**
 * Resumo do grau de automação do documento inteiro — insumo direto do
 * "diagnóstico técnico" e do "preview humano" descritos no aditivo §15.
 */
export function diagnosticarDocumento(doc: ConteudoCanonico): DiagnosticoDocumento {
  const porModo: Record<ModoAutomacao, number> = {
    automatico: 0,
    assistido: 0,
    lembrete: 0,
    narrativo_rastreado: 0,
    sem_executor: 0,
  };
  const efeitosSemExecutor: string[] = [];
  const efeitosLembrete: string[] = [];

  for (const efeito of doc.efeitos) {
    porModo[efeito.modoAutomacao] += 1;
    if (efeito.modoAutomacao === "sem_executor") efeitosSemExecutor.push(efeito.id);
    if (efeito.modoAutomacao === "lembrete") efeitosLembrete.push(efeito.id);
  }

  return { totalEfeitos: doc.efeitos.length, porModo, efeitosSemExecutor, efeitosLembrete };
}

/** Guarda-correde citado nas regras desta etapa: nenhum efeito pode se autodeclarar "automatico". */
export function assertModoAutomacaoConsistente(efeito: EfeitoCanonico): void {
  const esperado = diagnosticarEfeito(efeito.tipo).modoAutomacao;
  if (efeito.modoAutomacao !== esperado) {
    throw new Error(
      `Efeito ${efeito.id} declara modoAutomacao="${efeito.modoAutomacao}" mas o catálogo determina "${esperado}" para o tipo "${efeito.tipo}". modoAutomacao deve ser sempre derivado, nunca sobrescrito manualmente.`,
    );
  }
}
