"use client";

/**
 * Página de DEBUG da base mínima de Mesa/Log persistente — não é a
 * interface final do VTT (sem chat real, sem realtime, sem
 * autenticação). Server Actions chamadas diretamente daqui, mesmo
 * padrão de CharacterSheetClient.
 */

import { useEffect, useState } from "react";
import {
  createCampaign,
  listCampaigns,
  canAdvanceCampaign,
  addLog,
  listLogs,
  createCampaignProfile,
  listCampaignProfiles,
  setCampaignProfileLocked,
  setCampaignProfileActiveCharacter,
  forceReleaseCampaignProfile,
  createCampaignInvite,
  listCampaignInvites,
  revokeCampaignInvite,
  listProfileSessions,
} from "../../../lib/table/storage";
import {
  TABLE_LOG_VISIBILITIES,
  PROFILE_HEARTBEAT_TIMEOUT_MS,
  type Campaign,
  type CampaignInvite,
  type CampaignProfile,
  type ProfileSession,
  type TableLogEntry,
  type TableLogVisibility,
} from "../../../lib/table";
import { getCharacter, updateCharacter, listCharactersForNarratorCampaign } from "../../../lib/character/storage";
import { endCampaignRound } from "../../../lib/table/endRound";
import { buildCampaignEndRoundSummary } from "../../../lib/table/endRoundSummary";
import { endCampaignScene } from "../../../lib/table/endScene";
import { buildCampaignEndSceneSummary } from "../../../lib/table/endSceneSummary";
import {
  listCrewInventory,
  upsertCrewInventoryItem,
  removeCrewInventoryItem,
  updateCrewInventoryItemInstance,
  type CrewInventoryItem,
} from "../../../lib/table/crewInventory";
import {
  computeDerivedStats,
  normalizeCharacter,
  applyGmDamage,
  applyGmHealing,
  setGmResourceValue,
  applyGmCondition,
  removeGmCondition,
  getEquippedDefenseProfile,
  resolveMarginBand,
  rollExtraMarginDie,
  getRegionMit,
  applyMarginBasedAttackDamage,
  rollDamageFormula,
  getReactionAvailability,
  spendReactionForDefense,
  getActiveConditionIds,
  getActiveTemporaryEffects,
  removeTemporaryEffect,
  addTemporaryEffect,
  formatTemporaryEffectSummary,
  describeDuration,
  getConditionEndRoundEffects,
  normalizeConditionSlug,
  resolvePendingRupture,
  BODY_REGIONS,
  BODY_REGION_LABELS,
  splitInventoryInstance,
  addInstanceToInventory,
  canSplitInstanceQuantity,
  hasHemorragia,
  getHemorragiaCriticalDie,
  getExecutarAvailability,
  markExecutarUsed,
  hasAEspreita,
  hasHeadshot,
  hasAtaqueFatal,
  hasLaminaOculta,
  endFurtividade,
  getCanalizarState,
  markCanalizarUsed,
  hasFuria,
  buildFuriaTemporaryEffect,
  getBlindagemAvailability,
  markBlindagemUsed,
  type GmResource,
  type CharacterRecord,
  type Character,
  type CharacterRulesPayload,
  type DerivedStats,
  type ItemContent,
  type BodyRegion,
  type ReactionRules,
  type ConditionContent,
  type ConditionEndRoundEffect,
  type InventoryItemInstance,
  type TalentContent,
  type MarginBandRules,
} from "../../../lib/character";
import { rollPericia } from "../../../lib/dice";
import type { NarratorConditionOption } from "./page";

const buttonStyle: React.CSSProperties = {
  background: "#1d1e24",
  color: "inherit",
  border: "1px solid #333",
  borderRadius: 6,
  padding: "8px 14px",
  fontSize: 13,
  cursor: "pointer",
};

interface AttackPanelForm {
  targetCharacterId: string;
  attackTotal: string;
  defenseTotal: string;
  region: BodyRegion | "";
  rawDamage: string;
  mit: string;
  mitSource: "structured" | "manual" | "none";
  /** true assim que o narrador edita o campo MIT à mão — trava o autopreenchimento até "Usar MIT da armadura" ser clicado (fix pós-v0.50: MIT não sobrescreve edição manual ao trocar alvo/região). */
  mitTouched: boolean;
  override: boolean;
  overrideReason: string;
  /** Perícia usada por "Resistir" — Vigor por padrão, Mobilidade se o narrador escolher (regra de produto deste checkpoint). */
  resistirSkill: "vigor" | "mobilidade";
  /** Modificador manual simples somado à rolagem de defesa — chips automáticos de condição/postura ficam fora deste checkpoint (ver requirementReminder). */
  defenseModifier: string;
  /** Último resultado de defesa rolado neste painel — preenche Defesa/CD automaticamente e alimenta o attack_resolved final. */
  lastDefense: DefenseRollResult | null;
  /** Permite rolar defesa mesmo sem Reação disponível quando a regra canônica (combat_flow) não modela "defesa sem Reação" — narrador decide explicitamente (nunca automático). */
  defenseOverride: boolean;
  /** Assassino › Hemorragia (checkpoint talentos, Fase E) — narrador confirma que quer aplicar (só habilitado quando atacante tem o talento + arma tem a propriedade Sangramento + margem ≥ sucesso padrão). */
  aplicarHemorragia: boolean;
  /** Assassino › Executar (checkpoint talentos, Fase E) — narrador confirma o requisito (alvo <50% PV, não percebe, Imobilizado ou Atordoado) manualmente antes de habilitar. */
  executarRequisitoConfirmado: boolean;
  executarAtivo: boolean;
  /** Atirador de Elite › À Espreita (checkpoint talentos, Fase 3) — narrador confirma alvo não ciente + ataque após sucesso em Mirar; sucesso/falha limitada viram sucesso padrão. */
  aEspreitaConfirmado: boolean;
  /** Atirador de Elite › Headshot — narrador confirma Mirar crítico; acerto (não miss) vira crítico. */
  headshotConfirmado: boolean;
  /** Sorrateiro › Ataque Fatal — narrador confirma que o atacante está saindo de Furtividade para este ataque; acerto vira crítico e encerra a Furtividade do atacante. */
  ataqueFatalConfirmado: boolean;
  /** Assassino › Lâmina Oculta (checkpoint talentos, Fase 4) — narrador confirma que o alvo não percebe a presença do atacante. */
  laminaOcultaAlvoConfirmado: boolean;
  /**
   * O sistema de bandas de dano (`resolveMarginBand`) só distingue "miss" (margem < 0)
   * de "limited" (0–1) — não separa falha_limitada de falha_crítica dentro do miss, essa
   * granularidade não existe no capítulo de Combate codificado aqui. Por isso, quando o
   * atacante tem Lâmina Oculta e o ataque errou, o NARRADOR confirma manualmente se este
   * miss específico conta como falha limitada (julgamento de mesa, mesmo critério de
   * "alvo não percebe presença") — só então a banda é promovida para "limited". Nunca
   * promove sozinho um número de margem específico (isso seria inventar um corte que o
   * capítulo não define).
   */
  laminaOcultaFalhaLimitadaConfirmada: boolean;
  /**
   * Mago de Batalha › Canalizar — Amortecer (checkpoint talentos, Fase 5) — mana que o
   * ALVO (não o atacante) gasta para reduzir o dano ANTES de MIT/PD, 1/rodada (gate
   * compartilhado com Potencializar, `CANALIZAR_USAGE_KEY`). Texto porque é digitado
   * pelo narrador (o alvo geralmente está numa sessão separada).
   */
  amortecerManaGasta: string;
  /** Guardião › Blindagem (checkpoint talentos, Fase 5) — talento do ALVO: anula TODO o dano em sucesso de Bloquear, 1/cena, sem consumir PD/escudo. */
  blindagemAnularAtivo: boolean;
}

/** Bandas fixas reaproveitadas por Executar/À Espreita/Headshot/Ataque Fatal/Lâmina Oculta — nunca inventadas ad-hoc em cada callsite. */
const LIMITED_BAND_RULES: MarginBandRules = { band: "limited", allowedRegions: ["tronco"], modifierType: "flat", flatModifier: -1 };
const STANDARD_BAND_RULES: MarginBandRules = { band: "standard", allowedRegions: ["tronco", "bracos", "pernas"], modifierType: "none", flatModifier: 0 };
const CRITICAL_BAND_RULES: MarginBandRules = { band: "critical", allowedRegions: [...BODY_REGIONS], modifierType: "extraDie", flatModifier: 0 };

/**
 * Aplica as sobreposições de banda de margem dos talentos de combate
 * (Executar > À Espreita > Headshot/Ataque Fatal, nessa ordem — Executar
 * já força crítico incondicional, então os demais não têm efeito quando
 * ele está ativo). À Espreita só eleva "limited" (sucesso limitado ou
 * falha limitada tratada como sucesso, ver resolveMarginBand) para
 * "standard"; Headshot/Ataque Fatal só forçam crítico quando já é um
 * ACERTO (nunca transformam miss em acerto).
 */
function applyMarginBandOverrides(
  baseBandRules: MarginBandRules | null,
  form: Pick<
    AttackPanelForm,
    "executarAtivo" | "aEspreitaConfirmado" | "headshotConfirmado" | "ataqueFatalConfirmado" | "laminaOcultaAlvoConfirmado" | "laminaOcultaFalhaLimitadaConfirmada"
  >,
): MarginBandRules | null {
  if (form.executarAtivo) return CRITICAL_BAND_RULES;
  let effective = baseBandRules;
  if (form.laminaOcultaAlvoConfirmado && form.laminaOcultaFalhaLimitadaConfirmada && effective?.band === "miss") {
    effective = LIMITED_BAND_RULES;
  }
  if (form.aEspreitaConfirmado && effective?.band === "limited") {
    effective = STANDARD_BAND_RULES;
  }
  if ((form.headshotConfirmado || form.ataqueFatalConfirmado) && effective && effective.band !== "miss") {
    effective = CRITICAL_BAND_RULES;
  }
  return effective;
}

type DefenseType = "esquivar" | "aparar" | "bloquear" | "resistir";

interface DefenseRollResult {
  defenseReactionLogId: string;
  defenseType: DefenseType;
  defenseName: string;
  attributeId: string;
  attributeName: string;
  skillId: string;
  skillName: string;
  dice: number[];
  highestDie: number;
  skillValue: number;
  modifiersTotal: number;
  total: number;
  reactionCost: number;
  reactionsBefore: number;
  reactionsAfter: number;
  requirementStatus: "met" | "not_detected" | "manual_override" | "not_applicable";
  requirementReminder: string | null;
}

const DEFAULT_ATTACK_PANEL_FORM: AttackPanelForm = {
  targetCharacterId: "",
  attackTotal: "",
  defenseTotal: "",
  region: "",
  rawDamage: "",
  mit: "",
  mitSource: "none",
  mitTouched: false,
  override: false,
  overrideReason: "",
  resistirSkill: "vigor",
  defenseModifier: "",
  lastDefense: null,
  defenseOverride: false,
  aplicarHemorragia: false,
  executarRequisitoConfirmado: false,
  executarAtivo: false,
  aEspreitaConfirmado: false,
  headshotConfirmado: false,
  ataqueFatalConfirmado: false,
  laminaOcultaAlvoConfirmado: false,
  laminaOcultaFalhaLimitadaConfirmada: false,
  amortecerManaGasta: "",
  blindagemAnularAtivo: false,
};

/**
 * Painel "Resolver ataque mágico" (checkpoint pós-v0.70) — reaproveita
 * boa parte do modelo do ataque físico (alvo, defesa/reação, margem,
 * MIT, override), mas NUNCA assume região/MIT automáticos: a magia
 * pode ser de área (sem região corporal aplicável) e nenhuma magia do
 * catálogo hoje estrutura se MIT se aplica ao dano — MIT fica sempre
 * manual aqui, com lembrete explícito.
 */
interface SpellAttackPanelForm {
  targetCharacterId: string;
  /** Total do ataque — pré-preenchido do log quando a magia foi rolável na conjuração; editável (nunca inventa quando ausente). */
  attackTotal: string;
  defenseTotal: string;
  rawDamage: string;
  mit: string;
  /** Região só é oferecida quando a magia não declara área — nunca forçada em efeito de área/explosão/zona. */
  region: BodyRegion | "";
  override: boolean;
  overrideReason: string;
  resistirSkill: "vigor" | "mobilidade";
  defenseModifier: string;
  lastDefense: DefenseRollResult | null;
  defenseOverride: boolean;
}

const DEFAULT_SPELL_ATTACK_PANEL_FORM: SpellAttackPanelForm = {
  targetCharacterId: "",
  attackTotal: "",
  defenseTotal: "",
  rawDamage: "",
  mit: "",
  region: "",
  override: false,
  overrideReason: "",
  resistirSkill: "vigor",
  defenseModifier: "",
  lastDefense: null,
  defenseOverride: false,
};

const DEFENSE_TYPE_LABELS: Record<DefenseType, string> = {
  esquivar: "Esquivar",
  aparar: "Aparar",
  bloquear: "Bloquear",
  resistir: "Resistir",
};

/** Perícia canônica de cada defesa (fallback do capítulo de Combate) — Resistir usa `form.resistirSkill` em vez de um valor fixo aqui. */
const DEFENSE_SKILL_SLUG: Record<Exclude<DefenseType, "resistir">, string> = {
  esquivar: "reflexos",
  aparar: "luta",
  bloquear: "reflexos",
};

const inputStyle: React.CSSProperties = {
  background: "#0f1014",
  color: "inherit",
  border: "1px solid #333",
  borderRadius: 4,
  padding: "6px 8px",
  fontSize: 13,
};

const VISIBILITY_LABELS: Record<TableLogVisibility, string> = {
  public: "Pública",
  private: "Privada",
  gm: "Mestre (GM)",
};

function formatRolagem(payload: Record<string, unknown>): string {
  if (typeof payload.characterNome === "string") {
    if (payload.atributo) {
      const pericia = payload.pericia ? ` + ${payload.pericia}` : " (sem perícia)";
      return `${payload.characterNome}: ${payload.atributo}${pericia} = ${payload.total}`;
    }
    if (payload.expressao) {
      return `${payload.characterNome}: ${payload.expressao} = ${payload.total}`;
    }
  }
  return `Rolagem — total ${typeof payload.total === "number" ? payload.total : "?"}.`;
}

function formatProfileEvent(payload: Record<string, unknown>): string {
  const nickname = typeof payload.profileNickname === "string" ? payload.profileNickname : "perfil desconhecido";
  if (payload.evento === "enter") return `${nickname}: entrou no perfil`;
  if (payload.evento === "leave") return `${nickname}: saiu do perfil`;
  if (payload.evento === "heartbeat_expirado") return `${nickname}: heartbeat expirado (perfil perdido)`;
  return `${nickname}: ${typeof payload.evento === "string" ? payload.evento.replace(/_/g, " ") : "evento de perfil"}`;
}

