/**
 * Aplica Surtos de Sobrecarga e registra a Ruptura pendente ao atingir o
 * limite. O chamador desconta o dano psíquico de PE pelo fluxo de recursos,
 * que também processa Integridade e Colapso.
 */

import { rollDamageFormula } from "./attack";
import { SURTOS_SOBRECARGA } from "../rulesetV12/ruptura";
import type { ActiveCondition, Character, OverloadRulesPayload } from "./types";

export const OVERLOAD_SURGE_TYPES = [
  "Surto de Energia",
  "Surto de Foco",
  "Surto de Desequilíbrio",
  "Surto de Impacto",
  "Surto de Urgência",
  "Surto de Discrição",
  "Surto de Expansão",
  "Surto de Proteção",
  "Surto de Difusão",
  "Outro",
] as const;
export type OverloadSurgeType = (typeof OVERLOAD_SURGE_TYPES)[number];

export const MAX_OVERLOAD_SURGES_PER_DAY = 3;
/** Surto de Energia: +5 de mana temporária na hora (some no descanso longo). */
export const SURTO_DE_ENERGIA = "Surto de Energia";
export const MANA_DO_SURTO_DE_ENERGIA = 5;
const WILL_TEST_CD = 7;
const DEFAULT_SURGE_DAMAGE_DIE = "1d4";

/** Limite base de Sobrecarga; Marcas de Ruptura podem ampliá-lo. */
export function getOverloadMaxPerDay(rules: OverloadRulesPayload | null | undefined): number {
  const declarado = rules?.cargas_maximas_por_dia;
  return typeof declarado === "number" && declarado > 0 ? declarado : MAX_OVERLOAD_SURGES_PER_DAY;
}

/** Dado do dano psíquico imediato do surto — da regra canônica; fallback "1d4". */
export function getOverloadSurgeDamageDie(rules: OverloadRulesPayload | null | undefined): string {
  const dado = rules?.surto?.dano_imediato?.dado;
  return typeof dado === "string" && dado.trim() ? dado : DEFAULT_SURGE_DAMAGE_DIE;
}

/** Teste ao alcançar o limite e condição de falha. */
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
  pvTemporarios?: number;
  criadoEm: string;
}

export interface UseOverloadSurgeResult {
  character: Character;
  surge: OverloadSurgeSummary | null;
  warnings: string[];
  /** true ao alcançar o limite; o chamador oferece a rolagem de Vontade. */
  requiresWillRoll: boolean;
  rupturePending: boolean;
}

/**
 * Usa um ponto de Sobrecarga. Recusa (sem mudar nada) se o limite atual
 * estiver esgotado — `surge: null` sinaliza isso ao chamador.
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
  /** Override do limite diário por talento (Mago › Ascensão → 5). Só vale quando > limite canônico. Ruptura acompanha o novo limite. */
  maxPerDayOverride?: number | null,
  /** Total já rolado fora daqui (os dados 3D da mesa). Sem ele, rola com `rng`. */
  danoRolado?: number | null,
): UseOverloadSurgeResult {
  const usadosAntes = character.sobrecarga_usada_dia ?? 0;
  const maxCanonico = getOverloadMaxPerDay(rules);
  const maxPerDay = typeof maxPerDayOverride === "number" && maxPerDayOverride > maxCanonico ? maxPerDayOverride : maxCanonico;
  const surtoCanonico = SURTOS_SOBRECARGA.find((surto) => surto.nome === tipo);
  if (surtoCanonico?.exigeMarcaId && !(character.historico_ruptura ?? []).some((entrada) => entrada.marcaId === surtoCanonico.exigeMarcaId)) {
    return {
      character,
      surge: null,
      warnings: [`${tipo} exige uma Marca de Ruptura que o personagem ainda não possui.`],
      requiresWillRoll: false,
      rupturePending: character.ruptura_pendente ?? false,
    };
  }

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
  const danoPsiquico = typeof danoRolado === "number" ? danoRolado : rollDamageFormula(dado, rng);
  const pvTemporarios = tipo === "Surto de Proteção" ? rollDamageFormula("1d8", rng) + 2 * indice : undefined;
  const surge: OverloadSurgeSummary = { tipo, indice, danoPsiquico, ...(pvTemporarios === undefined ? {} : { pvTemporarios }), criadoEm: nowIso };
  const terceiro = indice >= maxPerDay;

  const recursos = character.recursos_atuais;
  const nextCharacter: Character = {
    ...character,
    ...(recursos && (tipo === SURTO_DE_ENERGIA || pvTemporarios !== undefined)
      ? { recursos_atuais: {
          ...recursos,
          ...(tipo === SURTO_DE_ENERGIA ? { mana_temporaria: (recursos.mana_temporaria ?? 0) + ((character.historico_ruptura ?? []).some((entrada) => entrada.marcaId === "reserva_excedente") ? 7 : MANA_DO_SURTO_DE_ENERGIA) } : {}),
          ...(pvTemporarios === undefined ? {} : { pv_temporario: Math.max(recursos.pv_temporario ?? 0, pvTemporarios) }),
        } }
      : {}),
    sobrecarga_usada_dia: indice,
    ultimo_surto: surge,
    ruptura_pendente: terceiro ? true : character.ruptura_pendente,
    ruptura_nivel_pendente: terceiro ? (character.ruptura_nivel_pendente ?? 1) : character.ruptura_nivel_pendente,
  };

  // O dano psíquico vai em PE (cap. 16 da 1.2) — quem aplica é o chamador,
  // pelo caminho de edição de recurso (piso negativo, Integridade, Colapso).
  const willRule = getOverloadWillTestRule(rules);
  const warnings: string[] = [];
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
  // RUPTURA 1.2: o +1 de limite ganho numa Ruptura entra no fim do próximo descanso longo.
  const pendente = character.sobrecarga_limite_bonus_pendente ?? 0;
  return {
    ...character,
    sobrecarga_usada_dia: 0,
    ...(pendente > 0
      ? { sobrecarga_limite_bonus: (character.sobrecarga_limite_bonus ?? 0) + pendente, sobrecarga_limite_bonus_pendente: 0 }
      : {}),
  };
}
