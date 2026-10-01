/**
 * Ações mínimas de narrador sobre personagem (checkpoint v0.63) —
 * dano, cura, ajuste direto de recurso, aplicar/remover condição.
 * Usado pela ferramenta "Estado dos personagens" em `/dev/table`.
 *
 * Puramente funcional: recebe um `Character` e devolve o próximo
 * `Character` + metadados para log — quem chama decide persistência
 * (`updateCharacter`) e `addLog`. Reaproveita os mesmos helpers
 * canônicos já usados pela ficha (`applyAutoHealRemoval`,
 * `detectCollapseOnResourceChange`) — nunca duplica essa lógica.
 *
 * Fora de escopo deste checkpoint (ver relatório): cálculo de MIT/PD,
 * resolução de ataque completa, avanço de "dano adicional durante
 * Colapso" (`resolveCollapseAdditionalDamage` — fluxo mais pesado,
 * ligado a fim de rodada, não a uma ação avulsa de narrador) e dano
 * recorrente automático.
 */

import { applyAutoHealRemoval } from "./autoHeal";
import { detectCollapseOnResourceChange, type ResourceSnapshot } from "./collapse";
import { applyDamageThroughTemporaryPv } from "./temporaryPv";
import { getConditionLevel, getConditionLevelCap } from "./conditionState";
import type { ActiveCondition, Character, CharacterResources } from "./types";

const RECURSOS_PADRAO: Required<Pick<CharacterResources, "pv" | "pe" | "mana" | "integridade">> = {
  pv: 0,
  pe: 0,
  mana: 0,
  integridade: 0,
};

export type GmResource = "pv" | "pe" | "mana" | "integridade";

export interface GmDamageResult {
  character: Character;
  before: number;
  after: number;
}

/**
 * Aplica dano a PV ou PE — nunca abaixo de 0. Reaproveita
 * `detectCollapseOnResourceChange` (mesma regra da ficha) para
 * detectar início/fim de Colapso na mesma mudança.
 */
export function applyGmDamage(character: Character, resource: "pv" | "pe", amount: number, nowIso: string): GmDamageResult {
  const recursos = { ...RECURSOS_PADRAO, ...character.recursos_atuais };
  const before = recursos[resource];
  const pvDamage = resource === "pv" ? applyDamageThroughTemporaryPv(character, amount) : null;
  const after = pvDamage?.pvAfter ?? Math.max(0, before - Math.max(0, Math.trunc(amount)));
  const beforePvPe: ResourceSnapshot = { pv: recursos.pv, pe: recursos.pe };
  const afterPvPe: ResourceSnapshot = { ...beforePvPe, [resource]: after };
  const baseChar: Character = pvDamage?.character ?? { ...character, recursos_atuais: { ...recursos, [resource]: after } };
  const colapso = detectCollapseOnResourceChange(baseChar, beforePvPe, afterPvPe, nowIso);
  return { character: colapso.character, before, after };
}

export interface GmHealResult {
  character: Character;
  before: number;
  after: number;
  /** Condições removidas pela cura automática (só quando `resource === "pv"`). */
  removidasPorCura: ActiveCondition[];
}

/**
 * Aplica cura a PV, PE ou Mana — nunca acima de `max`. Cura de PV
 * também reduz automaticamente Contundido/Sangrando em 1 nível
 * (`applyAutoHealRemoval`, mesma regra da ficha) e faz a
 * detecção de fim de Colapso quando aplicável.
 */
export function applyGmHealing(
  character: Character,
  resource: "pv" | "pe" | "mana",
  amount: number,
  max: number,
  nowIso: string,
): GmHealResult {
  const recursos = { ...RECURSOS_PADRAO, ...character.recursos_atuais };
  const before = recursos[resource];
  const after = Math.min(Math.max(0, max), before + Math.max(0, Math.trunc(amount)));

  let nextCharacter: Character = { ...character, recursos_atuais: { ...recursos, [resource]: after } };
  let removidasPorCura: ActiveCondition[] = [];

  if (resource === "pv" || resource === "pe") {
    if (resource === "pv") {
      const { condicoes, removidas } = applyAutoHealRemoval(character.condicoes_ativas ?? [], before, after, nowIso);
      nextCharacter = { ...nextCharacter, condicoes_ativas: condicoes };
      removidasPorCura = removidas;
    }
    const beforePvPe: ResourceSnapshot = { pv: recursos.pv, pe: recursos.pe };
    const afterPvPe: ResourceSnapshot = { ...beforePvPe, [resource]: after };
    const colapso = detectCollapseOnResourceChange(nextCharacter, beforePvPe, afterPvPe, nowIso);
    nextCharacter = colapso.character;
  }

  return { character: nextCharacter, before, after, removidasPorCura };
}

export interface GmSetResourceResult {
  character: Character;
  before: number;
  after: number;
}

/**
 * Override manual direto de um recurso (PV/PE/Mana/Integridade) —
 * clamp em `[0, max]`. Deliberadamente NÃO chama cura automática nem
 * detecção de Colapso: é um ajuste explícito do narrador ("definir
 * valor"), não uma ação de jogo (dano/cura) — mesma distinção que a
 * ficha já faz para edição manual de recursos.
 */