/** "postura_ofensiva" → "Postura Ofensiva" — só para exibir slugs de estado sem tabela nova. */
function humanizeStateSlug(slug: string): string {
  return slug
    .split("_")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Checkpoint v0.64 — mesmo formatador de `MesaTab.tsx` (duplicado aqui
 * de propósito: `/dev/table` e a aba Mesa da ficha são duas árvores de
 * componente distintas, sem import compartilhado hoje). Nunca cai em
 * JSON cru: custo, condições/estados aplicados/removidos e lembretes.
 */
function formatActionUsed(payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  const actionName = typeof payload.actionName === "string" ? payload.actionName : "Ação";
  const cost = payload.cost as Record<string, unknown> | undefined;
  const custoLabel = typeof cost?.label === "string" ? cost.label : "—";
  const removedConditions = Array.isArray(payload.removedConditions)
    ? payload.removedConditions.filter((c): c is string => typeof c === "string")
    : [];
  const pendingEffects = Array.isArray(payload.pendingEffects)
    ? payload.pendingEffects.filter((c): c is string => typeof c === "string")
    : [];
  const reminders = Array.isArray(payload.reminders) ? payload.reminders.filter((r): r is string => typeof r === "string") : [];
  const appliedState = typeof payload.appliedState === "string" ? payload.appliedState : null;
  const removedStates = Array.isArray(payload.removedStates) ? payload.removedStates.filter((s): s is string => typeof s === "string") : [];

  const partes = [`custo ${custoLabel}`];
  if (payload.defenseWithoutReaction === true) {
    const penalty = typeof payload.reactionPenaltyApplied === "number" ? payload.reactionPenaltyApplied : null;
    partes.push(`defesa sem Reação${penalty != null ? ` · penalidade ${penalty}` : ""}`);
  } else if (payload.usedReaction === true) {
    partes.push("usou 1 Reação");
  }
  if (removedConditions.length > 0) partes.push(`removeu ${removedConditions.join(", ")}`);
  if (appliedState) partes.push(`ativou ${humanizeStateSlug(appliedState)}`);
  if (removedStates.length > 0) partes.push(`desligou ${removedStates.map(humanizeStateSlug).join(", ")}`);
  if (pendingEffects.length > 0) partes.push(`pendente: ${pendingEffects.join(", ")}`);

  const weaponName = typeof payload.weaponName === "string" ? payload.weaponName : null;
  if (weaponName) {
    const attackSkill = typeof payload.attackSkill === "string" ? payload.attackSkill : null;
    partes.push(`arma: ${weaponName}${attackSkill ? ` (${attackSkill})` : ""}`);
    const damageBase = typeof payload.damageBase === "string" ? payload.damageBase : null;
    const damageType = typeof payload.damageType === "string" ? payload.damageType : null;
    partes.push(`dano-base: ${damageBase ? `${damageBase}${damageType ? ` (${damageType})` : ""}` : "não estruturado"}`);
    if (payload.ammoConsumed === true) {
      const quiverName = typeof payload.quiverName === "string" ? payload.quiverName : null;
      const arrowType = typeof payload.arrowType === "string" ? payload.arrowType : null;
      const ammoBefore = typeof payload.ammoBefore === "number" ? payload.ammoBefore : "?";
      const ammoAfter = typeof payload.ammoAfter === "number" ? payload.ammoAfter : "?";
      partes.push(
        quiverName ? `${quiverName}: ${arrowType ?? "flecha"} ${ammoBefore} → ${ammoAfter}` : `munição ${ammoBefore} → ${ammoAfter}`,
      );
    }
  }

  const base = `${characterNome}: ${actionName} (${partes.join(" · ")})`;
  return reminders.length > 0 ? `${base} — Lembrete: ${reminders.join(" ")}` : base;
}

const MARGIN_BAND_LABELS: Record<string, string> = {
  miss: "errou",
  limited: "margem limitada",
  standard: "margem padrão",
  critical: "margem crítica",
};

/**
 * `attack_resolved` — tipo canônico já existente (mesa dashboard,
 * checkpoint v0.47/v0.58, ver `formatAttackResolved` em MesaTab.tsx).
 * Este formatador cobre AMBOS os formatos de payload: o antigo
 * (`attackerWins`/`attackerTotal`/`damageRoll`, ataque contestado
 * direto do dashboard) e o novo (`marginBand`/`selectedRegion`/
 * `finalDamage`, "Resolver Ataque" a partir de um log `action_used` em
 * /dev/table, checkpoint pós-v0.50). Nunca cai em JSON cru.
 */
function formatAttackResolved(payload: Record<string, unknown>): string {
  // Formato novo (marginBand presente) — resolução por margem/região a partir de action_used.
  if (typeof payload.marginBand === "string") {
    const attackerName = typeof payload.attackerName === "string" ? payload.attackerName : "Atacante";
    const targetName = typeof payload.targetName === "string" ? payload.targetName : "Alvo";
    const weaponName = typeof payload.weaponName === "string" ? payload.weaponName : null;
    const margin = typeof payload.margin === "number" ? payload.margin : null;
    const bandLabel = MARGIN_BAND_LABELS[payload.marginBand as string] ?? (payload.marginBand as string);
    const selectedRegion = typeof payload.selectedRegion === "string" ? payload.selectedRegion : null;
    const regionLabel = selectedRegion ? BODY_REGION_LABELS[selectedRegion as BodyRegion] ?? selectedRegion : null;
    const rawDamage = typeof payload.rawDamage === "number" ? payload.rawDamage : "?";
    const mitApplied = typeof payload.mitApplied === "number" ? payload.mitApplied : 0;
    const finalDamage = typeof payload.finalDamage === "number" ? payload.finalDamage : "?";
    const pvBefore = typeof payload.targetPvBefore === "number" ? payload.targetPvBefore : "?";
    const pvAfter = typeof payload.targetPvAfter === "number" ? payload.targetPvAfter : "?";
    const damageType = typeof payload.damageType === "string" ? payload.damageType : null;
    const override = payload.override === true;

    const partes = [
      `${attackerName} → ${targetName}`,
      weaponName ? `arma: ${weaponName}` : null,
      margin != null ? `margem ${margin} (${bandLabel})` : bandLabel,
      regionLabel ? `região: ${regionLabel}` : null,
      `dano bruto ${rawDamage}${damageType ? ` (${damageType})` : ""}`,
      `MIT ${mitApplied}`,
      `dano final ${finalDamage}`,
      `PV ${pvBefore} → ${pvAfter}`,
      override ? "override" : null,
    ].filter((p): p is string => Boolean(p));

    return `Ataque resolvido — ${partes.join(" · ")}.`;
  }

  // Formato antigo (mesa dashboard, checkpoint v0.47/v0.58) — mantido para logs anteriores.
  const attackerNome = typeof payload.attackerNome === "string" ? payload.attackerNome : "Atacante";
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Alvo";
  const margin = typeof payload.margin === "number" ? payload.margin : "?";
  if (payload.attackerWins === true) {
    const damageRoll = typeof payload.damageRoll === "number" ? payload.damageRoll : "?";
    const damageType = typeof payload.damageType === "string" ? payload.damageType : "";
    return `${attackerNome} atacou ${characterNome} (margem ${margin}) — ${damageRoll} de dano ${damageType}.`;
  }
  return `${attackerNome} atacou ${characterNome} (margem ${margin}) — defesa bem-sucedida, sem dano.`;
}

/**
 * `defense_reaction_used` (checkpoint pós-v0.50, defesa reativa no
 * painel "Resolver Ataque") — "Defesa usada — {defensor} usou {tipo}:
 * {total} (Reações {antes} → {depois})." Nunca cai em JSON cru.
 */
function formatDefenseReactionUsed(payload: Record<string, unknown>): string {
  const targetName = typeof payload.targetName === "string" ? payload.targetName : "Personagem";
  const defenseName = typeof payload.defenseName === "string" ? payload.defenseName : "Defesa";
  const total = typeof payload.total === "number" ? payload.total : "?";
  const reactionsBefore = typeof payload.reactionsBefore === "number" ? payload.reactionsBefore : "?";
  const reactionsAfter = typeof payload.reactionsAfter === "number" ? payload.reactionsAfter : "?";
  const requirementReminder = typeof payload.requirementReminder === "string" ? payload.requirementReminder : null;
  const requirementStatus = typeof payload.requirementStatus === "string" ? payload.requirementStatus : null;

  let base = `Defesa usada — ${targetName} usou ${defenseName}: ${total} (Reações ${reactionsBefore} → ${reactionsAfter}).`;
  if (requirementReminder && requirementStatus !== "met" && requirementStatus !== "not_applicable") {
    base += ` ${requirementReminder}`;
  }
  return base;
}

/**
 * `spell_attack_used` (checkpoint pós-v0.70) — "Ataque mágico —
 * {personagem} conjurou {magia}: total {X}, dano {Y}, tipo {Z}."
 * (formato mínimo pedido). Total ausente quando o payload da magia não
 * estruturou perícia/atributo de acerto — nunca inventa um número.
 */
function formatSpellAttackUsed(payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  const spellName = typeof payload.spellName === "string" ? payload.spellName : "Magia";
  const total = typeof payload.total === "number" ? payload.total : null;
  const damageFormula = typeof payload.damageFormula === "string" ? payload.damageFormula : null;
  const damageRolled = typeof payload.damageRolled === "number" ? payload.damageRolled : null;
  const damageType = typeof payload.damageType === "string" ? payload.damageType : null;
  const area = payload.area != null ? String(payload.area) : null;
  const range = payload.range != null ? String(payload.range) : null;
  const fusion = typeof payload.fusion === "object" && payload.fusion !== null ? (payload.fusion as Record<string, unknown>) : null;

  const partes = [
    total != null ? `total ${total}` : "teste de acerto não rolado automaticamente",
    damageRolled != null ? `dano ${damageRolled}${damageFormula ? ` (${damageFormula})` : ""}${damageType ? ` ${damageType}` : ""}` : damageFormula ? `dano ${damageFormula}${damageType ? ` ${damageType}` : ""}` : null,
    area ? `área: ${area}` : null,
    range ? `alcance: ${range}` : null,
  ].filter((p): p is string => Boolean(p));

  const fusedNome = fusion && typeof fusion.fusedSpellNome === "string" ? fusion.fusedSpellNome : null;
  const nomeCompleto = `${spellName}${fusedNome ? ` + ${fusedNome} (FUSÃO)` : ""}`;
  const reminders = Array.isArray(payload.reminders) ? payload.reminders.filter((r): r is string => typeof r === "string") : [];
  const base = `Ataque mágico — ${characterNome} conjurou ${nomeCompleto}: ${partes.join(", ")}.`;
  return reminders.length > 0 ? `${base} — ${reminders.join(" ")}` : base;
}

/**
 * `spell_attack_resolved` (checkpoint pós-v0.70) — "Ataque mágico
 * resolvido — {conjurador} → {alvo} · {magia} · margem {X} · dano
 * final {Y} · PV {antes} → {depois}." (formato mínimo pedido).
 */
function formatSpellAttackResolved(payload: Record<string, unknown>): string {
  const casterName = typeof payload.casterName === "string" ? payload.casterName : "Conjurador";
  const targetName = typeof payload.targetName === "string" ? payload.targetName : "Alvo";
  const spellName = typeof payload.spellName === "string" ? payload.spellName : "Magia";
  const margin = typeof payload.margin === "number" ? payload.margin : null;
  const marginBand = typeof payload.marginBand === "string" ? MARGIN_BAND_LABELS[payload.marginBand] ?? payload.marginBand : null;
  const finalDamage = typeof payload.finalDamage === "number" ? payload.finalDamage : "?";
  const pvBefore = typeof payload.targetPvBefore === "number" ? payload.targetPvBefore : "?";
  const pvAfter = typeof payload.targetPvAfter === "number" ? payload.targetPvAfter : "?";
  const mitApplied = typeof payload.mitApplied === "number" ? payload.mitApplied : 0;
  const damageType = typeof payload.damageType === "string" ? payload.damageType : null;
  const selectedRegion = typeof payload.selectedRegion === "string" ? payload.selectedRegion : null;
  const regionLabel = selectedRegion ? BODY_REGION_LABELS[selectedRegion as BodyRegion] ?? selectedRegion : null;
  const override = payload.override === true;
  const resistanceReminder = typeof payload.resistanceReminder === "string" ? payload.resistanceReminder : null;
  const areaReminder = typeof payload.areaReminder === "string" ? payload.areaReminder : null;

  const partes = [
    margin != null ? `margem ${margin}${marginBand ? ` (${marginBand})` : ""}` : null,
    regionLabel ? `região: ${regionLabel}` : null,
    `MIT ${mitApplied}`,
    `dano final ${finalDamage}${damageType ? ` (${damageType})` : ""}`,
    `PV ${pvBefore} → ${pvAfter}`,
    override ? "override" : null,
  ].filter((p): p is string => Boolean(p));

  const extras = [resistanceReminder, areaReminder].filter((r): r is string => Boolean(r));
  const base = `Ataque mágico resolvido — ${casterName} → ${targetName} · ${spellName} · ${partes.join(" · ")}.`;
  return extras.length > 0 ? `${base} — ${extras.join(" ")}` : base;
}

const ENTRY_KIND_LABELS: Record<string, string> = {
  chat: "Mensagem",
  rolagem_pericia: "Rolagem de Perícia",
  rolagem_expressao: "Rolagem de Expressão",
  profile_event: "Evento de Perfil",
  action_used: "Ação Usada",
  attack_resolved: "Ataque Resolvido",
  defense_reaction_used: "Defesa Usada",
  round_end_processed: "Rodada Encerrada",
  scene_end_processed: "Cena Encerrada",
  condition_end_round_damage: "Dano de Condição",
  condition_end_round_check_created: "Teste de Condição Pendente",
  condition_end_round_check_resolved: "Teste de Condição Resolvido",
  round_pa_reduced_by_condition: "PA Reduzido por Condição",
  condition_applied: "Condição Aplicada",
  condition_removed: "Condição Removida",
  collapse_end_round_test: "Teste de Colapso",
  collapse_third_segment_test: "Colapso — 3º Segmento",
  collapse_outcome: "Desfecho de Colapso",
  rupture_resolved: "Ruptura Resolvida",
  rupture_choice_created: "Marca/Traço Pendentes",
  integrity_zero_pending: "Integridade Zerada",
  character_state_change: "Estado do Personagem",
  item_used: "Item Usado",
  talent_used: "Talento Usado",
  spell_cast: "Magia Conjurada",
  overload_surge: "Surto de Sobrecarga",
  overload_surge_used: "Surto de Sobrecarga",
  overload_will_roll: "Teste de Vontade (Sobrecarga)",
  inventory_transfer: "Transferência de Inventário",
  spell_attack_used: "Ataque Mágico",
  spell_attack_resolved: "Ataque Mágico Resolvido",
  temporary_effect_added: "Efeito Temporário Criado",
  temporary_effect_removed: "Efeito Temporário Removido",
  temporary_effect_expired: "Efeito Temporário Expirado",
};

function entryKindLabel(type: string): string {
  return ENTRY_KIND_LABELS[type] ?? type;
}

function entryIcon(type: string): string {
  if (type === "chat") return "💬";
  if (type === "rolagem_pericia" || type === "rolagem_expressao") return "🎲";
  if (type === "profile_event") return "🔑";
  if (type === "action_used") return "⚔";
  if (type === "attack_resolved") return "💥";
  if (type === "defense_reaction_used") return "🛡";
  if (type === "round_end_processed") return "🎬";
  if (type === "scene_end_processed") return "🎬";
  if (type === "condition_end_round_damage") return "🩸";
  if (type === "condition_end_round_check_created" || type === "condition_end_round_check_resolved") return "🎯";
  if (type.startsWith("collapse_")) return "💀";
  if (type === "rupture_resolved" || type === "rupture_choice_created") return "💔";
  if (type === "integrity_zero_pending") return "☠";
  if (type === "item_used") return "🎒";
  if (type === "talent_used") return "✨";
  if (type === "spell_cast") return "🔮";
  if (type === "overload_surge" || type === "overload_surge_used" || type === "overload_will_roll") return "⚡";
  if (type === "inventory_transfer") return "📦";
  if (type === "spell_attack_used" || type === "spell_attack_resolved") return "⚔";
  if (type === "temporary_effect_added" || type === "temporary_effect_removed" || type === "temporary_effect_expired") return "⏱";
  return "•";
}

/**
 * Formatador de logs de sistema (fim de rodada/cena, condições,
 * colapso, ruptura) para /dev/table — checkpoint pós-v0.58. Espelha os
 * formatadores da aba Mesa (`MesaTab.tsx`, duplicação intencional: as
 * duas árvores de componente não compartilham import hoje, mesmo padrão
 * de `formatActionUsed`). NUNCA cai em JSON cru: o último fallback é uma
 * linha legível com o rótulo do tipo + nome do personagem.
 */
/**
 * `temporary_effect_added` / `temporary_effect_removed` /
 * `temporary_effect_expired` (checkpoint pós-v0.71) — nunca cai em JSON
 * cru. "Efeito temporário criado/removido/expirado — {personagem}:
 * {efeito} (fonte {tipo}: {nome}) · {duração/motivo}."
 */
function formatTemporaryEffectLog(type: string, payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  const effectName = typeof payload.effectName === "string" ? payload.effectName : "Efeito";
  const sourceType = typeof payload.sourceType === "string" ? payload.sourceType : null;
  const sourceName = typeof payload.sourceName === "string" ? payload.sourceName : null;
  const durationType = typeof payload.durationType === "string" ? payload.durationType : null;
  const remainingRounds = typeof payload.remainingRounds === "number" ? payload.remainingRounds : null;
  const stacks = typeof payload.stacks === "number" && payload.stacks > 1 ? payload.stacks : null;
  const reason = typeof payload.reason === "string" ? payload.reason : null;

  const verbo = type === "temporary_effect_added" ? "criado" : type === "temporary_effect_removed" ? "removido" : "expirado";
  const duracaoTxt =
    durationType === "rounds"
      ? remainingRounds != null && verbo === "criado"
        ? `${remainingRounds} rodada(s)`
        : "por rodadas"
      : durationType === "scene"
        ? "até o fim da cena"
        : durationType === "rest"
          ? "até o descanso longo"
          : durationType === "manual"
            ? "duração manual"
            : null;
  const partes = [
    sourceType && sourceName ? `fonte ${sourceType}: ${sourceName}` : null,
    duracaoTxt,
    stacks ? `${stacks} pilhas` : null,
    verbo !== "criado" && reason ? reason : null,
  ].filter((p): p is string => Boolean(p));
  return `Efeito temporário ${verbo} — ${characterNome}: ${effectName}${partes.length > 0 ? ` (${partes.join(" · ")})` : ""}.`;
}

function formatSystemLog(type: string, payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  const conditionName = typeof payload.conditionName === "string" ? payload.conditionName : "Condição";
  const names = (v: unknown): string[] => (Array.isArray(v) ? v.filter((n): n is string => typeof n === "string") : []);

  if (type === "item_used") {
    const itemName = typeof payload.itemName === "string" ? payload.itemName : "Item";
    const useType = typeof payload.useType === "string" ? payload.useType : null;
    const partes: string[] = [];
    const paCost = typeof payload.paCost === "number" ? payload.paCost : null;
    const paBefore = typeof payload.paBefore === "number" ? payload.paBefore : null;
    const paAfter = typeof payload.paAfter === "number" ? payload.paAfter : null;
    if (paCost != null && paBefore != null && paAfter != null) partes.push(`PA ${paBefore} → ${paAfter}`);
    const resourceChanges = Array.isArray(payload.resourceChanges) ? payload.resourceChanges : [];
    for (const mudanca of resourceChanges) {
      if (typeof mudanca !== "object" || mudanca === null) continue;
      const m = mudanca as Record<string, unknown>;
      const resource = typeof m.resource === "string" ? m.resource.toUpperCase() : "?";
      const before = typeof m.before === "number" ? m.before : "?";
      const after = typeof m.after === "number" ? m.after : "?";
      partes.push(`${resource} ${before} → ${after}`);
    }
    const chargesBefore = typeof payload.chargesBefore === "number" ? payload.chargesBefore : null;
    const chargesAfter = typeof payload.chargesAfter === "number" ? payload.chargesAfter : null;
    if (chargesBefore != null && chargesAfter != null) {
      partes.push(`cargas ${chargesBefore} → ${chargesAfter}`);
    } else {
      const quantityBefore = typeof payload.quantityBefore === "number" ? payload.quantityBefore : null;
      const quantityAfter = typeof payload.quantityAfter === "number" ? payload.quantityAfter : null;
      if (quantityBefore != null && quantityAfter != null) partes.push(`quantidade ${quantityBefore} → ${quantityAfter}`);
    }
    const damageRolled = Array.isArray(payload.damageRolled) ? payload.damageRolled : [];
    if (damageRolled.length > 0) {
      const textoDano = damageRolled
        .map((d) => {
          if (typeof d !== "object" || d === null) return null;
          const dr = d as Record<string, unknown>;
          const result = typeof dr.result === "number" ? dr.result : "?";
          const formula = typeof dr.formula === "string" ? dr.formula : "?";
          const damageType = typeof dr.damageType === "string" ? dr.damageType : null;
          return `${result} (${formula}${damageType ? `/${damageType}` : ""})`;
        })
        .filter((t): t is string => t != null);
      if (textoDano.length > 0) partes.push(`dano rolado ${textoDano.join(", ")}`);
    }
    const removedConditions = names(payload.removedConditions);
    if (removedConditions.length > 0) partes.push(`removeu ${removedConditions.join(", ")}`);
    if (payload.stabilizedCollapse === "pv" || payload.stabilizedCollapse === "pe") {
      partes.push(`estabilizou colapso (${(payload.stabilizedCollapse as string).toUpperCase()})`);
    }
    // Uso em aliado (checkpoint pós-v0.71) — o efeito foi aplicado no ALVO, não no usuário; os
    // campos `target*` são exclusivos desse fluxo (ausentes em logs de uso próprio antigos).
    const targetCharacterName = typeof payload.targetCharacterName === "string" ? payload.targetCharacterName : null;
    const targetResourceChanges = Array.isArray(payload.targetResourceChanges) ? payload.targetResourceChanges : [];
    for (const mudanca of targetResourceChanges) {
      if (typeof mudanca !== "object" || mudanca === null) continue;
      const m = mudanca as Record<string, unknown>;
      const resource = typeof m.resource === "string" ? m.resource.toUpperCase() : "?";
      const before = typeof m.before === "number" ? m.before : null;
      const after = typeof m.after === "number" ? m.after : null;
      if (before != null && after != null) partes.push(`curou ${Math.max(0, after - before)} ${resource}`);
    }
    const targetRemovedConditions = names(payload.targetRemovedConditions);
    if (targetRemovedConditions.length > 0) partes.push(`removeu ${targetRemovedConditions.join(", ")}`);
    const area = typeof payload.area === "number" ? payload.area : null;
    const range = typeof payload.range === "number" ? payload.range : null;
    if (area != null || range != null) {
      partes.push(`${area != null ? `área ${area}m` : ""}${area != null && range != null ? ", " : ""}${range != null ? `alcance ${range}m` : ""}`);
    }
    const temporaryEffectsAdded = names(payload.temporaryEffectsAdded).concat(names(payload.targetTemporaryEffectsAdded));
    if (temporaryEffectsAdded.length > 0) partes.push(`efeito temporário: ${temporaryEffectsAdded.join(", ")}`);
    const reminders = names(payload.reminders);
    const tipoLabel = useType === "pharmacy" ? " (farmácia)" : useType === "grenade" ? " (granada)" : useType === "explosive" ? " (explosivo)" : "";
    const itemComAlvo = targetCharacterName ? `${itemName} em ${targetCharacterName}` : itemName;
    const base = `Item usado — ${characterNome} usou ${itemComAlvo}${tipoLabel}${partes.length > 0 ? `: ${partes.join(" · ")}` : ""}.`;
    return reminders.length > 0 ? `${base} — Lembrete: ${reminders.join(" ")}` : base;
  }
  if (type === "temporary_effect_added" || type === "temporary_effect_removed" || type === "temporary_effect_expired") {
    return formatTemporaryEffectLog(type, payload);
  }
  if (type === "talent_used") {
    const talentNome = typeof payload.talentNome === "string" ? payload.talentNome : "Talento";
    const nivelNome = typeof payload.nivelNome === "string" ? payload.nivelNome : null;
    const action = typeof payload.action === "string" ? payload.action : "use";
    const description = typeof payload.description === "string" ? payload.description : null;
    const reminders = names(payload.reminders);
    const nomeCompleto = `${talentNome}${nivelNome ? ` — ${nivelNome}` : ""}`;
    if (action === "toggle_on" || action === "toggle_off") {
      const verbo = action === "toggle_on" ? "ativou" : "desativou";
      const base = `Talento — ${characterNome} ${verbo} ${nomeCompleto}${description ? ` (${description})` : ""}.`;
      return reminders.length > 0 ? `${base} — Lembrete: ${reminders.join(" ")}` : base;
    }
    const partes: string[] = [];
    const paCost = typeof payload.paCost === "number" ? payload.paCost : null;
    const paBefore = typeof payload.paBefore === "number" ? payload.paBefore : null;
    const paAfter = typeof payload.paAfter === "number" ? payload.paAfter : null;
    if (paCost != null && paBefore != null && paAfter != null) partes.push(`PA ${paBefore} → ${paAfter}`);
    const usesSpent = typeof payload.usesSpent === "number" ? payload.usesSpent : null;
    const usesMax = typeof payload.usesMax === "number" ? payload.usesMax : null;
    const cadencia = typeof payload.cadencia === "string" ? payload.cadencia.replace(/_/g, " ") : null;
    if (usesSpent != null && usesMax != null) partes.push(`usos ${usesSpent}/${usesMax}${cadencia ? ` por ${cadencia}` : ""}`);
    const temporaryEffectsAdded = names(payload.temporaryEffectsAdded);
    if (temporaryEffectsAdded.length > 0) partes.push(`efeito temporário: ${temporaryEffectsAdded.join(", ")}`);
    const base = `Talento usado — ${characterNome} usou ${nomeCompleto}${description ? ` (${description})` : ""}${partes.length > 0 ? `: ${partes.join(" · ")}` : ""}.`;
    return reminders.length > 0 ? `${base} — Lembrete: ${reminders.join(" ")}` : base;
  }
  if (type === "spell_cast") {
    const spellNome = typeof payload.spellNome === "string" ? payload.spellNome : "Magia";
    const vertente = typeof payload.vertente === "string" ? payload.vertente : null;
    const nivel = typeof payload.nivel === "number" ? payload.nivel : null;
    const partes: string[] = [];
    const paBefore = typeof payload.paBefore === "number" ? payload.paBefore : null;
    const paAfter = typeof payload.paAfter === "number" ? payload.paAfter : null;
    if (paBefore != null && paAfter != null) partes.push(`PA ${paBefore} → ${paAfter}`);
    if (payload.manaCostUnknown === true) {
      partes.push("Mana: custo placeholder (não descontado)");
    } else {
      const manaBefore = typeof payload.manaBefore === "number" ? payload.manaBefore : null;
      const manaAfter = typeof payload.manaAfter === "number" ? payload.manaAfter : null;
      const temporaria = typeof payload.manaTemporariaConsumida === "number" ? payload.manaTemporariaConsumida : 0;
      if (manaBefore != null && manaAfter != null) {
        partes.push(`Mana ${manaBefore} → ${manaAfter}${temporaria > 0 ? ` (${temporaria} da temporária)` : ""}`);
      }
    }
    const damage = typeof payload.damage === "object" && payload.damage !== null ? (payload.damage as Record<string, unknown>) : null;
    if (damage) {
      const result = typeof damage.result === "number" ? damage.result : "?";
      const formula = typeof damage.formula === "string" ? damage.formula : "?";
      const tipoDano = typeof damage.tipoDano === "string" ? damage.tipoDano : null;
      partes.push(`dano ${damage.fixo === true ? "fixo" : "rolado"} ${result} (${formula}${tipoDano ? `/${tipoDano}` : ""})`);
    }
    const resistance = typeof payload.resistance === "object" && payload.resistance !== null ? (payload.resistance as Record<string, unknown>) : null;
    if (resistance) {
      const acoes = names(resistance.acoes);
      // CD numérica calculada (regra do VTT: 6 + nível da vertente) — nunca a fórmula bruta do conteúdo.
      const cd = typeof resistance.cd === "number" ? String(resistance.cd) : "nível da vertente não definido";
      partes.push(`resistência ${acoes.join("/") || "?"} CD ${cd}`);
    }
    const fusion = typeof payload.fusion === "object" && payload.fusion !== null ? (payload.fusion as Record<string, unknown>) : null;
    if (fusion) {
      const sobrecargaBefore = typeof fusion.sobrecargaBefore === "number" ? fusion.sobrecargaBefore : "?";
      const sobrecargaAfter = typeof fusion.sobrecargaAfter === "number" ? fusion.sobrecargaAfter : "?";
      const sobrecargaMax = typeof fusion.sobrecargaMax === "number" ? fusion.sobrecargaMax : "?";
      partes.push(`Sobrecarga ${sobrecargaBefore} → ${sobrecargaAfter}/${sobrecargaMax} (Fusão custa 1)`);
    }
    const extras = [...names(payload.manualEffects), ...names(payload.reminders)];
    const fusedNome = fusion && typeof fusion.fusedSpellNome === "string" ? fusion.fusedSpellNome : null;
    const cabecalho = `${spellNome}${fusedNome ? ` + ${fusedNome} (FUSÃO)` : ""}${vertente ? ` (${vertente}${nivel != null ? `, nível ${nivel}` : ""})` : ""}`;
    const base = `Magia conjurada — ${characterNome} conjurou ${cabecalho}${partes.length > 0 ? `: ${partes.join(" · ")}` : ""}.`;
    return extras.length > 0 ? `${base} — ${extras.join(" ")}` : base;
  }
  if (type === "overload_surge" || type === "overload_surge_used") {
    const tipo = typeof payload.tipo === "string" ? payload.tipo : "?";
    const indice = typeof payload.indice === "number" ? payload.indice : "?";
    const max = typeof payload.maxSurtos === "number" ? payload.maxSurtos : 3;
    const dado = typeof payload.danoDado === "string" ? payload.danoDado : "1d4";
    const dano = typeof payload.danoPsiquico === "number" ? payload.danoPsiquico : "?";
    const ruptura = payload.rupturaPendente === true ? " — Ruptura pendente!" : "";
    return `Surto de Sobrecarga — ${characterNome}: ${tipo} (${indice}/${max}) — ${dano} dano psíquico (${dado}, aplicação manual)${ruptura}`;
  }
  if (type === "overload_will_roll") {
    const total = typeof payload.total === "number" ? payload.total : "?";
    const cd = typeof payload.cd === "number" ? payload.cd : "?";
    const sucesso = payload.sucesso === true;
    return `Teste de Vontade (Sobrecarga) — ${characterNome}: total ${total} vs CD ${cd} — ${sucesso ? "Sucesso" : "Falha (Atordoado 1 rodada)"}.`;
  }
  if (type === "inventory_transfer") {
    const direction = typeof payload.direction === "string" ? payload.direction : "?";
    const itemName = typeof payload.itemName === "string" ? payload.itemName : "Item";
    const quantityMoved = typeof payload.quantityMoved === "number" ? payload.quantityMoved : "?";
    const quantityBeforeSource = typeof payload.quantityBeforeSource === "number" ? payload.quantityBeforeSource : null;
    const quantityAfterSource = typeof payload.quantityAfterSource === "number" ? payload.quantityAfterSource : null;
    const quantityBeforeTarget = typeof payload.quantityBeforeTarget === "number" ? payload.quantityBeforeTarget : null;
    const quantityAfterTarget = typeof payload.quantityAfterTarget === "number" ? payload.quantityAfterTarget : null;
    const chargesMoved = typeof payload.chargesMoved === "number" ? payload.chargesMoved : null;
    const partes: string[] = [`x${quantityMoved}`];
    if (quantityBeforeSource != null && quantityAfterSource != null) partes.push(`origem ${quantityBeforeSource} → ${quantityAfterSource}`);
    if (quantityBeforeTarget != null && quantityAfterTarget != null) partes.push(`destino ${quantityBeforeTarget} → ${quantityAfterTarget}`);
    if (chargesMoved != null) partes.push(`cargas ${chargesMoved}`);
    if (direction === "character_to_crew") {
      const sourceCharacterName = typeof payload.sourceCharacterName === "string" ? payload.sourceCharacterName : "Personagem";
      return `Transferência — ${sourceCharacterName} enviou ${itemName} ao bando (${partes.join(" · ")}).`;
    }
    if (direction === "crew_to_character") {
      const targetCharacterName = typeof payload.targetCharacterName === "string" ? payload.targetCharacterName : "Personagem";
      return `Transferência — ${targetCharacterName} recebeu ${itemName} do bando (${partes.join(" · ")}).`;
    }
    return `Transferência de inventário — ${itemName} (${partes.join(" · ")}).`;
  }
  if (type === "round_end_processed") {
    const nomes = names(payload.processedCharacterNames);
    const prev = typeof payload.previousRound === "number" ? payload.previousRound : "?";
    const next = typeof payload.nextRound === "number" ? payload.nextRound : "?";
    const dano = typeof payload.damageCount === "number" ? payload.damageCount : 0;
    const pend = typeof payload.pendingCheckCount === "number" ? payload.pendingCheckCount : 0;
    return `Rodada ${prev} → ${next} processada — ${nomes.length} personagem(ns), ${dano} dano(s) de condição, ${pend} pendência(s).`;
  }
  if (type === "scene_end_processed") {
    const nomes = names(payload.processedCharacterNames);
    const prev = typeof payload.previousScene === "number" ? payload.previousScene : "?";
    const next = typeof payload.nextScene === "number" ? payload.nextScene : "?";
    const rup = typeof payload.ruptureResolvedCount === "number" ? payload.ruptureResolvedCount : 0;
    const pend = typeof payload.pendingChoiceCount === "number" ? payload.pendingChoiceCount : 0;
    return `Cena ${prev} → ${next} processada — ${nomes.length} personagem(ns), ${rup} Ruptura(s) resolvida(s), ${pend} pendência(s) de Marca/Traço.`;
  }
  if (type === "condition_end_round_damage") {
    const damage = typeof payload.damage === "number" ? payload.damage : "?";
    const damageType = typeof payload.damageType === "string" ? payload.damageType : "";
    const before = typeof payload.before === "number" ? payload.before : "?";
    const after = typeof payload.after === "number" ? payload.after : "?";
    return `${characterNome}: ${conditionName} causou ${damage} de dano ${damageType} (PV ${before} → ${after}).`;
  }
  if (type === "condition_end_round_check_created") {
    const resistance = payload.resistance as Record<string, unknown> | undefined;
    const pericia = typeof resistance?.pericia === "string" ? resistance.pericia : "?";
    const cd = typeof resistance?.cd === "number" ? resistance.cd : "?";
    const target = typeof payload.targetConditionId === "string" ? ` (para remover ${payload.targetConditionId})` : "";
    return `${characterNome}: ${conditionName} — teste de ${pericia} CD ${cd} pendente${target}.`;
  }
  if (type === "condition_end_round_check_resolved") {
    const result = payload.result === "success" ? "Sucesso" : "Falha";
    return `${characterNome}: ${conditionName} — ${result}.`;
  }
  if (type === "round_pa_reduced_by_condition") {
    const value = typeof payload.value === "number" ? payload.value : "?";
    const paBefore = typeof payload.paBefore === "number" ? payload.paBefore : "?";
    const paAfter = typeof payload.paAfter === "number" ? payload.paAfter : "?";
    return `${characterNome}: ${conditionName} reduziu ${value} PA (${paBefore} → ${paAfter}).`;
  }
  if (type === "condition_applied") {
    const nome = typeof payload.nome === "string" ? payload.nome : conditionName;
    return `${characterNome}: aplicada "${nome}".`;
  }
  if (type === "condition_removed") {
    const nome = typeof payload.nome === "string" ? payload.nome : conditionName;
    return `${characterNome}: removida "${nome}".`;
  }
  if (type === "collapse_end_round_test" || type === "collapse_third_segment_test" || type === "collapse_outcome") {
    const tipo = payload.tipo === "pe" ? "PE" : payload.tipo === "pv" ? "PV" : "?";
    const segmentos = typeof payload.segmentos === "number" ? ` — segmento ${payload.segmentos}/3` : "";
    const desfecho = typeof payload.desfecho === "string" ? ` — desfecho: ${payload.desfecho}` : "";
    return `${characterNome}: Colapso (${tipo})${segmentos}${desfecho}.`;
  }
  if (type === "rupture_resolved") {
    const level = typeof payload.ruptureLevel === "number" ? payload.ruptureLevel : "?";
    const iBefore = typeof payload.integrityBefore === "number" ? payload.integrityBefore : "?";
    const iAfter = typeof payload.integrityAfter === "number" ? payload.integrityAfter : "?";
    const mana = typeof payload.manaBonusApplied === "number" ? payload.manaBonusApplied : "?";
    return `${characterNome}: Ruptura nível ${level} — Integridade ${iBefore} → ${iAfter}, Mana máxima +${mana}.`;
  }
  if (type === "rupture_choice_created") {
    return `${characterNome}: Marca e Traço pendentes.`;
  }
  if (type === "integrity_zero_pending") {
    return `${characterNome}: Integridade zerada — Última Vontade pendente.`;
  }
  if (type === "character_state_change") {
    const action = typeof payload.action === "string" ? payload.action : "ajuste";
    const resource = typeof payload.resource === "string" ? payload.resource : "";
    const before = typeof payload.before === "number" ? payload.before : "?";
    const after = typeof payload.after === "number" ? payload.after : "?";
    return `${characterNome}: ${action}${resource ? ` ${resource.toUpperCase()}` : ""} (${before} → ${after}).`;
  }
  // Fallback legível — nunca JSON cru: rótulo do tipo + personagem quando houver.
  return `${entryKindLabel(type)}${typeof payload.characterNome === "string" ? ` — ${payload.characterNome}` : ""}`;
}

function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return "nunca";
  return new Date(lastSeenAt).toLocaleString("pt-BR");
}

function isPerfilExpirado(perfil: CampaignProfile, now: number): boolean {
  if (!perfil.is_locked) return false;
  const lastSeenMs = perfil.last_seen_at ? new Date(perfil.last_seen_at).getTime() : 0;
  return now - lastSeenMs > PROFILE_HEARTBEAT_TIMEOUT_MS;
}

const AUTO_REFRESH_INTERVAL_MS = 5000;

const VISIBILITY_FILTERS = ["todos", ...TABLE_LOG_VISIBILITIES] as const;
type VisibilityFilter = (typeof VISIBILITY_FILTERS)[number];

const VISIBILITY_FILTER_LABELS: Record<VisibilityFilter, string> = {
  todos: "Todos",
  public: "Pública",
  private: "Privada",
  gm: "Narrador",
};

