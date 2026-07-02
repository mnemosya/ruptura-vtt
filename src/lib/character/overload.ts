/**
 * Sobrecarga diária e Ruptura pendente — checkpoint v0.37 (PRD 10.5/10.6).
 *
 * Primeira versão jogável: rastreia surtos usados no dia (0..3), aplica
 * o dano psíquico de 1d4 por surto, e no 3º surto marca Ruptura
 * pendente + exige teste de Vontade CD 7 (falha aplica Atordoado por
 * "1 rodada" via o sistema de condições já existente, v0.32/v0.33).
 *
 * Escopo explícito deste checkpoint: SEM tipos de surto com efeito
 * mecânico próprio (são só rótulos, ver `OVERLOAD_SURGE_TYPES`), SEM
 * resolução de Ruptura (Marca/Traço), SEM Colapso. `ruptura_pendente`
 * só é limpo por uma resolução de Ruptura futura — nunca por descanso.
 *
 * Dano psíquico: o PRD não amarra "dano psíquico" a nenhum recurso
 * específico, e não existe nenhuma regra codificada no app hoje que
 * relacione "dano psíquico" a PE automaticamente (PE só é editado
 * manualmente, sem sistema de dano). Por isso este módulo NUNCA
 * desconta PE sozinho — só devolve o valor rolado (`surge.danoPsiquico`)
 * para o jogador aplicar manualmente, com um warning explícito.
 */

import type { ActiveCondition, Character } from "./types";

export const OVERLOAD_SURGE_TYPES = [
  "Surto de Energia",
  "Surto de Foco",
  "Surto de Desequilíbrio",
  "Surto de Impacto",
  "Outro",
] as const;
export type OverloadSurgeType = (typeof OVERLOAD_SURGE_TYPES)[number];

export const MAX_OVERLOAD_SURGES_PER_DAY = 3;
const WILL_TEST_CD = 7;

export interface OverloadSurgeSummary {
  tipo: string;
  indice: number;
  danoPsiquico: number;
  criadoEm: string;
}

export interface UseOverloadSurgeResult {
  character: Character;
  surge: OverloadSurgeSummary | null;
  warnings: string[];
  /** true só no 3º surto — o chamador deve oferecer a rolagem de Vontade CD 7. */
  requiresWillRoll: boolean;
  rupturePending: boolean;
}

/**
 * Usa um surto de Sobrecarga. Recusa (sem mudar nada) se já houver 3
 * surtos usados no dia — `surge: null` sinaliza isso ao chamador.
 * `rng` é injetável para teste determinístico; por padrão usa
 * `Math.random` (mesmo padrão de `rollDie`, sem depender do módulo de
 * dice para manter este arquivo sem dependência cruzada desnecessária).
 */
export function useOverloadSurge(
  character: Character,
  tipo: string,
  nowIso: string,
  rng: () => number = Math.random,
): UseOverloadSurgeResult {
  const usadosAntes = character.sobrecarga_usada_dia ?? 0;

  if (usadosAntes >= MAX_OVERLOAD_SURGES_PER_DAY) {
    return {
      character,
      surge: null,
      warnings: [`Limite de ${MAX_OVERLOAD_SURGES_PER_DAY} surtos de Sobrecarga por dia já atingido.`],
      requiresWillRoll: false,
      rupturePending: character.ruptura_pendente ?? false,
    };
  }

  const indice = usadosAntes + 1;
  const danoPsiquico = 1 + Math.floor(rng() * 4); // 1d4
  const surge: OverloadSurgeSummary = { tipo, indice, danoPsiquico, criadoEm: nowIso };
  const terceiro = indice >= MAX_OVERLOAD_SURGES_PER_DAY;

  const nextCharacter: Character = {
    ...character,
    sobrecarga_usada_dia: indice,
    ultimo_surto: surge,
    ruptura_pendente: terceiro ? true : character.ruptura_pendente,
    ruptura_nivel_pendente: terceiro ? (character.ruptura_nivel_pendente ?? 1) : character.ruptura_nivel_pendente,
  };

  const warnings = [
    `Dano psíquico de ${danoPsiquico} (1d4) não é aplicado automaticamente a nenhum recurso — sem regra codificada de dano psíquico ainda; ajuste PE manualmente se for o caso.`,
  ];
  if (terceiro) {
    warnings.push("3º surto do dia — Ruptura pendente. Role Vontade CD 7; falha aplica Atordoado por 1 rodada.");
  }

  return {
    character: nextCharacter,
    surge,
    warnings,
    requiresWillRoll: terceiro,
    rupturePending: nextCharacter.ruptura_pendente ?? false,
  };
}

/** CD do teste de Vontade do 3º surto — exportado para o chamador montar o prompt de rolagem sem duplicar o número mágico. */
export const OVERLOAD_WILL_TEST_CD = WILL_TEST_CD;

/**
 * Aplica Atordoado por 1 rodada via o sistema de condições (v0.32) —
 * chamado pelo consumidor quando o teste de Vontade CD 7 falha.
 * Função pura: devolve `condicoes_ativas` atualizado, não persiste nada.
 */
export function applyStunFromFailedWillTest(condicoes: ActiveCondition[], nowIso: string): ActiveCondition[] {
  const nova: ActiveCondition = {
    id: crypto.randomUUID(),
    conditionId: "atordoado",
    nome: "Atordoado",
    descricao: "Sem ações ou reações.",
    origem: "Falha no teste de Vontade CD 7 (3º surto de Sobrecarga)",
    duracao: "1 rodada",
    aplicadaEm: nowIso,
    removidaEm: null,
    ativa: true,
  };
  return [...condicoes, nova];
}

/**
 * Reseta o contador de surtos do dia (chamado pelo descanso longo,
 * v0.36) — NUNCA limpa `ruptura_pendente`/`ruptura_nivel_pendente`
 * (regra explícita: Ruptura só é resolvida no fim de cena, não no
 * descanso).
 */
export function resetOverloadForLongRest(character: Character): Character {
  return { ...character, sobrecarga_usada_dia: 0 };
}