export function setGmResourceValue(character: Character, resource: GmResource, newValue: number, max: number): GmSetResourceResult {
  const recursos = { ...RECURSOS_PADRAO, ...character.recursos_atuais };
  const before = recursos[resource];
  const after = Math.max(0, Math.min(Math.max(0, max), Math.trunc(newValue)));
  return { character: { ...character, recursos_atuais: { ...recursos, [resource]: after } }, before, after };
}

export interface GmApplyConditionResult {
  character: Character;
  condicao: ActiveCondition | null;
  /** true = não aplicou porque a mesma condição (por slug) já estava ativa (modelo atual não tem stacks). */
  jaAtiva: boolean;
  /** A mesma condição já existia e subiu um nível. */
  agravada: boolean;
  /**
   * Nova aplicação com a condição já no nível máximo (v1.2):
   * Ofuscado 2 → Cego até o fim do próximo turno (aplicado aqui);
   * Contundido 2 → fratura de um membro (só sinalizada: a escolha do
   * membro é do narrador).
   */
  transbordo?: "cego" | "fratura";
}

/**
 * Aplica uma condição publicada da Biblioteca. Uma nova aplicação de
 * condição cumulativa agrava seu nível até o limite canônico; condições
 * não cumulativas continuam sem duplicação. `authorship` (checkpoint talentos,
 * Fase 6) é opcional — quando presente, grava a autoria estruturada
 * (`sourceCharacterId`/`sourceTalentId`/etc.) usada por talentos como
 * Praga › Sangria Lenta/Contágio, que precisam identificar "efeitos que
 * EU apliquei" entre vários ativos no mesmo alvo.
 */
export function applyGmCondition(
  character: Character,
  condition: { slug: string; nome: string; duracao?: string; nivelMaximo?: number; round?: number },
  nowIso: string,
  authorship?: {
    sourceCharacterId?: string | null;
    sourceTalentId?: string | null;
    sourceType?: ActiveCondition["sourceType"];
    originalTargetId?: string | null;
    applicationEventId?: string | null;
  },
): GmApplyConditionResult {
  const atuais = character.condicoes_ativas ?? [];
  const ativa = atuais.find((c) => c.ativa && c.conditionId === condition.slug);
  const nivelMaximo = condition.nivelMaximo ?? getConditionLevelCap(condition.slug);
  if (ativa) {
    if (!nivelMaximo) return { character, condicao: null, jaAtiva: true, agravada: false };
    const nivelAtual = getConditionLevel(ativa);
    if (nivelAtual >= nivelMaximo) {
      if (condition.slug === "ofuscado") {
        const cegoAtivo = atuais.some((c) => c.ativa && c.conditionId === "cego");
        const cego: ActiveCondition = {
          id: crypto.randomUUID(),
          conditionId: "cego",
          nome: "Cego",
          origem: "Ofuscado no nível máximo",
          duracao: "ate_fim_do_proximo_turno",
          aplicadaEm: nowIso,
          removidaEm: null,
          ativa: true,
          aplicadaNaRodada: condition.round,
        };
        return {
          character: cegoAtivo ? character : { ...character, condicoes_ativas: [...atuais, cego] },
          condicao: ativa,
          jaAtiva: true,
          agravada: false,
          transbordo: "cego",
        };
      }
      if (condition.slug === "contundido") {
        return { character, condicao: ativa, jaAtiva: true, agravada: false, transbordo: "fratura" };
      }
      return { character, condicao: ativa, jaAtiva: true, agravada: false };
    }
    const agravada: ActiveCondition = { ...ativa, nivel: nivelAtual + 1, nivelMaximo, aplicadaNaRodada: condition.round };
    return {
      character: {
        ...character,
        condicoes_ativas: atuais.map((c) => c.id === ativa.id ? agravada : c),
      },
      condicao: agravada,
      jaAtiva: true,
      agravada: true,
    };
  }
  const novaCondicao: ActiveCondition = {
    id: crypto.randomUUID(),
    conditionId: condition.slug,
    nome: condition.nome,
    duracao: condition.duracao,
    aplicadaEm: nowIso,
    removidaEm: null,
    ativa: true,
    nivel: nivelMaximo ? 1 : undefined,
    nivelMaximo,
    aplicadaNaRodada: condition.round,
    origem: "dev_table_narrator_tool",
    ...(authorship ?? {}),
  };
  return { character: { ...character, condicoes_ativas: [...atuais, novaCondicao] }, condicao: novaCondicao, jaAtiva: false, agravada: false };
}

export interface GmRemoveConditionResult {
  character: Character;
  condicao: ActiveCondition | null;
}

/** Remove (marca `ativa:false` + `removidaEm`) uma condição ativa — nunca apaga a entrada, preserva histórico. */
export function removeGmCondition(character: Character, conditionInstanceId: string, nowIso: string): GmRemoveConditionResult {
  const atuais = character.condicoes_ativas ?? [];
  const condicao = atuais.find((c) => c.id === conditionInstanceId && c.ativa);
  if (!condicao) return { character, condicao: null };
  return {
    character: {
      ...character,
      condicoes_ativas: atuais.map((c) => (c.id === conditionInstanceId ? { ...c, ativa: false, removidaEm: nowIso } : c)),
    },
    condicao,
  };
}