const MESA_OWNER_FILTERS = ["todas", "minhas", "sem_dono"] as const;
type MesaOwnerFilter = (typeof MESA_OWNER_FILTERS)[number];

const MESA_OWNER_FILTER_LABELS: Record<MesaOwnerFilter, string> = {
  todas: "Todas as mesas dev",
  minhas: "Minhas mesas",
  sem_dono: "Mesas sem dono",
};

interface Props {
  mesasIniciais: Campaign[];
  personagensIniciais: CharacterRecord[];
  /** Email do narrador logado (auth dev, checkpoint v0.13) — null se não logado. Só informativo. */
  currentUserEmail: string | null;
  /** Id do narrador logado (checkpoint v0.16) — usado para comparar com campaigns.owner_id. */
  currentUserId: string | null;
  /** regras_personagem (checkpoint v0.63) — só para computar PV/PE/Mana/Integridade MÁXIMOS na ferramenta de narrador, igual à ficha. */
  regras: CharacterRulesPayload | null;
  /** Condições publicadas na Biblioteca (checkpoint v0.63) — fonte única do select "Aplicar condição"; nunca lista hardcoded aqui. */
  condicoesDisponiveis: NarratorConditionOption[];
  /** Conteúdo COMPLETO das condições publicadas (payload_automacao) — detecta data-driven os efeitos de fim de rodada no preview de "Encerrar Rodada" (mesma fonte que endRound.ts usa ao aplicar). */
  conditionContents: ConditionContent[];
  /** Itens publicados na Biblioteca (checkpoint pós-v0.50, "Resolver Ataque") — só para ler o MIT ATUAL do equipamento defensivo ativo do alvo. */
  itemsIniciais: ItemContent[];
  /** Regra canônica de Reação interpretada do singleton combat_flow (checkpoint pós-v0.50, "Resolver Ataque" com defesa reativa) — mesmo fallback fail-closed da ficha. */
  reactionRules: ReactionRules;
  /** Talentos publicados na Biblioteca (checkpoint talentos, Fase E) — só para ler os talentos do ATACANTE ao resolver dano (Hemorragia, Executar, Fúria, etc.). */
  talentsIniciais: TalentContent[];
}

const GM_RESOURCE_LABELS: Record<GmResource, string> = { pv: "PV", pe: "PE", mana: "Mana", integridade: "Integridade" };
const GM_RESOURCE_MAX_KEY: Record<GmResource, keyof DerivedStats> = {
  pv: "pv_max",
  pe: "pe_max",
  mana: "mana_max",
  integridade: "integridade_max",
};

/** PV/PE/Mana/Integridade MÁXIMOS do personagem — mesma fórmula da ficha (computeDerivedStats), nunca reinventada aqui. */
function gmDerivedMax(payload: Character, regras: CharacterRulesPayload | null, resource: GmResource): number {
  const derivados = computeDerivedStats(payload.atributos, regras, payload.mana_bonus_ruptura ?? 0);
  return derivados[GM_RESOURCE_MAX_KEY[resource]];
}

// ---------------------------------------------------------------------
// Preview de Encerrar Rodada / Encerrar Cena (checkpoint pós-v0.58)
// ---------------------------------------------------------------------
//
// O preview é uma INSPEÇÃO read-only do estado atual de cada personagem
// ativo — NUNCA rola dado, NUNCA persiste. Ao confirmar, o narrador
// delega para os helpers canônicos idempotentes `endCampaignRound` /
// `endCampaignScene` (os mesmos usados pelo dashboard da mesa), sem
// reimplementar nenhuma regra aqui. Efeitos determinísticos (reset de
// PA/Reações, perda de Integridade por Ruptura) são mostrados com
// valores exatos; efeitos com dado (dano de condição, teste de Colapso)
// são mostrados como "será rolado/processado ao confirmar", nunca com
// um número falso pré-rolado que não bateria com a resolução real.

interface EndRoundConditionPreview {
  conditionName: string;
  description: string;
}

interface EndRoundCharacterPreview {
  characterId: string;
  characterNome: string;
  paGastos: number;
  paMax: number;
  reacoesUsadas: number;
  reacoesMax: number;
  defesasSemReacao: number;
  conditionEffects: EndRoundConditionPreview[];
  /** Condições ativas sem conteúdo/efeito estruturado detectado — resolução manual (fallback quando a Biblioteca está fora do ar). */
  unstructuredConditions: string[];
  emColapso: { tipo: string; segmentos: number; estabilizado: boolean } | null;
  /** Efeitos temporários por rodada que vão reduzir/expirar (checkpoint pós-v0.71). */
  temporaryEffects: string[];
  /** true quando NADA muda para este personagem (sem PA/Reação gastos, sem condição de fim de rodada, sem colapso, sem efeito temporário). */
  semEfeito: boolean;
}

interface EndRoundPreview {
  kind: "round";
  round: number;
  scene: number;
  characters: EndRoundCharacterPreview[];
  manualPending: string[];
}

interface EndSceneCharacterPreview {
  characterId: string;
  characterNome: string;
  rupturePending: boolean;
  ruptureLevel: number;
  integridadeAntes: number;
  integridadeDepois: number;
  manaBonusAntes: number;
  manaBonusDepois: number;
  ultimaVontade: boolean;
  /** Efeitos temporários por cena que vão expirar ao confirmar (checkpoint pós-v0.71). */
  temporaryEffects: string[];
}

interface EndScenePreview {
  kind: "scene";
  round: number;
  scene: number;
  characters: EndSceneCharacterPreview[];
  manualPending: string[];
}

/**
 * Descreve, data-driven, UM efeito de condição do ponto de vista do
 * fim de rodada — retorna `null` quando o `tipo` não é resolvido pelo
 * motor de fim de rodada (o mesmo conjunto de `tipo`s que
 * `endRoundConditions.ts` trata). Nunca inventa dano/valor: só
 * descreve o que o payload declara.
 */
function describeEndRoundEffect(efeito: ConditionEndRoundEffect): string | null {
  const asRec = (v: unknown): Record<string, unknown> | null =>
    typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  switch (efeito.tipo) {
    case "dano_fim_de_rodada": {
      const dano = typeof efeito.dano === "string" ? efeito.dano : "?";
      const tipoDano = typeof efeito.tipo_dano === "string" ? ` ${efeito.tipo_dano}` : "";
      return `dano de fim de rodada (${dano}${tipoDano}) — será rolado ao confirmar`;
    }
    case "teste_fim_de_rodada": {
      const r = asRec(efeito.resistencia);
      const pericia = typeof r?.pericia === "string" ? r.pericia : "?";
      const cd = typeof r?.cd === "number" ? r.cd : "?";
      const falha = asRec(efeito.falha);
      const falhaTxt =
        falha && typeof falha.dano === "string" ? ` (falha: ${falha.dano}${typeof falha.tipo_dano === "string" ? ` ${falha.tipo_dano}` : ""})` : "";
      return `teste de ${pericia} CD ${cd} — pendência criada ao confirmar (rolagem manual depois)${falhaTxt}`;
    }
    case "teste_fim_de_rodada_para_remover_condicao": {
      const r = asRec(efeito.resistencia);
      const pericia = typeof r?.pericia === "string" ? r.pericia : "?";
      const cd = typeof r?.cd === "number" ? r.cd : "?";
      const alvo = typeof efeito.condicao === "string" ? efeito.condicao : "?";
      return `teste de ${pericia} CD ${cd} para remover ${alvo} — pendência criada ao confirmar`;
    }
    case "teste_apos_exposicao": {
      const apos = typeof efeito.apos_rodadas === "number" ? efeito.apos_rodadas : 1;
      return `teste após exposição (após ${apos} rodada(s)) — processado ao confirmar`;
    }
    case "reduzir_pa": {
      const valor = typeof efeito.valor === "number" ? efeito.valor : 1;
      return `reduz ${valor} PA na próxima rodada`;
    }
    default:
      return null;
  }
}

/** Constrói o preview de Encerrar Rodada inspecionando o estado atual dos personagens ativos (read-only). */
function buildEndRoundPreview(
  records: CharacterRecord[],
  regras: CharacterRulesPayload | null,
  conditionContents: ConditionContent[],
  round: number,
  scene: number,
): EndRoundPreview {
  const conditionBySlug = new Map(conditionContents.map((c) => [normalizeConditionSlug(c.slug), c]));
  const characters: EndRoundCharacterPreview[] = [];
  let anyTestePendente = false;

  for (const record of records) {
    const character = normalizeCharacter(record.payload);
    const derived = computeDerivedStats(character.atributos, regras, character.mana_bonus_ruptura ?? 0);
    const paGastos = character.estado_jogo?.pa_gastos ?? 0;
    const reacoesUsadas = character.estado_jogo?.reacoes_usadas ?? 0;
    const defesasSemReacao = character.estado_jogo?.defesas_sem_reacao ?? 0;

    const conditionEffects: EndRoundConditionPreview[] = [];
    const unstructuredConditions: string[] = [];
    for (const slug of getActiveConditionIds(character)) {
      const content = conditionBySlug.get(slug);
      if (!content) {
        // Sem conteúdo (Biblioteca fora do ar) — não inventa efeito; marca como resolução manual.
        unstructuredConditions.push(slug);
        continue;
      }
      const descriptions = getConditionEndRoundEffects(content)
        .map(describeEndRoundEffect)
        .filter((d): d is string => d != null);
      if (descriptions.length === 0) continue; // condição ativa sem efeito de fim de rodada — nada a processar.
      if (descriptions.some((d) => d.includes("pendência criada"))) anyTestePendente = true;
      conditionEffects.push({ conditionName: content.nome, description: descriptions.join("; ") });
    }

    const colapso = character.colapso;
    const emColapso = colapso?.ativo ? { tipo: colapso.tipo === "pe" ? "PE" : "PV", segmentos: colapso.segmentos ?? 0, estabilizado: colapso.estabilizado === true } : null;

    // Efeitos temporários por rodada que vão reduzir/expirar ao confirmar (checkpoint pós-v0.71).
    const temporaryEffects = getActiveTemporaryEffects(character)
      .filter((e) => e.durationType === "rounds" && typeof e.remainingRounds === "number")
      .map((e) => {
        const restante = (e.remainingRounds as number) - 1;
        return restante <= 0 ? `${e.name}: expira nesta rodada` : `${e.name}: ${e.remainingRounds} → ${restante} rodada(s)`;
      });

    const semEfeito =
      paGastos === 0 && reacoesUsadas === 0 && defesasSemReacao === 0 && conditionEffects.length === 0 && unstructuredConditions.length === 0 && !emColapso && temporaryEffects.length === 0;

    characters.push({
      characterId: record.id,
      characterNome: character.nome,
      paGastos,
      paMax: derived.pa_max,
      reacoesUsadas,
      reacoesMax: derived.reacoes_por_rodada,
      defesasSemReacao,
      conditionEffects,
      unstructuredConditions,
      emColapso,
      temporaryEffects,
      semEfeito,
    });
  }

  const manualPending: string[] = [];
  if (anyTestePendente) {
    manualPending.push("Testes de resistência de condição são criados como pendência e exigem rolagem manual do narrador depois.");
  }
  manualPending.push("Efeitos temporários com stack não estruturado (ex.: Fúria do Berserker) continuam como lembrete — sem expiração/stack automático.");

  return { kind: "round", round, scene, characters, manualPending };
}

/** Constrói o preview de Encerrar Cena. Ruptura é determinística — usa `resolvePendingRupture` (puro, sem persistir) para mostrar valores EXATOS de Integridade/Mana. */
function buildEndScenePreview(records: CharacterRecord[], round: number, scene: number, nowIso: string): EndScenePreview {
  const characters: EndSceneCharacterPreview[] = [];
  for (const record of records) {
    const character = normalizeCharacter(record.payload);
    const result = resolvePendingRupture(character, { scene, nowIso });
    // Efeitos temporários por cena que vão expirar ao confirmar (checkpoint pós-v0.71).
    const temporaryEffects = getActiveTemporaryEffects(character)
      .filter((e) => e.durationType === "scene")
      .map((e) => `${e.name}: expira ao fim da cena`);
    characters.push({
      characterId: record.id,
      characterNome: character.nome,
      rupturePending: result.resolved,
      ruptureLevel: result.level,
      integridadeAntes: result.integridadeAntes,
      integridadeDepois: result.integridadeDepois,
      manaBonusAntes: result.manaMaxBonusAntes,
      manaBonusDepois: result.manaMaxBonusDepois,
      ultimaVontade: result.ultimaVontadePendente,
      temporaryEffects,
    });
  }
  const manualPending: string[] = [
    "A escolha de Marca/Traço de cada Ruptura fica pendente para resolução manual do jogador/narrador.",
  ];
  return { kind: "scene", round, scene, characters, manualPending };
}

