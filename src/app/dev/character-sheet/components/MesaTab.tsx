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
  if (type === "overload_surge" || type === "overload_will_roll") return "⚡";
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
  return "•";
}

function entryBorderColor(type: string): string {
  if (type === "chat") return "#4f8cff";
  if (type === "profile_event") return "#ff6b9f";
  if (type === "condition_auto_removed" || type === "condition_auto_removal_undone") return "#4caf50";
  if (type === "rest_short" || type === "rest_long") return "#5ec8ff";
  if (type === "overload_surge" || type === "overload_will_roll") return "#c0392b";
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

/** Checkpoint v0.37: cartão de overload_surge. */
function formatOverloadSurge(payload: Record<string, unknown>): string {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  const tipo = typeof payload.tipo === "string" ? payload.tipo : "?";
  const indice = typeof payload.indice === "number" ? payload.indice : "?";
  const dano = typeof payload.danoPsiquico === "number" ? payload.danoPsiquico : "?";
  const ruptura = payload.rupturaPendente === true ? " — Ruptura pendente!" : "";
  return `${characterNome}: ${tipo} (${indice}/${MAX_OVERLOAD_SURGES_PER_DAY}) — ${dano} dano psíquico (1d4)${ruptura}`;
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
  return JSON.stringify(payload);
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
function formatAttackResolved(payload: Record<string, unknown>): string {
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

/** Texto da mensagem de chat — aceita `text` (ficha, v0.12) ou `mensagem` (formato antigo do /dev/table). */
function chatText(payload: Record<string, unknown>): string {
  if (typeof payload.text === "string") return payload.text;
  if (typeof payload.mensagem === "string") return payload.mensagem;
  return JSON.stringify(payload);
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
  return JSON.stringify(payload);
}

function formatProfileEvent(payload: Record<string, unknown>): string {
  const nickname = typeof payload.profileNickname === "string" ? payload.profileNickname : "perfil desconhecido";
  if (payload.evento === "enter") return `${nickname}: entrou no perfil`;
  if (payload.evento === "leave") return `${nickname}: saiu do perfil`;
  if (payload.evento === "heartbeat_expirado") return `${nickname}: heartbeat expirado (perfil perdido)`;
  return JSON.stringify(payload);
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
              {entry.type === "chat"
                ? chatText(entry.payload)
                : entry.type === "rolagem_pericia" || entry.type === "rolagem_expressao"
                  ? formatRolagem(entry.payload)
                  : entry.type === "profile_event"
                    ? formatProfileEvent(entry.payload)
                    : entry.type === "condition_auto_removed" || entry.type === "condition_auto_removal_undone"
                      ? formatAutoHeal(entry.payload)
                      : entry.type === "rest_short" || entry.type === "rest_long"
                        ? formatRest(entry.payload)
                        : entry.type === "overload_surge"
                          ? formatOverloadSurge(entry.payload)
                          : entry.type === "overload_will_roll"
                            ? formatOverloadWillRoll(entry.payload)
                            : entry.type.startsWith("collapse_")
                              ? formatCollapse(entry.payload)
                              : entry.type === "round_ended" || entry.type === "scene_ended" || entry.type === "scene_rupture_pending"
                                ? formatRoundOrScene(entry.type, entry.payload)
                                : entry.type === "character_evolution"
                                  ? formatEvolution(entry.payload)
                                  : entry.type === "action_used"
                                    ? formatActionUsed(entry.payload)
                                    : entry.type === "condition_end_round_damage"
                                      ? formatConditionEndRoundDamage(entry.payload)
                                      : entry.type === "condition_end_round_check_created"
                                        ? formatConditionCheckCreated(entry.payload)
                                        : entry.type === "condition_end_round_check_resolved"
                                          ? formatConditionCheckResolved(entry.payload)
                                          : entry.type === "round_pa_reduced_by_condition"
                                            ? formatRoundPaReduced(entry.payload)
                                            : entry.type === "condition_applied"
                                              ? formatConditionApplied(entry.payload)
                                              : entry.type === "condition_removed"
                                                ? formatConditionRemoved(entry.payload)
                                                : entry.type === "round_end_processed"
                                                  ? formatRoundEndProcessed(entry.payload)
                                                  : entry.type === "scene_end_processed"
                                                    ? formatSceneEndProcessed(entry.payload)
                                                    : entry.type === "rupture_resolved"
                                                      ? formatRuptureResolved(entry.payload)
                                                      : entry.type === "rupture_choice_created"
                                                        ? formatRuptureChoiceCreated(entry.payload)
                                                        : entry.type === "rupture_choice_resolved"
                                                          ? formatRuptureChoiceResolved(entry.payload)
                                                          : entry.type === "integrity_zero_pending"
                                                            ? formatIntegrityZeroPending(entry.payload)
                                                            : entry.type === "scene_effect_expired"
                                                              ? formatSceneEffectExpired(entry.payload)
                                                              : entry.type === "attack_resolved"
                                                                ? formatAttackResolved(entry.payload)
                                                                : JSON.stringify(entry.payload)}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}
