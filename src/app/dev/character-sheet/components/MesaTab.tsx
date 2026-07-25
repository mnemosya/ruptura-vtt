"use client";

/**
 * Aba "Mesa" da ficha — chat mínimo + log persistente da mesa
 * selecionada (table_logs). Atualiza automaticamente via Supabase
 * Realtime (checkpoint v0.46, `useTableLogsRealtime`) quando a mesa
 * ganha um novo log; o botão "Atualizar logs" continua funcionando
 * como refetch manual (útil se Realtime estiver indisponível). Não
 * substitui o Log local (aba "Log"), que continua sendo o histórico
 * volátil desta sessão de ficha.
 *
 * Segue o padrão do RollsTab: é um Client Component com estado próprio
 * (logs/filtro/input) que chama Server Actions diretamente
 * (listLogsForViewer/addLog), em vez de receber tudo via props do
 * CharacterSheetClient. IMPORTANTE (v0.20): usa listLogsForViewer, NÃO
 * listLogs — este componente é usado tanto por /ficha (jogador) quanto
 * por /dev/character-sheet, então a leitura já sai filtrada por
 * visibilidade no servidor (nunca listLogs cru, que não filtra nada).
 */

import { useEffect, useState } from "react";
import { Section } from "./Section";
import { buttonStyle } from "./styles";
import { addLog, listLogsForViewer } from "../../../../lib/table/storage";
import { useTableLogsRealtime } from "../../../../lib/realtime/useTableLogsRealtime";
import { describeRealtimeStatus } from "../../../../lib/realtime/tableRealtime";
import { TABLE_LOG_VISIBILITIES, type TableLogEntry, type TableLogVisibility } from "../../../../lib/table";
import {
  MAX_COLLAPSE_SEGMENTS,
  MAX_OVERLOAD_SURGES_PER_DAY,
  formatCriticalItemPropertySuggestions,
  BODY_REGION_LABELS,
  type BodyRegion,
} from "../../../../lib/character";

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
  gm: "Narrador",
};

const VISIBILITY_FILTERS = ["todos", ...TABLE_LOG_VISIBILITIES] as const;
type VisibilityFilter = (typeof VISIBILITY_FILTERS)[number];

const VISIBILITY_FILTER_LABELS: Record<VisibilityFilter, string> = {
  todos: "Todos",
  public: "Pública",
  private: "Privada",
  gm: "Narrador",
};

const ENTRY_KIND_LABELS: Record<string, string> = {
  chat: "Mensagem",
  rolagem_pericia: "Rolagem de Perícia",
  rolagem_expressao: "Rolagem de Expressão",
  profile_event: "Evento de Perfil",
  condition_applied: "Condição Aplicada",
  condition_removed: "Condição Removida",
  condition_auto_removed: "Condição Removida (Cura)",
  condition_auto_removal_undone: "Remoção por Cura Desfeita",
  rest_short: "Descanso Curto",
  rest_long: "Descanso Longo",
  overload_surge: "Surto de Sobrecarga",
  overload_surge_used: "Surto de Sobrecarga",
  overload_will_roll: "Teste de Vontade (Sobrecarga)",
  collapse_started: "Colapso Iniciado",
  collapse_advanced: "Colapso — Segmento Avançado",
  collapse_stabilized: "Colapso Estabilizado",
  collapse_ended: "Colapso Encerrado",
  round_ended: "Rodada Encerrada",
  scene_ended: "Cena Encerrada",
  scene_rupture_pending: "Ruptura Pendente (Fim de Cena)",
  character_evolution: "Evolução",
  action_used: "Ação Usada",
  condition_end_round_damage: "Dano de Condição",
  condition_end_round_check_created: "Teste de Condição Pendente",
  condition_end_round_check_resolved: "Teste de Condição Resolvido",
  round_pa_reduced_by_condition: "PA Reduzido por Condição",
  round_end_processed: "Rodada Encerrada",
  scene_end_processed: "Cena Encerrada",
  rupture_resolved: "Ruptura Resolvida",
  rupture_choice_created: "Marca e Traço Pendentes",
  rupture_choice_resolved: "Marca e Traço Registrados",
  integrity_zero_pending: "Integridade Zerada",
  scene_effect_expired: "Efeito de Cena Encerrado",
  attack_resolved: "Ataque Resolvido",
  defense_reaction_used: "Defesa Usada",
  item_used: "Item Usado",
  talent_used: "Talento Usado",
  spell_cast: "Magia Conjurada",
  character_state_change: "Estado do Personagem",
  character_created: "Personagem Criado",
  ammunition: "Munição",
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
  if (type === "condition_applied" || type === "condition_removed") return "⚠";
  if (type === "condition_auto_removed" || type === "condition_auto_removal_undone") return "✚";
  if (type === "rest_short" || type === "rest_long") return "💤";
  if (type === "overload_surge" || type === "overload_surge_used" || type === "overload_will_roll") return "⚡";
  if (type.startsWith("collapse_")) return "💀";
  if (type === "round_ended" || type === "scene_ended" || type === "scene_rupture_pending") return "🎬";
  if (type === "character_evolution") return "📈";
  if (type === "action_used") return "⚔";
  if (type === "condition_end_round_damage") return "🩸";
  if (type === "condition_end_round_check_created" || type === "condition_end_round_check_resolved") return "🎯";
  if (type === "round_pa_reduced_by_condition") return "⚡";
  if (type === "round_end_processed" || type === "scene_end_processed") return "🎬";
  if (type === "rupture_resolved") return "💔";
  if (type === "rupture_choice_created" || type === "rupture_choice_resolved") return "📝";
  if (type === "integrity_zero_pending") return "☠";
  if (type === "scene_effect_expired") return "⏳";
  if (type === "attack_resolved") return "🗡";
  if (type === "defense_reaction_used") return "🛡";
  if (type === "item_used") return "🎒";
  if (type === "talent_used") return "✨";
  if (type === "spell_cast") return "🔮";
  if (type === "inventory_transfer") return "📦";
  if (type === "spell_attack_used" || type === "spell_attack_resolved") return "⚔";
  if (type === "temporary_effect_added" || type === "temporary_effect_removed" || type === "temporary_effect_expired") return "⏱";
  return "•";
}