export default function TableClient({ mesasIniciais, personagensIniciais, currentUserEmail, currentUserId, regras, condicoesDisponiveis, conditionContents, itemsIniciais, reactionRules, talentsIniciais }: Props) {
  const [mesas, setMesas] = useState<Campaign[]>(mesasIniciais);
  const [personagens] = useState<CharacterRecord[]>(personagensIniciais);
  const [novaMesaNome, setNovaMesaNome] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [logs, setLogs] = useState<TableLogEntry[]>([]);
  const [mensagemInput, setMensagemInput] = useState("");
  const [visibilidade, setVisibilidade] = useState<TableLogVisibility>("public");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [visibilidadeFiltro, setVisibilidadeFiltro] = useState<VisibilityFilter>("todos");
  const [autoAtualizar, setAutoAtualizar] = useState(false);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);
  const [perfis, setPerfis] = useState<CampaignProfile[]>([]);
  const [novoPerfilApelido, setNovoPerfilApelido] = useState("");
  const [loadingPerfis, setLoadingPerfis] = useState(false);
  const [mesaOwnerFiltro, setMesaOwnerFiltro] = useState<MesaOwnerFilter>("todas");
  const [sessoes, setSessoes] = useState<ProfileSession[]>([]);
  const [convites, setConvites] = useState<CampaignInvite[]>([]);
  const [novoConviteLabel, setNovoConviteLabel] = useState("");
  const [conviteLinkNovo, setConviteLinkNovo] = useState<string | null>(null);
  const [conviteCopiado, setConviteCopiado] = useState(false);
  // Tick local (5s) só para recalcular "parece expirado" comparando
  // last_seen_at já carregado com Date.now() — não busca nada novo do
  // servidor (ver mesmo padrão em CharacterSheetClient).
  const [nowTick, setNowTick] = useState(() => Date.now());

  // ---------------------------------------------------------------
  // "Estado dos personagens" — ferramenta de narrador (checkpoint
  // v0.63). `personagens` (acima) é a lista global carregada uma vez
  // no mount da página e nunca é uma fonte confiável do estado ATUAL
  // de um personagem específico; por isso os personagens ativos dos
  // perfis são buscados à parte (getCharacter) e mantidos aqui,
  // atualizados após cada ação de narrador com o registro que
  // `updateCharacter` devolve (sem precisar recarregar a lista toda).
  // ---------------------------------------------------------------
  const [personagensAtivos, setPersonagensAtivos] = useState<Record<string, CharacterRecord>>({});
  const [gmErro, setGmErro] = useState<string | null>(null);

  // ---------------------------------------------------------------
  // Inventário do bando/mesa (checkpoint pós-v0.68, CP7). RLS estrita
  // (migration 0019, só `authenticated` dono da mesa) — sem narrador
  // logado, `listCrewInventory` lança e a seção mostra o erro em vez de
  // fingir uma lista vazia. `campaignCharactersAtivos` é a MESMA fonte
  // de `fetchActiveCampaignCharacters` (listCharactersForNarratorCampaign,
  // só não-arquivados) — não a lista de perfis — para o seletor de
  // personagem de destino incluir qualquer personagem ativo da mesa,
  // não só os vinculados a um perfil.
  // ---------------------------------------------------------------
  const [crewInventory, setCrewInventory] = useState<CrewInventoryItem[]>([]);
  const [crewInventoryError, setCrewInventoryError] = useState<string | null>(null);
  const [crewInventoryLoading, setCrewInventoryLoading] = useState(false);
  const [campaignCharactersAtivos, setCampaignCharactersAtivos] = useState<CharacterRecord[]>([]);
  const [crewTransferForm, setCrewTransferForm] = useState<Record<string, { targetCharacterId: string; quantidade: number }>>({});
  const [crewTransferBusyId, setCrewTransferBusyId] = useState<string | null>(null);
  const [gmDanoForm, setGmDanoForm] = useState<Record<string, { recurso: "pv" | "pe"; valor: number; nota: string }>>({});
  const [gmCuraForm, setGmCuraForm] = useState<Record<string, { recurso: "pv" | "pe" | "mana"; valor: number; nota: string }>>({});
  const [gmSetForm, setGmSetForm] = useState<Record<string, { recurso: GmResource; valor: number; nota: string }>>({});
  const [gmCondicaoForm, setGmCondicaoForm] = useState<Record<string, string>>({});

  // ---------------------------------------------------------------
  // Preview de Encerrar Rodada / Encerrar Cena (checkpoint pós-v0.58).
  // `endPreview` guarda o dry-run read-only aberto (ou null). `endBusy`
  // trava os botões contra clique duplo (montagem do preview E confirm).
  // `endSummary` mostra o resumo textual pós-confirmação (reaproveita
  // buildCampaignEndRoundSummary/Scene). Nada é persistido até o
  // "Confirmar" chamar o helper canônico idempotente.
  // ---------------------------------------------------------------
  const [endPreview, setEndPreview] = useState<EndRoundPreview | EndScenePreview | null>(null);
  const [endBusy, setEndBusy] = useState(false);
  const [endErro, setEndErro] = useState<string | null>(null);
  const [endSummary, setEndSummary] = useState<string[] | null>(null);
  // Preflight (checkpoint pós-v0.58): a sessão atual pode avançar a campanha?
  // Calculado ao abrir o preview (mesma checagem que endCampaignRound/Scene
  // fazem server-side). null = ainda não checado; false = Confirmar bloqueado.
  const [endCanConfirm, setEndCanConfirm] = useState<boolean | null>(null);

  // ---------------------------------------------------------------
  // "Resolver Ataque" a partir de um log `action_used` de Atacar
  // (checkpoint pós-v0.50). Teatro da mente: alvo é escolhido
  // manualmente entre os personagens ativos da mesa (`personagensAtivos`,
  // acima) — sem token/mapa/distância/adjacência/linha de visão
  // automática. Defesa/CD, ataque total, dano bruto e MIT são
  // informados ou conferidos manualmente pelo narrador; a margem e a
  // região liberada são derivadas (`resolveMarginBand`). Um painel por
  // log (`ataqueResolvendoLogId` guarda qual está aberto).
  // ---------------------------------------------------------------
  const [ataqueResolvendoLogId, setAtaqueResolvendoLogId] = useState<string | null>(null);
  const [ataquePainelForm, setAtaquePainelForm] = useState<Record<string, AttackPanelForm>>({});
  const [ataqueResolverErro, setAtaqueResolverErro] = useState<string | null>(null);
  const [ataqueResolverProcessing, setAtaqueResolverProcessing] = useState<string | null>(null);
  /** Chave `${logId}:${defenseType}` do botão de defesa em andamento — separado de ataqueResolverProcessing (que trava "Aplicar dano") para os dois não se bloquearem um ao outro. */
  const [ataqueDefesaProcessing, setAtaqueDefesaProcessing] = useState<string | null>(null);

  // ---------------------------------------------------------------
  // "Resolver ataque mágico" (checkpoint pós-v0.70) — painel irmão do
  // de ataque físico acima, aberto a partir de logs `spell_attack_used`.
  // ---------------------------------------------------------------
  const [magiaResolvendoLogId, setMagiaResolvendoLogId] = useState<string | null>(null);
  const [magiaPainelForm, setMagiaPainelForm] = useState<Record<string, SpellAttackPanelForm>>({});
  const [magiaResolverErro, setMagiaResolverErro] = useState<string | null>(null);
  const [magiaResolverProcessing, setMagiaResolverProcessing] = useState<string | null>(null);
  const [magiaDefesaProcessing, setMagiaDefesaProcessing] = useState<string | null>(null);

  /** true quando `damageBase` é uma fórmula "NdM" simples (rolável automaticamente); false para dano fixo/não estruturado. */
  function isDiceFormula(damageBase: string | null | undefined): boolean {
    return typeof damageBase === "string" && /^\d+d\d+([+-]\d+)?$/.test(damageBase.trim().replace(/\s+/g, ""));
  }

  function handleOpenResolveAttack(log: TableLogEntry) {
    setAtaqueResolverErro(null);
    setAtaqueResolvendoLogId(log.id);
    if (!ataquePainelForm[log.id]) {
      const damageBase = typeof log.payload.damageBase === "string" ? log.payload.damageBase : null;
      // Dano fixo (ex.: ataque desarmado "3", vindo de Corpo) já é um número pronto — pré-preenche;
      // fórmula "NdM" fica para o botão "Rolar dano"; "dano não estruturado" fica vazio (exige preenchimento manual).
      const rawDamagePrefill = damageBase && !isDiceFormula(damageBase) && /^\d+$/.test(damageBase.trim()) ? damageBase.trim() : "";
      setAtaquePainelForm((prev) => ({ ...prev, [log.id]: { ...DEFAULT_ATTACK_PANEL_FORM, rawDamage: rawDamagePrefill } }));
    }
  }

  function updateAttackPanelForm(logId: string, patch: Partial<AttackPanelForm>) {
    setAtaquePainelForm((prev) => ({ ...prev, [logId]: { ...(prev[logId] ?? DEFAULT_ATTACK_PANEL_FORM), ...patch } }));
  }

  /** MIT ATUAL do equipamento defensivo ativo do alvo (flat — o modelo hoje não tem MIT por região, ver getRegionMit) — null quando não há alvo/região suficiente para calcular. */
  function computeAutoMit(targetCharacterId: string, region: BodyRegion | ""): { mit: number; source: "structured" | "manual" | "none" } | null {
    if (!targetCharacterId || !region) return null;
    const targetRecord = personagensAtivos[targetCharacterId];
    if (!targetRecord) return null;
    const targetNormalizado = normalizeCharacter(targetRecord.payload);
    const defesa = getEquippedDefenseProfile(targetNormalizado, itemsIniciais);
    return getRegionMit(defesa, region);
  }

  /**
   * Autopreenche o MIT sempre que alvo OU região mudam — independente
   * da ordem de seleção (fix pós-v0.50: antes só recalculava no
   * onChange da região, então escolher a região primeiro e o alvo
   * depois deixava o MIT parado em "sem MIT estruturado" até a região
   * ser reselecionada). Nunca sobrescreve um MIT editado manualmente
   * (`mitTouched`) — o narrador troca de volta clicando "Usar MIT da
   * armadura".
   */
  function handleAttackTargetOrRegionChange(logId: string, patch: { targetCharacterId?: string; region?: BodyRegion }) {
    const current = ataquePainelForm[logId] ?? DEFAULT_ATTACK_PANEL_FORM;
    const nextTargetCharacterId = patch.targetCharacterId ?? current.targetCharacterId;
    const nextRegion = patch.region ?? current.region;
    if (current.mitTouched) {
      updateAttackPanelForm(logId, patch);
      return;
    }
    const auto = computeAutoMit(nextTargetCharacterId, nextRegion);
    updateAttackPanelForm(logId, {
      ...patch,
      mit: auto ? String(auto.mit) : current.mit,
      mitSource: auto ? auto.source : current.mitSource,
    });
  }

  /** Botão "Usar MIT da armadura" — descarta a edição manual e recalcula a partir do alvo/região atuais. */
  function handleUseArmorMit(logId: string) {
    const current = ataquePainelForm[logId] ?? DEFAULT_ATTACK_PANEL_FORM;
    const auto = computeAutoMit(current.targetCharacterId, current.region);
    updateAttackPanelForm(logId, {
      mit: auto ? String(auto.mit) : "0",
      mitSource: auto ? auto.source : "none",
      mitTouched: false,
    });
  }

  /** "Requer arma com propriedade Aparar" — detecta via `ItemContent.propertySlugs` das armas empunhadas do alvo (mesma fonte de propriedades usada em toda a ficha, nunca inventada aqui). Sem detecção clara, o requisito vira aviso (narrador decide via override do painel de Defesa/CD, não é trava absoluta neste checkpoint). */
  function checkApararRequirement(target: Character): boolean {
    return (target.inventario ?? []).some((inst) => {
      if (inst.estado !== "empunhado") return false;
      const item = itemsIniciais.find((m) => m.slug === inst.itemSlug);
      return item?.propertySlugs?.includes("aparar") ?? false;
    });
  }

  /** "Requer escudo ou proteção adequada" — reaproveita `getEquippedDefenseProfile` (mesmo helper de MIT/PD já usado no dano). Só detecta escudo equipado; não aplica/reduz PD neste checkpoint. */
  function checkBloquearRequirement(target: Character): boolean {
    return getEquippedDefenseProfile(target, itemsIniciais).escudo != null;
  }

  /**
   * Rola uma defesa reativa (Esquivar/Aparar/Bloquear/Resistir) para o
   * alvo selecionado — mesma regra central de rolagem da ficha
   * (`rollPericia`, maior dado entre Atributo d8 + Perícia +
   * modificadores), mesmo helper canônico de gasto de Reação
   * (`spendReactionForDefense`, `lib/character/reactions.ts`) usado na
   * ficha. Preenche Defesa/CD automaticamente e gera log persistente
   * `defense_reaction_used`. Modificadores automáticos de
   * condição/postura (chips da ficha) ficam fora de escopo — só o
   * campo de modificador manual do painel entra na rolagem.
   */
  async function handleRollDefense(logId: string, log: TableLogEntry, defenseType: DefenseType) {
    if (!selectedCampaignId) return;
    const form = ataquePainelForm[logId] ?? DEFAULT_ATTACK_PANEL_FORM;
    setAtaqueResolverErro(null);

    const targetRecord = form.targetCharacterId ? personagensAtivos[form.targetCharacterId] : null;
    if (!targetRecord) {
      setAtaqueResolverErro("Selecione o alvo antes de rolar defesa.");
      return;
    }
    const target = normalizeCharacter(targetRecord.payload);

    const skillSlug = defenseType === "resistir" ? form.resistirSkill : DEFENSE_SKILL_SLUG[defenseType];
    const skillDef = regras?.pericias.find((p) => p.id === skillSlug);
    const attributeId = skillDef?.atributo_primario ?? "corpo";
    const attributeDef = regras?.atributos.find((a) => a.id === attributeId);
    const attributeName = attributeDef?.nome ?? attributeId;
    const skillName = skillDef?.nome ?? skillSlug;
    const attributeValue = (target.atributos as unknown as Record<string, number>)[attributeId] ?? 0;
    const skillValue = target.pericias[skillSlug] ?? 0;

    let requirementStatus: DefenseRollResult["requirementStatus"] = "not_applicable";
    let requirementReminder: string | null = null;
    if (defenseType === "aparar") {
      const met = checkApararRequirement(target);
      // Requisito nunca bloqueia a rolagem neste checkpoint — só avisa (regra de produto §4). "manual_override" fica
      // reservado para quando o narrador rolar mesmo sem detecção (não há trava para acionar aqui, então o status
      // reflete a detecção real: met/not_detected).
      requirementStatus = met ? "met" : "not_detected";
      requirementReminder =
        "Requer arma com propriedade Aparar." +
        (met ? "" : " Não detectada no equipamento empunhado do alvo — pode ser usada por decisão do narrador.");
    } else if (defenseType === "bloquear") {
      const met = checkBloquearRequirement(target);
      requirementStatus = met ? "met" : "not_detected";
      requirementReminder =
        "Requer escudo ou proteção adequada." +
        (met ? "" : " Não detectado no equipamento do alvo — pode ser usada por decisão do narrador.") +
        " PD não é aplicado nem reduzido neste checkpoint.";
    } else if (defenseType === "resistir") {
      requirementReminder = "Usado contra movimento forçado, queda, imobilização, paralisia e efeitos similares.";
    }

    const maxReacoes = computeDerivedStats(target.atributos, regras, target.mana_bonus_ruptura ?? 0).reacoes_por_rodada;
    const reactionResult = spendReactionForDefense(target, maxReacoes, reactionRules, 1);
    const blocked = !reactionResult.usedReaction && !reactionResult.defenseWithoutReaction;
    if (blocked && !form.defenseOverride) {
      setAtaqueResolverErro(
        `${reactionResult.warnings[0] ?? "Sem Reação disponível."} Marque "Rolar mesmo sem Reação (override)" para permitir.`,
      );
      return;
    }

    const modifiersTotal = form.defenseModifier.trim() ? Number(form.defenseModifier) : 0;
    const rollResult = rollPericia({
      atributoId: attributeId,
      atributoNome: attributeName,
      atributoValor: attributeValue,
      periciaId: skillSlug,
      periciaNome: skillName,
      periciaValor: skillValue,
      modificador: Number.isFinite(modifiersTotal) ? modifiersTotal : 0,
    });

    setAtaqueDefesaProcessing(`${logId}:${defenseType}`);
    try {
      const record = await updateCharacter(form.targetCharacterId, reactionResult.character);
      setPersonagensAtivos((prev) => ({ ...prev, [record.id]: record }));

      const novoLog = await addLog({
        campaignId: selectedCampaignId,
        characterId: form.targetCharacterId,
        type: "defense_reaction_used",
        visibility: "public",
        payload: {
          sourceActionLogId: log.id,
          attackResolutionPanel: true,
          targetCharacterId: form.targetCharacterId,
          targetName: record.name,
          defenseType,
          defenseName: DEFENSE_TYPE_LABELS[defenseType],
          attributeId,
          attributeName,
          skillId: skillSlug,
          skillName,
          dice: rollResult.dados,
          highestDie: rollResult.maiorDado,
          skillValue,
          modifiersTotal: Number.isFinite(modifiersTotal) ? modifiersTotal : 0,
          total: rollResult.total,
          reactionCost: 1,
          reactionsBefore: reactionResult.reactionBefore,
          reactionsAfter: reactionResult.reactionAfter,
          requirementStatus,
          requirementReminder,
          usedAsDefenseCd: true,
          source: "attack_resolution",
        },
      });
      setLogs((prev) => [novoLog, ...prev]);

      const lastDefense: DefenseRollResult = {
        defenseReactionLogId: novoLog.id,
        defenseType,
        defenseName: DEFENSE_TYPE_LABELS[defenseType],
        attributeId,
        attributeName,
        skillId: skillSlug,
        skillName,
        dice: rollResult.dados,
        highestDie: rollResult.maiorDado,
        skillValue,
        modifiersTotal: Number.isFinite(modifiersTotal) ? modifiersTotal : 0,
        total: rollResult.total,
        reactionCost: 1,
        reactionsBefore: reactionResult.reactionBefore,
        reactionsAfter: reactionResult.reactionAfter,
        requirementStatus,
        requirementReminder,
      };
      updateAttackPanelForm(logId, { defenseTotal: String(rollResult.total), lastDefense });
    } catch (err) {
      // Falha pode ter acontecido entre salvar o personagem e gravar o log — nunca preenche Defesa/CD
      // como se a rolagem tivesse concluído; o erro deixa claro que o estado pode estar parcial.
      setAtaqueResolverErro(
        err instanceof Error
          ? `Erro ao registrar defesa: ${err.message}`
          : "Erro desconhecido ao rolar defesa — confira se a Reação do alvo foi consumida antes de tentar de novo.",
      );
    } finally {
      setAtaqueDefesaProcessing(null);
    }
  }

  function handleRollAttackDamage(logId: string, log: TableLogEntry) {
    const damageBase = typeof log.payload.damageBase === "string" ? log.payload.damageBase : null;
    if (!damageBase || !isDiceFormula(damageBase)) return;
    const rolled = rollDamageFormula(damageBase);
    updateAttackPanelForm(logId, { rawDamage: String(rolled) });
  }

  /** Botão "+1 dado de dano (margem crítica)" — soma +1 dado do mesmo tipo da fórmula-base ao dano bruto já informado; se a fórmula não for um dado simples, não faz nada (o lembrete textual aparece na UI). */
  function handleRollExtraMarginDie(logId: string, log: TableLogEntry) {
    const form = ataquePainelForm[logId] ?? DEFAULT_ATTACK_PANEL_FORM;
    const damageBase = typeof log.payload.damageBase === "string" ? log.payload.damageBase : null;
    if (!damageBase) return;
    const extra = rollExtraMarginDie(damageBase);
    if (extra == null) return;
    const atual = Number(form.rawDamage) || 0;
    updateAttackPanelForm(logId, { rawDamage: String(atual + extra) });
  }

  async function handleResolveAttackDamage(log: TableLogEntry) {
    if (!selectedCampaignId) return;
    const form = ataquePainelForm[log.id] ?? DEFAULT_ATTACK_PANEL_FORM;
    setAtaqueResolverErro(null);

    const targetRecord = form.targetCharacterId ? personagensAtivos[form.targetCharacterId] : null;
    if (!targetRecord) {
      setAtaqueResolverErro("Selecione o alvo antes de aplicar dano.");
      return;
    }
    const rawDamage = Number(form.rawDamage);
    if (!Number.isFinite(rawDamage)) {
      setAtaqueResolverErro("Informe o dano bruto antes de aplicar.");
      return;
    }

    const attackTotal = form.attackTotal.trim() ? Number(form.attackTotal) : null;
    const defenseTotal = form.defenseTotal.trim() ? Number(form.defenseTotal) : null;
    const hasMargin = attackTotal != null && Number.isFinite(attackTotal) && defenseTotal != null && Number.isFinite(defenseTotal);
    const margin = hasMargin ? attackTotal! - defenseTotal! : null;
    // Assassino › Executar / Atirador de Elite › À Espreita, Headshot / Sorrateiro › Ataque
    // Fatal: sobrepõem a banda de dano/região (mesma banda que um sucesso crítico real ou
    // padrão, conforme o caso) — a margem/attackTotal/defenseTotal digitados continuam sendo
    // os REAIS no log, só a banda de resolução é forçada por essas overrides.
    const bandRules = applyMarginBandOverrides(margin != null ? resolveMarginBand(margin) : null, form);
    const marginBand: "limited" | "standard" | "critical" | "miss" | null = bandRules?.band ?? null;

    if (margin != null && margin < 0 && !form.override && !form.executarAtivo && marginBand === "miss") {
      setAtaqueResolverErro('Ataque não acertou pela margem informada. Marque "Resolver mesmo assim" para aplicar dano por override.');
      return;
    }
    if (!form.region && !form.override) {
      setAtaqueResolverErro("Selecione a região atingida antes de aplicar dano.");
      return;
    }
    if (bandRules && form.region && !bandRules.allowedRegions.includes(form.region as BodyRegion) && !form.override) {
      setAtaqueResolverErro(`Região "${BODY_REGION_LABELS[form.region as BodyRegion]}" não é permitida para a margem ${margin} sem override.`);
      return;
    }
    if (form.executarAtivo && !form.executarRequisitoConfirmado) {
      setAtaqueResolverErro("Confirme o requisito de Executar (alvo abaixo de 50% PV, não percebe o atacante, Imobilizado ou Atordoado) antes de aplicar.");
      return;
    }

    // Log já resolvido antes — permitir de novo só com override (segurança operacional, sem apagar o antigo).
    const jaResolvido = logs.some((l) => l.type === "attack_resolved" && l.payload.sourceActionLogId === log.id);
    if (jaResolvido && !form.override) {
      setAtaqueResolverErro('Este ataque já tem resolução registrada. Marque "Resolver mesmo assim" para registrar de novo.');
      return;
    }

    // Executar: ignora MIT/armadura por completo (dano bruto passa direto).
    const mit = form.executarAtivo ? 0 : form.mit.trim() ? Number(form.mit) : 0;
    const marginDamageModifier = bandRules?.modifierType === "flat" ? bandRules.flatModifier : 0;

    setAtaqueResolverProcessing(log.id);
    try {
      const nowIso = new Date().toISOString();
      let targetNormalizado = normalizeCharacter(targetRecord.payload);

      // Guardião › Blindagem (checkpoint talentos, Fase 5) — o ALVO anula TODO o dano em
      // sucesso de Bloquear, 1/cena; nada é aplicado ao escudo/PD nem ao defensor/aliado
      // (dano bruto vira 0 antes de qualquer outro cálculo, inclusive Amortecer).
      const blindagemStatus = getBlindagemAvailability(targetNormalizado, talentsIniciais);
      const blindagemAplicada = form.blindagemAnularAtivo && blindagemStatus.acquired && !blindagemStatus.usedThisScene;
      if (blindagemAplicada) {
        targetNormalizado = markBlindagemUsed(targetNormalizado, nowIso);
      }

      // Mago de Batalha › Canalizar Amortecer (checkpoint talentos, Fase 5) — o ALVO
      // gasta Mana para reduzir o dano ANTES de MIT/PD (1 ponto de dano por 1 de Mana),
      // 1/rodada (mesmo gate de Potencializar). Reduz o dano BRUTO diretamente, então o
      // resto do pipeline (margem/MIT) roda normalmente sobre o valor já amortecido.
      // Irrelevante quando Blindagem já zerou o dano.
      let amortecerManaGastaReal = 0;
      const amortecerPedida = blindagemAplicada ? 0 : Math.max(0, Math.trunc(Number(form.amortecerManaGasta) || 0));
      if (amortecerPedida > 0) {
        const canalizarAlvoState = getCanalizarState(targetNormalizado, talentsIniciais);
        const manaAlvoAtual = targetNormalizado.recursos_atuais?.mana ?? 0;
        if (canalizarAlvoState.acquired && !canalizarAlvoState.usedThisRound) {
          amortecerManaGastaReal = Math.min(amortecerPedida, manaAlvoAtual, rawDamage);
        }
      }
      const rawDamageAmortecido = blindagemAplicada ? 0 : rawDamage - amortecerManaGastaReal;
      if (amortecerManaGastaReal > 0) {
        targetNormalizado = markCanalizarUsed(
          {
            ...targetNormalizado,
            recursos_atuais: { ...targetNormalizado.recursos_atuais, mana: (targetNormalizado.recursos_atuais?.mana ?? 0) - amortecerManaGastaReal },
          },
          nowIso,
        );
      }

      let resolucao = applyMarginBasedAttackDamage({
        character: targetNormalizado,
        rawDamage: rawDamageAmortecido,
        marginDamageModifier,
        mit,
        nowIso,
        collapseRules: regras?.colapso,
        round: targetNormalizado.current_round,
        scene: targetNormalizado.current_scene,
      });

      // Berserker › Fúria (checkpoint talentos, Fase 5): sofrer dano real (finalDamage > 0)
      // empilha +1 em Luta (até o máximo do payload) no ALVO — TemporaryEffect real com
      // stackingMode "stack" (nunca duplica registro, incrementa a pilha existente).
      let furiaAplicada = false;
      if (resolucao.finalDamage > 0 && hasFuria(resolucao.character, talentsIniciais)) {
        const furiaEffect = buildFuriaTemporaryEffect(
          resolucao.character,
          talentsIniciais,
          () => crypto.randomUUID(),
          nowIso,
          resolucao.character.current_round ?? null,
        );
        if (furiaEffect) {
          resolucao = { ...resolucao, character: addTemporaryEffect(resolucao.character, furiaEffect) };
          furiaAplicada = true;
        }
      }

      // Assassino › Hemorragia (Fase E): sucesso padrão ou melhor aplica Sangrando no
      // alvo; crítico usa o dado alterado do payload (1d8) em vez do padrão da condição.
      let hemorragiaAplicada = false;
      if (form.aplicarHemorragia && bandRules && bandRules.band !== "miss" && bandRules.band !== "limited") {
        const attackerCharacterIdForHemorragia = typeof log.payload.characterId === "string" ? log.payload.characterId : null;
        const attackerRecordForHemorragia = attackerCharacterIdForHemorragia ? personagensAtivos[attackerCharacterIdForHemorragia] : null;
        const attackerCharacterForHemorragia = attackerRecordForHemorragia ? normalizeCharacter(attackerRecordForHemorragia.payload) : null;
        const dado = attackerCharacterForHemorragia ? getHemorragiaCriticalDie(attackerCharacterForHemorragia, talentsIniciais) : "1d8";
        const nomeCondicao = bandRules.band === "critical" ? `Sangrando (crítico — ${dado}, Hemorragia)` : "Sangrando";
        const condResult = applyGmCondition(resolucao.character, { slug: "sangrando", nome: nomeCondicao }, nowIso, {
          sourceCharacterId: attackerCharacterIdForHemorragia,
          sourceTalentId: "assassino_hemorragia",
          sourceType: "talent",
        });
        resolucao = { ...resolucao, character: condResult.character };
        hemorragiaAplicada = !condResult.jaAtiva;
      }

      const record = await updateCharacter(form.targetCharacterId, resolucao.character);
      setPersonagensAtivos((prev) => ({ ...prev, [record.id]: record }));

      // Executar consome 1/cena no ATACANTE — persiste separadamente (registro diferente do alvo).
      if (form.executarAtivo) {
        const attackerCharacterId = typeof log.payload.characterId === "string" ? log.payload.characterId : null;
        const attackerRecord = attackerCharacterId ? personagensAtivos[attackerCharacterId] : null;
        if (attackerRecord) {
          const attackerCharacter = normalizeCharacter(attackerRecord.payload);
          const attackerNext = markExecutarUsed(attackerCharacter, nowIso);
          const attackerSaved = await updateCharacter(attackerCharacterId!, attackerNext);
          setPersonagensAtivos((prev) => ({ ...prev, [attackerSaved.id]: attackerSaved }));
        }
      }

      // Sorrateiro › Ataque Fatal: encerra a Furtividade do ATACANTE ao sair dela para
      // atacar (persistido separadamente, mesmo padrão de Executar acima).
      if (form.ataqueFatalConfirmado) {
        const attackerCharacterId = typeof log.payload.characterId === "string" ? log.payload.characterId : null;
        const attackerRecord = attackerCharacterId ? personagensAtivos[attackerCharacterId] : null;
        if (attackerRecord) {
          const attackerCharacter = normalizeCharacter(attackerRecord.payload);
          const attackerNext = endFurtividade(attackerCharacter, "ataque_fatal");
          if (attackerNext !== attackerCharacter) {
            const attackerSaved = await updateCharacter(attackerCharacterId!, attackerNext);
            setPersonagensAtivos((prev) => ({ ...prev, [attackerSaved.id]: attackerSaved }));
          }
        }
      }

      const reminders: string[] = [];
      if (log.payload.reminders && Array.isArray(log.payload.reminders)) {
        reminders.push(...(log.payload.reminders as unknown[]).filter((r): r is string => typeof r === "string"));
      }
      if (bandRules?.modifierType === "extraDie") {
        const damageBase = typeof log.payload.damageBase === "string" ? log.payload.damageBase : null;
        if (!damageBase || !isDiceFormula(damageBase)) {
          reminders.push("+1 dado de dano pela margem crítica (fórmula não estruturada — inclua manualmente no dano bruto).");
        }
      }
      if (form.executarAtivo) {
        reminders.push("Executar: MIT/armadura ignorados, acerto tratado como crítico.");
      }
      if (form.aEspreitaConfirmado) {
        reminders.push("À Espreita: sucesso limitado/falha limitada tratados como sucesso padrão (alvo não ciente após Mirar).");
      }
      if (form.headshotConfirmado) {
        reminders.push("Headshot: acerto tratado como crítico (Mirar crítico confirmado).");
      }
      if (form.ataqueFatalConfirmado) {
        reminders.push("Ataque Fatal: acerto tratado como crítico; Furtividade do atacante encerrada.");
      }
      if (form.laminaOcultaAlvoConfirmado && form.laminaOcultaFalhaLimitadaConfirmada && marginBand === "limited") {
        reminders.push("Lâmina Oculta: falha limitada tratada como sucesso limitado (alvo não percebia a presença).");
      }
      if (form.laminaOcultaAlvoConfirmado && (marginBand === "standard" || marginBand === "critical")) {
        reminders.push("Lâmina Oculta: pode reposicionar até 3m sem gastar PA (sucesso padrão ou superior).");
      }
      if (amortecerManaGastaReal > 0) {
        reminders.push(`Canalizar Amortecer: ${amortecerManaGastaReal} de dano reduzido ANTES do MIT/PD (${amortecerManaGastaReal} Mana gasta pelo alvo).`);
      } else if (amortecerPedida > 0) {
        reminders.push("Canalizar Amortecer: pedido não aplicado (talento não adquirido, já usado nesta rodada, ou Mana insuficiente).");
      }
      if (hemorragiaAplicada) {
        reminders.push("Hemorragia: Sangrando aplicado ao alvo.");
      }
      if (furiaAplicada) {
        reminders.push("Fúria: +1 em Luta empilhado no alvo (até o fim do próximo turno/rodada).");
      }
      if (blindagemAplicada) {
        reminders.push("Blindagem: dano totalmente anulado (sucesso em Bloquear) — nada aplicado ao escudo/PD nem ao defensor.");
      }
      const requisitosTexto = [
        "Cobertura, alcance, linha de visão, linha de efeito e posição não são validados automaticamente.",
      ];

      // Só referencia a defesa rolada se o total dela ainda bate com o Defesa/CD atual — se o narrador
      // digitou por cima depois de rolar, o attack_resolved não deve alegar uma defesa que não foi usada de fato.
      const defenseUsed = form.lastDefense && form.lastDefense.total === defenseTotal ? form.lastDefense : null;

      const novoLog = await addLog({
        campaignId: selectedCampaignId,
        characterId: form.targetCharacterId,
        type: "attack_resolved",
        visibility: "public",
        payload: {
          sourceActionLogId: log.id,
          attackerCharacterId: typeof log.payload.characterId === "string" ? log.payload.characterId : null,
          attackerName: typeof log.payload.characterNome === "string" ? log.payload.characterNome : "Atacante",
          targetCharacterId: form.targetCharacterId,
          targetName: record.name,
          weaponName: typeof log.payload.weaponName === "string" ? log.payload.weaponName : "Ataque desarmado",
          attackTotal,
          defenseTotal,
          margin,
          marginBand,
          allowedRegions: bandRules?.allowedRegions ?? [],
          selectedRegion: form.region || null,
          rawDamage: resolucao.rawDamage,
          marginDamageModifier: resolucao.marginDamageModifier,
          damageAfterMargin: resolucao.damageAfterMargin,
          mitApplied: resolucao.mitApplied,
          mitSource: form.mitSource,
          finalDamage: resolucao.finalDamage,
          targetPvBefore: resolucao.pvBefore,
          targetPvAfter: resolucao.pvAfter,
          damageType: typeof log.payload.damageType === "string" ? log.payload.damageType : null,
          override: form.override,
          overrideReason: form.overrideReason.trim() || null,
          reminders: [...requisitosTexto, ...reminders],
          collapseStarted: resolucao.collapseStarted,
          collapseAdvanced: resolucao.collapseAdvanceLogs.length > 0,
          source: "attack_resolution",
          defenseReactionLogId: defenseUsed?.defenseReactionLogId ?? null,
          defenseType: defenseUsed?.defenseType ?? null,
          reactionsAfterDefense: defenseUsed?.reactionsAfter ?? null,
        },
      });
      setLogs((prev) => [novoLog, ...prev]);
      setAtaqueResolvendoLogId(null);
      setAtaquePainelForm((prev) => {
        const next = { ...prev };
        delete next[log.id];
        return next;
      });
    } catch (err) {
      setAtaqueResolverErro(err instanceof Error ? err.message : "Erro desconhecido ao aplicar dano — dados preenchidos foram mantidos.");
    } finally {
      setAtaqueResolverProcessing(null);
    }
  }

  function handleOpenResolveSpellAttack(log: TableLogEntry) {
    setMagiaResolverErro(null);
    setMagiaResolvendoLogId(log.id);
    if (!magiaPainelForm[log.id]) {
      const attackTotalPrefill = typeof log.payload.total === "number" ? String(log.payload.total) : "";
      const rawDamagePrefill = typeof log.payload.damageRolled === "number" ? String(log.payload.damageRolled) : "";
      setMagiaPainelForm((prev) => ({
        ...prev,
        [log.id]: { ...DEFAULT_SPELL_ATTACK_PANEL_FORM, attackTotal: attackTotalPrefill, rawDamage: rawDamagePrefill },
      }));
    }
  }

  function updateSpellAttackPanelForm(logId: string, patch: Partial<SpellAttackPanelForm>) {
    setMagiaPainelForm((prev) => ({ ...prev, [logId]: { ...(prev[logId] ?? DEFAULT_SPELL_ATTACK_PANEL_FORM), ...patch } }));
  }

  /**
   * Rola defesa/reação do alvo contra ataque mágico — mesma lógica de
   * `handleRollDefense` (Esquivar/Aparar/Bloquear/Resistir, gasto de
   * Reação canônico), só grava no painel de magia em vez do de arma.
   */
  async function handleRollSpellDefense(logId: string, log: TableLogEntry, defenseType: DefenseType) {
    if (!selectedCampaignId) return;
    const form = magiaPainelForm[logId] ?? DEFAULT_SPELL_ATTACK_PANEL_FORM;
    setMagiaResolverErro(null);

    const targetRecord = form.targetCharacterId ? personagensAtivos[form.targetCharacterId] : null;
    if (!targetRecord) {
      setMagiaResolverErro("Selecione o alvo antes de rolar defesa.");
      return;
    }
    const target = normalizeCharacter(targetRecord.payload);

    const skillSlug = defenseType === "resistir" ? form.resistirSkill : DEFENSE_SKILL_SLUG[defenseType];
    const skillDef = regras?.pericias.find((p) => p.id === skillSlug);
    const attributeId = skillDef?.atributo_primario ?? "corpo";
    const attributeDef = regras?.atributos.find((a) => a.id === attributeId);
    const attributeName = attributeDef?.nome ?? attributeId;
    const skillName = skillDef?.nome ?? skillSlug;
    const attributeValue = (target.atributos as unknown as Record<string, number>)[attributeId] ?? 0;
    const skillValue = target.pericias[skillSlug] ?? 0;

    let requirementStatus: DefenseRollResult["requirementStatus"] = "not_applicable";
    let requirementReminder: string | null = null;
    if (defenseType === "aparar") {
      const met = checkApararRequirement(target);
      requirementStatus = met ? "met" : "not_detected";
      requirementReminder =
        "Requer arma com propriedade Aparar." +
        (met ? "" : " Não detectada no equipamento empunhado do alvo — pode ser usada por decisão do narrador.");
    } else if (defenseType === "bloquear") {
      const met = checkBloquearRequirement(target);
      requirementStatus = met ? "met" : "not_detected";
      requirementReminder =
        "Requer escudo ou proteção adequada." +
        (met ? "" : " Não detectado no equipamento do alvo — pode ser usada por decisão do narrador.") +
        " PD não é aplicado nem reduzido neste checkpoint.";
    } else if (defenseType === "resistir") {
      requirementReminder = "Usado contra movimento forçado, queda, imobilização, paralisia e efeitos similares.";
    }

    const maxReacoes = computeDerivedStats(target.atributos, regras, target.mana_bonus_ruptura ?? 0).reacoes_por_rodada;
    const reactionResult = spendReactionForDefense(target, maxReacoes, reactionRules, 1);
    const blocked = !reactionResult.usedReaction && !reactionResult.defenseWithoutReaction;
    if (blocked && !form.defenseOverride) {
      setMagiaResolverErro(
        `${reactionResult.warnings[0] ?? "Sem Reação disponível."} Marque "Rolar mesmo sem Reação (override)" para permitir.`,
      );
      return;
    }

    const modifiersTotal = form.defenseModifier.trim() ? Number(form.defenseModifier) : 0;
    const rollResult = rollPericia({
      atributoId: attributeId,
      atributoNome: attributeName,
      atributoValor: attributeValue,
      periciaId: skillSlug,
      periciaNome: skillName,
      periciaValor: skillValue,
      modificador: Number.isFinite(modifiersTotal) ? modifiersTotal : 0,
    });

    setMagiaDefesaProcessing(`${logId}:${defenseType}`);
    try {
      const record = await updateCharacter(form.targetCharacterId, reactionResult.character);
      setPersonagensAtivos((prev) => ({ ...prev, [record.id]: record }));

      const novoLog = await addLog({
        campaignId: selectedCampaignId,
        characterId: form.targetCharacterId,
        type: "defense_reaction_used",
        visibility: "public",
        payload: {
          sourceActionLogId: log.id,
          spellAttackResolutionPanel: true,
          targetCharacterId: form.targetCharacterId,
          targetName: record.name,
          defenseType,
          defenseName: DEFENSE_TYPE_LABELS[defenseType],
          attributeId,
          attributeName,
          skillId: skillSlug,
          skillName,
          dice: rollResult.dados,
          highestDie: rollResult.maiorDado,
          skillValue,
          modifiersTotal: Number.isFinite(modifiersTotal) ? modifiersTotal : 0,
          total: rollResult.total,
          reactionCost: 1,
          reactionsBefore: reactionResult.reactionBefore,
          reactionsAfter: reactionResult.reactionAfter,
          requirementStatus,
          requirementReminder,
          usedAsDefenseCd: true,
          source: "spell_attack_resolution",
        },
      });
      setLogs((prev) => [novoLog, ...prev]);

      const lastDefense: DefenseRollResult = {
        defenseReactionLogId: novoLog.id,
        defenseType,
        defenseName: DEFENSE_TYPE_LABELS[defenseType],
        attributeId,
        attributeName,
        skillId: skillSlug,
        skillName,
        dice: rollResult.dados,
        highestDie: rollResult.maiorDado,
        skillValue,
        modifiersTotal: Number.isFinite(modifiersTotal) ? modifiersTotal : 0,
        total: rollResult.total,
        reactionCost: 1,
        reactionsBefore: reactionResult.reactionBefore,
        reactionsAfter: reactionResult.reactionAfter,
        requirementStatus,
        requirementReminder,
      };
      updateSpellAttackPanelForm(logId, { defenseTotal: String(rollResult.total), lastDefense });
    } catch (err) {
      setMagiaResolverErro(
        err instanceof Error
          ? `Erro ao registrar defesa: ${err.message}`
          : "Erro desconhecido ao rolar defesa — confira se a Reação do alvo foi consumida antes de tentar de novo.",
      );
    } finally {
      setMagiaDefesaProcessing(null);
    }
  }

  function handleRollSpellAttackDamage(logId: string, log: TableLogEntry) {
    const damageFormula = typeof log.payload.damageFormula === "string" ? log.payload.damageFormula : null;
    if (!damageFormula || !isDiceFormula(damageFormula)) return;
    const rolled = rollDamageFormula(damageFormula);
    updateSpellAttackPanelForm(logId, { rawDamage: String(rolled) });
  }

  function handleRollSpellExtraMarginDie(logId: string, log: TableLogEntry) {
    const form = magiaPainelForm[logId] ?? DEFAULT_SPELL_ATTACK_PANEL_FORM;
    const damageFormula = typeof log.payload.damageFormula === "string" ? log.payload.damageFormula : null;
    if (!damageFormula) return;
    const extra = rollExtraMarginDie(damageFormula);
    if (extra == null) return;
    const atual = Number(form.rawDamage) || 0;
    updateSpellAttackPanelForm(logId, { rawDamage: String(atual + extra) });
  }

  /**
   * Confirma a resolução de um ataque mágico — reaproveita
   * `applyMarginBasedAttackDamage` (mesmo helper canônico do ataque
   * físico), mas NUNCA exige região quando a magia declara área
   * (`log.payload.area`) e NUNCA autopreenche MIT — o narrador decide
   * se MIT se aplica a este dano mágico (regra de produto §6).
   */
  async function handleResolveSpellAttackDamage(log: TableLogEntry) {
    if (!selectedCampaignId) return;
    const form = magiaPainelForm[log.id] ?? DEFAULT_SPELL_ATTACK_PANEL_FORM;
    setMagiaResolverErro(null);

    const targetRecord = form.targetCharacterId ? personagensAtivos[form.targetCharacterId] : null;
    if (!targetRecord) {
      setMagiaResolverErro("Selecione o alvo antes de aplicar dano.");
      return;
    }
    const rawDamage = Number(form.rawDamage);
    if (!Number.isFinite(rawDamage)) {
      setMagiaResolverErro("Informe o dano bruto antes de aplicar.");
      return;
    }

    const hasArea = log.payload.area != null && log.payload.area !== "";
    const regionApplicable = !hasArea;

    const attackTotal = form.attackTotal.trim() ? Number(form.attackTotal) : null;
    const defenseTotal = form.defenseTotal.trim() ? Number(form.defenseTotal) : null;
    const hasMargin = attackTotal != null && Number.isFinite(attackTotal) && defenseTotal != null && Number.isFinite(defenseTotal);
    const margin = hasMargin ? attackTotal! - defenseTotal! : null;
    const bandRules = margin != null ? resolveMarginBand(margin) : null;
    const marginBand: "limited" | "standard" | "critical" | "miss" | null = bandRules?.band ?? null;

    if (margin != null && margin < 0 && !form.override) {
      setMagiaResolverErro('Ataque mágico não acertou pela margem informada. Marque "Resolver mesmo assim" para aplicar dano por override.');
      return;
    }
    if (regionApplicable && bandRules && form.region && !bandRules.allowedRegions.includes(form.region as BodyRegion) && !form.override) {
      setMagiaResolverErro(`Região "${BODY_REGION_LABELS[form.region as BodyRegion]}" não é permitida para a margem ${margin} sem override.`);
      return;
    }

    const jaResolvido = logs.some((l) => l.type === "spell_attack_resolved" && l.payload.sourceSpellAttackLogId === log.id);
    if (jaResolvido && !form.override) {
      setMagiaResolverErro('Este ataque mágico já tem resolução registrada. Marque "Resolver mesmo assim" para registrar de novo.');
      return;
    }

    const mit = form.mit.trim() ? Number(form.mit) : 0;
    const marginDamageModifier = bandRules?.modifierType === "flat" ? bandRules.flatModifier : 0;

    setMagiaResolverProcessing(log.id);
    try {
      const nowIso = new Date().toISOString();
      const targetNormalizado = normalizeCharacter(targetRecord.payload);
      const resolucao = applyMarginBasedAttackDamage({
        character: targetNormalizado,
        rawDamage,
        marginDamageModifier,
        mit,
        nowIso,
        collapseRules: regras?.colapso,
        round: targetNormalizado.current_round,
        scene: targetNormalizado.current_scene,
      });

      const record = await updateCharacter(form.targetCharacterId, resolucao.character);
      setPersonagensAtivos((prev) => ({ ...prev, [record.id]: record }));

      const manualReminders: string[] = [
        "Cobertura, alcance, linha de visão, linha de efeito e posição não são validados automaticamente.",
        "Verifique se MIT se aplica a este dano mágico — não presumido automaticamente.",
      ];
      if (hasArea) {
        manualReminders.push("Magia de área/linha — região corporal não se aplica; múltiplos alvos são resolvidos manualmente, um de cada vez.");
      }
      const resistanceReminder =
        log.payload.resistance && typeof log.payload.resistance === "object"
          ? "Magia também estrutura Resistência do alvo — resolva-a separadamente pelo cartão de conjuração; não é a mesma coisa que este ataque."
          : null;

      const defenseUsed = form.lastDefense && form.lastDefense.total === defenseTotal ? form.lastDefense : null;

      const novoLog = await addLog({
        campaignId: selectedCampaignId,
        characterId: form.targetCharacterId,
        type: "spell_attack_resolved",
        visibility: "public",
        payload: {
          sourceSpellAttackLogId: log.id,
          casterCharacterId: typeof log.payload.characterId === "string" ? log.payload.characterId : null,
          casterName: typeof log.payload.characterNome === "string" ? log.payload.characterNome : "Conjurador",
          targetCharacterId: form.targetCharacterId,
          targetName: record.name,
          spellId: typeof log.payload.spellId === "string" ? log.payload.spellId : null,
          spellName: typeof log.payload.spellName === "string" ? log.payload.spellName : "Magia",
          spellVertente: typeof log.payload.spellVertente === "string" ? log.payload.spellVertente : null,
          spellLevel: typeof log.payload.spellLevel === "number" ? log.payload.spellLevel : null,
          attackTotal,
          defenseTotal,
          margin,
          marginBand,
          selectedRegion: regionApplicable ? form.region || null : null,
          regionApplicable,
          rawDamage: resolucao.rawDamage,
          damageAfterMargin: resolucao.damageAfterMargin,
          mitApplied: resolucao.mitApplied,
          mitSource: "manual",
          finalDamage: resolucao.finalDamage,
          targetPvBefore: resolucao.pvBefore,
          targetPvAfter: resolucao.pvAfter,
          damageType: typeof log.payload.damageType === "string" ? log.payload.damageType : null,
          resistanceReminder,
          areaReminder: hasArea ? (typeof log.payload.area === "string" ? log.payload.area : String(log.payload.area)) : null,
          manualReminders,
          override: form.override,
          overrideReason: form.overrideReason.trim() || null,
          collapseStarted: resolucao.collapseStarted,
          collapseAdvanced: resolucao.collapseAdvanceLogs.length > 0,
          defenseReactionLogId: defenseUsed?.defenseReactionLogId ?? null,
          defenseType: defenseUsed?.defenseType ?? null,
          reactionsAfterDefense: defenseUsed?.reactionsAfter ?? null,
          source: "spell_attack_resolution",
        },
      });
      setLogs((prev) => [novoLog, ...prev]);
      setMagiaResolvendoLogId(null);
      setMagiaPainelForm((prev) => {
        const next = { ...prev };
        delete next[log.id];
        return next;
      });
    } catch (err) {
      setMagiaResolverErro(err instanceof Error ? err.message : "Erro desconhecido ao aplicar dano — dados preenchidos foram mantidos.");
    } finally {
      setMagiaResolverProcessing(null);
    }
  }

  async function refreshPersonagensAtivos(perfisAtuais: CampaignProfile[]) {
    const ids = Array.from(new Set(perfisAtuais.map((p) => p.active_character_id).filter((id): id is string => !!id)));
    if (ids.length === 0) {
      setPersonagensAtivos({});
      return;
    }
    try {
      const results = await Promise.all(ids.map((id) => getCharacter(id)));
      const proximo: Record<string, CharacterRecord> = {};
      results.forEach((rec) => {
        if (rec) proximo[rec.id] = rec;
      });
      setPersonagensAtivos(proximo);
    } catch {
      // Best-effort — a seção mostra "carregando…" enquanto isso; sem mesa quebrar a página toda.
    }
  }

  useEffect(() => {
    refreshPersonagensAtivos(perfis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfis]);

  /**
   * Salva o personagem mutado (`updateCharacter`, já normalizado) e
   * registra a entrada em `table_logs` — mesmo par save+log usado por
   * qualquer ação de mesa. A ficha do jogador aberta neste personagem
   * recebe a mudança pelo Realtime já existente (checkpoint v0.62);
   * se houver edição local pendente lá, o aviso de "versão mais
   * recente no servidor" aparece exatamente como antes — esta
   * ferramenta não sabe nada sobre isso, só salva o registro canônico.
   */
  async function persistGmMutation(params: { characterId: string; nextCharacter: Character; logPayload: Record<string, unknown>; logType?: string }) {
    if (!selectedCampaignId) return;
    setGmErro(null);
    try {
      const derivados = computeDerivedStats(params.nextCharacter.atributos, regras, params.nextCharacter.mana_bonus_ruptura ?? 0);
      const toSave = normalizeCharacter(params.nextCharacter, derivados);
      const record = await updateCharacter(params.characterId, toSave);
      setPersonagensAtivos((prev) => ({ ...prev, [record.id]: record }));
      await addLog({
        campaignId: selectedCampaignId,
        characterId: params.characterId,
        type: params.logType ?? "character_state_change",
        visibility: "public",
        payload: params.logPayload,
      });
    } catch (err) {
      setGmErro(err instanceof Error ? err.message : "Erro desconhecido ao aplicar ação de narrador.");
    }
  }

  /**
   * Narrador remove/encerra manualmente um efeito temporário de um
   * personagem ativo (checkpoint pós-v0.71) — marca `active: false`
   * (mantém histórico), persiste e grava `temporary_effect_removed`.
   */
  async function handleGmRemoveTemporaryEffect(characterId: string, effectId: string) {
    const record = personagensAtivos[characterId];
    if (!record) return;
    const character = normalizeCharacter(record.payload);
    const effect = (character.efeitos_temporarios ?? []).find((e) => e.id === effectId && e.active);
    if (!effect) return;
    const nowIso = new Date().toISOString();
    const next = removeTemporaryEffect(character, effectId, nowIso);
    await persistGmMutation({
      characterId,
      nextCharacter: next,
      logType: "temporary_effect_removed",
      logPayload: {
        characterId,
        characterNome: record.name,
        effectId: effect.id,
        effectName: effect.name,
        sourceType: effect.sourceType,
        sourceName: effect.sourceName,
        durationType: effect.durationType,
        remainingRounds: effect.remainingRounds ?? null,
        stacks: effect.stacks ?? 1,
        modifiers: effect.modifiers ?? [],
        reason: "Removido manualmente pelo narrador em /dev/table.",
        source: "temporary_effect",
      },
    });
  }

  function updateCrewTransferForm(rowId: string, patch: Partial<{ targetCharacterId: string; quantidade: number }>) {
    setCrewTransferForm((prev) => ({
      ...prev,
      [rowId]: { targetCharacterId: prev[rowId]?.targetCharacterId ?? "", quantidade: prev[rowId]?.quantidade ?? 1, ...patch },
    }));
  }

  /**
   * Transfere um item do bando para um personagem (checkpoint pós-v0.68,
   * CP7) — usa `splitInventoryInstance`/`addInstanceToInventory` (helpers
   * puros, `lib/character/inventory.ts`) para preservar cargas/munição
   * carregada/Aljava/propriedades. Ordem SEGURA sem transação real entre
   * `characters` e `campaign_inventory_items` (tabelas separadas, sem
   * função Postgres cruzando as duas — ver relatório do checkpoint):
   * grava no PERSONAGEM primeiro; só then reduz/remove do bando. Se o
   * passo 2 falhar, o pior caso é uma DUPLICATA (item em ambos os
   * lugares, corrigível manualmente pelo narrador) — nunca uma perda
   * silenciosa do item.
   */
  async function handleTransferCrewToCharacter(rowId: string) {
    if (!selectedCampaignId) return;
    setCrewInventoryError(null);
    const row = crewInventory.find((r) => r.id === rowId);
    if (!row) return;
    const form = crewTransferForm[rowId];
    if (!form?.targetCharacterId) {
      setCrewInventoryError("Escolha um personagem de destino antes de transferir.");
      return;
    }
    const quantidade = form.quantidade ?? row.payload.quantidade;
    setCrewTransferBusyId(rowId);
    try {
      const targetRecordBefore = await getCharacter(form.targetCharacterId);
      if (!targetRecordBefore) {
        setCrewInventoryError("Personagem de destino não encontrado — pode ter sido removido.");
        return;
      }
      const nowIso = new Date().toISOString();
      const split = splitInventoryInstance(row.payload, quantidade, nowIso);
      if (!split.ok || !split.movedInstance) {
        setCrewInventoryError(split.reason ?? "Transferência não permitida.");
        return;
      }

      const targetCharacter = normalizeCharacter(targetRecordBefore.payload);
      const quantityBeforeTarget =
        targetCharacter.inventario?.find((i) => i.itemSlug === split.movedInstance!.itemSlug && i.categoria === "municao")?.quantidade ?? 0;
      const nextTargetCharacter = addInstanceToInventory(targetCharacter, split.movedInstance);
      const quantityAfterTarget =
        nextTargetCharacter.inventario?.find((i) =>
          split.movedInstance!.categoria === "municao" ? i.itemSlug === split.movedInstance!.itemSlug && i.categoria === "municao" : i.id === split.movedInstance!.id,
        )?.quantidade ?? split.movedInstance.quantidade;

      const derivados = computeDerivedStats(nextTargetCharacter.atributos, regras, nextTargetCharacter.mana_bonus_ruptura ?? 0);
      const toSave = normalizeCharacter(nextTargetCharacter, derivados);

      // 1) personagem primeiro (ordem segura — ver docstring acima).
      const savedRecord = await updateCharacter(form.targetCharacterId, toSave);
      setPersonagensAtivos((prev) => ({ ...prev, [savedRecord.id]: savedRecord }));

      // 2) só então reduz/remove do bando.
      if (split.sourceRemainder == null) {
        await removeCrewInventoryItem(selectedCampaignId, row.id);
      } else {
        await updateCrewInventoryItemInstance(selectedCampaignId, row.id, split.sourceRemainder);
      }
      await refreshCrewInventory(selectedCampaignId);

      await addLog({
        campaignId: selectedCampaignId,
        characterId: savedRecord.id,
        type: "inventory_transfer",
        visibility: "public",
        payload: {
          campaignId: selectedCampaignId,
          direction: "crew_to_character",
          targetCharacterId: savedRecord.id,
          targetCharacterName: savedRecord.name,
          itemInstanceId: split.movedInstance.id,
          itemName: split.movedInstance.itemNome,
          itemSlug: split.movedInstance.itemSlug,
          quantityMoved: split.movedInstance.quantidade,
          quantityBeforeSource: row.payload.quantidade,
          quantityAfterSource: split.sourceRemainder?.quantidade ?? 0,
          quantityBeforeTarget,
          quantityAfterTarget,
          chargesMoved: split.movedInstance.cargasAtual ?? null,
          payloadPreserved: true,
          source: "crew_inventory_transfer",
        },
      });
      setLogs(await listLogs(selectedCampaignId));
      setCrewTransferForm((prev) => ({ ...prev, [rowId]: { targetCharacterId: "", quantidade: 1 } }));
    } catch (err) {
      setCrewInventoryError(err instanceof Error ? err.message : "Erro desconhecido ao transferir do bando para o personagem.");
    } finally {
      setCrewTransferBusyId(null);
    }
  }

  async function handleGmDamage(characterId: string) {
    const record = personagensAtivos[characterId];
    const form = gmDanoForm[characterId];
    if (!record || !form || !form.valor) return;
    const nowIso = new Date().toISOString();
    const result = applyGmDamage(record.payload, form.recurso, form.valor, nowIso);
    await persistGmMutation({
      characterId,
      nextCharacter: result.character,
      logPayload: {
        action: "damage",
        characterId,
        characterNome: record.name,
        resource: form.recurso,
        amount: form.valor,
        before: result.before,
        after: result.after,
        note: form.nota || undefined,
        source: "dev_table_narrator_tool",
      },
    });
    setGmDanoForm((prev) => ({ ...prev, [characterId]: { ...prev[characterId], valor: 0, nota: "" } }));
  }

  async function handleGmCura(characterId: string) {
    const record = personagensAtivos[characterId];
    const form = gmCuraForm[characterId];
    if (!record || !form || !form.valor) return;
    const nowIso = new Date().toISOString();
    const max = gmDerivedMax(record.payload, regras, form.recurso);
    const result = applyGmHealing(record.payload, form.recurso, form.valor, max, nowIso);
    await persistGmMutation({
      characterId,
      nextCharacter: result.character,
      logPayload: {
        action: "healing",
        characterId,
        characterNome: record.name,
        resource: form.recurso,
        amount: form.valor,
        before: result.before,
        after: result.after,
        note: form.nota || undefined,
        source: "dev_table_narrator_tool",
        removidasPorCura: result.removidasPorCura.map((c) => c.nome),
      },
    });
    setGmCuraForm((prev) => ({ ...prev, [characterId]: { ...prev[characterId], valor: 0, nota: "" } }));
  }

  async function handleGmSetResource(characterId: string) {
    const record = personagensAtivos[characterId];
    const form = gmSetForm[characterId];
    if (!record || !form) return;
    const max = gmDerivedMax(record.payload, regras, form.recurso);
    const result = setGmResourceValue(record.payload, form.recurso, form.valor, max);
    await persistGmMutation({
      characterId,
      nextCharacter: result.character,
      logPayload: {
        action: "set_resource",
        characterId,
        characterNome: record.name,
        resource: form.recurso,
        before: result.before,
        after: result.after,
        note: form.nota || undefined,
        source: "dev_table_narrator_tool",
      },
    });
  }

  async function handleGmApplyCondition(characterId: string) {
    const record = personagensAtivos[characterId];
    const slug = gmCondicaoForm[characterId];
    const condicao = condicoesDisponiveis.find((c) => c.slug === slug);
    if (!record || !condicao) return;
    const nowIso = new Date().toISOString();
    const result = applyGmCondition(record.payload, condicao, nowIso);
    if (result.jaAtiva) {
      setGmErro(`"${condicao.nome}" já está ativa em ${record.name}.`);
      return;
    }
    await persistGmMutation({
      characterId,
      nextCharacter: result.character,
      logPayload: {
        action: "apply_condition",
        characterId,
        characterNome: record.name,
        conditionId: condicao.slug,
        conditionName: condicao.nome,
        source: "dev_table_narrator_tool",
      },
    });
  }

  async function handleGmRemoveCondition(characterId: string, conditionInstanceId: string) {
    const record = personagensAtivos[characterId];
    if (!record) return;
    const nowIso = new Date().toISOString();
    const result = removeGmCondition(record.payload, conditionInstanceId, nowIso);
    if (!result.condicao) return;
    await persistGmMutation({
      characterId,
      nextCharacter: result.character,
      logPayload: {
        action: "remove_condition",
        characterId,
        characterNome: record.name,
        conditionId: result.condicao.conditionId,
        conditionName: result.condicao.nome,
        source: "dev_table_narrator_tool",
      },
    });
  }

  async function refreshMesas() {
    try {
      setMesas(await listCampaigns());
    } catch {
      // Falha ao atualizar a lista não deve esconder o resultado da ação atual.
    }
  }

  // ---------------------------------------------------------------
  // Encerrar Rodada / Encerrar Cena com preview (checkpoint pós-v0.58).
  // ---------------------------------------------------------------

  /** Personagens que o encerramento vai processar — MESMA fonte do helper canônico (listCharactersForNarratorCampaign, só ativos), não a lista de perfis. */
  async function fetchActiveCampaignCharacters(campaignId: string): Promise<CharacterRecord[]> {
    const all = await listCharactersForNarratorCampaign(campaignId);
    return all.filter((record) => !record.archived_at);
  }

  /**
   * Inventário do bando (checkpoint pós-v0.68) — RLS estrita (migration
   * 0019) exige narrador dono da mesa autenticado; sem sessão real, a
   * chamada lança e a seção mostra o erro claro (nunca uma lista vazia
   * fingida). `campaignCharactersAtivos` reusa a MESMA fonte de
   * `fetchActiveCampaignCharacters` para o seletor de destino.
   */
  async function refreshCrewInventory(campaignId: string) {
    setCrewInventoryLoading(true);
    setCrewInventoryError(null);
    try {
      const [inventario, personagens] = await Promise.all([
        listCrewInventory(campaignId),
        fetchActiveCampaignCharacters(campaignId),
      ]);
      setCrewInventory(inventario);
      setCampaignCharactersAtivos(personagens);
    } catch (err) {
      setCrewInventory([]);
      setCrewInventoryError(
        err instanceof Error
          ? `Inventário do bando indisponível: ${err.message} (exige narrador dono da mesa autenticado — ver /dev/login).`
          : "Inventário do bando indisponível — exige narrador dono da mesa autenticado (ver /dev/login).",
      );
    } finally {
      setCrewInventoryLoading(false);
    }
  }

  async function handleOpenEndRoundPreview() {
    if (!selectedCampaignId || !mesaAtual) return;
    setEndErro(null);
    setEndSummary(null);
    setEndCanConfirm(null);
    setEndBusy(true);
    try {
      // Preflight + preview em paralelo — o preview é read-only; canAdvanceCampaign
      // exercita a MESMA RLS que o confirm, para desabilitar "Confirmar" quando a
      // sessão não puder avançar a campanha (sem chegar a processar personagens).
      const [records, canConfirm] = await Promise.all([
        fetchActiveCampaignCharacters(selectedCampaignId),
        canAdvanceCampaign(selectedCampaignId),
      ]);
      setEndCanConfirm(canConfirm);
      setEndPreview(buildEndRoundPreview(records, regras, conditionContents, mesaAtual.current_round, mesaAtual.current_scene));
    } catch (err) {
      setEndErro(err instanceof Error ? err.message : "Erro ao montar o preview de fim de rodada.");
    } finally {
      setEndBusy(false);
    }
  }

  async function handleOpenEndScenePreview() {
    if (!selectedCampaignId || !mesaAtual) return;
    setEndErro(null);
    setEndSummary(null);
    setEndCanConfirm(null);
    setEndBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const [records, canConfirm] = await Promise.all([
        fetchActiveCampaignCharacters(selectedCampaignId),
        canAdvanceCampaign(selectedCampaignId),
      ]);
      setEndCanConfirm(canConfirm);
      setEndPreview(buildEndScenePreview(records, mesaAtual.current_round, mesaAtual.current_scene, nowIso));
    } catch (err) {
      setEndErro(err instanceof Error ? err.message : "Erro ao montar o preview de fim de cena.");
    } finally {
      setEndBusy(false);
    }
  }

  function handleCancelEndPreview() {
    setEndPreview(null);
    setEndErro(null);
  }

  async function handleConfirmEndResolution() {
    if (!selectedCampaignId || !mesaAtual || !endPreview) return;
    setEndErro(null);
    setEndBusy(true);
    try {
      if (endPreview.kind === "round") {
        const result = await endCampaignRound({ campaignId: selectedCampaignId, expectedRound: mesaAtual.current_round });
        setEndSummary(buildCampaignEndRoundSummary(result));
      } else {
        const result = await endCampaignScene({ campaignId: selectedCampaignId, expectedScene: mesaAtual.current_scene });
        setEndSummary(buildCampaignEndSceneSummary(result));
      }
      // Persistência concluída pelo helper canônico — recarrega mesa (round/scene avançados),
      // logs e personagens ativos para refletir o novo estado. As fichas abertas recebem o
      // update pelo Realtime já existente (updateCharacter foi chamado dentro do helper).
      setEndPreview(null);
      await refreshMesas();
      try {
        setLogs(await listLogs(selectedCampaignId));
      } catch {
        // Best-effort — o resumo já mostra o que foi processado.
      }
      await refreshPersonagensAtivos(perfis);
    } catch (err) {
      // Falha (ex.: rodada/cena já avançou) — mantém o preview aberto e os dados; nunca finge que processou.
      setEndErro(err instanceof Error ? err.message : "Erro ao processar o encerramento.");
    } finally {
      setEndBusy(false);
    }
  }

  async function handleCreateMesa() {
    setErrorMessage(null);
    try {
      const mesa = await createCampaign(novaMesaNome);
      setNovaMesaNome("");
      await refreshMesas();
      await handleSelectMesa(mesa.id);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao criar mesa.");
    }
  }

  async function handleSelectMesa(id: string) {
    setSelectedCampaignId(id);
    setErrorMessage(null);
    setLoadingLogs(true);
    try {
      setLogs(await listLogs(id));
      setUltimaAtualizacao(new Date());
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao carregar logs.");
    } finally {
      setLoadingLogs(false);
    }
    await handleRefreshPerfis(id);
    await handleRefreshConvites(id);
    await refreshCrewInventory(id);
    setConviteLinkNovo(null);
  }

  async function handleRefreshConvites(campaignId: string) {
    try {
      setConvites(await listCampaignInvites(campaignId));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao carregar convites.");
    }
  }

  async function handleCreateConvite() {
    if (!selectedCampaignId) return;
    setErrorMessage(null);
    setConviteCopiado(false);
    try {
      const { rawToken } = await createCampaignInvite(selectedCampaignId, novoConviteLabel);
      setNovoConviteLabel("");
      const link = `${window.location.origin}/join/${rawToken}`;
      setConviteLinkNovo(link);
      await handleRefreshConvites(selectedCampaignId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao criar convite.");
    }
  }

  async function handleRevokeConvite(inviteId: string) {
    if (!selectedCampaignId) return;
    setErrorMessage(null);
    try {
      await revokeCampaignInvite(inviteId);
      await handleRefreshConvites(selectedCampaignId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao revogar convite.");
    }
  }

  async function handleCopyConviteLink() {
    if (!conviteLinkNovo) return;
    try {
      await navigator.clipboard.writeText(conviteLinkNovo);
      setConviteCopiado(true);
    } catch {
      // Clipboard pode falhar sem gesto do usuário; o link fica visível para cópia manual.
    }
  }

  async function handleRefreshPerfis(campaignId: string) {
    setLoadingPerfis(true);
    try {
      setPerfis(await listCampaignProfiles(campaignId));
      setSessoes(await listProfileSessions(campaignId));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao carregar perfis.");
    } finally {
      setLoadingPerfis(false);
    }
  }

  /** Sessão ativa de um perfil (ou null) — derivada da lista carregada. */
  function activeSessionOf(profileId: string): ProfileSession | null {
    return sessoes.find((s) => s.profile_id === profileId && s.status === "active") ?? null;
  }

  async function handleCreatePerfil() {
    if (!selectedCampaignId) return;
    setErrorMessage(null);
    try {
      await createCampaignProfile(selectedCampaignId, novoPerfilApelido);
      setNovoPerfilApelido("");
      await handleRefreshPerfis(selectedCampaignId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao criar perfil.");
    }
  }

  async function handleToggleLockPerfil(profile: CampaignProfile) {
    if (!selectedCampaignId) return;
    setErrorMessage(null);
    try {
      await setCampaignProfileLocked(profile.id, !profile.is_locked);
      await handleRefreshPerfis(selectedCampaignId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao bloquear/desbloquear perfil.");
    }
  }

  async function handleSetPersonagemAtivo(profileId: string, characterId: string | null) {
    if (!selectedCampaignId) return;
    setErrorMessage(null);
    try {
      await setCampaignProfileActiveCharacter(profileId, characterId);
      await handleRefreshPerfis(selectedCampaignId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao vincular personagem ativo.");
    }
  }

  /** Botão "Liberar perfil" — ação de "narrador", libera incondicionalmente (ver forceReleaseCampaignProfile). */
  async function handleForceReleasePerfil(profileId: string) {
    if (!selectedCampaignId) return;
    setErrorMessage(null);
    try {
      await forceReleaseCampaignProfile(profileId);
      await handleRefreshPerfis(selectedCampaignId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao liberar perfil.");
    }
  }

  async function handleAddLog() {
    if (!selectedCampaignId) return;
    setErrorMessage(null);
    try {
      await addLog({
        campaignId: selectedCampaignId,
        type: "chat",
        visibility: visibilidade,
        payload: { mensagem: mensagemInput.trim() || "(mensagem vazia)" },
      });
      setMensagemInput("");
      setLogs(await listLogs(selectedCampaignId));
      setUltimaAtualizacao(new Date());
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao registrar log.");
    }
  }

  async function handleRefreshLogs() {
    if (!selectedCampaignId) return;
    setErrorMessage(null);
    setLoadingLogs(true);
    try {
      setLogs(await listLogs(selectedCampaignId));
      setUltimaAtualizacao(new Date());
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao atualizar logs.");
    } finally {
      setLoadingLogs(false);
    }
  }

  // Autoatualização: re-busca os logs da mesa selecionada a cada
  // AUTO_REFRESH_INTERVAL_MS, sem mexer no filtro de visibilidade (estado
  // separado, não tocado aqui) e sem indicador de "Carregando…" (evita
  // piscar a lista a cada 5s). setLogs substitui a lista inteira a partir
  // do servidor — não há append, então não há risco de duplicar entradas.
  useEffect(() => {
    if (!autoAtualizar || !selectedCampaignId) return;

    const intervalId = setInterval(async () => {
      try {
        const proximosLogs = await listLogs(selectedCampaignId);
        setLogs(proximosLogs);
        setUltimaAtualizacao(new Date());
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido na autoatualização.");
      }
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [autoAtualizar, selectedCampaignId]);

  useEffect(() => {
    if (!selectedCampaignId) return;
    const id = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(id);
  }, [selectedCampaignId]);

  const mesaAtual = mesas.find((m) => m.id === selectedCampaignId);
  const logsFiltrados =
    visibilidadeFiltro === "todos" ? logs : logs.filter((entry) => entry.visibility === visibilidadeFiltro);
  const mesasFiltradas = mesas.filter((mesa) => {
    if (mesaOwnerFiltro === "minhas") return currentUserId != null && mesa.owner_id === currentUserId;
    if (mesaOwnerFiltro === "sem_dono") return mesa.owner_id == null;
    return true;
  });

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
      <p style={{ opacity: 0.6, fontSize: 13, marginBottom: 12 }}>
        /dev/table — base mínima de Mesa/Log persistente. Sem chat real, sem realtime, sem
        autenticação. Visibilidade ("Pública"/"Privada"/"Mestre") é só um campo de dados nesta
        etapa — não há filtro de RLS por enquanto (ver migration 0003).
      </p>

      {currentUserEmail ? (
        <p
          data-testid="auth-banner-logado"
          style={{ fontSize: 12, marginBottom: 16, padding: "8px 12px", background: "#15301a", border: "1px solid #2a5a35", borderRadius: 6 }}
        >
          Narrador logado: <strong>{currentUserEmail}</strong> ·{" "}
          <a href="/dev/auth/status" style={{ color: "#5ec8ff" }}>status</a>. RLS ainda em modo de
          transição — as policies dev-anon continuam abertas, então isto não é segurança real
          ainda (ver checkpoint v0.14/v0.16).
        </p>
      ) : (
        <p
          data-testid="auth-banner-deslogado"
          style={{ fontSize: 12, marginBottom: 16, padding: "8px 12px", background: "#2a2a15", border: "1px solid #5a5a2a", borderRadius: 6 }}
        >
          Nenhum narrador logado (modo dev anon). A RLS ainda é aberta — login não é obrigatório
          nesta etapa. <a href="/dev/login" style={{ color: "#5ec8ff" }}>Entrar</a>
        </p>
      )}

      {errorMessage && (
        <p style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 16 }}>Erro: {errorMessage}</p>
      )}

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 12 }}>
          Criar mesa
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            data-testid="nova-mesa-nome"
            type="text"
            value={novaMesaNome}
            onChange={(e) => setNovaMesaNome(e.target.value)}
            placeholder="Nome da mesa"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button data-testid="criar-mesa-button" onClick={handleCreateMesa} style={buttonStyle}>
            Criar mesa
          </button>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6 }}>
            Mesas ({mesasFiltradas.length}/{mesas.length})
          </h2>
          <select
            data-testid="mesa-owner-filtro-select"
            value={mesaOwnerFiltro}
            onChange={(e) => setMesaOwnerFiltro(e.target.value as MesaOwnerFilter)}
            style={inputStyle}
          >
            {MESA_OWNER_FILTERS.map((f) => (
              <option key={f} value={f}>
                {MESA_OWNER_FILTER_LABELS[f]}
              </option>
            ))}
          </select>
        </div>
        {!currentUserId && mesaOwnerFiltro === "minhas" && (
          <p style={{ fontSize: 11, opacity: 0.6, marginBottom: 12 }}>
            Sem login, "Minhas mesas" não tem como identificar você — a lista fica vazia. Entre em{" "}
            <a href="/dev/login" style={{ color: "#5ec8ff" }}>/dev/login</a>.
          </p>
        )}
        {mesas.length === 0 && <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhuma mesa criada ainda.</p>}
        {mesas.length > 0 && mesasFiltradas.length === 0 && (
          <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhuma mesa com esse filtro.</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {mesasFiltradas.map((mesa) => {
            const isMinha = currentUserId != null && mesa.owner_id === currentUserId;
            const semDono = mesa.owner_id == null;
            const ownerLabel = isMinha ? "Sua mesa" : semDono ? "Sem dono (mesa dev legada)" : "De outro narrador";
            const ownerColor = isMinha ? "#7fd99a" : semDono ? "#ffb84f" : "#888";

            return (
              <div
                key={mesa.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  background: mesa.id === selectedCampaignId ? "#26283280" : "#1d1e24",
                  borderRadius: 8,
                  padding: "10px 14px",
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {mesa.name}{" "}
                    <span data-testid={`mesa-owner-badge-${mesa.id}`} style={{ fontSize: 11, fontWeight: 400, color: ownerColor }}>
                      · {ownerLabel}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.5 }}>{mesa.id}</div>
                </div>
                <button data-testid={`selecionar-mesa-${mesa.id}`} onClick={() => handleSelectMesa(mesa.id)} style={buttonStyle}>
                  {mesa.id === selectedCampaignId ? "Selecionada" : "Selecionar"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {selectedCampaignId && (
        <>
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 12 }}>
              Perfis da mesa ({perfis.length}) — {mesaAtual?.name ?? selectedCampaignId}
            </h2>
            <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
              Perfil DEV: apelido + bloqueio manual ou via heartbeat (polling client-side, sem
              Supabase Realtime). Sem login, sem link de convite real — "sessão" é só um id no
              localStorage de quem entrou pela ficha, sem prova de identidade (ver migrations 0004
              e 0005).
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                data-testid="novo-perfil-apelido"
                type="text"
                value={novoPerfilApelido}
                onChange={(e) => setNovoPerfilApelido(e.target.value)}
                placeholder="Apelido do perfil"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button data-testid="criar-perfil-button" onClick={handleCreatePerfil} style={buttonStyle}>
                Criar perfil
              </button>
            </div>
            {loadingPerfis && <p style={{ fontSize: 13, opacity: 0.6 }}>Carregando…</p>}
            {!loadingPerfis && perfis.length === 0 && (
              <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhum perfil criado ainda nesta mesa.</p>
            )}
            <div data-testid="perfis-lista" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {perfis.map((perfil) => {
                const personagemAtivo = personagens.find((p) => p.id === perfil.active_character_id);
                const expirado = isPerfilExpirado(perfil, nowTick);

                return (
                  <div
                    key={perfil.id}
                    data-testid="perfil-entry"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      background: "#1d1e24",
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontSize: 13,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <span data-testid="perfil-apelido" style={{ fontWeight: 600 }}>
                          {perfil.nickname}
                        </span>
                        <span
                          data-testid="perfil-status"
                          style={{ marginLeft: 10, fontSize: 11, opacity: 0.7, color: perfil.is_locked ? "#ffb84f" : "#7fd99a" }}
                        >
                          {perfil.is_locked ? "Bloqueado" : "Livre"}
                        </span>
                      </div>
                      <button data-testid={`bloquear-perfil-${perfil.id}`} onClick={() => handleToggleLockPerfil(perfil)} style={buttonStyle}>
                        {perfil.is_locked ? "Desbloquear" : "Bloquear"}
                      </button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span data-testid="perfil-personagem-ativo" style={{ fontSize: 11, opacity: 0.7 }}>
                        Personagem ativo: {personagemAtivo ? personagemAtivo.name : "nenhum"}
                      </span>
                      <select
                        data-testid={`perfil-personagem-select-${perfil.id}`}
                        value={perfil.active_character_id ?? ""}
                        onChange={(e) => handleSetPersonagemAtivo(perfil.id, e.target.value || null)}
                        style={inputStyle}
                      >
                        <option value="">— selecionar personagem —</option>
                        {personagens.map((personagem) => (
                          <option key={personagem.id} value={personagem.id}>
                            {personagem.name}
                            {personagem.campaign_id == null ? " (sem mesa — legado/dev)" : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        data-testid={`limpar-personagem-ativo-${perfil.id}`}
                        onClick={() => handleSetPersonagemAtivo(perfil.id, null)}
                        style={buttonStyle}
                        disabled={!perfil.active_character_id}
                      >
                        Limpar personagem
                      </button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span data-testid={`perfil-last-seen-${perfil.id}`} style={{ fontSize: 11, opacity: 0.7 }}>
                        Último sinal: {formatLastSeen(perfil.last_seen_at)}
                      </span>
                      {expirado && (
                        <span
                          data-testid={`perfil-expirado-${perfil.id}`}
                          style={{ fontSize: 11, color: "#ff6b6b", fontWeight: 700 }}
                        >
                          Parece expirado
                        </span>
                      )}
                      <button
                        data-testid={`liberar-perfil-${perfil.id}`}
                        onClick={() => handleForceReleasePerfil(perfil.id)}
                        style={buttonStyle}
                        disabled={!perfil.is_locked}
                      >
                        Liberar perfil
                      </button>
                    </div>
                    {(() => {
                      const sess = activeSessionOf(perfil.id);
                      return (
                        <div data-testid={`perfil-sessao-${perfil.id}`} style={{ fontSize: 11, opacity: 0.7 }}>
                          Sessão: {sess
                            ? `ativa · último sinal ${formatLastSeen(sess.last_seen_at)}${sess.invite_id ? " · via convite" : ""}`
                            : "nenhuma sessão ativa"}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </section>

          <section style={{ marginBottom: 32 }} data-testid="encerramento-secao">
            <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 12 }}>
              Encerrar Rodada / Cena — {mesaAtual?.name ?? selectedCampaignId}
            </h2>
            <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
              Rodada atual <strong>{mesaAtual?.current_round ?? "?"}</strong> · Cena atual{" "}
              <strong>{mesaAtual?.current_scene ?? "?"}</strong>. O encerramento mostra um <em>preview</em> do que será
              processado ANTES de aplicar; só o botão "Confirmar" persiste (via helper canônico idempotente da mesa).
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <button
                data-testid="encerrar-rodada-btn"
                onClick={handleOpenEndRoundPreview}
                disabled={endBusy || endPreview != null}
                style={{ ...buttonStyle, opacity: endBusy || endPreview != null ? 0.5 : 1 }}
              >
                Encerrar Rodada
              </button>
              <button
                data-testid="encerrar-cena-btn"
                onClick={handleOpenEndScenePreview}
                disabled={endBusy || endPreview != null}
                style={{ ...buttonStyle, opacity: endBusy || endPreview != null ? 0.5 : 1 }}
              >
                Encerrar Cena
              </button>
            </div>
            {endErro && (
              <p data-testid="encerramento-erro" style={{ color: "#ff6b6b", fontSize: 12, marginBottom: 12 }}>
                {endErro}
              </p>
            )}
            {endSummary && !endPreview && (
              <div
                data-testid="encerramento-resumo"
                style={{ background: "#151620", borderRadius: 8, padding: "10px 14px", fontSize: 12, marginBottom: 12, display: "flex", flexDirection: "column", gap: 4 }}
              >
                <strong style={{ opacity: 0.7 }}>Processado:</strong>
                {endSummary.map((linha, i) => (
                  <span key={i}>{linha}</span>
                ))}
              </div>
            )}
            {endPreview && (
              <EndResolutionPreviewPanel
                preview={endPreview}
                processing={endBusy}
                canConfirm={endCanConfirm}
                onConfirm={handleConfirmEndResolution}
                onCancel={handleCancelEndPreview}
              />
            )}
          </section>

          <section style={{ marginBottom: 32 }} data-testid="estado-personagens-secao">
            <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 12 }}>
              Estado dos personagens — {mesaAtual?.name ?? selectedCampaignId}
            </h2>
            <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
              Dano/cura/ajuste de recurso e condições aplicados aqui salvam direto em <code>characters</code> e
              registram em <code>table_logs</code> (<code>type: "character_state_change"</code>). A ficha do
              jogador aberta neste personagem recebe a mudança pelo Realtime já existente — sem reload manual.
              Sem cálculo de MIT/PD/região corporal ainda: dano é redução direta do recurso escolhido.
            </p>
            {gmErro && <p style={{ color: "#ff6b6b", fontSize: 12, marginBottom: 12 }}>{gmErro}</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {perfis.map((perfil) => {
                if (!perfil.active_character_id) {
                  return (
                    <div
                      key={perfil.id}
                      data-testid={`estado-personagem-sem-ativo-${perfil.id}`}
                      style={{ background: "#1d1e24", borderRadius: 8, padding: "8px 14px", fontSize: 12, opacity: 0.55 }}
                    >
                      {perfil.nickname}: sem personagem ativo vinculado.
                    </div>
                  );
                }
                const characterId = perfil.active_character_id;
                const record = personagensAtivos[characterId];
                if (!record) {
                  return (
                    <div key={perfil.id} style={{ background: "#1d1e24", borderRadius: 8, padding: "8px 14px", fontSize: 12, opacity: 0.6 }}>
                      {perfil.nickname}: carregando personagem…
                    </div>
                  );
                }
                const payload = record.payload;
                const recursos = payload.recursos_atuais ?? {};
                const condicoesAtivas = (payload.condicoes_ativas ?? []).filter((c) => c.ativa);
                const efeitosTemporarios = getActiveTemporaryEffects(normalizeCharacter(payload));
                const danoForm = gmDanoForm[characterId] ?? { recurso: "pv" as const, valor: 0, nota: "" };
                const curaForm = gmCuraForm[characterId] ?? { recurso: "pv" as const, valor: 0, nota: "" };
                const setForm = gmSetForm[characterId] ?? { recurso: "pv" as GmResource, valor: recursos.pv ?? 0, nota: "" };
                const condicaoSelecionada = gmCondicaoForm[characterId] ?? "";

                return (
                  <div
                    key={perfil.id}
                    data-testid={`estado-personagem-${characterId}`}
                    style={{ background: "#1d1e24", borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}
                  >
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                      <strong>{perfil.nickname}</strong>
                      <span style={{ opacity: 0.7 }}>→ {record.name}</span>
                    </div>

                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
                      {(["pv", "pe", "mana", "integridade"] as const).map((r) => (
                        <span key={r} data-testid={`estado-recurso-${characterId}-${r}`}>
                          {GM_RESOURCE_LABELS[r]}: {recursos[r] ?? 0} / {gmDerivedMax(payload, regras, r)}
                        </span>
                      ))}
                    </div>

                    <div style={{ fontSize: 12 }}>
                      <span style={{ opacity: 0.6 }}>Condições ativas: </span>
                      {condicoesAtivas.length === 0 ? (
                        <span style={{ opacity: 0.5 }}>nenhuma</span>
                      ) : (
                        <div data-testid={`estado-condicoes-${characterId}`} style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                          {condicoesAtivas.map((c) => (
                            <span
                              key={c.id}
                              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#0f1014", borderRadius: 4, padding: "2px 8px" }}
                            >
                              {c.nome}
                              <button
                                data-testid={`estado-remover-condicao-${characterId}-${c.id}`}
                                onClick={() => handleGmRemoveCondition(characterId, c.id)}
                                style={{ ...buttonStyle, padding: "1px 6px", fontSize: 11 }}
                              >
                                Remover
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {efeitosTemporarios.length > 0 && (
                      <div style={{ fontSize: 12 }}>
                        <span style={{ opacity: 0.6 }}>Efeitos temporários: </span>
                        <div data-testid={`estado-efeitos-temporarios-${characterId}`} style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                          {efeitosTemporarios.map((e) => (
                            <span
                              key={e.id}
                              title={formatTemporaryEffectSummary(e)}
                              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#0f1014", borderRadius: 4, padding: "2px 8px", color: "#7bc67e" }}
                            >
                              {e.name} · {describeDuration(e)}
                              <button
                                data-testid={`estado-remover-efeito-temp-${characterId}-${e.id}`}
                                onClick={() => handleGmRemoveTemporaryEffect(characterId, e.id)}
                                style={{ ...buttonStyle, padding: "1px 6px", fontSize: 11 }}
                              >
                                Encerrar
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Aplicar dano */}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <select
                        data-testid={`estado-dano-recurso-${characterId}`}
                        value={danoForm.recurso}
                        onChange={(e) => setGmDanoForm((prev) => ({ ...prev, [characterId]: { ...danoForm, recurso: e.target.value as "pv" | "pe" } }))}
                        style={inputStyle}
                      >
                        <option value="pv">PV</option>
                        <option value="pe">PE</option>
                      </select>
                      <input
                        data-testid={`estado-dano-valor-${characterId}`}
                        type="number"
                        min={0}
                        value={danoForm.valor}
                        onChange={(e) => setGmDanoForm((prev) => ({ ...prev, [characterId]: { ...danoForm, valor: Math.max(0, Number(e.target.value)) } }))}
                        style={{ ...inputStyle, width: 70 }}
                      />
                      <input
                        data-testid={`estado-dano-nota-${characterId}`}
                        type="text"
                        placeholder="Nota (opcional)"
                        value={danoForm.nota}
                        onChange={(e) => setGmDanoForm((prev) => ({ ...prev, [characterId]: { ...danoForm, nota: e.target.value } }))}
                        style={{ ...inputStyle, flex: 1, minWidth: 120 }}
                      />
                      <button data-testid={`estado-aplicar-dano-${characterId}`} onClick={() => handleGmDamage(characterId)} style={buttonStyle}>
                        Aplicar dano
                      </button>
                    </div>

                    {/* Aplicar cura */}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <select
                        data-testid={`estado-cura-recurso-${characterId}`}
                        value={curaForm.recurso}
                        onChange={(e) => setGmCuraForm((prev) => ({ ...prev, [characterId]: { ...curaForm, recurso: e.target.value as "pv" | "pe" | "mana" } }))}
                        style={inputStyle}
                      >
                        <option value="pv">PV</option>
                        <option value="pe">PE</option>
                        <option value="mana">Mana</option>
                      </select>
                      <input
                        data-testid={`estado-cura-valor-${characterId}`}
                        type="number"
                        min={0}
                        value={curaForm.valor}
                        onChange={(e) => setGmCuraForm((prev) => ({ ...prev, [characterId]: { ...curaForm, valor: Math.max(0, Number(e.target.value)) } }))}
                        style={{ ...inputStyle, width: 70 }}
                      />
                      <input
                        data-testid={`estado-cura-nota-${characterId}`}
                        type="text"
                        placeholder="Nota (opcional)"
                        value={curaForm.nota}
                        onChange={(e) => setGmCuraForm((prev) => ({ ...prev, [characterId]: { ...curaForm, nota: e.target.value } }))}
                        style={{ ...inputStyle, flex: 1, minWidth: 120 }}
                      />
                      <button data-testid={`estado-aplicar-cura-${characterId}`} onClick={() => handleGmCura(characterId)} style={buttonStyle}>
                        Aplicar cura
                      </button>
                    </div>

                    {/* Ajuste direto de recurso (override manual) */}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <select
                        data-testid={`estado-set-recurso-${characterId}`}
                        value={setForm.recurso}
                        onChange={(e) => setGmSetForm((prev) => ({ ...prev, [characterId]: { ...setForm, recurso: e.target.value as GmResource } }))}
                        style={inputStyle}
                      >
                        <option value="pv">PV</option>
                        <option value="pe">PE</option>
                        <option value="mana">Mana</option>
                        <option value="integridade">Integridade</option>
                      </select>
                      <input
                        data-testid={`estado-set-valor-${characterId}`}
                        type="number"
                        min={0}
                        value={setForm.valor}
                        onChange={(e) => setGmSetForm((prev) => ({ ...prev, [characterId]: { ...setForm, valor: Number(e.target.value) } }))}
                        style={{ ...inputStyle, width: 70 }}
                      />
                      <input
                        data-testid={`estado-set-nota-${characterId}`}
                        type="text"
                        placeholder="Nota (opcional)"
                        value={setForm.nota}
                        onChange={(e) => setGmSetForm((prev) => ({ ...prev, [characterId]: { ...setForm, nota: e.target.value } }))}
                        style={{ ...inputStyle, flex: 1, minWidth: 120 }}
                      />
                      <button data-testid={`estado-definir-valor-${characterId}`} onClick={() => handleGmSetResource(characterId)} style={buttonStyle}>
                        Definir valor
                      </button>
                      <span style={{ fontSize: 10, opacity: 0.5 }}>override manual — ignora regra de dano/cura</span>
                    </div>

                    {/* Aplicar condição */}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <select
                        data-testid={`estado-condicao-select-${characterId}`}
                        value={condicaoSelecionada}
                        onChange={(e) => setGmCondicaoForm((prev) => ({ ...prev, [characterId]: e.target.value }))}
                        style={inputStyle}
                        disabled={condicoesDisponiveis.length === 0}
                      >
                        <option value="">— escolher condição —</option>
                        {condicoesDisponiveis.map((c) => (
                          <option key={c.slug} value={c.slug}>
                            {c.nome}
                          </option>
                        ))}
                      </select>
                      <button
                        data-testid={`estado-aplicar-condicao-${characterId}`}
                        onClick={() => handleGmApplyCondition(characterId)}
                        disabled={!condicaoSelecionada}
                        style={{ ...buttonStyle, opacity: condicaoSelecionada ? 1 : 0.5 }}
                      >
                        Aplicar condição
                      </button>
                      {condicoesDisponiveis.length === 0 && (
                        <span style={{ fontSize: 11, opacity: 0.5 }}>Biblioteca de condições indisponível.</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {perfis.length === 0 && <p style={{ fontSize: 12, opacity: 0.6 }}>Nenhum perfil nesta mesa ainda.</p>}
            </div>
          </section>

          <section style={{ marginBottom: 32 }} data-testid="inventario-bando-secao">
            <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 12 }}>
              Inventário do bando ({crewInventory.length}) — {mesaAtual?.name ?? selectedCampaignId}
            </h2>
            <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
              Itens guardados na mesa (tabela <code>campaign_inventory_items</code>), fora do inventário de
              qualquer personagem. RLS estrita: exige narrador dono da mesa autenticado (
              <a href="/dev/login" style={{ color: "#5ec8ff" }}>/dev/login</a>) — sem sessão, esta seção mostra o
              erro abaixo em vez de fingir uma lista vazia.
            </p>
            {crewInventoryError && (
              <p data-testid="inventario-bando-erro" style={{ color: "#ff6b6b", fontSize: 12, marginBottom: 12 }}>
                ⚠ {crewInventoryError}
              </p>
            )}
            {crewInventoryLoading && <p style={{ fontSize: 12, opacity: 0.6 }}>Carregando…</p>}
            {!crewInventoryLoading && !crewInventoryError && crewInventory.length === 0 && (
              <p style={{ fontSize: 12, opacity: 0.6 }}>Nenhum item no bando ainda.</p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {crewInventory.map((row) => {
                const instance = row.payload;
                const form = crewTransferForm[row.id] ?? { targetCharacterId: "", quantidade: instance.quantidade };
                const splittable = canSplitInstanceQuantity(instance);
                const busy = crewTransferBusyId === row.id;
                return (
                  <div
                    key={row.id}
                    data-testid={`inventario-bando-item-${row.id}`}
                    style={{ background: "#1d1e24", borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong>{instance.itemNome}</strong>
                      <span style={{ opacity: 0.6 }}>x{instance.quantidade}</span>
                      {instance.cargasAtual != null && <span style={{ opacity: 0.6 }}>cargas: {instance.cargasAtual}</span>}
                      {instance.municaoAtual != null && <span style={{ opacity: 0.6 }}>munição carregada: {instance.municaoAtual}</span>}
                      {instance.aljava && (
                        <span style={{ opacity: 0.6 }}>
                          Aljava: {instance.aljava.stacks.reduce((s, x) => s + x.quantidade, 0)}/{instance.aljava.capacidade} flechas
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <select
                        data-testid={`inventario-bando-destino-${row.id}`}
                        value={form.targetCharacterId}
                        onChange={(e) => updateCrewTransferForm(row.id, { targetCharacterId: e.target.value })}
                        style={inputStyle}
                      >
                        <option value="">— personagem de destino —</option>
                        {campaignCharactersAtivos.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      {splittable && (
                        <input
                          data-testid={`inventario-bando-quantidade-${row.id}`}
                          type="number"
                          min={1}
                          max={instance.quantidade}
                          value={form.quantidade}
                          onChange={(e) => updateCrewTransferForm(row.id, { quantidade: Math.max(1, Math.min(instance.quantidade, Number(e.target.value))) })}
                          style={{ ...inputStyle, width: 70 }}
                        />
                      )}
                      <button
                        data-testid={`inventario-bando-transferir-${row.id}`}
                        onClick={() => handleTransferCrewToCharacter(row.id)}
                        disabled={busy || !form.targetCharacterId}
                        style={{ ...buttonStyle, opacity: busy || !form.targetCharacterId ? 0.5 : 1 }}
                      >
                        {busy ? "Transferindo…" : "Transferir para personagem"}
                      </button>
                    </div>
                    {!splittable && instance.quantidade > 1 && (
                      <span style={{ fontSize: 10, opacity: 0.45 }}>
                        Cargas/munição/Aljava/propriedades pertencem a uma unidade específica — transferência sempre move a
                        instância inteira ({instance.quantidade}).
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 12 }}>
              Convites ({convites.length}) — {mesaAtual?.name ?? selectedCampaignId}
            </h2>
            <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
              Convite real com token revogável → gera <code>/join/&lt;token&gt;</code>. O banco guarda só
              o hash do token; o link bruto aparece uma única vez, ao criar.
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <input
                data-testid="novo-convite-label"
                type="text"
                value={novoConviteLabel}
                onChange={(e) => setNovoConviteLabel(e.target.value)}
                placeholder="Rótulo do convite (opcional)"
                style={{ ...inputStyle, flex: 1, minWidth: 180 }}
              />
              <button data-testid="criar-convite-button" onClick={handleCreateConvite} style={buttonStyle}>
                Criar convite
              </button>
            </div>

            {conviteLinkNovo && (
              <div
                data-testid="convite-link-novo"
                style={{ background: "#15301a", border: "1px solid #2a5a35", borderRadius: 8, padding: 12, marginBottom: 12 }}
              >
                <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>
                  Link do convite (mostrado só agora — copie antes de sair):
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <code style={{ fontSize: 12, wordBreak: "break-all", flex: 1 }}>{conviteLinkNovo}</code>
                  <button data-testid="copiar-convite-button" onClick={handleCopyConviteLink} style={buttonStyle}>
                    {conviteCopiado ? "Copiado ✓" : "Copiar"}
                  </button>
                </div>
              </div>
            )}

            {convites.length === 0 && <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhum convite criado ainda.</p>}
            <div data-testid="convites-lista" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {convites.map((convite) => {
                const expirado = convite.expires_at != null && new Date(convite.expires_at).getTime() < nowTick;
                const revogado = convite.revoked_at != null || !convite.is_active;
                const estado = revogado ? "Revogado" : expirado ? "Expirado" : "Ativo";
                const estadoCor = revogado ? "#ff6b6b" : expirado ? "#ffb84f" : "#7fd99a";

                return (
                  <div
                    key={convite.id}
                    data-testid="convite-entry"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      background: "#1d1e24",
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontSize: 13,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600 }}>{convite.label ?? "(sem rótulo)"}</span>
                      <span data-testid="convite-estado" style={{ marginLeft: 10, fontSize: 11, color: estadoCor }}>
                        {estado}
                      </span>
                      <div style={{ fontSize: 11, opacity: 0.5 }}>
                        criado {new Date(convite.created_at).toLocaleString("pt-BR")}
                        {convite.expires_at ? ` · expira ${new Date(convite.expires_at).toLocaleString("pt-BR")}` : ""}
                      </div>
                    </div>
                    <button
                      data-testid={`revogar-convite-${convite.id}`}
                      onClick={() => handleRevokeConvite(convite.id)}
                      disabled={revogado}
                      style={{ ...buttonStyle, opacity: revogado ? 0.5 : 1 }}
                    >
                      Revogar
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 12 }}>
              Enviar mensagem — {mesaAtual?.name ?? selectedCampaignId}
            </h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                data-testid="mensagem-teste-input"
                type="text"
                value={mensagemInput}
                onChange={(e) => setMensagemInput(e.target.value)}
                placeholder="Mensagem"
                style={{ ...inputStyle, flex: 1, minWidth: 200 }}
              />
              <select
                data-testid="mensagem-visibilidade-select"
                value={visibilidade}
                onChange={(e) => setVisibilidade(e.target.value as TableLogVisibility)}
                style={inputStyle}
              >
                {TABLE_LOG_VISIBILITIES.map((v) => (
                  <option key={v} value={v}>
                    {VISIBILITY_LABELS[v]}
                  </option>
                ))}
              </select>
              <button data-testid="adicionar-log-button" onClick={handleAddLog} style={buttonStyle}>
                Enviar
              </button>
            </div>
          </section>

          <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6 }}>
                Log da mesa ({logsFiltrados.length}/{logs.length})
              </h2>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  data-testid="filtro-visibilidade-select"
                  value={visibilidadeFiltro}
                  onChange={(e) => setVisibilidadeFiltro(e.target.value as VisibilityFilter)}
                  style={inputStyle}
                >
                  {VISIBILITY_FILTERS.map((v) => (
                    <option key={v} value={v}>
                      {VISIBILITY_FILTER_LABELS[v]}
                    </option>
                  ))}
                </select>
                <button data-testid="atualizar-logs-button" onClick={handleRefreshLogs} style={buttonStyle}>
                  Atualizar logs
                </button>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <input
                    data-testid="auto-atualizar-toggle"
                    type="checkbox"
                    checked={autoAtualizar}
                    onChange={(e) => setAutoAtualizar(e.target.checked)}
                  />
                  Autoatualizar
                </label>
              </div>
            </div>
            <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 4 }}>
              Console dev/diagnóstico: mostra TODOS os logs (public/private/gm), sem filtro real de
              visibilidade — o filtro abaixo é só visual. A visibilidade real (v0.20) é aplicada nas
              rotas de jogador (aba Mesa da ficha via listLogsForViewer), não aqui.
            </p>
            <p data-testid="auto-atualizar-status" style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
              {autoAtualizar ? "Autoatualização ligada" : "Autoatualização desligada"}
              {ultimaAtualizacao && ` — Última atualização: ${ultimaAtualizacao.toLocaleTimeString("pt-BR")}`}
            </p>
            {loadingLogs && <p style={{ fontSize: 13, opacity: 0.6 }}>Carregando…</p>}
            {!loadingLogs && logs.length === 0 && (
              <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhum log ainda nesta mesa.</p>
            )}
            {!loadingLogs && logs.length > 0 && logsFiltrados.length === 0 && (
              <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhum log com essa visibilidade.</p>
            )}
            <div data-testid="logs-lista" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {logsFiltrados.map((entry) => {
                const isChat = entry.type === "chat";
                const isRolagem = entry.type === "rolagem_pericia" || entry.type === "rolagem_expressao";
                const isProfileEvent = entry.type === "profile_event";
                const isActionUsed = entry.type === "action_used";
                const isAttackResolved = entry.type === "attack_resolved";
                const isDefenseReactionUsed = entry.type === "defense_reaction_used";
                const isSpellAttackUsed = entry.type === "spell_attack_used";
                const isSpellAttackResolved = entry.type === "spell_attack_resolved";
                // "Resolver ataque" só faz sentido para action_used de Atacar (detectado pelo mesmo campo que a ficha grava — weaponName presente).
                const isAttackAction = isActionUsed && typeof entry.payload.weaponName === "string";
                const jaResolvido = isAttackAction && logs.some((l) => l.type === "attack_resolved" && l.payload.sourceActionLogId === entry.id);
                const magiaJaResolvida = isSpellAttackUsed && logs.some((l) => l.type === "spell_attack_resolved" && l.payload.sourceSpellAttackLogId === entry.id);
                // Chat aceita `text` (ficha, checkpoint v0.12) ou `mensagem` (formato antigo desta tela).
                const chatTexto =
                  typeof entry.payload.text === "string"
                    ? entry.payload.text
                    : typeof entry.payload.mensagem === "string"
                      ? entry.payload.mensagem
                      : null;
                const conteudo = isChat && chatTexto != null
                  ? chatTexto
                  : isRolagem
                    ? formatRolagem(entry.payload)
                    : isProfileEvent
                      ? formatProfileEvent(entry.payload)
                      : isActionUsed
                        ? formatActionUsed(entry.payload)
                        : isAttackResolved
                          ? formatAttackResolved(entry.payload)
                          : isDefenseReactionUsed
                            ? formatDefenseReactionUsed(entry.payload)
                            : isSpellAttackUsed
                              ? formatSpellAttackUsed(entry.payload)
                              : isSpellAttackResolved
                                ? formatSpellAttackResolved(entry.payload)
                                : formatSystemLog(entry.type, entry.payload);
                const corBorda = isChat
                  ? "#4f8cff"
                  : isProfileEvent
                    ? "#ff6b9f"
                    : isActionUsed
                      ? "#ff9f6b"
                      : isAttackResolved
                        ? "#ff5252"
                        : isDefenseReactionUsed
                          ? "#5ec8ff"
                          : isSpellAttackUsed || isSpellAttackResolved
                            ? "#7c4dff"
                            : "#ffb84f";

                return (
                  <div
                    key={entry.id}
                    data-testid="log-entry"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      background: "#1d1e24",
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontSize: 13,
                      borderLeft: `3px solid ${corBorda}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, opacity: 0.6 }}>
                      <span aria-hidden="true">{entryIcon(entry.type)}</span>
                      <span data-testid="log-entry-type">{entryKindLabel(entry.type)}</span>
                      <span data-testid="log-entry-visibility">[{VISIBILITY_LABELS[entry.visibility]}]</span>
                      <span style={{ marginLeft: "auto", fontFamily: "monospace" }}>
                        {new Date(entry.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <span data-testid="log-entry-mensagem">{conteudo}</span>
                    {isAttackAction && (
                      <div style={{ marginTop: 4 }}>
                        <button
                          data-testid={`log-resolver-ataque-${entry.id}`}
                          onClick={() => handleOpenResolveAttack(entry)}
                          style={{ ...buttonStyle, fontSize: 11, padding: "4px 10px", opacity: 0.85 }}
                        >
                          Resolver ataque{jaResolvido ? " (já resolvido)" : ""}
                        </button>
                      </div>
                    )}
                    {isAttackAction && ataqueResolvendoLogId === entry.id && (
                      <AttackResolutionPanel
                        log={entry}
                        form={ataquePainelForm[entry.id] ?? DEFAULT_ATTACK_PANEL_FORM}
                        personagensAtivos={personagensAtivos}
                        regras={regras}
                        reactionRules={reactionRules}
                        jaResolvido={jaResolvido}
                        processing={ataqueResolverProcessing === entry.id}
                        defenseProcessing={ataqueDefesaProcessing}
                        erro={ataqueResolverErro}
                        onUpdateForm={(patch) => updateAttackPanelForm(entry.id, patch)}
                        onSelectTarget={(targetCharacterId) => handleAttackTargetOrRegionChange(entry.id, { targetCharacterId })}
                        onSelectRegion={(region) => handleAttackTargetOrRegionChange(entry.id, { region })}
                        onUseArmorMit={() => handleUseArmorMit(entry.id)}
                        onRollDamage={() => handleRollAttackDamage(entry.id, entry)}
                        onRollExtraMarginDie={() => handleRollExtraMarginDie(entry.id, entry)}
                        onRollDefense={(defenseType) => handleRollDefense(entry.id, entry, defenseType)}
                        onApply={() => handleResolveAttackDamage(entry)}
                        onCancel={() => setAtaqueResolvendoLogId(null)}
                        talentsIniciais={talentsIniciais}
                        itemsIniciais={itemsIniciais}
                      />
                    )}
                    {isSpellAttackUsed && (
                      <div style={{ marginTop: 4 }}>
                        <button
                          data-testid={`log-resolver-ataque-magico-${entry.id}`}
                          onClick={() => handleOpenResolveSpellAttack(entry)}
                          style={{ ...buttonStyle, fontSize: 11, padding: "4px 10px", opacity: 0.85, borderColor: "#7c4dff", color: "#c9a6ff" }}
                        >
                          Resolver ataque mágico{magiaJaResolvida ? " (já resolvido)" : ""}
                        </button>
                      </div>
                    )}
                    {isSpellAttackUsed && magiaResolvendoLogId === entry.id && (
                      <SpellAttackResolutionPanel
                        log={entry}
                        form={magiaPainelForm[entry.id] ?? DEFAULT_SPELL_ATTACK_PANEL_FORM}
                        personagensAtivos={personagensAtivos}
                        regras={regras}
                        reactionRules={reactionRules}
                        jaResolvido={magiaJaResolvida}
                        processing={magiaResolverProcessing === entry.id}
                        defenseProcessing={magiaDefesaProcessing}
                        erro={magiaResolverErro}
                        onUpdateForm={(patch) => updateSpellAttackPanelForm(entry.id, patch)}
                        onSelectTarget={(targetCharacterId) => updateSpellAttackPanelForm(entry.id, { targetCharacterId })}
                        onRollDamage={() => handleRollSpellAttackDamage(entry.id, entry)}
                        onRollExtraMarginDie={() => handleRollSpellExtraMarginDie(entry.id, entry)}
                        onRollDefense={(defenseType) => handleRollSpellDefense(entry.id, entry, defenseType)}
                        onApply={() => handleResolveSpellAttackDamage(entry)}
                        onCancel={() => setMagiaResolvendoLogId(null)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

/**
 * Painel inline "Resolver Ataque" (checkpoint pós-v0.50) — sem
 * modal/mapa/token. Só apresentação + coleta de campos; toda a
 * lógica (margem, região liberada, MIT, dano final) fica em
 * `TableClient`/`lib/character/attack.ts`, chamada via os callbacks.
 */
function AttackResolutionPanel({
  log,
  form,
  personagensAtivos,
  regras,
  reactionRules,
  jaResolvido,
  processing,
  defenseProcessing,
  erro,
  onUpdateForm,
  onSelectTarget,
  onSelectRegion,
  onUseArmorMit,
  onRollDamage,
  onRollExtraMarginDie,
  onRollDefense,
  onApply,
  onCancel,
  talentsIniciais,
  itemsIniciais,
}: {
  log: TableLogEntry;
  form: AttackPanelForm;
  personagensAtivos: Record<string, CharacterRecord>;
  regras: CharacterRulesPayload | null;
  reactionRules: ReactionRules;
  jaResolvido: boolean;
  processing: boolean;
  defenseProcessing: string | null;
  erro: string | null;
  onUpdateForm: (patch: Partial<AttackPanelForm>) => void;
  onSelectTarget: (targetCharacterId: string) => void;
  onSelectRegion: (region: BodyRegion) => void;
  onUseArmorMit: () => void;
  onRollDamage: () => void;
  onRollExtraMarginDie: () => void;
  onRollDefense: (defenseType: DefenseType) => void;
  onApply: () => void;
  onCancel: () => void;
  /** Assassino › Hemorragia/Executar (checkpoint talentos, Fase E) — talentos do ATACANTE. */
  talentsIniciais: TalentContent[];
  itemsIniciais: ItemContent[];
}) {
  const attackTotal = form.attackTotal.trim() ? Number(form.attackTotal) : null;
  const defenseTotal = form.defenseTotal.trim() ? Number(form.defenseTotal) : null;
  const hasMargin = attackTotal != null && Number.isFinite(attackTotal) && defenseTotal != null && Number.isFinite(defenseTotal);
  const margin = hasMargin ? attackTotal! - defenseTotal! : null;
  const bandRules = margin != null ? resolveMarginBand(margin) : null;
  const rawDamage = Number(form.rawDamage) || 0;
  const bandRulesEfetivo = applyMarginBandOverrides(bandRules, form);
  const marginDamageModifier = bandRulesEfetivo?.modifierType === "flat" ? bandRulesEfetivo.flatModifier : 0;
  const damageAfterMargin = Math.max(0, rawDamage + marginDamageModifier);
  const mit = form.executarAtivo ? 0 : Number(form.mit) || 0;
  const finalDamage = Math.max(0, damageAfterMargin - mit);
  const damageBase = typeof log.payload.damageBase === "string" ? log.payload.damageBase : null;
  const isDice = damageBase != null && /^\d+d\d+([+-]\d+)?$/.test(damageBase.trim().replace(/\s+/g, ""));

  const targetRecord = form.targetCharacterId ? personagensAtivos[form.targetCharacterId] : null;
  const targetNormalizado = targetRecord ? normalizeCharacter(targetRecord.payload) : null;
  const reactionMax = targetNormalizado
    ? computeDerivedStats(targetNormalizado.atributos, regras, targetNormalizado.mana_bonus_ruptura ?? 0).reacoes_por_rodada
    : 0;
  const reactionAvailability = targetNormalizado ? getReactionAvailability(targetNormalizado, reactionMax, reactionRules) : null;
  // Mago de Batalha › Canalizar Amortecer (checkpoint talentos, Fase 5) — lido do ALVO (quem sofre o dano), não do atacante.
  const canalizarAmortecerStatus = targetNormalizado ? getCanalizarState(targetNormalizado, talentsIniciais) : { acquired: false, usedThisRound: false };
  const manaAlvoAtual = targetNormalizado?.recursos_atuais?.mana ?? 0;
  // Guardião › Blindagem (checkpoint talentos, Fase 5) — lido do ALVO.
  const blindagemStatus = targetNormalizado ? getBlindagemAvailability(targetNormalizado, talentsIniciais) : { acquired: false, usedThisScene: false };

  // Assassino › Hemorragia/Executar (Fase E, cross-record) — lidos do ATACANTE, não do alvo.
  const attackerCharacterId = typeof log.payload.characterId === "string" ? log.payload.characterId : null;
  const attackerRecord = attackerCharacterId ? personagensAtivos[attackerCharacterId] : null;
  const attackerCharacter = attackerRecord ? normalizeCharacter(attackerRecord.payload) : null;
  const weaponInstanceId = typeof log.payload.weaponInstanceId === "string" ? log.payload.weaponInstanceId : null;
  const weaponInstance = attackerCharacter && weaponInstanceId ? attackerCharacter.inventario?.find((i) => i.id === weaponInstanceId) : null;
  const weaponModel = weaponInstance ? itemsIniciais.find((m) => m.slug === weaponInstance.itemSlug) : null;
  const hemorragiaDisponivel = !!attackerCharacter && hasHemorragia(attackerCharacter, talentsIniciais) && !!weaponModel?.propertySlugs.includes("sangramento");
  const executarStatus = attackerCharacter ? getExecutarAvailability(attackerCharacter, talentsIniciais) : { acquired: false, usedThisScene: false, available: false };
  // Atirador de Elite › À Espreita/Headshot / Sorrateiro › Ataque Fatal (checkpoint talentos, Fase 3) — lidos do ATACANTE, mesmo padrão de Hemorragia/Executar acima.
  // À Espreita/Headshot exigem Mirar (só à distância) — mesma tag precisao/balistica de 1 Tiro, 1 Acerto; arma desconhecida nunca bloqueia (compatibilidade incerta permissiva, mesmo critério de runas).
  const armaEhADistancia = !weaponModel?.periciaAtaque || weaponModel.periciaAtaque === "precisao" || weaponModel.periciaAtaque === "balistica";
  const aEspreitaDisponivel = !!attackerCharacter && hasAEspreita(attackerCharacter, talentsIniciais) && armaEhADistancia;
  const headshotDisponivel = !!attackerCharacter && hasHeadshot(attackerCharacter, talentsIniciais) && armaEhADistancia;
  const ataqueFatalDisponivel = !!attackerCharacter && hasAtaqueFatal(attackerCharacter, talentsIniciais) && !!attackerCharacter.furtividade_ativa?.active;
  const laminaOcultaDisponivel = !!attackerCharacter && hasLaminaOculta(attackerCharacter, talentsIniciais);

  return (
    <div
      data-testid={`painel-resolver-ataque-${log.id}`}
      style={{ marginTop: 8, background: "#0f1014", borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}
    >
      <p style={{ opacity: 0.6, margin: 0 }}>
        Ataque: {typeof log.payload.characterNome === "string" ? log.payload.characterNome : "Atacante"} · arma:{" "}
        {typeof log.payload.weaponName === "string" ? log.payload.weaponName : "Ataque desarmado"} · perícia:{" "}
        {typeof log.payload.attackSkill === "string" ? log.payload.attackSkill : "?"} · dano-base: {damageBase ?? "não estruturado"}
        {typeof log.payload.damageType === "string" ? ` (${log.payload.damageType})` : ""}
      </p>
      <p style={{ opacity: 0.5, margin: 0 }}>
        Lembrete: cobertura, alcance, linha de visão, linha de efeito e posição não são validados automaticamente.
      </p>
      {jaResolvido && (
        <p style={{ color: "#f5a623", margin: 0 }}>Este ataque já tem resolução registrada.</p>
      )}

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        Alvo
        <select
          data-testid={`ataque-alvo-${log.id}`}
          value={form.targetCharacterId}
          onChange={(e) => onSelectTarget(e.target.value)}
          style={inputStyle}
        >
          <option value="">— selecione —</option>
          {Object.values(personagensAtivos).map((record) => (
            <option key={record.id} value={record.id}>
              {record.name}
            </option>
          ))}
        </select>
      </label>

      {targetNormalizado && reactionAvailability && (
        <div
          data-testid={`ataque-defesa-alvo-${log.id}`}
          style={{ display: "flex", flexDirection: "column", gap: 8, background: "#151620", borderRadius: 6, padding: "8px 10px" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 11, opacity: 0.7 }}>Defesa do alvo</strong>
            <span data-testid={`ataque-defesa-reacoes-${log.id}`} style={{ fontSize: 11, opacity: 0.7 }}>
              Reações: {reactionAvailability.remaining}/{reactionAvailability.max}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["esquivar", "aparar", "bloquear", "resistir"] as DefenseType[]).map((defenseType) => (
              <button
                key={defenseType}
                data-testid={`ataque-defesa-rolar-${defenseType}-${log.id}`}
                onClick={() => onRollDefense(defenseType)}
                disabled={defenseProcessing === `${log.id}:${defenseType}`}
                style={{ ...buttonStyle, fontSize: 11, opacity: defenseProcessing === `${log.id}:${defenseType}` ? 0.5 : 1 }}
              >
                {defenseProcessing === `${log.id}:${defenseType}` ? "Rolando…" : DEFENSE_TYPE_LABELS[defenseType]}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              Perícia de Resistir
              <select
                data-testid={`ataque-defesa-resistir-pericia-${log.id}`}
                value={form.resistirSkill}
                onChange={(e) => onUpdateForm({ resistirSkill: e.target.value as "vigor" | "mobilidade" })}
                style={inputStyle}
              >
                <option value="vigor">Vigor</option>
                <option value="mobilidade">Mobilidade</option>
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              Modificador manual
              <input
                data-testid={`ataque-defesa-modificador-${log.id}`}
                type="number"
                value={form.defenseModifier}
                onChange={(e) => onUpdateForm({ defenseModifier: e.target.value })}
                style={{ ...inputStyle, width: 90 }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <input
                data-testid={`ataque-defesa-override-${log.id}`}
                type="checkbox"
                checked={form.defenseOverride}
                onChange={(e) => onUpdateForm({ defenseOverride: e.target.checked })}
              />
              Rolar mesmo sem Reação (override)
            </label>
          </div>
          {form.lastDefense && (
            <p data-testid={`ataque-defesa-ultimo-resultado-${log.id}`} style={{ fontSize: 11, opacity: 0.7, margin: 0 }}>
              Última defesa: {form.lastDefense.defenseName} — {form.lastDefense.attributeName}d8 (maior {form.lastDefense.highestDie}) +{" "}
              {form.lastDefense.skillName} {form.lastDefense.skillValue}
              {form.lastDefense.modifiersTotal !== 0 ? ` + mod ${form.lastDefense.modifiersTotal}` : ""} = {form.lastDefense.total}
              {form.lastDefense.requirementReminder && form.lastDefense.requirementStatus !== "met" ? ` — ${form.lastDefense.requirementReminder}` : ""}
            </p>
          )}
          <p style={{ fontSize: 10, opacity: 0.5, margin: 0 }}>
            Modificadores automáticos de condição/postura ainda são pendência nesta tela — só o modificador manual acima entra na rolagem.
          </p>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Ataque total
          <input
            data-testid={`ataque-total-${log.id}`}
            type="number"
            value={form.attackTotal}
            onChange={(e) => onUpdateForm({ attackTotal: e.target.value })}
            style={{ ...inputStyle, width: 90 }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Defesa/CD
          <input
            data-testid={`ataque-defesa-cd-${log.id}`}
            type="number"
            value={form.defenseTotal}
            onChange={(e) => onUpdateForm({ defenseTotal: e.target.value })}
            style={{ ...inputStyle, width: 90 }}
          />
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Margem
          <span data-testid={`ataque-margem-${log.id}`} style={{ padding: "6px 0" }}>
            {margin != null ? margin : "—"}
            {bandRules ? ` (${bandRules.band})` : ""}
          </span>
        </div>
      </div>

      {margin != null && margin < 0 && (
        <p data-testid={`ataque-aviso-margem-negativa-${log.id}`} style={{ color: "#ff6b6b", margin: 0 }}>
          Ataque não acertou pela margem informada.
        </p>
      )}

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        Região
        <select
          data-testid={`ataque-regiao-${log.id}`}
          value={form.region}
          onChange={(e) => onSelectRegion(e.target.value as BodyRegion)}
          style={inputStyle}
        >
          <option value="">— selecione —</option>
          {BODY_REGIONS.map((region) => {
            const permitida = form.override || !bandRules || bandRules.allowedRegions.includes(region);
            return (
              <option key={region} value={region} disabled={!permitida}>
                {BODY_REGION_LABELS[region]}
                {!permitida ? " (fora da margem)" : ""}
              </option>
            );
          })}
        </select>
      </label>

      {bandRules?.modifierType === "extraDie" && (
        <p style={{ opacity: 0.7, margin: 0 }}>
          Margem crítica: +1 dado de dano.{" "}
          {isDice ? (
            <button data-testid={`ataque-rolar-dado-extra-${log.id}`} onClick={onRollExtraMarginDie} style={{ ...buttonStyle, fontSize: 11, padding: "2px 8px" }}>
              Rolar +1 dado
            </button>
          ) : (
            "Fórmula não estruturada — inclua manualmente no dano bruto."
          )}
        </p>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Dano bruto
          <input
            data-testid={`ataque-dano-bruto-${log.id}`}
            type="number"
            value={form.rawDamage}
            onChange={(e) => onUpdateForm({ rawDamage: e.target.value })}
            style={{ ...inputStyle, width: 90 }}
          />
        </label>
        {isDice && (
          <button data-testid={`ataque-rolar-dano-${log.id}`} onClick={onRollDamage} style={{ ...buttonStyle, fontSize: 11 }}>
            Rolar dano ({damageBase})
          </button>
        )}
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          MIT
          <input
            data-testid={`ataque-mit-${log.id}`}
            type="number"
            value={form.executarAtivo ? "0" : form.mit}
            disabled={form.executarAtivo}
            onChange={(e) => onUpdateForm({ mit: e.target.value, mitSource: "manual", mitTouched: true })}
            style={{ ...inputStyle, width: 70, opacity: form.executarAtivo ? 0.5 : 1 }}
          />
        </label>
        <span style={{ opacity: 0.5, fontSize: 11 }}>
          {form.executarAtivo ? "MIT ignorado (Executar)" : form.mitSource === "structured" ? "MIT do equipamento ativo" : form.mitSource === "manual" ? "MIT manual" : "sem MIT estruturado"}
        </span>
        {form.mitTouched && (
          <span data-testid={`ataque-mit-editado-manualmente-${log.id}`} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#f5a623" }}>
            MIT foi editado manualmente.
            <button data-testid={`ataque-usar-mit-armadura-${log.id}`} onClick={onUseArmorMit} style={{ ...buttonStyle, fontSize: 11, padding: "2px 8px" }}>
              Usar MIT da armadura
            </button>
          </span>
        )}
      </div>

      {blindagemStatus.acquired && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "#141a24", border: "1px solid #2e4a5c", borderRadius: 6, padding: "8px 10px" }}>
          <span style={{ fontSize: 11, opacity: 0.7 }}>Blindagem (talento do ALVO):</span>
          {blindagemStatus.usedThisScene ? (
            <span style={{ fontSize: 11, color: "#888" }}>Blindagem já foi usada pelo alvo nesta cena.</span>
          ) : (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <input
                data-testid={`ataque-blindagem-${log.id}`}
                type="checkbox"
                checked={form.blindagemAnularAtivo}
                onChange={(e) => onUpdateForm({ blindagemAnularAtivo: e.target.checked })}
              />
              Anular todo o dano (sucesso em Bloquear) — 1/cena, não consome PD/escudo
            </label>
          )}
        </div>
      )}

      {canalizarAmortecerStatus.acquired && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "#141a24", border: "1px solid #2e4a5c", borderRadius: 6, padding: "8px 10px" }}>
          <span style={{ fontSize: 11, opacity: 0.7 }}>Canalizar Amortecer (talento do ALVO — reduz dano antes de MIT/PD, 1/rodada):</span>
          {canalizarAmortecerStatus.usedThisRound ? (
            <span style={{ fontSize: 11, color: "#888" }}>Canalizar já foi usado pelo alvo nesta rodada (Potencializar ou Amortecer).</span>
          ) : (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              Mana a gastar (alvo tem {manaAlvoAtual}):
              <input
                data-testid={`ataque-amortecer-mana-${log.id}`}
                type="number"
                min={0}
                max={manaAlvoAtual}
                value={form.amortecerManaGasta}
                onChange={(e) => onUpdateForm({ amortecerManaGasta: e.target.value })}
                style={{ ...inputStyle, width: 70 }}
              />
            </label>
          )}
        </div>
      )}

      {(hemorragiaDisponivel || executarStatus.acquired || aEspreitaDisponivel || headshotDisponivel || ataqueFatalDisponivel || laminaOcultaDisponivel) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "#1a1420", border: "1px solid #4a2e5c", borderRadius: 6, padding: "8px 10px" }}>
          <span style={{ fontSize: 11, opacity: 0.7 }}>Talentos do atacante ({typeof log.payload.characterNome === "string" ? log.payload.characterNome : "atacante"}):</span>
          {laminaOcultaDisponivel && (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  data-testid={`ataque-lamina-oculta-alvo-${log.id}`}
                  type="checkbox"
                  checked={form.laminaOcultaAlvoConfirmado}
                  onChange={(e) => onUpdateForm({ laminaOcultaAlvoConfirmado: e.target.checked })}
                />
                Lâmina Oculta — confirmo que o alvo não percebe a presença do atacante
              </label>
              {form.laminaOcultaAlvoConfirmado && bandRulesEfetivo?.band === "miss" && (
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                  <input
                    data-testid={`ataque-lamina-oculta-falha-limitada-${log.id}`}
                    type="checkbox"
                    checked={form.laminaOcultaFalhaLimitadaConfirmada}
                    onChange={(e) => onUpdateForm({ laminaOcultaFalhaLimitadaConfirmada: e.target.checked })}
                  />
                  Esta falha é limitada, não crítica (julgamento do narrador) — trata como sucesso limitado
                </label>
              )}
            </>
          )}
          {aEspreitaDisponivel && (
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                data-testid={`ataque-a-espreita-${log.id}`}
                type="checkbox"
                checked={form.aEspreitaConfirmado}
                onChange={(e) => onUpdateForm({ aEspreitaConfirmado: e.target.checked })}
              />
              À Espreita — confirmo alvo não ciente + ataque após sucesso em Mirar (sucesso/falha limitada viram sucesso padrão)
            </label>
          )}
          {headshotDisponivel && (
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                data-testid={`ataque-headshot-${log.id}`}
                type="checkbox"
                checked={form.headshotConfirmado}
                onChange={(e) => onUpdateForm({ headshotConfirmado: e.target.checked })}
              />
              Headshot — confirmo Mirar crítico (acerto vira crítico; miss continua miss)
            </label>
          )}
          {ataqueFatalDisponivel && (
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                data-testid={`ataque-ataque-fatal-${log.id}`}
                type="checkbox"
                checked={form.ataqueFatalConfirmado}
                onChange={(e) => onUpdateForm({ ataqueFatalConfirmado: e.target.checked })}
              />
              Ataque Fatal — atacante está saindo de Furtividade neste ataque (acerto vira crítico; encerra a Furtividade dele)
            </label>
          )}
          {hemorragiaDisponivel && (
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                data-testid={`ataque-hemorragia-${log.id}`}
                type="checkbox"
                checked={form.aplicarHemorragia}
                onChange={(e) => onUpdateForm({ aplicarHemorragia: e.target.checked })}
              />
              Aplicar Hemorragia (Sangrando no acerto — 1d8 em crítico)
            </label>
          )}
          {executarStatus.acquired && (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  data-testid={`ataque-executar-${log.id}`}
                  type="checkbox"
                  checked={form.executarAtivo}
                  disabled={!executarStatus.available}
                  onChange={(e) => onUpdateForm({ executarAtivo: e.target.checked })}
                />
                Executar (ignora MIT, trata como crítico) — 1/cena
                {executarStatus.usedThisScene && <span style={{ color: "#888" }}> — já usado nesta cena</span>}
              </label>
              {form.executarAtivo && (
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                  <input
                    data-testid={`ataque-executar-requisito-${log.id}`}
                    type="checkbox"
                    checked={form.executarRequisitoConfirmado}
                    onChange={(e) => onUpdateForm({ executarRequisitoConfirmado: e.target.checked })}
                  />
                  Confirmo o requisito: alvo abaixo de 50% PV, não percebe o atacante, Imobilizado ou Atordoado (confirmação manual)
                </label>
              )}
            </>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
        <span>
          Dano após margem: <strong data-testid={`ataque-dano-apos-margem-${log.id}`}>{damageAfterMargin}</strong>
        </span>
        <span>
          Dano final: <strong data-testid={`ataque-dano-final-${log.id}`}>{finalDamage}</strong>
        </span>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          data-testid={`ataque-override-${log.id}`}
          type="checkbox"
          checked={form.override}
          onChange={(e) => onUpdateForm({ override: e.target.checked })}
        />
        Resolver mesmo assim (override)
      </label>
      {form.override && (
        <input
          data-testid={`ataque-override-nota-${log.id}`}
          type="text"
          placeholder="Nota do override (opcional)"
          value={form.overrideReason}
          onChange={(e) => onUpdateForm({ overrideReason: e.target.value })}
          style={inputStyle}
        />
      )}

      {erro && <p style={{ color: "#ff6b6b", margin: 0 }}>{erro}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <button data-testid={`ataque-aplicar-dano-${log.id}`} onClick={onApply} disabled={processing} style={{ ...buttonStyle, opacity: processing ? 0.5 : 1 }}>
          {processing ? "Aplicando…" : "Aplicar dano"}
        </button>
        <button onClick={onCancel} style={{ ...buttonStyle, opacity: 0.7 }}>
          Fechar
        </button>
      </div>
    </div>
  );
}

/**
 * Painel inline "Resolver ataque mágico" (checkpoint pós-v0.70) — irmão
 * do `AttackResolutionPanel` físico, aberto a partir de logs
 * `spell_attack_used`. Visualmente distinto (borda/rótulo roxos) para
 * nunca ser confundido com o painel de ataque físico. Nunca oferece
 * região quando a magia declara área; MIT é sempre manual com
 * lembrete — nenhuma magia do catálogo hoje estrutura se MIT se aplica.
 */
function SpellAttackResolutionPanel({
  log,
  form,
  personagensAtivos,
  regras,
  reactionRules,
  jaResolvido,
  processing,
  defenseProcessing,
  erro,
  onUpdateForm,
  onSelectTarget,
  onRollDamage,
  onRollExtraMarginDie,
  onRollDefense,
  onApply,
  onCancel,
}: {
  log: TableLogEntry;
  form: SpellAttackPanelForm;
  personagensAtivos: Record<string, CharacterRecord>;
  regras: CharacterRulesPayload | null;
  reactionRules: ReactionRules;
  jaResolvido: boolean;
  processing: boolean;
  defenseProcessing: string | null;
  erro: string | null;
  onUpdateForm: (patch: Partial<SpellAttackPanelForm>) => void;
  onSelectTarget: (targetCharacterId: string) => void;
  onRollDamage: () => void;
  onRollExtraMarginDie: () => void;
  onRollDefense: (defenseType: DefenseType) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const attackTotal = form.attackTotal.trim() ? Number(form.attackTotal) : null;
  const defenseTotal = form.defenseTotal.trim() ? Number(form.defenseTotal) : null;
  const hasMargin = attackTotal != null && Number.isFinite(attackTotal) && defenseTotal != null && Number.isFinite(defenseTotal);
  const margin = hasMargin ? attackTotal! - defenseTotal! : null;
  const bandRules = margin != null ? resolveMarginBand(margin) : null;
  const rawDamage = Number(form.rawDamage) || 0;
  const marginDamageModifier = bandRules?.modifierType === "flat" ? bandRules.flatModifier : 0;
  const damageAfterMargin = Math.max(0, rawDamage + marginDamageModifier);
  const mit = Number(form.mit) || 0;
  const finalDamage = Math.max(0, damageAfterMargin - mit);
  const damageFormula = typeof log.payload.damageFormula === "string" ? log.payload.damageFormula : null;
  const isDice = damageFormula != null && /^\d+d\d+([+-]\d+)?$/.test(damageFormula.trim().replace(/\s+/g, ""));
  const hasArea = log.payload.area != null && log.payload.area !== "";
  const regionApplicable = !hasArea;
  const resistance = typeof log.payload.resistance === "object" && log.payload.resistance !== null ? (log.payload.resistance as Record<string, unknown>) : null;
  const rollableAttack = typeof log.payload.total === "number";

  const targetRecord = form.targetCharacterId ? personagensAtivos[form.targetCharacterId] : null;
  const targetNormalizado = targetRecord ? normalizeCharacter(targetRecord.payload) : null;
  const reactionMax = targetNormalizado
    ? computeDerivedStats(targetNormalizado.atributos, regras, targetNormalizado.mana_bonus_ruptura ?? 0).reacoes_por_rodada
    : 0;
  const reactionAvailability = targetNormalizado ? getReactionAvailability(targetNormalizado, reactionMax, reactionRules) : null;

  return (
    <div
      data-testid={`painel-resolver-ataque-magico-${log.id}`}
      style={{ marginTop: 8, background: "#17111f", border: "1px solid #7c4dff", borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}
    >
      <p style={{ color: "#c9a6ff", fontWeight: 700, margin: 0 }}>⚔ Ataque mágico</p>
      <p style={{ opacity: 0.6, margin: 0 }}>
        Conjurador: {typeof log.payload.characterNome === "string" ? log.payload.characterNome : "?"} · magia:{" "}
        {typeof log.payload.spellName === "string" ? log.payload.spellName : "?"} · dano:{" "}
        {damageFormula ?? "não estruturado"}
        {typeof log.payload.damageType === "string" ? ` (${log.payload.damageType})` : ""}
        {!rollableAttack && " — teste de acerto não foi rolado automaticamente na conjuração (role manualmente e preencha Ataque total)."}
      </p>
      <p style={{ opacity: 0.5, margin: 0 }}>
        Lembrete: cobertura, alcance, linha de visão, linha de efeito e posição não são validados automaticamente.
      </p>
      {resistance && (
        <p style={{ color: "#f5a623", margin: 0 }}>
          Esta magia também estrutura Resistência do alvo — isso é diferente deste ataque; resolva a Resistência pelo cartão de conjuração, não aqui.
        </p>
      )}
      {hasArea && (
        <p style={{ color: "#f5a623", margin: 0 }}>
          Área declarada ({String(log.payload.area)}) — sem automação de área/múltiplos alvos; região corporal não se aplica. Resolva cada alvo manualmente, um de cada vez.
        </p>
      )}
      {jaResolvido && <p style={{ color: "#f5a623", margin: 0 }}>Este ataque mágico já tem resolução registrada.</p>}

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        Alvo
        <select
          data-testid={`magia-ataque-alvo-${log.id}`}
          value={form.targetCharacterId}
          onChange={(e) => onSelectTarget(e.target.value)}
          style={inputStyle}
        >
          <option value="">— selecione —</option>
          {Object.values(personagensAtivos).map((record) => (
            <option key={record.id} value={record.id}>
              {record.name}
            </option>
          ))}
        </select>
      </label>

      {targetNormalizado && reactionAvailability && (
        <div
          data-testid={`magia-ataque-defesa-alvo-${log.id}`}
          style={{ display: "flex", flexDirection: "column", gap: 8, background: "#151620", borderRadius: 6, padding: "8px 10px" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 11, opacity: 0.7 }}>Defesa do alvo</strong>
            <span style={{ fontSize: 11, opacity: 0.7 }}>
              Reações: {reactionAvailability.remaining}/{reactionAvailability.max}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["esquivar", "aparar", "bloquear", "resistir"] as DefenseType[]).map((defenseType) => (
              <button
                key={defenseType}
                data-testid={`magia-ataque-defesa-rolar-${defenseType}-${log.id}`}
                onClick={() => onRollDefense(defenseType)}
                disabled={defenseProcessing === `${log.id}:${defenseType}`}
                style={{ ...buttonStyle, fontSize: 11, opacity: defenseProcessing === `${log.id}:${defenseType}` ? 0.5 : 1 }}
              >
                {defenseProcessing === `${log.id}:${defenseType}` ? "Rolando…" : DEFENSE_TYPE_LABELS[defenseType]}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              Perícia de Resistir
              <select
                value={form.resistirSkill}
                onChange={(e) => onUpdateForm({ resistirSkill: e.target.value as "vigor" | "mobilidade" })}
                style={inputStyle}
              >
                <option value="vigor">Vigor</option>
                <option value="mobilidade">Mobilidade</option>
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              Modificador manual
              <input
                type="number"
                value={form.defenseModifier}
                onChange={(e) => onUpdateForm({ defenseModifier: e.target.value })}
                style={{ ...inputStyle, width: 90 }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <input
                type="checkbox"
                checked={form.defenseOverride}
                onChange={(e) => onUpdateForm({ defenseOverride: e.target.checked })}
              />
              Rolar mesmo sem Reação (override)
            </label>
          </div>
          {form.lastDefense && (
            <p style={{ fontSize: 11, opacity: 0.7, margin: 0 }}>
              Última defesa: {form.lastDefense.defenseName} — {form.lastDefense.attributeName}d8 (maior {form.lastDefense.highestDie}) +{" "}
              {form.lastDefense.skillName} {form.lastDefense.skillValue}
              {form.lastDefense.modifiersTotal !== 0 ? ` + mod ${form.lastDefense.modifiersTotal}` : ""} = {form.lastDefense.total}
            </p>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Ataque total
          <input
            data-testid={`magia-ataque-total-${log.id}`}
            type="number"
            value={form.attackTotal}
            onChange={(e) => onUpdateForm({ attackTotal: e.target.value })}
            style={{ ...inputStyle, width: 90 }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Defesa/CD
          <input
            data-testid={`magia-ataque-defesa-cd-${log.id}`}
            type="number"
            value={form.defenseTotal}
            onChange={(e) => onUpdateForm({ defenseTotal: e.target.value })}
            style={{ ...inputStyle, width: 90 }}
          />
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Margem
          <span data-testid={`magia-ataque-margem-${log.id}`} style={{ padding: "6px 0" }}>
            {margin != null ? margin : "—"}
            {bandRules ? ` (${bandRules.band})` : ""}
          </span>
        </div>
      </div>

      {margin != null && margin < 0 && (
        <p style={{ color: "#ff6b6b", margin: 0 }}>Ataque mágico não acertou pela margem informada.</p>
      )}

      {regionApplicable ? (
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Região (opcional — alvo único, sem área declarada)
          <select
            data-testid={`magia-ataque-regiao-${log.id}`}
            value={form.region}
            onChange={(e) => onUpdateForm({ region: e.target.value as BodyRegion | "" })}
            style={inputStyle}
          >
            <option value="">— não aplicável / manual —</option>
            {BODY_REGIONS.map((region) => {
              const permitida = form.override || !bandRules || bandRules.allowedRegions.includes(region);
              return (
                <option key={region} value={region} disabled={!permitida}>
                  {BODY_REGION_LABELS[region]}
                  {!permitida ? " (fora da margem)" : ""}
                </option>
              );
            })}
          </select>
        </label>
      ) : (
        <p style={{ opacity: 0.5, margin: 0 }}>Região corporal: não aplicável (magia de área).</p>
      )}

      {bandRules?.modifierType === "extraDie" && (
        <p style={{ opacity: 0.7, margin: 0 }}>
          Margem crítica: +1 dado de dano.{" "}
          {isDice ? (
            <button onClick={onRollExtraMarginDie} style={{ ...buttonStyle, fontSize: 11, padding: "2px 8px" }}>
              Rolar +1 dado
            </button>
          ) : (
            "Fórmula não estruturada — inclua manualmente no dano bruto."
          )}
        </p>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Dano bruto
          <input
            data-testid={`magia-ataque-dano-bruto-${log.id}`}
            type="number"
            value={form.rawDamage}
            onChange={(e) => onUpdateForm({ rawDamage: e.target.value })}
            style={{ ...inputStyle, width: 90 }}
          />
        </label>
        {isDice && (
          <button data-testid={`magia-ataque-rolar-dano-${log.id}`} onClick={onRollDamage} style={{ ...buttonStyle, fontSize: 11 }}>
            Rolar dano ({damageFormula})
          </button>
        )}
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          MIT (manual)
          <input
            data-testid={`magia-ataque-mit-${log.id}`}
            type="number"
            value={form.mit}
            onChange={(e) => onUpdateForm({ mit: e.target.value })}
            style={{ ...inputStyle, width: 70 }}
          />
        </label>
        <span style={{ opacity: 0.6, fontSize: 11, color: "#f5a623" }}>
          Verifique se MIT se aplica a este dano mágico — nunca presumido automaticamente.
        </span>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
        <span>
          Dano após margem: <strong data-testid={`magia-ataque-dano-apos-margem-${log.id}`}>{damageAfterMargin}</strong>
        </span>
        <span>
          Dano final: <strong data-testid={`magia-ataque-dano-final-${log.id}`}>{finalDamage}</strong>
        </span>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          data-testid={`magia-ataque-override-${log.id}`}
          type="checkbox"
          checked={form.override}
          onChange={(e) => onUpdateForm({ override: e.target.checked })}
        />
        Resolver mesmo assim (override)
      </label>
      {form.override && (
        <input
          type="text"
          placeholder="Nota do override (opcional)"
          value={form.overrideReason}
          onChange={(e) => onUpdateForm({ overrideReason: e.target.value })}
          style={inputStyle}
        />
      )}

      {erro && <p style={{ color: "#ff6b6b", margin: 0 }}>{erro}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <button data-testid={`magia-ataque-aplicar-dano-${log.id}`} onClick={onApply} disabled={processing} style={{ ...buttonStyle, opacity: processing ? 0.5 : 1 }}>
          {processing ? "Aplicando…" : "Aplicar dano"}
        </button>
        <button onClick={onCancel} style={{ ...buttonStyle, opacity: 0.7 }}>
          Fechar
        </button>
      </div>
    </div>
  );
}

/**
 * Painel inline de preview de Encerrar Rodada / Encerrar Cena
 * (checkpoint pós-v0.58). Só apresentação read-only do dry-run — a
 * lógica de inspeção fica em buildEndRoundPreview/buildEndScenePreview,
 * o apply fica no helper canônico chamado por onConfirm.
 */
function EndResolutionPreviewPanel({
  preview,
  processing,
  canConfirm,
  onConfirm,
  onCancel,
}: {
  preview: EndRoundPreview | EndScenePreview;
  processing: boolean;
  /** null = ainda checando; false = sessão não pode avançar a campanha (Confirmar bloqueado). */
  canConfirm: boolean | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isRound = preview.kind === "round";
  const titulo = isRound ? `Encerrar Rodada ${preview.round} (cena ${preview.scene})` : `Encerrar Cena ${preview.scene} (rodada ${preview.round})`;
  const bloqueado = canConfirm === false;

  return (
    <div
      data-testid="encerramento-preview"
      style={{ background: "#0f1014", borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12, fontSize: 12 }}
    >
      <strong style={{ fontSize: 13 }}>{titulo}</strong>
      {bloqueado && (
        <p data-testid="encerramento-permissao-aviso" style={{ color: "#f5a623", margin: 0 }}>
          Esta sessão não pode avançar a campanha. Entre como narrador dono da mesa para confirmar.
        </p>
      )}
      <p style={{ opacity: 0.6, margin: 0 }}>Será processado ao confirmar:</p>

      {preview.kind === "round" ? (
        <div data-testid="encerramento-preview-rodada" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {preview.characters.length === 0 && <p style={{ opacity: 0.6, margin: 0 }}>Nenhum personagem ativo na mesa.</p>}
          {preview.characters.map((c) => (
            <div key={c.characterId} data-testid={`encerramento-preview-char-${c.characterId}`} style={{ background: "#151620", borderRadius: 6, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
              <strong>{c.characterNome}</strong>
              {c.semEfeito ? (
                <span style={{ opacity: 0.55 }}>Sem efeitos de fim de rodada (só renovação padrão).</span>
              ) : (
                <>
                  {c.conditionEffects.map((ef, i) => (
                    <span key={i}>
                      • <strong>{ef.conditionName}</strong>: {ef.description}
                    </span>
                  ))}
                  {c.unstructuredConditions.map((slug) => (
                    <span key={slug} style={{ color: "#f5a623" }}>
                      • {slug}: efeito não estruturado (Biblioteca indisponível) — resolução manual pendente.
                    </span>
                  ))}
                  {c.emColapso && (
                    <span style={{ color: "#ff6b6b" }}>
                      • Em Colapso ({c.emColapso.tipo}), segmento {c.emColapso.segmentos}/3
                      {c.emColapso.estabilizado ? " (estabilizado)" : ""} — teste de fim de rodada ao confirmar.
                    </span>
                  )}
                  {c.paGastos > 0 && <span>• PA: {c.paGastos} gasto(s) → renovado ({c.paMax} máx).</span>}
                  {c.reacoesUsadas > 0 && <span>• Reações: {c.reacoesUsadas} usada(s) → renovadas ({c.reacoesMax} máx).</span>}
                  {c.defesasSemReacao > 0 && <span>• Defesas sem Reação: {c.defesasSemReacao} → 0 (penalidade zerada).</span>}
                  {c.temporaryEffects.map((t, i) => (
                    <span key={`te-${i}`} data-testid={`encerramento-preview-efeito-temp-${c.characterId}-${i}`} style={{ color: "#7bc67e" }}>
                      • Efeito temporário — {t} (ao confirmar).
                    </span>
                  ))}
                </>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div data-testid="encerramento-preview-cena" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {preview.characters.length === 0 && <p style={{ opacity: 0.6, margin: 0 }}>Nenhum personagem ativo na mesa.</p>}
          {preview.characters.filter((c) => c.rupturePending).length === 0 && preview.characters.length > 0 && (
            <p data-testid="encerramento-preview-sem-ruptura" style={{ opacity: 0.6, margin: 0 }}>
              Nenhuma Ruptura pendente entre os personagens ativos.
            </p>
          )}
          {preview.characters.map((c) => (
            <div key={c.characterId} data-testid={`encerramento-preview-char-${c.characterId}`} style={{ background: "#151620", borderRadius: 6, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
              <strong>{c.characterNome}</strong>
              {c.rupturePending ? (
                <>
                  <span>
                    • Ruptura pendente (nível {c.ruptureLevel}): Integridade {c.integridadeAntes} → {c.integridadeDepois}, bônus de Mana máx{" "}
                    {c.manaBonusAntes} → {c.manaBonusDepois}.
                  </span>
                  <span style={{ opacity: 0.7 }}>• Criará escolha de Marca/Traço (pendente, resolução manual).</span>
                  {c.ultimaVontade && <span style={{ color: "#ff6b6b" }}>• Integridade zerada → Última Vontade pendente.</span>}
                </>
              ) : c.temporaryEffects.length === 0 ? (
                <span style={{ opacity: 0.55 }}>Sem Ruptura pendente.</span>
              ) : null}
              {c.temporaryEffects.map((t, i) => (
                <span key={`te-${i}`} data-testid={`encerramento-preview-cena-efeito-temp-${c.characterId}-${i}`} style={{ color: "#7bc67e" }}>
                  • Efeito temporário — {t} (ao confirmar).
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {preview.manualPending.length > 0 && (
        <div data-testid="encerramento-preview-pendencias" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <strong style={{ opacity: 0.7 }}>Pendências manuais:</strong>
          {preview.manualPending.map((p, i) => (
            <span key={i} style={{ opacity: 0.65 }}>
              • {p}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          data-testid="encerramento-confirmar-btn"
          onClick={onConfirm}
          disabled={processing || bloqueado}
          style={{ ...buttonStyle, opacity: processing || bloqueado ? 0.5 : 1, cursor: processing || bloqueado ? "not-allowed" : "pointer" }}
        >
          {processing ? "Processando…" : isRound ? "Confirmar Encerrar Rodada" : "Confirmar Encerrar Cena"}
        </button>
        <button data-testid="encerramento-cancelar-btn" onClick={onCancel} disabled={processing} style={{ ...buttonStyle, opacity: 0.7 }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
