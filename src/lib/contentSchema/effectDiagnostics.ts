/**
 * Diagnóstico dinâmico de automação por efeito editável (Etapa 4).
 *
 * A pessoa administradora NUNCA escolhe o modo de automação — este
 * módulo deriva a partir de (a) o teto estático do catálogo da Etapa 1
 * (`effectTypeRegistry.ts` — "o executor sequer existe para este
 * tipo?") e (b) o quão completa/executável está a configuração
 * preenchida agora. O resultado nunca ultrapassa o teto do catálogo —
 * só pode ficar igual ou mais conservador.
 */

import { getEfeitoTipoDefinition } from "./effectTypeRegistry";
import type { EfeitoEditavel } from "./effectDraftTypes";
import type { ModoAutomacao } from "./types";

export interface DiagnosticoEfeitoEditavel {
  modoAutomacao: ModoAutomacao;
  executor?: string;
  motivo: string;
}

function formulaPreenchida(tipoFormula: string, quantidadeDados?: number, faces?: number, valorFixo?: number): boolean {
  if (tipoFormula === "fixo") return valorFixo != null;
  return (quantidadeDados ?? 0) > 0 && (faces ?? 0) > 0;
}

const RANK: Record<ModoAutomacao, number> = { automatico: 4, assistido: 3, lembrete: 2, narrativo_rastreado: 1, sem_executor: 0 };

/** Nunca deixa o resultado passar do teto do catálogo (Etapa 1) para aquele `tipo`. */
function limitarAoTeto(modo: ModoAutomacao, teto: ModoAutomacao): ModoAutomacao {
  return RANK[modo] <= RANK[teto] ? modo : teto;
}

export function diagnosticarEfeitoEditavel(efeito: EfeitoEditavel): DiagnosticoEfeitoEditavel {
  const definicaoCatalogo = getEfeitoTipoDefinition(efeito.tipo);
  const teto = definicaoCatalogo.executor.modo;

  if (!efeito.habilitado) {
    return { modoAutomacao: "lembrete", motivo: "Efeito desabilitado no rascunho — não será considerado quando (se) publicado." };
  }
  if (!efeito.gatilho) {
    return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Sem gatilho definido — configuração incompleta." };
  }

  switch (efeito.tipo) {
    case "dano": {
      const { tipoFormula, quantidadeDados, faces, valorFixo, tipoDano } = efeito.campos;
      if (!formulaPreenchida(tipoFormula, quantidadeDados, faces, valorFixo) || !tipoDano) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Fórmula ou tipo de dano incompletos." };
      }
      return {
        modoAutomacao: limitarAoTeto("assistido", teto),
        executor: "src/lib/character/spells.ts, itemUse.ts, endRoundConditions.ts",
        motivo: "Rola a fórmula; aplicação ao alvo em magia/item ainda depende de confirmação manual (dano em condição de fim de rodada já aplica sozinho).",
      };
    }
    case "cura": {
      const { tipoFormula, quantidadeDados, faces, valorFixo, recurso } = efeito.campos;
      if (!formulaPreenchida(tipoFormula, quantidadeDados, faces, valorFixo) || !recurso) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Fórmula ou recurso incompletos." };
      }
      if (!efeito.alvo) {
        return { modoAutomacao: limitarAoTeto("assistido", teto), motivo: "Falta alvo definido — requer seleção antes de aplicar." };
      }
      return { modoAutomacao: limitarAoTeto("automatico", teto), executor: "src/lib/character/itemUse.ts (applyGmHealing)", motivo: "Fórmula, recurso e alvo definidos — executor real já aplica e limita ao máximo." };
    }
    case "aplicar_condicao": {
      const { condicaoSlug, confirmacaoManual } = efeito.campos;
      if (!condicaoSlug) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Sem condição referenciada da Biblioteca." };
      }
      if (confirmacaoManual || !efeito.alvo || efeito.alvo === "selecionado_manualmente") {
        return {
          modoAutomacao: limitarAoTeto("assistido", teto),
          executor: "src/lib/character/conditionEffectExecutor.ts (executarAplicarCondicao)",
          motivo: "Executor genérico existe, mas exige seleção/confirmação manual de alvo (ou foi marcado como exigindo confirmação).",
        };
      }
      return {
        modoAutomacao: limitarAoTeto("automatico", teto),
        executor: "src/lib/character/conditionEffectExecutor.ts (executarAplicarCondicao)",
        motivo: "Condição referenciada e alvo resolvido — executor genérico valida e aplica.",
      };
    }
    case "remover_condicao": {
      const { condicaoSlug, removerTodas, selecaoManual } = efeito.campos;
      if (!condicaoSlug && !removerTodas && !selecaoManual) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Nenhuma condição, seleção manual ou remoção total configurada." };
      }
      if (selecaoManual) {
        return { modoAutomacao: limitarAoTeto("assistido", teto), motivo: "Seleção manual da condição a remover no momento da resolução." };
      }
      return { modoAutomacao: limitarAoTeto("automatico", teto), executor: "src/lib/character/itemUse.ts, actionConsole.ts", motivo: "Remove automaticamente quando a condição está ativa no alvo." };
    }
    case "modificar_teste": {
      const { modo, valor, tags, pericia, acao, confirmacaoDeContexto } = efeito.campos;
      const exigeValor = modo === "bonus" || modo === "penalidade";
      if (exigeValor && valor == null) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: `Modo "${modo}" exige um valor numérico.` };
      }
      if (tags.length === 0 && !pericia && !acao) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Sem tags/perícia/ação alvo — não há como o motor saber onde aplicar." };
      }
      if (confirmacaoDeContexto) {
        return { modoAutomacao: limitarAoTeto("assistido", teto), motivo: "Marcado como dependente de confirmação de contexto." };
      }
      return {
        modoAutomacao: limitarAoTeto("automatico", teto),
        executor: "src/lib/character/activeEffects.ts, talents.ts, technicalEffects.ts",
        motivo: "Modificador simples com alvo de teste definido — mesmo padrão já automatizado hoje.",
      };
    }
    case "alterar_recurso": {
      const { recurso, operacao, valorFixo, formula } = efeito.campos;
      if (valorFixo == null && !formula) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Sem valor fixo nem fórmula definidos." };
      }
      if (recurso === "pa" && efeito.gatilho === "ao_encerrar_rodada" && operacao === "reduzir") {
        return { modoAutomacao: limitarAoTeto("automatico", teto), executor: "src/lib/character/endRoundConditions.ts (reduzir_pa)", motivo: "Único caso hoje com executor automático real (redução de PA em fim de rodada)." };
      }
      return {
        modoAutomacao: limitarAoTeto("assistido", teto),
        motivo: `Recurso "${recurso}" reconhecido, mas ainda sem executor automático genérico fora do caso de PA em fim de rodada — depende de ação manual do narrador ou de outro fluxo específico.`,
      };
    }
  }
}