function entryBorderColor(type: string): string {
  if (type === "chat") return "#4f8cff";
  if (type === "profile_event") return "#ff6b9f";
  if (type === "condition_auto_removed" || type === "condition_auto_removal_undone") return "#4caf50";
  if (type === "rest_short" || type === "rest_long") return "#5ec8ff";
  if (type === "overload_surge" || type === "overload_surge_used" || type === "overload_will_roll") return "#c0392b";
  if (type.startsWith("collapse_")) return "#8e44ad";
  if (type === "round_ended" || type === "scene_ended" || type === "scene_rupture_pending") return "#9b8cff";
  if (type === "character_evolution") return "#4caf50";
  if (type === "action_used") return "#ff9f6b";
  if (type === "condition_end_round_damage") return "#c0392b";
  if (type === "condition_end_round_check_created" || type === "condition_end_round_check_resolved") return "#f5a623";
  if (type === "round_pa_reduced_by_condition") return "#f5a623";
  if (type === "round_end_processed" || type === "scene_end_processed") return "#9b8cff";
  if (type === "rupture_resolved") return "#c0392b";
  if (type === "rupture_choice_created" || type === "rupture_choice_resolved") return "#5ec8ff";
  if (type === "integrity_zero_pending") return "#c0392b";
  if (type === "scene_effect_expired") return "#888";
  if (type === "attack_resolved") return "#ff6b6b";
  if (type === "defense_reaction_used") return "#5ec8ff";
  if (type === "item_used") return "#4caf50";
  if (type === "talent_used") return "#9b8cff";
  if (type === "spell_cast") return "#5ec8ff";
  if (type === "inventory_transfer") return "#f5a623";
  if (type === "spell_attack_used" || type === "spell_attack_resolved") return "#7c4dff";
  if (type === "temporary_effect_added" || type === "temporary_effect_removed" || type === "temporary_effect_expired") return "#4caf50";
  return "#ffb84f";
}

/** Checkpoint v0.34: cartão de condition_auto_removed/condition_auto_removal_undone. */
function formatAutoHeal(payload: Record<string, unknown>): string {
  const nomes = Array.isArray(payload.nomes) ? payload.nomes.filter((n): n is string => typeof n === "string") : [];
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  const pvAnterior = typeof payload.pvAnterior === "number" ? payload.pvAnterior : "?";
  const pvNovo = typeof payload.pvNovo === "number" ? payload.pvNovo : "?";
  return `${characterNome}: ${nomes.join(", ") || "(nenhuma)"} — PV ${pvAnterior} → ${pvNovo}`;
}

/** Checkpoint v0.36: cartão de rest_short/rest_long — resume before→after dos campos que mudaram. */
function formatRest(payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  const before = payload.before as Record<string, number> | undefined;
  const after = payload.after as Record<string, number> | undefined;
  if (!before || !after) return `${characterNome}: descanso aplicado.`;
  const campos: [string, string][] = [
    ["pv", "PV"],
    ["pe", "PE"],
    ["mana", "Mana"],
  ];
  const partes = campos
    .filter(([key]) => before[key] !== after[key])
    .map(([key, label]) => `${label} ${before[key]} → ${after[key]}`);
  return `${characterNome}: ${partes.join(", ") || "sem mudança"}`;
}

/** Checkpoint v0.37: cartão de overload_surge; cobre também o canônico overload_surge_used (pós-v0.65, com maxSurtos/dado da regra). */
function formatOverloadSurge(payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  const tipo = typeof payload.tipo === "string" ? payload.tipo : "?";
  const indice = typeof payload.indice === "number" ? payload.indice : "?";
  const max = typeof payload.maxSurtos === "number" ? payload.maxSurtos : MAX_OVERLOAD_SURGES_PER_DAY;
  const dado = typeof payload.danoDado === "string" ? payload.danoDado : "1d4";
  const dano = typeof payload.danoPsiquico === "number" ? payload.danoPsiquico : "?";
  const ruptura = payload.rupturaPendente === true ? " — Ruptura pendente!" : "";
  return `Surto de Sobrecarga — ${characterNome}: ${tipo} (${indice}/${max}) — ${dano} dano psíquico (${dado}, aplicação manual)${ruptura}`;
}

/** Checkpoint v0.37: cartão de overload_will_roll. */
function formatOverloadWillRoll(payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  const total = typeof payload.total === "number" ? payload.total : "?";
  const cd = typeof payload.cd === "number" ? payload.cd : "?";
  const sucesso = payload.sucesso === true;
  return `${characterNome}: total ${total} vs CD ${cd} — ${sucesso ? "Sucesso" : "Falha (Atordoado 1 rodada)"}`;
}

/** Checkpoint v0.38: cartões de collapse_started/collapse_advanced/collapse_stabilized/collapse_ended. */
function formatCollapse(payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  const tipo = payload.tipo === "pv" ? "PV" : payload.tipo === "pe" ? "PE" : "?";
  const segmentos = typeof payload.segmentos === "number" ? ` — segmento ${payload.segmentos}/${MAX_COLLAPSE_SEGMENTS}` : "";
  const motivo = typeof payload.motivo === "string" ? ` (${payload.motivo})` : "";
  return `${characterNome}: ${tipo}${segmentos}${motivo}`;
}

