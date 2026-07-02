/**
 * Remoção automática de condição por cura — checkpoint v0.34.
 *
 * PRD 9.3: "Contundido, Envenenado e Sangrando somem quando o
 * personagem recupera pelo menos 1 PV. A ficha remove a condição,
 * exibe aviso e oferece desfazer." Este módulo é puramente funcional:
 * dado o array de condições e a variação de PV, devolve o próximo
 * array de condições (sem tocar em estado/React) — quem chama decide
 * o que fazer com o resultado (setCharacter, log, aviso).
 *
 * Escopo explícito (ver checkpoint v0.34 e pendências do v0.33): só
 * estas 3 condições, só por aumento de PV — nenhum dano recorrente,
 * fim de rodada ou ação derivada é implementado aqui.
 */

import type { ActiveCondition } from "./types";

/** Slugs da Biblioteca cobertos pela remoção automática por cura (PRD 9.3). */
export const AUTO_HEAL_REMOVABLE_CONDITION_SLUGS = ["contundido", "envenenado", "sangrando"] as const;

export interface AutoHealRemovalResult {
  /** Próximo array de condições — mesma referência de entrada se nada foi removido. */
  condicoes: ActiveCondition[];
  /** As condições efetivamente removidas nesta chamada (já com ativa:false), para log/aviso/desfazer. */
  removidas: ActiveCondition[];
}

/**
 * Aplica a remoção automática: só dispara se `pvNovo > pvAnterior`
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
      const removida: ActiveCondition = { ...c, ativa: false, removidaEm: nowIso, removidaOrigem: "cura_pv" };
      removidas.push(removida);
      return removida;
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
