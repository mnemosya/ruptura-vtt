/**
 * Remoção automática de condição por cura — checkpoint v0.34.
 *
 * RUPTURA v1.2: recuperar ao menos 1 PV reduz Contundido e Sangrando
 * em 1 nível; Envenenado exige antídoto ou tratamento apropriado.
 * A ficha encerra a condição quando o nível cai abaixo de 1 e oferece
 * desfazer quando isso acontece. Este módulo é puramente funcional:
 * dado o array de condições e a variação de PV, devolve o próximo
 * array de condições (sem tocar em estado/React) — quem chama decide
 * o que fazer com o resultado (setCharacter, log, aviso).
 *
 * Escopo explícito: só estas 2 condições, só por aumento de PV — nenhum dano recorrente,
 * fim de rodada ou ação derivada é implementado aqui.
 */

import type { ActiveCondition } from "./types";
import { reduceConditionLevel } from "./conditionState";

/** Slugs da Biblioteca cobertos pela redução automática por cura na v1.2. */
export const AUTO_HEAL_REMOVABLE_CONDITION_SLUGS = ["contundido", "sangrando"] as const;

export interface AutoHealRemovalResult {
  /** Próximo array de condições — mesma referência de entrada se nada foi removido. */
  condicoes: ActiveCondition[];
  /** As condições efetivamente removidas nesta chamada (já com ativa:false), para log/aviso/desfazer. */
  removidas: ActiveCondition[];
}

/**
 * Aplica a redução automática: só dispara se `pvNovo > pvAnterior`
 * (aumento real de PV — reduzir ou manter PV nunca remove nada).
 * Marca `ativa:false`, `removidaEm` e `removidaOrigem:"cura_pv"` nas
 * condições ativas cujo `conditionId` esteja em
 * `AUTO_HEAL_REMOVABLE_CONDITION_SLUGS`. Condições manuais sem
 * `conditionId` da Biblioteca nunca são removidas automaticamente —
 * não há como saber com segurança que "Sangrando" digitado à mão é a
 * mesma condição da Biblioteca (evita remover algo que o
 * narrador/jogador quis dizer outra coisa).
 */
export function applyAutoHealRemoval(
  condicoes: ActiveCondition[],
  pvAnterior: number,
  pvNovo: number,
  nowIso: string,
): AutoHealRemovalResult {
  if (pvNovo <= pvAnterior) {
    return { condicoes, removidas: [] };
  }

  const removidas: ActiveCondition[] = [];
  const proximas = condicoes.map((c) => {
    if (c.ativa && c.conditionId && (AUTO_HEAL_REMOVABLE_CONDITION_SLUGS as readonly string[]).includes(c.conditionId)) {
      const reduzida = reduceConditionLevel(c, 1, nowIso, "cura_pv");
      if (!reduzida.ativa) removidas.push(reduzida);
      return reduzida;
    }
    return c;
  });

  if (removidas.length === 0) {
    return { condicoes, removidas: [] };
  }
  return { condicoes: proximas, removidas };
}

/**
 * Desfaz uma remoção automática: reativa exatamente as condições cujos
 * `id` estejam em `idsParaReativar` (a última leva removida por cura,
 * rastreada pelo chamador) — nunca reativa remoções manuais antigas.
 */
export function undoAutoHealRemoval(condicoes: ActiveCondition[], idsParaReativar: string[]): ActiveCondition[] {
  const idsSet = new Set(idsParaReativar);
  return condicoes.map((c) =>
    idsSet.has(c.id) && c.removidaOrigem === "cura_pv"
      ? { ...c, ativa: true, removidaEm: null, removidaOrigem: undefined }
      : c,
  );
}