/** Checkpoint v0.39: cartões de round_ended/scene_ended/scene_rupture_pending. */
function formatRoundOrScene(type: string, payload: Record<string, unknown>): string {
  if (type === "round_ended") {
    const prev = typeof payload.previousRound === "number" ? payload.previousRound : "?";
    const next = typeof payload.newRound === "number" ? payload.newRound : "?";
    const atencao = Array.isArray(payload.attentionSummary)
      ? payload.attentionSummary.filter((n): n is string => typeof n === "string")
      : [];
    const aviso = atencao.length > 0 ? ` — atenção: ${atencao.join(", ")}` : "";
    return `Rodada ${prev} → ${next}${aviso}`;
  }
  if (type === "scene_ended") {
    const prev = typeof payload.previousScene === "number" ? payload.previousScene : "?";
    const next = typeof payload.newScene === "number" ? payload.newScene : "?";
    return `Cena ${prev} → ${next}`;
  }
  if (type === "scene_rupture_pending") {
    const nomes = Array.isArray(payload.characterNames)
      ? payload.characterNames.filter((n): n is string => typeof n === "string")
      : [];
    return `Ruptura pendente para: ${nomes.join(", ") || "(nenhum)"}`;
  }
  return formatGenericLog(type, payload);
}

/** Checkpoint v0.40: cartão de character_evolution (PM ganho/gasto ou ajuste de atributo/perícia). */
function formatEvolution(payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  const tipo = payload.tipo;
  const descricao = typeof payload.descricao === "string" ? payload.descricao : "";
  const quantidade = typeof payload.quantidade === "number" ? payload.quantidade : 0;
  if (tipo === "ganho") return `${characterNome}: +${quantidade} PM — ${descricao}`;
  if (tipo === "gasto") return `${characterNome}: -${quantidade} PM — ${descricao}`;
  return `${characterNome}: ${descricao}`;
}

