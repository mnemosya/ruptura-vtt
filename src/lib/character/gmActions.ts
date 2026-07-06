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
  const after = Math.max(0, before - Math.max(0, Math.trunc(amount)));
  const beforePvPe: ResourceSnapshot = { pv: recursos.pv, pe: recursos.pe };
  const afterPvPe: ResourceSnapshot = { ...beforePvPe, [resource]: after };
  const baseChar: Character = { ...character, recursos_atuais: { ...recursos, [resource]: after } };
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
 * também dispara a remoção automática de Contundido/Envenenado/
 * Sangrando (`applyAutoHealRemoval`, mesma regra da ficha) e a
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
}

/**
 * Aplica uma condição publicada da Biblioteca. Não duplica a mesma
 * condição (`conditionId`) enquanto já houver uma ativa — `ActiveCondition`
 * não tem campo de stacks hoje, então duas entradas ativas com o mesmo
 * slug seriam indistinguíveis na UI.
 */
export function applyGmCondition(character: Character, condition: { slug: string; nome: string }, nowIso: string): GmApplyConditionResult {
  const atuais = character.condicoes_ativas ?? [];
  const jaAtiva = atuais.some((c) => c.ativa && c.conditionId === condition.slug);
  if (jaAtiva) {
    return { character, condicao: null, jaAtiva: true };
  }
  const novaCondicao: ActiveCondition = {
    id: crypto.randomUUID(),
    conditionId: condition.slug,
    nome: condition.nome,
    aplicadaEm: nowIso,
    removidaEm: null,
    ativa: true,
    origem: "dev_table_narrator_tool",
  };
  return { character: { ...character, condicoes_ativas: [...atuais, novaCondicao] }, condicao: novaCondicao, jaAtiva: false };
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
