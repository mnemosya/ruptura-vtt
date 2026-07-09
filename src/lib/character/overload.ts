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

import { rollDamageFormula } from "./attack";
import type { ActiveCondition, Character, OverloadRulesPayload } from "./types";

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
const DEFAULT_SURGE_DAMAGE_DIE = "1d4";

/** Máximo de cargas/dia da regra canônica `regras_personagem.sobrecarga` — fallback 3 (PRD 10.5) quando a regra não carregou. */
export function getOverloadMaxPerDay(rules: OverloadRulesPayload | null | undefined): number {
  const declarado = rules?.cargas_maximas_por_dia;
  return typeof declarado === "number" && declarado > 0 ? declarado : MAX_OVERLOAD_SURGES_PER_DAY;
}

/** Dado do dano psíquico imediato do surto — da regra canônica; fallback "1d4". */
export function getOverloadSurgeDamageDie(rules: OverloadRulesPayload | null | undefined): string {
  const dado = rules?.surto?.dano_imediato?.dado;
  return typeof dado === "string" && dado.trim() ? dado : DEFAULT_SURGE_DAMAGE_DIE;
}

/** Teste do 3º surto (perícia + CD) e condição de falha — da regra canônica; fallback Vontade CD 7 / Atordoado 1 rodada. */
export function getOverloadWillTestRule(rules: OverloadRulesPayload | null | undefined): {
  pericia: string;
  cd: number;
  falhaCondicao: string;
  falhaDuracao: string;
} {
  const teste = rules?.terceiro_surto?.teste;
  const falha = rules?.terceiro_surto?.falha;
  return {
    pericia: typeof teste?.pericia === "string" && teste.pericia ? teste.pericia : "vontade",
    cd: typeof teste?.cd === "number" ? teste.cd : WILL_TEST_CD,
    falhaCondicao: typeof falha?.aplicar_condicao === "string" && falha.aplicar_condicao ? falha.aplicar_condicao : "atordoado",
    falhaDuracao: typeof falha?.duracao === "string" && falha.duracao ? falha.duracao : "1 rodada",
  };
}

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
  rules?: OverloadRulesPayload | null,
): UseOverloadSurgeResult {
  const usadosAntes = character.sobrecarga_usada_dia ?? 0;
  const maxPerDay = getOverloadMaxPerDay(rules);

  if (usadosAntes >= maxPerDay) {
    return {
      character,
      surge: null,
      warnings: [`Limite de ${maxPerDay} surtos de Sobrecarga por dia já atingido — sobrecarga insuficiente.`],
      requiresWillRoll: false,
      rupturePending: character.ruptura_pendente ?? false,
    };
  }

  const indice = usadosAntes + 1;
  const dado = getOverloadSurgeDamageDie(rules);
  const danoPsiquico = rollDamageFormula(dado, rng);
  const surge: OverloadSurgeSummary = { tipo, indice, danoPsiquico, criadoEm: nowIso };
  const terceiro = indice >= maxPerDay;

  const nextCharacter: Character = {
    ...character,
    sobrecarga_usada_dia: indice,
    ultimo_surto: surge,
    ruptura_pendente: terceiro ? true : character.ruptura_pendente,
    ruptura_nivel_pendente: terceiro ? (character.ruptura_nivel_pendente ?? 1) : character.ruptura_nivel_pendente,
  };

  // A regra canônica declara `surto.aplicar_dano_na_hora: true`, mas o RECURSO-alvo do dano
  // psíquico não é estruturado em lugar nenhum do conteúdo — aplicar em PE seria regra
  // inventada. Continua manual, com aviso explícito (pendência de conteúdo).
  const willRule = getOverloadWillTestRule(rules);
  const warnings = [
    `Dano psíquico de ${danoPsiquico} (${dado}) não é aplicado automaticamente a nenhum recurso — o conteúdo não estrutura o recurso-alvo; ajuste PE manualmente se for o caso.`,
  ];
  if (terceiro) {
    warnings.push(
      `${indice}º surto do dia — Ruptura pendente. Role ${willRule.pericia} CD ${willRule.cd}; falha aplica ${willRule.falhaCondicao} por ${willRule.falhaDuracao}.`,
    );
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