/** "postura_ofensiva" → "Postura Ofensiva" — só para exibir slugs de estado sem digitar uma tabela nova. */
function humanizeStateSlug(slug: string): string {
  return slug
    .split("_")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Checkpoints v0.42/v0.43/v0.64: ação, custo, uso normal ou excedente de
 * Reação, condições/estados aplicados/removidos e lembretes textuais
 * (checkpoint v0.64 — Escapar/Soltar alvo não têm alvo estruturado para
 * remover a condição do outro lado do vínculo automaticamente).
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

/** Checkpoint v0.44: cartão de condition_end_round_damage. */
function formatConditionEndRoundDamage(payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  const conditionName = typeof payload.conditionName === "string" ? payload.conditionName : "Condição";
  const damage = typeof payload.damage === "number" ? payload.damage : "?";
  const damageType = typeof payload.damageType === "string" ? payload.damageType : "";
  const before = typeof payload.before === "number" ? payload.before : "?";
  const after = typeof payload.after === "number" ? payload.after : "?";
  return `${characterNome}: ${conditionName} causou ${damage} de dano ${damageType} (PV ${before} → ${after}).`;
}

/** Checkpoint v0.44: cartão de condition_end_round_check_created. */
function formatConditionCheckCreated(payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  const conditionName = typeof payload.conditionName === "string" ? payload.conditionName : "Condição";
  const resistance = payload.resistance as Record<string, unknown> | undefined;
  const pericia = typeof resistance?.pericia === "string" ? resistance.pericia : "?";
  const cd = typeof resistance?.cd === "number" ? resistance.cd : "?";
  const target = typeof payload.targetConditionId === "string" ? ` (para remover ${payload.targetConditionId})` : "";
  return `${characterNome}: ${conditionName} — teste de ${pericia} CD ${cd} pendente${target}.`;
}

/** Checkpoint v0.44: cartão de condition_end_round_check_resolved. */
function formatConditionCheckResolved(payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  const conditionName = typeof payload.conditionName === "string" ? payload.conditionName : "Condição";
  const result = payload.result === "success" ? "Sucesso" : "Falha";
  const appliedEffects = Array.isArray(payload.appliedEffects)
    ? payload.appliedEffects.filter((e): e is string => typeof e === "string")
    : [];
  return `${characterNome}: ${conditionName} — ${result}${appliedEffects.length > 0 ? ` (${appliedEffects.join(", ")})` : ""}.`;
}

/** Checkpoint v0.44: cartão de round_pa_reduced_by_condition. */
function formatRoundPaReduced(payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  const conditionName = typeof payload.conditionName === "string" ? payload.conditionName : "Condição";
  const value = typeof payload.value === "number" ? payload.value : "?";
  const paBefore = typeof payload.paBefore === "number" ? payload.paBefore : "?";
  const paAfter = typeof payload.paAfter === "number" ? payload.paAfter : "?";
  return `${characterNome}: ${conditionName} reduziu ${value} PA (${paBefore} → ${paAfter}).`;
}

/** condition_applied — cobre o payload de v0.32 (manual) e v0.44 (por teste de exposição, com sourceConditionId). */
function formatConditionApplied(payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  const nome = typeof payload.nome === "string" ? payload.nome : typeof payload.conditionName === "string" ? payload.conditionName : "Condição";
  const origem = typeof payload.sourceConditionId === "string" ? ` (falha em teste de ${payload.sourceConditionId})` : "";
  return `${characterNome}: aplicada "${nome}"${origem}.`;
}

/** condition_removed — cobre o payload de v0.32 (manual) e v0.44 (por teste de fim de rodada, com sourceConditionId). */
function formatConditionRemoved(payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  const nome = typeof payload.nome === "string" ? payload.nome : typeof payload.conditionName === "string" ? payload.conditionName : "Condição";
  const origem = typeof payload.sourceConditionId === "string" ? ` (sucesso em teste de ${payload.sourceConditionId})` : "";
  return `${characterNome}: removida "${nome}"${origem}.`;
}

/** Checkpoint v0.44.1: cartão agregado de round_end_processed (faltava formatação nesta aba). */
function formatRoundEndProcessed(payload: Record<string, unknown>): string {
  const names = Array.isArray(payload.processedCharacterNames)
    ? payload.processedCharacterNames.filter((n): n is string => typeof n === "string")
    : [];
  const dano = typeof payload.damageCount === "number" ? payload.damageCount : 0;
  const pendencias = typeof payload.pendingCheckCount === "number" ? payload.pendingCheckCount : 0;
  return `Rodada da mesa processada — ${names.length} personagem(ns), ${dano} dano(s) de condição, ${pendencias} pendência(s).`;
}

/** Checkpoint v0.45: cartão agregado de scene_end_processed. */
function formatSceneEndProcessed(payload: Record<string, unknown>): string {
  const names = Array.isArray(payload.processedCharacterNames)
    ? payload.processedCharacterNames.filter((n): n is string => typeof n === "string")
    : [];
  const rupturas = typeof payload.ruptureResolvedCount === "number" ? payload.ruptureResolvedCount : 0;
  const pendencias = typeof payload.pendingChoiceCount === "number" ? payload.pendingChoiceCount : 0;
  return `Cena da mesa processada — ${names.length} personagem(ns), ${rupturas} Ruptura(s) resolvida(s), ${pendencias} pendência(s) de Marca/Traço.`;
}

/** Checkpoint v0.45: cartão de rupture_resolved. */
function formatRuptureResolved(payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  const level = typeof payload.ruptureLevel === "number" ? payload.ruptureLevel : "?";
  const integrityBefore = typeof payload.integrityBefore === "number" ? payload.integrityBefore : "?";
  const integrityAfter = typeof payload.integrityAfter === "number" ? payload.integrityAfter : "?";
  const manaBonus = typeof payload.manaBonusApplied === "number" ? payload.manaBonusApplied : "?";
  return `${characterNome}: Ruptura nível ${level} — Integridade ${integrityBefore} → ${integrityAfter}, Mana máxima +${manaBonus}.`;
}

/** Checkpoint v0.45: cartão de rupture_choice_created. */
function formatRuptureChoiceCreated(payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  return `${characterNome}: Marca e Traço pendentes.`;
}

/** Checkpoint v0.45: cartão de rupture_choice_resolved. */
function formatRuptureChoiceResolved(payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  const marca = typeof payload.marca === "string" && payload.marca ? payload.marca : "(sem marca)";
  const traco = typeof payload.traco === "string" && payload.traco ? payload.traco : "(sem traço)";
  return `${characterNome}: Marca e Traço registrados — ${marca} / ${traco}.`;
}

/** Checkpoint v0.45: cartão de integrity_zero_pending. */
function formatIntegrityZeroPending(payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  return `${characterNome}: Integridade zerada — Última Vontade pendente.`;
}

/** Checkpoint v0.45: cartão de scene_effect_expired. */
function formatSceneEffectExpired(payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  const effectName = typeof payload.effectName === "string" ? payload.effectName : "Efeito";
  return `${characterNome}: ${effectName} encerrado (duração de cena).`;
}

/** Checkpoint v0.47: cartão de attack_resolved (ataque contestado básico). */
const MARGIN_BAND_LABELS: Record<string, string> = {
  miss: "errou",
  limited: "margem limitada",
  standard: "margem padrão",
  critical: "margem crítica",
};

/**
 * `attack_resolved` cobre dois formatos: o antigo (mesa dashboard,
 * `attackerWins`/`damageRoll`, checkpoint v0.47/v0.58) e o novo
 * (`marginBand`/`selectedRegion`/`finalDamage`, "Resolver Ataque" a
 * partir de `action_used` em /dev/table, checkpoint pós-v0.50). Nunca
 * cai em JSON cru.
 */
function formatAttackResolved(payload: Record<string, unknown>): string {
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

  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Alvo";
  const attackerNome = typeof payload.attackerNome === "string" ? payload.attackerNome : "Atacante";
  const margin = typeof payload.margin === "number" ? payload.margin : "?";
  if (payload.attackerWins === true) {
    const damageRoll = typeof payload.damageRoll === "number" ? payload.damageRoll : "?";
    const damageType = typeof payload.damageType === "string" ? payload.damageType : "";
    const criticalText = formatCriticalItemPropertySuggestions(payload.criticalPropertySuggestions);
    return `${attackerNome} atacou ${characterNome} (margem ${margin}) — ${damageRoll} de dano ${damageType}.${criticalText ? ` ${criticalText}` : ""}`;
  }
  return `${attackerNome} atacou ${characterNome} (margem ${margin}) — defesa bem-sucedida, sem dano.`;
}

/**
 * `defense_reaction_used` (checkpoint pós-v0.50, defesa reativa no
 * painel "Resolver Ataque" de /dev/table) — "Defesa usada — {defensor}
 * usou {tipo}: {total} (Reações {antes} → {depois})." Nunca cai em
 * JSON cru.
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
 * `item_used` (checkpoint pós-v0.58, uso de itens de farmácia/granadas
 * pelo Inventário) — "Item usado — {personagem} usou {item}: PA X → Y,
 * PV/PE antes → depois, cargas/quantidade antes → depois, dano
 * rolado, lembretes." Nunca cai em JSON cru.
 */
function formatItemUsed(payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
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

  const removedConditions = Array.isArray(payload.removedConditions)
    ? payload.removedConditions.filter((c): c is string => typeof c === "string")
    : [];
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
  const targetRemovedConditions = Array.isArray(payload.targetRemovedConditions)
    ? payload.targetRemovedConditions.filter((c): c is string => typeof c === "string")
    : [];
  if (targetRemovedConditions.length > 0) partes.push(`removeu ${targetRemovedConditions.join(", ")}`);

  const area = typeof payload.area === "number" ? payload.area : null;
  const range = typeof payload.range === "number" ? payload.range : null;
  if (area != null || range != null) {
    partes.push(`${area != null ? `área ${area}m` : ""}${area != null && range != null ? ", " : ""}${range != null ? `alcance ${range}m` : ""}`);
  }

  const nomes = (v: unknown): string[] => (Array.isArray(v) ? v.filter((n): n is string => typeof n === "string") : []);
  const temporaryEffectsAdded = nomes(payload.temporaryEffectsAdded).concat(nomes(payload.targetTemporaryEffectsAdded));
  if (temporaryEffectsAdded.length > 0) partes.push(`efeito temporário: ${temporaryEffectsAdded.join(", ")}`);

  const reminders = Array.isArray(payload.reminders) ? payload.reminders.filter((r): r is string => typeof r === "string") : [];

  const tipoLabel = useType === "pharmacy" ? " (farmácia)" : useType === "grenade" ? " (granada)" : useType === "explosive" ? " (explosivo)" : "";
  const itemComAlvo = targetCharacterName ? `${itemName} em ${targetCharacterName}` : itemName;
  const base = `Item usado — ${characterNome} usou ${itemComAlvo}${tipoLabel}${partes.length > 0 ? `: ${partes.join(" · ")}` : ""}.`;
  return reminders.length > 0 ? `${base} — Lembrete: ${reminders.join(" ")}` : base;
}

/**
 * `temporary_effect_added/removed/expired` (checkpoint pós-v0.71) —
 * "Efeito temporário criado/removido/expirado — {personagem}: {efeito}
 * (fonte {tipo}: {nome} · {duração/motivo})." Nunca cai em JSON cru.
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

/**
 * `talent_used` (checkpoint pós-v0.63, segunda camada de talentos) —
 * "Talento usado — {personagem} usou {talento} — {nível}: descrição,
 * usos X/Y por cadência, PA antes → depois, lembretes." Cobre também
 * toggles (action: toggle_on/toggle_off). Nunca cai em JSON cru.
 */
function formatTalentUsed(payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  const talentNome = typeof payload.talentNome === "string" ? payload.talentNome : "Talento";
  const nivelNome = typeof payload.nivelNome === "string" ? payload.nivelNome : null;
  const action = typeof payload.action === "string" ? payload.action : "use";
  const description = typeof payload.description === "string" ? payload.description : null;
  const reminders = Array.isArray(payload.reminders) ? payload.reminders.filter((r): r is string => typeof r === "string") : [];

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
  const temporaryEffectsAdded = Array.isArray(payload.temporaryEffectsAdded)
    ? payload.temporaryEffectsAdded.filter((e): e is string => typeof e === "string")
    : [];
  if (temporaryEffectsAdded.length > 0) partes.push(`efeito temporário: ${temporaryEffectsAdded.join(", ")}`);
  const base = `Talento usado — ${characterNome} usou ${nomeCompleto}${description ? ` (${description})` : ""}${partes.length > 0 ? `: ${partes.join(" · ")}` : ""}.`;
  return reminders.length > 0 ? `${base} — Lembrete: ${reminders.join(" ")}` : base;
}

/**
 * `spell_cast` (checkpoint pós-v0.64) — "Magia conjurada — {personagem}
 * conjurou {magia} (vertente, nível): PA/Mana antes → depois, dano
 * rolado, resistência esperada, efeitos manuais." Nunca cai em JSON cru.
 */
function formatSpellCast(payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
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
    const acoes = Array.isArray(resistance.acoes) ? resistance.acoes.filter((a): a is string => typeof a === "string") : [];
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

  const manualEffects = Array.isArray(payload.manualEffects) ? payload.manualEffects.filter((m): m is string => typeof m === "string") : [];
  const reminders = Array.isArray(payload.reminders) ? payload.reminders.filter((r): r is string => typeof r === "string") : [];
  const extras = [...manualEffects, ...reminders];

  const fusedNome = fusion && typeof fusion.fusedSpellNome === "string" ? fusion.fusedSpellNome : null;
  const cabecalho = `${spellNome}${fusedNome ? ` + ${fusedNome} (FUSÃO)` : ""}${vertente ? ` (${vertente}${nivel != null ? `, nível ${nivel}` : ""})` : ""}`;
  const base = `Magia conjurada — ${characterNome} conjurou ${cabecalho}${partes.length > 0 ? `: ${partes.join(" · ")}` : ""}.`;
  return extras.length > 0 ? `${base} — ${extras.join(" ")}` : base;
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
  const finalDamage = typeof payload.finalDamage === "number" ? payload.finalDamage : "?";
  const pvBefore = typeof payload.targetPvBefore === "number" ? payload.targetPvBefore : "?";
  const pvAfter = typeof payload.targetPvAfter === "number" ? payload.targetPvAfter : "?";
  const mitApplied = typeof payload.mitApplied === "number" ? payload.mitApplied : 0;
  const damageType = typeof payload.damageType === "string" ? payload.damageType : null;
  const selectedRegion = typeof payload.selectedRegion === "string" ? payload.selectedRegion : null;
  const override = payload.override === true;
  const resistanceReminder = typeof payload.resistanceReminder === "string" ? payload.resistanceReminder : null;
  const areaReminder = typeof payload.areaReminder === "string" ? payload.areaReminder : null;

  const partes = [
    margin != null ? `margem ${margin}` : null,
    selectedRegion ? `região: ${selectedRegion}` : null,
    `MIT ${mitApplied}`,
    `dano final ${finalDamage}${damageType ? ` (${damageType})` : ""}`,
    `PV ${pvBefore} → ${pvAfter}`,
    override ? "override" : null,
  ].filter((p): p is string => Boolean(p));

  const extras = [resistanceReminder, areaReminder].filter((r): r is string => Boolean(r));
  const base = `Ataque mágico resolvido — ${casterName} → ${targetName} · ${spellName} · ${partes.join(" · ")}.`;
  return extras.length > 0 ? `${base} — ${extras.join(" ")}` : base;
}

/**
 * `inventory_transfer` (checkpoint pós-v0.68, CP7) — transferência
 * entre personagem e inventário do bando/mesa, nos dois sentidos.
 * "Transferência — {origem} enviou/recebeu {item} x{quantidade} (bando)
 * — origem X → Y, destino X → Y." Nunca cai em JSON cru.
 */
function formatInventoryTransfer(payload: Record<string, unknown>): string {
  const direction = typeof payload.direction === "string" ? payload.direction : "?";
  const itemName = typeof payload.itemName === "string" ? payload.itemName : "Item";
  const quantityMoved = typeof payload.quantityMoved === "number" ? payload.quantityMoved : "?";
  const quantityBeforeSource = typeof payload.quantityBeforeSource === "number" ? payload.quantityBeforeSource : null;
  const quantityAfterSource = typeof payload.quantityAfterSource === "number" ? payload.quantityAfterSource : null;
  const quantityBeforeTarget = typeof payload.quantityBeforeTarget === "number" ? payload.quantityBeforeTarget : null;
  const quantityAfterTarget = typeof payload.quantityAfterTarget === "number" ? payload.quantityAfterTarget : null;
  const chargesMoved = typeof payload.chargesMoved === "number" ? payload.chargesMoved : null;

  const partes: string[] = [`x${quantityMoved}`];
  if (quantityBeforeSource != null && quantityAfterSource != null) {
    partes.push(`origem ${quantityBeforeSource} → ${quantityAfterSource}`);
  }
  if (quantityBeforeTarget != null && quantityAfterTarget != null) {
    partes.push(`destino ${quantityBeforeTarget} → ${quantityAfterTarget}`);
  }
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

/** `character_state_change` (ferramentas de narrador do /dev/table) — dano/cura/ajuste com recurso e antes → depois. */
function formatCharacterStateChange(payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  const action = typeof payload.action === "string" ? payload.action : "ajuste";
  const resource = typeof payload.resource === "string" ? payload.resource : "";
  const before = typeof payload.before === "number" ? payload.before : "?";
  const after = typeof payload.after === "number" ? payload.after : "?";
  return `${characterNome}: ${action}${resource ? ` ${resource.toUpperCase()}` : ""} (${before} → ${after}).`;
}

/** "usesSpent" → "uses spent"; "sobrecargaAntes" → "sobrecarga antes" — só para o fallback genérico. */
function humanizePayloadKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
}

/**
 * Fallback genérico legível (checkpoint pós-v0.67) — para tipos de log
 * ainda sem formatter dedicado: rótulo do tipo + personagem + campos
 * escalares do payload em "chave: valor" (ids/fontes técnicas
 * omitidos). NUNCA JSON cru; dados importantes continuam visíveis.
 */
function formatGenericLog(type: string, payload: Record<string, unknown>): string {
  const skip = new Set([
    "characterId",
    "characterNome",
    "profileId",
    "profileNickname",
    "profileSessionId",
    "campaignId",
    "source",
    "itemInstanceId",
    "checkId",
    "pendingChoiceId",
    "effectKey",
  ]);
  const partes: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (skip.has(key)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      partes.push(`${humanizePayloadKey(key)}: ${value}`);
    } else if (Array.isArray(value)) {
      const strings = value.filter((v): v is string => typeof v === "string");
      if (strings.length > 0) partes.push(`${humanizePayloadKey(key)}: ${strings.join(", ")}`);
    }
  }
  const characterNome = typeof payload.characterNome === "string" ? ` — ${payload.characterNome}` : "";
  return `${entryKindLabel(type)}${characterNome}${partes.length > 0 ? `: ${partes.join(" · ")}` : ""}`;
}

/** Texto da mensagem de chat — aceita `text` (ficha, v0.12) ou `mensagem` (formato antigo do /dev/table). */
function chatText(payload: Record<string, unknown>): string {
  if (typeof payload.text === "string") return payload.text;
  if (typeof payload.mensagem === "string") return payload.mensagem;
  return "(mensagem sem texto)";
}

/**
 * Autor preferencial de uma mensagem de chat: personagem > perfil >
 * "Mesa". Usa os campos que a ficha grava no payload (characterNome /
 * profileNickname); mensagens antigas sem esses campos caem em "Mesa".
 */
function chatAuthor(payload: Record<string, unknown>): string {
  if (typeof payload.characterNome === "string" && payload.characterNome.trim()) return payload.characterNome;
  if (typeof payload.profileNickname === "string" && payload.profileNickname.trim()) return payload.profileNickname;
  return "Mesa";
}

/**
 * Sufixo com os modificadores de condição aplicados nesta rolagem
 * (checkpoint v0.33, item 8: "cartões de rolagem devem exibir, quando
 * houver, os modificadores de condição aplicados"). `effectsApplied`
 * só existe em rolagens de perícia feitas depois deste checkpoint —
 * rolagens antigas/de expressão simplesmente não têm o campo.
 */
function formatEffectsApplied(payload: Record<string, unknown>): string {
  const effects = payload.effectsApplied;
  if (!Array.isArray(effects) || effects.length === 0) return "";
  const partes = effects
    .filter((e): e is { sourceName?: unknown; modifier?: unknown } => typeof e === "object" && e !== null)
    .map((e) => {
      const nome = typeof e.sourceName === "string" ? e.sourceName : "?";
      const mod = typeof e.modifier === "number" ? e.modifier : 0;
      return `${nome} ${mod >= 0 ? "+" : ""}${mod}`;
    });
  return partes.length > 0 ? ` [${partes.join(", ")}]` : "";
}

function formatRolagem(payload: Record<string, unknown>): string {
  if (typeof payload.characterNome === "string") {
    if (payload.atributo) {
      const pericia = payload.pericia ? ` + ${payload.pericia}` : " (sem perícia)";
      return `${payload.characterNome}: ${payload.atributo}${pericia} = ${payload.total}${formatEffectsApplied(payload)}`;
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

/**
 * Formata o conteúdo de uma entrada de `table_logs` para exibição —
 * dispatcher único por `entry.type`, extraído da lista de mensagens
 * desta aba (checkpoint de promoção de mesa/log para produção) para
 * ser reaproveitado por qualquer outra tela que precise exibir o
 * mesmo log (ex.: `/mesas/[campaignId]`), sem duplicar os
 * formatadores acima. Nunca cai em JSON cru — tipos não reconhecidos
 * usam `formatGenericLog`.
 */
export function formatTableLogEntry(entry: TableLogEntry): string {
  if (entry.type === "chat") return chatText(entry.payload);
  if (entry.type === "rolagem_pericia" || entry.type === "rolagem_expressao") return formatRolagem(entry.payload);
  if (entry.type === "profile_event") return formatProfileEvent(entry.payload);
  if (entry.type === "condition_auto_removed" || entry.type === "condition_auto_removal_undone") return formatAutoHeal(entry.payload);
  if (entry.type === "rest_short" || entry.type === "rest_long") return formatRest(entry.payload);
  if (entry.type === "overload_surge" || entry.type === "overload_surge_used") return formatOverloadSurge(entry.payload);
  if (entry.type === "overload_will_roll") return formatOverloadWillRoll(entry.payload);
  if (entry.type.startsWith("collapse_")) return formatCollapse(entry.payload);
  if (entry.type === "round_ended" || entry.type === "scene_ended" || entry.type === "scene_rupture_pending") return formatRoundOrScene(entry.type, entry.payload);
  if (entry.type === "character_evolution") return formatEvolution(entry.payload);
  if (entry.type === "action_used") return formatActionUsed(entry.payload);
  if (entry.type === "condition_end_round_damage") return formatConditionEndRoundDamage(entry.payload);
  if (entry.type === "condition_end_round_check_created") return formatConditionCheckCreated(entry.payload);
  if (entry.type === "condition_end_round_check_resolved") return formatConditionCheckResolved(entry.payload);
  if (entry.type === "round_pa_reduced_by_condition") return formatRoundPaReduced(entry.payload);
  if (entry.type === "condition_applied") return formatConditionApplied(entry.payload);
  if (entry.type === "condition_removed") return formatConditionRemoved(entry.payload);
  if (entry.type === "round_end_processed") return formatRoundEndProcessed(entry.payload);
  if (entry.type === "scene_end_processed") return formatSceneEndProcessed(entry.payload);
  if (entry.type === "rupture_resolved") return formatRuptureResolved(entry.payload);
  if (entry.type === "rupture_choice_created") return formatRuptureChoiceCreated(entry.payload);
  if (entry.type === "rupture_choice_resolved") return formatRuptureChoiceResolved(entry.payload);
  if (entry.type === "integrity_zero_pending") return formatIntegrityZeroPending(entry.payload);
  if (entry.type === "scene_effect_expired") return formatSceneEffectExpired(entry.payload);
  if (entry.type === "attack_resolved") return formatAttackResolved(entry.payload);
  if (entry.type === "defense_reaction_used") return formatDefenseReactionUsed(entry.payload);
  if (entry.type === "item_used") return formatItemUsed(entry.payload);
  if (entry.type === "talent_used") return formatTalentUsed(entry.payload);
  if (entry.type === "spell_cast") return formatSpellCast(entry.payload);
  if (entry.type === "character_state_change") return formatCharacterStateChange(entry.payload);
  if (entry.type === "inventory_transfer") return formatInventoryTransfer(entry.payload);
  if (entry.type === "spell_attack_used") return formatSpellAttackUsed(entry.payload);
  if (entry.type === "spell_attack_resolved") return formatSpellAttackResolved(entry.payload);
  if (entry.type === "temporary_effect_added" || entry.type === "temporary_effect_removed" || entry.type === "temporary_effect_expired") {
    return formatTemporaryEffectLog(entry.type, entry.payload);
  }
  return formatGenericLog(entry.type, entry.payload);
}

export function MesaTab({
  campaignId,
  mesaNome,
  profileId,
  profileNickname,
  characterId,
  characterNome,
  profileSessionId,
}: {
  campaignId: string | null;
  mesaNome: string | null;
  profileId: string | null;
  profileNickname: string | null;
  characterId: string | null;
  characterNome: string;
  /** sessionId do navegador (checkpoint v0.24) — anotado em table_logs.profile_session_id. */
  profileSessionId?: string | null;
}) {
  const [logs, setLogs] = useState<TableLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<VisibilityFilter>("todos");
  const [mensagemInput, setMensagemInput] = useState("");
  const [visibilidade, setVisibilidade] = useState<TableLogVisibility>("public");
  // Só exibição ("Última atualização: HH:mm:ss") — nunca refeita a
  // partir do servidor, não interfere no filtro nem nos logs em si.
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  async function refreshLogs() {
    if (!campaignId) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      // Visibilidade REAL (v0.20): o servidor filtra por observador —
      // jogador vê public + private do próprio perfil, nunca gm; narrador
      // dono vê tudo. Não é mais só filtro visual.
      setLogs(await listLogsForViewer(campaignId, { profileId }));
      setLastUpdatedAt(new Date());
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao carregar logs da mesa.");
    } finally {
      setLoading(false);
    }
  }

  // Carrega os logs ao abrir a aba com uma mesa selecionada, e recarrega
  // se a mesa mudar. `filtro` nunca é resetado aqui — só `logs` muda;
  // atualizações automáticas (Realtime, abaixo) e manuais (botão
  // "Atualizar logs") reusam este mesmo refetch, sempre substituindo a
  // lista inteira (nunca duplica: é sempre a leitura canônica do servidor).
  useEffect(() => {
    if (!campaignId) {
      setLogs([]);
      return;
    }
    refreshLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  // Checkpoint v0.46 — Realtime mínimo: INSERT novo em table_logs desta
  // mesa agenda um refetch debounced de `refreshLogs` (mesmo refetch
  // canônico do botão "Atualizar logs", nunca patch parcial). Continua
  // funcionando manualmente (botão) se Realtime estiver indisponível.
  const syncStatus = useTableLogsRealtime(campaignId, refreshLogs);

  async function handleEnviar() {
    if (!campaignId) return;
    const text = mensagemInput.trim();
    if (!text) return;
    setErrorMessage(null);
    try {
      await addLog({
        campaignId,
        characterId: characterId ?? undefined,
        profileId,
        profileSessionId,
        type: "chat",
        visibility: visibilidade,
        payload: {
          text,
          source: "character_sheet",
          profileId,
          profileNickname,
          characterId,
          characterNome,
        },
      });
      setMensagemInput("");
      await refreshLogs();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao enviar mensagem.");
    }
  }

  if (!campaignId) {
    return (
      <Section title="Mesa">
        <p style={{ fontSize: 13, opacity: 0.6 }}>
          Nenhuma mesa selecionada — escolha uma mesa na aba Geral para ver e enviar mensagens ao
          log persistente da mesa.
        </p>
      </Section>
    );
  }

  const logsFiltrados = filtro === "todos" ? logs : logs.filter((entry) => entry.visibility === filtro);
  const podeEnviar = mensagemInput.trim().length > 0;

  return (
    <Section title={`Mesa — ${mesaNome ?? campaignId}`}>
      {errorMessage && (
        <p style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 12 }}>Erro: {errorMessage}</p>
      )}

      {/* --- Área de envio --- */}
      <div
        style={{
          background: "#15161b",
          border: "1px solid #2a2b33",
          borderRadius: 8,
          padding: 12,
          marginBottom: 20,
        }}
      >
        <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>
          Enviar mensagem como{" "}
          <strong>{characterNome?.trim() || profileNickname || "Mesa"}</strong>
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            data-testid="mesa-mensagem-input"
            type="text"
            value={mensagemInput}
            onChange={(e) => setMensagemInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && podeEnviar) handleEnviar();
            }}
            placeholder="Mensagem para a mesa"
            style={{ ...inputStyle, flex: 1, minWidth: 200 }}
          />
          <select
            data-testid="mesa-visibilidade-select"
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
          <button
            data-testid="mesa-enviar-button"
            onClick={handleEnviar}
            disabled={!podeEnviar}
            style={{ ...buttonStyle, opacity: podeEnviar ? 1 : 0.5, cursor: podeEnviar ? "pointer" : "not-allowed" }}
          >
            Enviar
          </button>
        </div>
      </div>

      {/* --- Lista de mensagens/eventos --- */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, opacity: 0.6 }}>
          Log da mesa ({logsFiltrados.length}/{logs.length})
        </span>
        <select
          data-testid="mesa-filtro-select"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as VisibilityFilter)}
          style={inputStyle}
        >
          {VISIBILITY_FILTERS.map((v) => (
            <option key={v} value={v}>
              {VISIBILITY_FILTER_LABELS[v]}
            </option>
          ))}
        </select>
        <button data-testid="mesa-atualizar-button" onClick={refreshLogs} style={buttonStyle}>
          Atualizar logs
        </button>
        <span data-testid="ficha-mesa-sync-status" style={{ fontSize: 11, color: describeRealtimeStatus(syncStatus, "ficha").cor }}>
          ● {describeRealtimeStatus(syncStatus, "ficha").texto}
        </span>
        <span data-testid="mesa-auto-update-status" style={{ fontSize: 11, opacity: 0.55 }}>
          {syncStatus === "subscribed" ? "Atualização automática ligada" : "Atualização automática indisponível — use o botão"}
          {lastUpdatedAt && ` · Última atualização: ${lastUpdatedAt.toLocaleTimeString("pt-BR")}`}
        </span>
      </div>
      <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
        Filtro visual apenas; ainda sem segurança real (visibilidade é só um campo de dados, ver
        migration 0003).
      </p>

      {loading && <p style={{ fontSize: 13, opacity: 0.6 }}>Carregando…</p>}
      {!loading && logs.length === 0 && (
        <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhum log ainda nesta mesa.</p>
      )}
      {!loading && logs.length > 0 && logsFiltrados.length === 0 && (
        <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhum log com essa visibilidade.</p>
      )}

      <div data-testid="mesa-logs-lista" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {logsFiltrados.map((entry) => (
          <div
            key={entry.id}
            data-testid="mesa-log-entry"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              background: "#1d1e24",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              borderLeft: `3px solid ${entryBorderColor(entry.type)}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, opacity: 0.6 }}>
              <span aria-hidden="true">{entryIcon(entry.type)}</span>
              {entry.type === "chat" ? (
                <span data-testid="mesa-log-entry-autor" style={{ fontWeight: 700 }}>
                  {chatAuthor(entry.payload)}
                </span>
              ) : (
                <span data-testid="mesa-log-entry-type">{entryKindLabel(entry.type)}</span>
              )}
              <span data-testid="mesa-log-entry-visibility">[{VISIBILITY_LABELS[entry.visibility]}]</span>
              <span style={{ marginLeft: "auto", fontFamily: "monospace" }}>
                {new Date(entry.created_at).toLocaleString("pt-BR")}
              </span>
            </div>
            <span data-testid="mesa-log-entry-conteudo">
              {entry.type === "chat" ? chatText(entry.payload) : formatTableLogEntry(entry)}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}
