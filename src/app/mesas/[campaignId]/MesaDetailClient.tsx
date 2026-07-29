"use client";

import { useState } from "react";
import Link from "next/link";
import {
  createCampaignInvite,
  createCampaignEmailInvite,
  listCampaignInvites,
  revokeCampaignInvite,
  listCampaignMembers,
  removeCampaignMember,
  listLogsForViewer,
  addLog,
  getCampaign,
} from "../../../lib/table/storage";
import { endCampaignRound } from "../../../lib/table/endRound";
import { buildCampaignEndRoundSummary } from "../../../lib/table/endRoundSummary";
import { endCampaignScene } from "../../../lib/table/endScene";
import { buildCampaignEndSceneSummary } from "../../../lib/table/endSceneSummary";
import { useCampaignRealtime } from "../../../lib/realtime/useCampaignRealtime";
import { describeRealtimeStatus, type RealtimeStatus } from "../../../lib/realtime/tableRealtime";
import {
  listCharactersForNarratorCampaign,
  listUnassignedCharactersForNarrator,
  listCharacterControllers,
  grantCharacterControl,
  revokeCharacterControl,
  assignCharacterToCampaign,
  createCharacterForCampaign,
  renameCharacter,
  archiveCharacter,
  restoreCharacter,
  duplicateCharacter,
  updateCharacter,
  type CharacterController,
} from "../../../lib/character/storage";
import {
  createInitialCharacter,
  normalizeCharacter,
  resolveContestedRoll,
  applyAttackDamage,
  deriveCriticalItemPropertySuggestions,
  formatCriticalItemPropertySuggestions,
  getEquippedDefenseProfile,
  resolveMarginBand,
  rollDamageFormula,
  rollExtraMarginDie,
  computeDerivedStats,
  spendReactionForDefense,
  BODY_REGION_LABELS,
  type AttackCriticalRules,
  type CriticalItemPropertySuggestion,
  type ItemContent,
  type BodyRegion,
  type MarginBandRules,
  type ReactionRules,
} from "../../../lib/character";
import type { TechnicalContentItem } from "../../../lib/content";
import type { Campaign, CampaignMember, CampaignInvite, TableLogEntry } from "../../../lib/table";
import type { CharacterRecord, CharacterRulesPayload } from "../../../lib/character";
import { formatTableLogEntry } from "../../dev/character-sheet/components/MesaTab";
import TurnTrackPanel from "../../components/TurnTrackPanel";

/**
 * Formatação mínima dos tipos de log criados/reaproveitados pelo motor
 * de fim de rodada (checkpoint v0.44/v0.44.1) para o log simplificado
 * do dashboard — nunca JSON cru. Tipos não cobertos aqui caem no
 * fallback genérico já existente (text/mensagem/total/evento).
 */
export function formatCampaignRoundLog(type: string, payload: Record<string, unknown>): string | null {
  const characterNome = typeof payload.characterNome === "string" ? payload.characterNome : "Personagem";
  if (type === "round_ended") {
    const prev = typeof payload.previousRound === "number" ? payload.previousRound : "?";
    const next = typeof payload.newRound === "number" ? payload.newRound : "?";
    return `Rodada ${prev} → ${next}.`;
  }
  if (type === "round_end_processed") {
    const names = Array.isArray(payload.processedCharacterNames)
      ? payload.processedCharacterNames.filter((n): n is string => typeof n === "string")
      : [];
    const dano = typeof payload.damageCount === "number" ? payload.damageCount : 0;
    const pendencias = typeof payload.pendingCheckCount === "number" ? payload.pendingCheckCount : 0;
    return `Rodada da mesa processada — ${names.length} personagem(ns), ${dano} dano(s) de condição, ${pendencias} pendência(s).`;
  }
  if (type === "condition_end_round_damage") {
    const conditionName = typeof payload.conditionName === "string" ? payload.conditionName : "Condição";
    const damage = typeof payload.damage === "number" ? payload.damage : "?";
    const damageType = typeof payload.damageType === "string" ? payload.damageType : "";
    return `${characterNome}: ${conditionName} causou ${damage} de dano ${damageType}.`;
  }
  if (type === "condition_end_round_check_created") {
    const conditionName = typeof payload.conditionName === "string" ? payload.conditionName : "Condição";
    const resistance = payload.resistance as Record<string, unknown> | undefined;
    const pericia = typeof resistance?.pericia === "string" ? resistance.pericia : "?";
    const cd = typeof resistance?.cd === "number" ? resistance.cd : "?";
    return `${characterNome}: ${conditionName} — teste de ${pericia} CD ${cd} pendente.`;
  }
  if (type === "condition_end_round_check_resolved") {
    const conditionName = typeof payload.conditionName === "string" ? payload.conditionName : "Condição";
    const result = payload.result === "success" ? "Sucesso" : "Falha";
    return `${characterNome}: ${conditionName} — ${result}.`;
  }
  if (type === "round_pa_reduced_by_condition") {
    const conditionName = typeof payload.conditionName === "string" ? payload.conditionName : "Condição";
    const value = typeof payload.value === "number" ? payload.value : "?";
    return `${characterNome}: ${conditionName} reduziu ${value} PA.`;
  }
  if (type === "condition_applied" || type === "condition_removed") {
    const nome = typeof payload.nome === "string" ? payload.nome : typeof payload.conditionName === "string" ? payload.conditionName : "Condição";
    return `${characterNome}: ${type === "condition_applied" ? "aplicada" : "removida"} "${nome}".`;
  }
  if (type === "scene_ended") {
    const prev = typeof payload.previousScene === "number" ? payload.previousScene : "?";
    const next = typeof payload.newScene === "number" ? payload.newScene : "?";
    return `Cena ${prev} → ${next}.`;
  }
  if (type === "scene_rupture_pending") {
    const names = Array.isArray(payload.characterNames)
      ? payload.characterNames.filter((n): n is string => typeof n === "string")
      : [];
    return `Ruptura pendente para: ${names.join(", ") || "(nenhum)"}.`;
  }
  if (type === "scene_end_processed") {
    const names = Array.isArray(payload.processedCharacterNames)
      ? payload.processedCharacterNames.filter((n): n is string => typeof n === "string")
      : [];
    const rupturas = typeof payload.ruptureResolvedCount === "number" ? payload.ruptureResolvedCount : 0;
    const pendencias = typeof payload.pendingChoiceCount === "number" ? payload.pendingChoiceCount : 0;
    return `Cena da mesa processada — ${names.length} personagem(ns), ${rupturas} Ruptura(s) resolvida(s), ${pendencias} pendência(s) de Marca/Traço.`;
  }
  if (type === "rupture_resolved") {
    const level = typeof payload.ruptureLevel === "number" ? payload.ruptureLevel : "?";
    const integrityBefore = typeof payload.integrityBefore === "number" ? payload.integrityBefore : "?";
    const integrityAfter = typeof payload.integrityAfter === "number" ? payload.integrityAfter : "?";
    const manaBonus = typeof payload.manaBonusApplied === "number" ? payload.manaBonusApplied : "?";
    return `${characterNome}: Ruptura nível ${level} — Integridade ${integrityBefore} → ${integrityAfter}, Mana máxima +${manaBonus}.`;
  }
  if (type === "rupture_choice_created") {
    return `${characterNome}: Marca e Traço pendentes.`;
  }
  if (type === "rupture_choice_resolved") {
    const marca = typeof payload.marca === "string" ? payload.marca : "(sem marca)";
    const traco = typeof payload.traco === "string" ? payload.traco : "(sem traço)";
    return `${characterNome}: Marca e Traço registrados — ${marca} / ${traco}.`;
  }
  if (type === "integrity_zero_pending") {
    return `${characterNome}: Integridade zerada — Última Vontade pendente.`;
  }
  if (type === "scene_effect_expired") {
    const effectName = typeof payload.effectName === "string" ? payload.effectName : "Efeito";
    return `${characterNome}: ${effectName} encerrado (duração de cena).`;
  }
  if (type === "attack_resolved") {
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
  return null;
}

const btn: React.CSSProperties = { background: "#1d1e24", color: "inherit", border: "1px solid #333", borderRadius: 6, padding: "6px 12px", fontSize: 13, cursor: "pointer" };
const input: React.CSSProperties = { background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "6px 8px", fontSize: 13 };
const h2: React.CSSProperties = { fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 12 };
const card: React.CSSProperties = { background: "#1d1e24", borderRadius: 8, padding: "10px 14px", fontSize: 13 };

interface Props {
  campaign: Campaign;
  membrosIniciais: CampaignMember[];
  convitesIniciais: CampaignInvite[];
  controlesIniciais: CharacterController[];
  logsIniciais: TableLogEntry[];
  /** Personagens já ligados a esta mesa (campaign_id === campaign.id, checkpoint v0.23). */
  personagensDaMesaIniciais: CharacterRecord[];
  /** Personagens "legados" (sem mesa) disponíveis para vincular a esta mesa. */
  personagensDisponiveisIniciais: CharacterRecord[];
  /** Regra canônica de `regras_personagem` (checkpoint v0.52) — usada só para `colapso` no "Resolver Ataque" (avanço por dano adicional). Null = segue sem avanço automático. */
  regras: CharacterRulesPayload | null;
  criticalRules: AttackCriticalRules;
  items: ItemContent[];
  properties: TechnicalContentItem[];
  runes: TechnicalContentItem[];
  /** Regra canônica de Reações (`combat_flow`, PRD 6.4) — mesma fonte usada por `/dev/table`. Inválida/ausente = defesa sem Reação fica indisponível (fail-closed), ver `reactions.ts`. */
  reactionRules: ReactionRules;
}

/** Tipos de defesa reativa (PRD 7.2/8.6) — mesmo conjunto de `/dev/table`, sem os bônus de talento específicos daquele console (fora de escopo desta promoção). */
type DefenseType = "esquivar" | "aparar" | "bloquear" | "resistir";
const DEFENSE_TYPE_LABELS: Record<DefenseType, string> = {
  esquivar: "Esquivar",
  aparar: "Aparar",
  bloquear: "Bloquear",
  resistir: "Resistir",
};

export default function MesaDetailClient({
  campaign,
  membrosIniciais,
  convitesIniciais,
  controlesIniciais,
  logsIniciais,
  personagensDaMesaIniciais,
  personagensDisponiveisIniciais,
  regras,
  criticalRules,
  items,
  properties,
  runes,
  reactionRules,
}: Props) {
  const [campaignState, setCampaignState] = useState(campaign);
  const [membros, setMembros] = useState(membrosIniciais);
  const [convites, setConvites] = useState(convitesIniciais);
  const [controles, setControles] = useState(controlesIniciais);
  const [logs, setLogs] = useState(logsIniciais);
  const [personagensDaMesa, setPersonagensDaMesa] = useState(personagensDaMesaIniciais);
  const [personagensDisponiveis, setPersonagensDisponiveis] = useState(personagensDisponiveisIniciais);
  const [personagemParaVincular, setPersonagemParaVincular] = useState("");
  const [novoPersonagemNome, setNovoPersonagemNome] = useState("");
  const [conviteLabel, setConviteLabel] = useState("");
  const [conviteEmail, setConviteEmail] = useState("");
  const [conviteEmailLabel, setConviteEmailLabel] = useState("");
  const [linkNovo, setLinkNovo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Checkpoint v0.44.1 — estado do processamento canônico de "Encerrar
  // Rodada" (endCampaignRound): trava o botão contra clique duplo e
  // mostra o resumo textual depois de concluído.
  const [endRoundProcessing, setEndRoundProcessing] = useState(false);
  const [endRoundSummary, setEndRoundSummary] = useState<string[] | null>(null);
  // Checkpoint v0.45 — mesmo padrão para "Encerrar Cena" (endCampaignScene).
  const [endSceneProcessing, setEndSceneProcessing] = useState(false);
  const [endSceneSummary, setEndSceneSummary] = useState<string[] | null>(null);
  // Checkpoint v0.47 — "Resolver Ataque" (ataque contestado básico, PRD 8.1/8.6).
  // Promoção pós-auditoria: reação defensiva (PRD 6.4/8.6), margem→região
  // (PRD 8.7) e MIT/PD (já existente, agora ligado à reação Bloquear) —
  // reusa exatamente os mesmos módulos de `/dev/table`
  // (`resolveMarginBand`, `spendReactionForDefense`, `applyAttackDamage`),
  // sem os ganchos de talento daquele console (fora de escopo).
  const [ataqueAtacanteId, setAtaqueAtacanteId] = useState("");
  const [ataqueAlvoId, setAtaqueAlvoId] = useState("");
  const [ataqueItemInstanceId, setAtaqueItemInstanceId] = useState("");
  const [ataqueTotalAtaque, setAtaqueTotalAtaque] = useState("");
  const [ataqueTotalDefesa, setAtaqueTotalDefesa] = useState("");
  const [ataqueFormulaDano, setAtaqueFormulaDano] = useState("1d6");
  const [ataqueTipoDano, setAtaqueTipoDano] = useState("fisico");
  /** Checkpoint v0.58 (fase 3) — MIT/PD só resolvem com esses dados; ausentes preservam o comportamento antigo (dano bruto). */
  const [ataqueSubtipoDano, setAtaqueSubtipoDano] = useState("");
  /** "nenhuma" = sem reação declarada (comportamento anterior); demais valores consomem 1 Reação do alvo via `spendReactionForDefense` e, se "bloquear", resolvem contra PD em vez de MIT. */
  const [ataqueDefesaTipo, setAtaqueDefesaTipo] = useState<DefenseType | "nenhuma">("nenhuma");
  const [ataqueReacaoAviso, setAtaqueReacaoAviso] = useState<string | null>(null);
  const [ataqueProcessing, setAtaqueProcessing] = useState(false);
  const [ataqueResultado, setAtaqueResultado] = useState<string | null>(null);
  const [ataqueSugestoesCriticas, setAtaqueSugestoesCriticas] = useState<CriticalItemPropertySuggestion[]>([]);
  /** Margem já calculada (acerto), aguardando escolha de região antes de aplicar dano — PRD 8.7 ("a escolha de região é travada por margem"). */
  const [ataqueMargemPendente, setAtaqueMargemPendente] = useState<{
    margin: number;
    band: MarginBandRules;
    alvoId: string;
  } | null>(null);
  const [ataqueRegiaoEscolhida, setAtaqueRegiaoEscolhida] = useState<BodyRegion | "">("");
  const ataqueAtacante = personagensDaMesa.find((character) => character.id === ataqueAtacanteId);
  const ataqueArmas = ataqueAtacante
    ? normalizeCharacter(ataqueAtacante.payload).inventario?.filter((item) => item.categoria === "arma") ?? []
    : [];

  function fail(err: unknown, msg: string) {
    setError(err instanceof Error ? err.message : msg);
  }

  async function reloadMembros() {
    try { setMembros(await listCampaignMembers(campaign.id)); } catch (e) { fail(e, "Erro ao recarregar participantes."); }
  }
  async function reloadControles() {
    try { setControles(await listCharacterControllers(campaign.id)); } catch (e) { fail(e, "Erro ao recarregar controles de personagem."); }
  }
  async function reloadConvites() {
    try { setConvites(await listCampaignInvites(campaign.id)); } catch (e) { fail(e, "Erro ao recarregar convites."); }
  }
  async function reloadLogs() {
    try { setLogs(await listLogsForViewer(campaign.id, {})); } catch (e) { fail(e, "Erro ao recarregar log."); }
  }
  async function reloadPersonagens() {
    try {
      setPersonagensDaMesa(await listCharactersForNarratorCampaign(campaign.id));
      setPersonagensDisponiveis(await listUnassignedCharactersForNarrator());
    } catch (e) { fail(e, "Erro ao recarregar personagens."); }
  }
  /** Checkpoint v0.46 — refetch canônico da campanha (current_round/current_scene), disparado por Realtime. */
  async function reloadCampaign() {
    try {
      const updated = await getCampaign(campaign.id);
      if (updated) setCampaignState(updated);
    } catch (e) { fail(e, "Erro ao recarregar mesa."); }
  }
  /** Botão "Recarregar mesa" (checkpoint v0.46) — fallback manual se Realtime estiver indisponível/com erro. */
  async function reloadAll() {
    await Promise.all([reloadCampaign(), reloadPersonagens(), reloadLogs(), reloadMembros(), reloadControles(), reloadConvites()]);
  }

  /**
   * "Resolver Ataque" — passo 1: reação defensiva + margem (promoção
   * pós-auditoria, PRD 6.4/8.1/8.6/8.7). Compara os totais JÁ ROLADOS
   * de atacante e defensor (narrador informa, mesmo padrão desde
   * v0.47) via `resolveContestedRoll`; se uma reação de defesa foi
   * escolhida, consome 1 Reação do ALVO (`spendReactionForDefense`,
   * `lib/character/reactions.ts` — mesmo motor de `/dev/table`) ANTES
   * de saber o resultado (a reação é gasta pelo uso, não pelo
   * sucesso). Se o atacante vencer, calcula a banda de margem
   * (`resolveMarginBand`) e aguarda o narrador escolher a região
   * liberada antes de aplicar dano (`handleAplicarDano`, passo 2). Sem
   * alvo estruturado/mapa: os dois personagens vêm da lista já
   * carregada da mesa.
   */
  async function handleCalcularMargem() {
    setError(null);
    setAtaqueResultado(null);
    setAtaqueSugestoesCriticas([]);
    setAtaqueReacaoAviso(null);
    setAtaqueMargemPendente(null);
    setAtaqueRegiaoEscolhida("");
    const atacante = personagensDaMesa.find((c) => c.id === ataqueAtacanteId);
    const alvo = personagensDaMesa.find((c) => c.id === ataqueAlvoId);
    const totalAtaque = Number(ataqueTotalAtaque);
    const totalDefesa = Number(ataqueTotalDefesa);
    if (!atacante || !alvo || !Number.isFinite(totalAtaque) || !Number.isFinite(totalDefesa)) {
      setError("Selecione atacante, alvo e informe os totais de ataque/defesa.");
      return;
    }

    setAtaqueProcessing(true);
    try {
      let alvoNormalizado = normalizeCharacter(alvo.payload);

      // Reação defensiva (PRD 6.4/8.6) — consumida pelo uso, independente do resultado.
      if (ataqueDefesaTipo !== "nenhuma") {
        const reactionMax = computeDerivedStats(alvoNormalizado.atributos, regras, alvoNormalizado.mana_bonus_ruptura ?? 0).reacoes_por_rodada;
        const reactionResult = spendReactionForDefense(alvoNormalizado, reactionMax, reactionRules, 1);
        alvoNormalizado = reactionResult.character;
        await updateCharacter(alvo.id, alvoNormalizado);
        const avisos: string[] = [...reactionResult.warnings];
        if (reactionResult.defenseWithoutReaction) {
          avisos.push(`Defesa sem Reação disponível — penalidade cumulativa de ${reactionResult.penaltyApplied} nesta rodada.`);
        }
        setAtaqueReacaoAviso(avisos.length > 0 ? avisos.join(" ") : null);
        try {
          await addLog({
            campaignId: campaign.id,
            characterId: alvo.id,
            type: "defense_reaction_used",
            visibility: "public",
            payload: {
              targetName: alvo.name,
              defenseName: DEFENSE_TYPE_LABELS[ataqueDefesaTipo],
              total: totalDefesa,
              reactionsBefore: reactionResult.reactionBefore,
              reactionsAfter: reactionResult.reactionAfter,
              source: "mesa_dashboard",
            },
          });
        } catch {
          // Best-effort — a Reação já foi persistida no personagem.
        }
        await reloadPersonagens();
      }

      const contested = resolveContestedRoll(totalAtaque, totalDefesa);
      let resumo = `${atacante.name} (${totalAtaque}) vs ${alvo.name} (${totalDefesa}) — margem ${contested.margin}.`;
      const atacanteNormalizado = normalizeCharacter(atacante.payload);
      const itemInstance = atacanteNormalizado.inventario?.find((item) => item.id === ataqueItemInstanceId);
      const itemContent = itemInstance ? items.find((item) => item.slug === itemInstance.itemSlug) : undefined;
      const criticalSuggestions = deriveCriticalItemPropertySuggestions({
        margin: contested.margin,
        rules: criticalRules,
        itemInstance,
        itemContent,
        properties,
        runes,
      });
      if (criticalSuggestions.length > 0) setAtaqueSugestoesCriticas(criticalSuggestions);

      if (contested.attackerWins) {
        const band = resolveMarginBand(contested.margin);
        resumo += ` Acerto — região liberada: ${band.allowedRegions.map((r) => BODY_REGION_LABELS[r]).join(", ")}. Escolha a região para aplicar o dano.`;
        setAtaqueMargemPendente({ margin: contested.margin, band, alvoId: alvo.id });
        if (band.allowedRegions.length === 1) setAtaqueRegiaoEscolhida(band.allowedRegions[0]);
      } else {
        resumo += " Defesa bem-sucedida — nenhum dano aplicado.";
        try {
          await addLog({
            campaignId: campaign.id,
            characterId: alvo.id,
            type: "attack_resolved",
            visibility: "public",
            payload: {
              attackerId: atacante.id,
              attackerNome: atacante.name,
              characterId: alvo.id,
              characterNome: alvo.name,
              attackerTotal: totalAtaque,
              defenderTotal: totalDefesa,
              margin: contested.margin,
              attackerWins: false,
              defenseType: ataqueDefesaTipo !== "nenhuma" ? ataqueDefesaTipo : null,
              source: "mesa_dashboard",
            },
          });
        } catch {
          // Best-effort.
        }
        await reloadLogs();
      }

      setAtaqueResultado(resumo);
    } catch (e) {
      fail(e, "Erro ao calcular margem do ataque.");
    } finally {
      setAtaqueProcessing(false);
    }
  }

  /**
   * "Resolver Ataque" — passo 2: aplica dano (PRD 8.7/13.5/13.6). Rola
   * a fórmula de dano (`rollDamageFormula`) e ajusta pela banda de
   * margem já calculada (`-1` flat na banda limitada, `+1 dado`
   * — `rollExtraMarginDie` — na crítica; mesma regra de
   * `/dev/table`); o valor final vira uma fórmula fixa
   * (`0d4+N`, 0 dados rolados = sem novo sorteio) só para reaproveitar
   * `applyAttackDamage`/`resolveDamageWithMitPd` sem duplicar o
   * cálculo de MIT/PD. "Bloquear" (reação escolhida no passo 1) resolve
   * contra PD; qualquer outra reação ou nenhuma resolve contra MIT.
   */
  async function handleAplicarDano() {
    if (!ataqueMargemPendente || !ataqueRegiaoEscolhida) {
      setError("Escolha a região atingida antes de aplicar o dano.");
      return;
    }
    setError(null);
    const atacante = personagensDaMesa.find((c) => c.id === ataqueAtacanteId);
    const alvo = personagensDaMesa.find((c) => c.id === ataqueMargemPendente.alvoId);
    if (!atacante || !alvo) {
      setError("Atacante ou alvo não encontrado — recarregue os personagens da mesa.");
      return;
    }

    setAtaqueProcessing(true);
    try {
      const nowIso = new Date().toISOString();
      const { margin, band } = ataqueMargemPendente;
      const atacanteNormalizado = normalizeCharacter(atacante.payload);
      const itemInstance = atacanteNormalizado.inventario?.find((item) => item.id === ataqueItemInstanceId);
      const alvoNormalizado = normalizeCharacter(alvo.payload);
      const defesaAlvo = getEquippedDefenseProfile(alvoNormalizado, items);
      const wasBlocked = ataqueDefesaTipo === "bloquear";

      const rawRoll = rollDamageFormula(ataqueFormulaDano);
      const adjustedRaw =
        band.modifierType === "flat"
          ? Math.max(0, rawRoll + band.flatModifier)
          : band.modifierType === "extraDie"
            ? rawRoll + (rollExtraMarginDie(ataqueFormulaDano) ?? 0)
            : rawRoll;

      const dano = applyAttackDamage({
        character: alvoNormalizado,
        // Fórmula fixa: 0 dados (sem novo sorteio) + o valor já ajustado pela margem — reaproveita `applyAttackDamage`/MIT/PD sem duplicar o parser de dados.
        formula: `0d4+${adjustedRaw}`,
        damageType: ataqueTipoDano,
        damageSubtype: ataqueSubtipoDano.trim() || undefined,
        wasBlocked,
        defense: defesaAlvo,
        nowIso,
        collapseRules: regras?.colapso,
        round: alvoNormalizado.current_round,
        scene: alvoNormalizado.current_scene,
      });
      await updateCharacter(alvo.id, dano.character);

      let resumo = `${atacante.name} → ${alvo.name} — margem ${margin} (${band.band}), região ${BODY_REGION_LABELS[ataqueRegiaoEscolhida]}: ${dano.rollResult} de dano ${ataqueTipoDano} (PV ${dano.pvBefore} → ${dano.pvAfter}).`;
      if (dano.mitigatedByMit > 0 || dano.mitigatedByPd > 0) resumo += ` ${dano.defenseSummary}`;
      if (dano.collapseStarted) resumo += ` Colapso (${dano.collapseTipo}) iniciado.`;
      if (dano.collapseAdvanceLogs.length > 0) resumo += ` ${dano.collapseAdvanceLogs.join(" ")}`;

      try {
        await addLog({
          campaignId: campaign.id,
          characterId: alvo.id,
          type: "attack_resolved",
          visibility: "public",
          payload: {
            attackerName: atacante.name,
            targetName: alvo.name,
            weaponName: itemInstance?.itemNome ?? null,
            margin,
            marginBand: band.band,
            selectedRegion: ataqueRegiaoEscolhida,
            rawDamage: adjustedRaw,
            damageType: ataqueTipoDano,
            mitApplied: dano.mitigatedByMit + dano.mitigatedByPd,
            finalDamage: dano.finalDamage,
            targetPvBefore: dano.pvBefore,
            targetPvAfter: dano.pvAfter,
            defenseType: ataqueDefesaTipo !== "nenhuma" ? ataqueDefesaTipo : null,
            wasBlocked,
            override: false,
            criticalPropertySuggestions: ataqueSugestoesCriticas,
            source: "mesa_dashboard",
          },
        });
        for (const entry of dano.collapseAdvanceTableLogs) {
          await addLog({
            campaignId: campaign.id,
            characterId: alvo.id,
            type: entry.type,
            visibility: "public",
            payload: { ...entry.payload, characterId: alvo.id, characterNome: alvo.name, source: "mesa_dashboard" },
          });
        }
      } catch {
        // Best-effort — o dano já foi persistido no personagem.
      }

      setAtaqueResultado(resumo);
      setAtaqueMargemPendente(null);
      setAtaqueRegiaoEscolhida("");
      await Promise.all([reloadPersonagens(), reloadLogs()]);
    } catch (e) {
      fail(e, "Erro ao aplicar dano do ataque.");
    } finally {
      setAtaqueProcessing(false);
    }
  }

  function handleCancelarAtaquePendente() {
    setAtaqueMargemPendente(null);
    setAtaqueRegiaoEscolhida("");
    setAtaqueResultado(null);
  }

  // Checkpoint v0.46 — Realtime mínimo: assina campaigns/characters/
  // table_logs desta mesa e refaz a leitura canônica quando algo muda
  // (nunca aplica patch parcial). Se Realtime não estiver disponível,
  // `syncStatus` vira "disabled"/"error" e a mesa continua funcionando
  // só com os botões de recarregar já existentes.
  const syncStatus: RealtimeStatus = useCampaignRealtime(campaign.id, {
    onCampaignChange: reloadCampaign,
    onCharactersChange: reloadPersonagens,
    onTableLogsChange: reloadLogs,
  });

  /**
   * Botão "Encerrar Rodada" CANÔNICO da mesa (checkpoint v0.44.1) —
   * processa todos os personagens ativos da campanha através do motor
   * data-driven de fim de rodada (`endCampaignRound`, reaproveita
   * `endRoundConditions.ts` do v0.44 sem reimplementar regra nenhuma):
   * dano/testes de condição, renovação de PA/Reações, reset de
   * penalidade de defesa sem Reação e redução de PA por condição — para
   * TODOS os personagens vinculados, não só um. `expectedRound` é a
   * checagem otimista de idempotência: se a rodada já avançou entre o
   * carregamento da página e o clique (outro clique, outra aba do
   * narrador), a chamada falha com erro claro em vez de reprocessar a
   * rodada errada.
   */
  async function handleEndRound() {
    setError(null);
    setEndRoundSummary(null);
    setEndRoundProcessing(true);
    try {
      const result = await endCampaignRound({
        campaignId: campaign.id,
        expectedRound: campaignState.current_round,
      });
      setCampaignState((prev) => ({ ...prev, current_round: result.nextRound }));
      setEndRoundSummary(buildCampaignEndRoundSummary(result));
      await Promise.all([reloadLogs(), reloadPersonagens()]);
    } catch (e) {
      fail(e, "Erro ao encerrar rodada.");
    } finally {
      setEndRoundProcessing(false);
    }
  }

  /**
   * Botão "Encerrar Cena" CANÔNICO da mesa (checkpoint v0.45) —
   * processa TODOS os personagens ativos da campanha através do motor
   * `rupture.ts`: resolve Ruptura pendente, reduz Integridade, aumenta
   * Mana máxima (Ânimo + 2), cria pendência de Marca/Traço e marca
   * Última Vontade pendente se a Integridade chegar a 0. `expectedScene`
   * é a mesma checagem otimista de idempotência do "Encerrar Rodada"
   * (v0.44.1) — se a cena já avançou, a chamada falha antes de tocar
   * em qualquer personagem.
   */
  async function handleEndScene() {
    setError(null);
    setEndSceneSummary(null);
    setEndSceneProcessing(true);
    try {
      const result = await endCampaignScene({
        campaignId: campaign.id,
        expectedScene: campaignState.current_scene,
      });
      setCampaignState((prev) => ({ ...prev, current_scene: result.nextScene }));
      setEndSceneSummary(buildCampaignEndSceneSummary(result));
      await Promise.all([reloadLogs(), reloadPersonagens()]);
    } catch (e) {
      fail(e, "Erro ao encerrar cena.");
    } finally {
      setEndSceneProcessing(false);
    }
  }

  /**
   * Log de ciclo de vida de personagem (checkpoint v0.25) — melhor
   * esforço, nunca bloqueia a ação principal. Visibilidade "gm": são
   * eventos operacionais de mesa/narrador, não mensagens de jogador.
   */
  async function logCharacterEvent(
    type: "character_created" | "character_assigned" | "character_archived" | "character_restored",
    characterId: string,
    characterNome: string,
    extra: Record<string, unknown> = {},
  ) {
    try {
      await addLog({
        campaignId: campaign.id,
        characterId,
        type,
        visibility: "gm",
        payload: { characterId, characterNome, ...extra },
      });
    } catch {
      // best-effort — não bloqueia a ação já concluída no banco.
    }
  }

  async function vincularPersonagemAMesa() {
    if (!personagemParaVincular) return;
    setError(null);
    try {
      const record = await assignCharacterToCampaign(personagemParaVincular, campaign.id);
      setPersonagemParaVincular("");
      await logCharacterEvent("character_assigned", record.id, record.name, { destino: "mesa" });
      await reloadPersonagens();
    } catch (e) { fail(e, "Erro ao vincular personagem à mesa."); }
  }
  async function desvincularPersonagemDaMesa(characterId: string) {
    setError(null);
    try {
      // assignCharacterToCampaign já revoga os controladores deste
      // personagem antes de desvincular (FK composta character_controllers
      // <-> characters(id, campaign_id); controle é escopado à campanha).
      await assignCharacterToCampaign(characterId, null);
      await reloadPersonagens();
      await reloadControles();
    } catch (e) { fail(e, "Erro ao desvincular personagem da mesa."); }
  }
  /** Concede controle de um personagem a um participante ativo (character_controllers, migration 0051). */
  async function concederControle(characterId: string, userId: string) {
    if (!userId) return;
    setError(null);
    try {
      await grantCharacterControl(characterId, userId);
      await logCharacterEvent("character_assigned", characterId, personagensDaMesa.find((c) => c.id === characterId)?.name ?? characterId, { destino: "controlador", userId });
      await reloadControles();
    } catch (e) { fail(e, "Erro ao conceder controle do personagem."); }
  }
  /** Remove controle de um personagem — não apaga o personagem. */
  async function removerControle(characterId: string, userId: string) {
    setError(null);
    try {
      await revokeCharacterControl(characterId, userId);
      await reloadControles();
    } catch (e) { fail(e, "Erro ao remover controle do personagem."); }
  }

  /** Cria um personagem mínimo já nascendo vinculado a esta mesa (checkpoint v0.25). */
  async function criarPersonagemNaMesa() {
    if (!novoPersonagemNome.trim()) return;
    setError(null);
    try {
      const record = await createCharacterForCampaign(campaign.id, createInitialCharacter(null, novoPersonagemNome.trim()));
      setNovoPersonagemNome("");
      await logCharacterEvent("character_created", record.id, record.name);
      await reloadPersonagens();
    } catch (e) { fail(e, "Erro ao criar personagem."); }
  }

  async function renomearPersonagem(characterId: string, nomeAtual: string) {
    const novoNome = window.prompt("Novo nome do personagem:", nomeAtual);
    if (novoNome == null || !novoNome.trim() || novoNome.trim() === nomeAtual) return;
    setError(null);
    try {
      await renameCharacter(characterId, novoNome.trim());
      await reloadPersonagens();
    } catch (e) { fail(e, "Erro ao renomear personagem."); }
  }

  async function arquivarPersonagem(characterId: string, characterNome: string) {
    setError(null);
    try {
      await archiveCharacter(characterId);
      await logCharacterEvent("character_archived", characterId, characterNome);
      await reloadPersonagens();
    } catch (e) { fail(e, "Erro ao arquivar personagem."); }
  }

  async function restaurarPersonagem(characterId: string, characterNome: string) {
    setError(null);
    try {
      await restoreCharacter(characterId);
      await logCharacterEvent("character_restored", characterId, characterNome);
      await reloadPersonagens();
    } catch (e) { fail(e, "Erro ao restaurar personagem."); }
  }

  async function duplicarPersonagem(characterId: string) {
    setError(null);
    try {
      const record = await duplicateCharacter(characterId);
      await logCharacterEvent("character_created", record.id, record.name, { duplicadoDe: characterId });
      await reloadPersonagens();
    } catch (e) { fail(e, "Erro ao duplicar personagem."); }
  }

  /** Remove um participante da campanha — revoga também, na mesma transação, seus controles de personagem (RPC remove_campaign_member, migration 0055). */
  async function removerParticipante(userId: string) {
    if (!window.confirm("Remover este participante da campanha? Isso revoga o acesso dele aos personagens que controla aqui.")) return;
    setError(null);
    try {
      await removeCampaignMember(campaign.id, userId);
      await Promise.all([reloadMembros(), reloadControles()]);
    } catch (e) { fail(e, "Erro ao remover participante."); }
  }
  /** Convite LIMPO (aditivo §7) — reutilizável, sempre concede Jogador. */
  async function criarConvite() {
    setError(null);
    try {
      const { rawToken } = await createCampaignInvite(campaign.id, conviteLabel);
      setConviteLabel("");
      setLinkNovo(`${window.location.origin}/join/${rawToken}`);
      await reloadConvites();
    } catch (e) { fail(e, "Erro ao criar convite."); }
  }
  /** Convite POR E-MAIL (aditivo §6) — ativação automática para a conta com esse e-mail. */
  async function criarConviteEmail() {
    if (!conviteEmail.trim()) return;
    setError(null);
    try {
      const { rawToken } = await createCampaignEmailInvite(campaign.id, conviteEmail, conviteEmailLabel);
      setConviteEmail("");
      setConviteEmailLabel("");
      setLinkNovo(`${window.location.origin}/join/${rawToken}`);
      await reloadConvites();
    } catch (e) { fail(e, "Erro ao criar convite por e-mail."); }
  }
  async function revogar(inviteId: string) {
    setError(null);
    try { await revokeCampaignInvite(inviteId); await reloadConvites(); }
    catch (e) { fail(e, "Erro ao revogar convite."); }
  }

  // Ciclo de vida: personagensDaMesa vem sem filtro de archived_at
  // (listCharactersForNarratorCampaign) — separado aqui em duas listas
  // de exibição. Só os ativos aparecem como opção de concessão de
  // controle (acima); os arquivados ganham uma seção própria com
  // "Restaurar".
  const personagensAtivosDaMesa = personagensDaMesa.filter((c) => !c.archived_at);
  const personagensArquivadosDaMesa = personagensDaMesa.filter((c) => c.archived_at);
  /** Participantes ativos com função "player" — candidatos a receber controle de personagem. */
  const jogadoresAtivos = membros.filter((m) => m.role === "player" && m.status === "active");
  function controladoresDe(characterId: string): CharacterController[] {
    return controles.filter((c) => c.character_id === characterId);
  }

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px 80px" }}>
      <Link href="/mesas" style={{ color: "#5ec8ff", fontSize: 12 }}>← Minhas mesas</Link>
      <h1 style={{ fontSize: 22, margin: "8px 0 4px" }}>{campaign.name}</h1>
      <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 8, fontFamily: "monospace" }}>{campaign.id}</p>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <span data-testid="mesa-sync-status" style={{ fontSize: 11, color: describeRealtimeStatus(syncStatus, "mesa").cor }}>
          ● {describeRealtimeStatus(syncStatus, "mesa").texto}
        </span>
        <button data-testid="mesa-recarregar" onClick={reloadAll} style={{ ...btn, padding: "3px 10px", fontSize: 11 }}>
          Recarregar mesa
        </button>
      </div>

      {error && <p style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 16 }}>Erro: {error}</p>}

      {/* Rodada e cena — fonte canônica da campanha (checkpoint v0.39; motor de condições ligado no v0.44.1) */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={h2}>Rodada e cena</h2>
        <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
          Esta mesa é a fonte OFICIAL da rodada/cena da campanha. "Encerrar Rodada" processa TODOS os
          personagens vinculados (Queimando/Sangrando/Envenenado/Saturado/Insaturado): aplica dano de
          fim de rodada, cria pendências de teste, renova PA/Reações, zera penalidade de defesa sem
          Reação e aplica redução de PA por condição — sem trilha de iniciativa, sem alternância
          PJ/PN. "Encerrar Cena" resolve a Ruptura pendente de todos: reduz Integridade, aumenta Mana
          máxima (Ânimo + 2), cria pendência de Marca/Traço e marca Última Vontade pendente se a
          Integridade chegar a 0 — sem narrativa automática, sem escolha obrigatória.
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span data-testid="det-rodada-atual" style={{ fontSize: 13 }}>
            Rodada <strong>{campaignState.current_round}</strong>
          </span>
          <button
            data-testid="det-encerrar-rodada"
            onClick={handleEndRound}
            disabled={endRoundProcessing}
            style={{ ...btn, opacity: endRoundProcessing ? 0.6 : 1, cursor: endRoundProcessing ? "not-allowed" : "pointer" }}
          >
            {endRoundProcessing ? "Processando…" : "Encerrar Rodada"}
          </button>
          <span data-testid="det-cena-atual" style={{ fontSize: 13 }}>
            Cena <strong>{campaignState.current_scene}</strong>
          </span>
          <button
            data-testid="det-encerrar-cena"
            onClick={handleEndScene}
            disabled={endSceneProcessing}
            style={{ ...btn, opacity: endSceneProcessing ? 0.6 : 1, cursor: endSceneProcessing ? "not-allowed" : "pointer" }}
          >
            {endSceneProcessing ? "Processando…" : "Encerrar Cena"}
          </button>
        </div>
        {endRoundProcessing && (
          <p data-testid="det-encerrar-rodada-processando" style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>
            Processando efeitos de fim de rodada…
          </p>
        )}
        {endRoundSummary && !endRoundProcessing && (
          <div data-testid="det-encerrar-rodada-resumo" style={{ fontSize: 12, marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            {endRoundSummary.map((line, i) => (
              <p key={i} style={{ opacity: 0.8, margin: 0 }}>
                {line}
              </p>
            ))}
          </div>
        )}
        {endSceneProcessing && (
          <p data-testid="det-encerrar-cena-processando" style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>
            Processando fim de cena…
          </p>
        )}
        {endSceneSummary && !endSceneProcessing && (
          <div data-testid="det-encerrar-cena-resumo" style={{ fontSize: 12, marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            {endSceneSummary.map((line, i) => (
              <p key={i} style={{ opacity: 0.8, margin: 0 }}>
                {line}
              </p>
            ))}
          </div>
        )}
      </section>

      <TurnTrackPanel campaign={campaignState} onCampaignChange={setCampaignState} isNarrator />

      {/* Personagens da mesa (checkpoint v0.23; ciclo de vida v0.25) */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={h2}>Personagens da mesa ({personagensAtivosDaMesa.length})</h2>
        <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
          Só personagens vinculados a esta mesa podem ter controle concedido a um participante.
          Personagens sem mesa são legados/globais — ver /dev/character-sheet.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <select data-testid="det-personagem-disponivel-select" value={personagemParaVincular} onChange={(e) => setPersonagemParaVincular(e.target.value)} style={{ ...input, flex: 1 }}>
            <option value="">— selecionar personagem existente (sem mesa) —</option>
            {personagensDisponiveis.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button data-testid="det-vincular-personagem-mesa" onClick={vincularPersonagemAMesa} disabled={!personagemParaVincular} style={{ ...btn, opacity: personagemParaVincular ? 1 : 0.5 }}>
            Vincular à mesa
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            data-testid="det-novo-personagem-nome"
            value={novoPersonagemNome}
            onChange={(e) => setNovoPersonagemNome(e.target.value)}
            placeholder="Nome do novo personagem"
            style={{ ...input, flex: 1 }}
          />
          <button data-testid="det-criar-personagem" onClick={criarPersonagemNaMesa} disabled={!novoPersonagemNome.trim()} style={{ ...btn, opacity: novoPersonagemNome.trim() ? 1 : 0.5 }}>
            Criar personagem novo
          </button>
        </div>
        <Link
          href={`/mesas/${campaign.id}/personagens/novo`}
          data-testid="det-abrir-assistente-criacao"
          style={{ ...btn, textDecoration: "none", display: "inline-block", marginBottom: 12, marginRight: 8 }}
        >
          Assistente de criação completo
        </Link>
        <Link
          href={`/mesas/${campaign.id}/livro`}
          data-testid="det-abrir-livro"
          style={{ ...btn, textDecoration: "none", display: "inline-block", marginBottom: 12 }}
        >
          Livro
        </Link>
        {personagensAtivosDaMesa.length === 0 && (
          <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhum personagem vinculado a esta mesa ainda.</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {personagensAtivosDaMesa.map((c) => {
            const controladores = controladoresDe(c.id);
            const jogadoresSemControle = jogadoresAtivos.filter((m) => !controladores.some((ctrl) => ctrl.user_id === m.user_id));
            return (
              <div key={c.id} data-testid="det-personagem-mesa" style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <strong>{c.name}</strong>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button data-testid={`det-renomear-personagem-${c.id}`} onClick={() => renomearPersonagem(c.id, c.name)} style={btn}>
                      Renomear
                    </button>
                    <button data-testid={`det-duplicar-personagem-${c.id}`} onClick={() => duplicarPersonagem(c.id)} style={btn}>
                      Duplicar
                    </button>
                    <button data-testid={`det-arquivar-personagem-${c.id}`} onClick={() => arquivarPersonagem(c.id, c.name)} style={btn}>
                      Arquivar
                    </button>
                    <button data-testid={`det-desvincular-personagem-${c.id}`} onClick={() => desvincularPersonagemDaMesa(c.id)} style={btn}>
                      Desvincular da mesa
                    </button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, opacity: 0.6 }}>
                    Controlado por: {controladores.length === 0 ? "ninguém (sem jogador)" : controladores.map((ctrl) => ctrl.user_id).join(", ")}
                  </span>
                  {controladores.map((ctrl) => (
                    <button key={ctrl.user_id} data-testid={`det-remover-controle-${c.id}-${ctrl.user_id}`} onClick={() => removerControle(c.id, ctrl.user_id)} style={{ ...btn, fontSize: 11 }}>
                      Remover controle de {ctrl.user_id}
                    </button>
                  ))}
                  {jogadoresSemControle.length > 0 && (
                    <select
                      data-testid={`det-personagem-conceder-controle-${c.id}`}
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) concederControle(c.id, e.target.value);
                        e.target.value = "";
                      }}
                      style={input}
                    >
                      <option value="">— conceder controle a —</option>
                      {jogadoresSemControle.map((m) => (
                        <option key={m.user_id} value={m.user_id}>{m.user_id}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {personagensArquivadosDaMesa.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, opacity: 0.5, marginBottom: 8 }}>
              Personagens arquivados ({personagensArquivadosDaMesa.length})
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {personagensArquivadosDaMesa.map((c) => (
                <div key={c.id} data-testid="det-personagem-arquivado" style={{ ...card, opacity: 0.7, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span>{c.name}</span>
                  <button data-testid={`det-restaurar-personagem-${c.id}`} onClick={() => restaurarPersonagem(c.id, c.name)} style={btn}>
                    Restaurar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Resolução completa de ataque: reação defensiva, margem→região, MIT/PD e dano (PRD 6.4/8.1/8.6/8.7). */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={h2}>Resolver Ataque</h2>
        <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
          Informe os totais JÁ ROLADOS de ataque e defesa (pela aba Rolagens da ficha, ou
          verbalmente) — maior total vence, empate favorece o defensor. Se uma reação defensiva
          for escolhida, o sistema consome 1 Reação do alvo ao calcular a margem (mesmo se a
          defesa falhar). Em caso de acerto, escolha a região liberada pela margem para aplicar
          MIT/PD e dano. A arma usada é opcional e serve apenas para sugerir propriedades
          críticas, nunca para aplicá-las automaticamente.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <select
            data-testid="det-ataque-atacante-select"
            value={ataqueAtacanteId}
            onChange={(e) => {
              setAtaqueAtacanteId(e.target.value);
              setAtaqueItemInstanceId("");
            }}
            style={input}
          >
            <option value="">— atacante —</option>
            {personagensAtivosDaMesa.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select
            data-testid="det-ataque-item-select"
            value={ataqueItemInstanceId}
            onChange={(e) => setAtaqueItemInstanceId(e.target.value)}
            style={input}
          >
            <option value="">— arma usada (opcional) —</option>
            {ataqueArmas.map((item) => <option key={item.id} value={item.id}>{item.itemNome}</option>)}
          </select>
          <select data-testid="det-ataque-alvo-select" value={ataqueAlvoId} onChange={(e) => setAtaqueAlvoId(e.target.value)} style={input}>
            <option value="">— alvo —</option>
            {personagensAtivosDaMesa.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <input data-testid="det-ataque-total-ataque" type="number" placeholder="Total do ataque" value={ataqueTotalAtaque} onChange={(e) => setAtaqueTotalAtaque(e.target.value)} style={{ ...input, width: 140 }} />
          <input data-testid="det-ataque-total-defesa" type="number" placeholder="Total da defesa" value={ataqueTotalDefesa} onChange={(e) => setAtaqueTotalDefesa(e.target.value)} style={{ ...input, width: 140 }} />
          <select
            data-testid="det-ataque-defesa-tipo"
            value={ataqueDefesaTipo}
            onChange={(e) => setAtaqueDefesaTipo(e.target.value as DefenseType | "nenhuma")}
            style={input}
          >
            <option value="nenhuma">Sem reação declarada</option>
            {(["esquivar", "aparar", "bloquear", "resistir"] as DefenseType[]).map((tipo) => (
              <option key={tipo} value={tipo}>{DEFENSE_TYPE_LABELS[tipo]}</option>
            ))}
          </select>
          <input data-testid="det-ataque-formula-dano" type="text" placeholder="Fórmula de dano (ex.: 1d6+2)" value={ataqueFormulaDano} onChange={(e) => setAtaqueFormulaDano(e.target.value)} style={{ ...input, width: 180 }} />
          <input data-testid="det-ataque-tipo-dano" type="text" placeholder="Tipo de dano" value={ataqueTipoDano} onChange={(e) => setAtaqueTipoDano(e.target.value)} style={{ ...input, width: 120 }} />
          <input data-testid="det-ataque-subtipo-dano" type="text" placeholder="Subtipo de dano (opcional: perfurante, acido...)" value={ataqueSubtipoDano} onChange={(e) => setAtaqueSubtipoDano(e.target.value)} style={{ ...input, width: 220 }} />
        </div>
        <button
          data-testid="det-calcular-margem"
          onClick={handleCalcularMargem}
          disabled={ataqueProcessing}
          style={{ ...btn, opacity: ataqueProcessing ? 0.6 : 1 }}
        >
          {ataqueProcessing ? "Calculando…" : "Calcular Margem"}
        </button>
        {ataqueReacaoAviso && (
          <p data-testid="det-ataque-reacao-aviso" style={{ fontSize: 12, color: "#e0b95c", marginTop: 8 }}>
            {ataqueReacaoAviso}
          </p>
        )}
        {ataqueResultado && (
          <p data-testid="det-ataque-resultado" style={{ fontSize: 12, opacity: 0.85, marginTop: 10 }}>
            {ataqueResultado}
          </p>
        )}
        {ataqueMargemPendente && (
          <div data-testid="det-ataque-margem-pendente" style={{ ...card, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            <strong>Margem {ataqueMargemPendente.margin} ({ataqueMargemPendente.band.band}) — escolha a região atingida</strong>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select
                data-testid="det-ataque-regiao-select"
                value={ataqueRegiaoEscolhida}
                onChange={(e) => setAtaqueRegiaoEscolhida(e.target.value as BodyRegion)}
                style={input}
              >
                <option value="">— região —</option>
                {ataqueMargemPendente.band.allowedRegions.map((regiao) => (
                  <option key={regiao} value={regiao}>{BODY_REGION_LABELS[regiao]}</option>
                ))}
              </select>
              <button
                data-testid="det-aplicar-dano"
                onClick={handleAplicarDano}
                disabled={ataqueProcessing || !ataqueRegiaoEscolhida}
                style={{ ...btn, opacity: ataqueProcessing || !ataqueRegiaoEscolhida ? 0.6 : 1 }}
              >
                {ataqueProcessing ? "Aplicando…" : "Aplicar Dano"}
              </button>
              <button data-testid="det-cancelar-ataque-pendente" onClick={handleCancelarAtaquePendente} disabled={ataqueProcessing} style={btn}>
                Cancelar
              </button>
            </div>
          </div>
        )}
        {ataqueSugestoesCriticas.length > 0 && (
          <div data-testid="det-ataque-propriedades-criticas" style={{ ...card, marginTop: 8 }}>
            <strong>Propriedades críticas — lembretes manuais</strong>
            {ataqueSugestoesCriticas.map((suggestion) => (
              <p key={suggestion.id} style={{ margin: "4px 0 0", fontSize: 12 }}>
                {suggestion.name}: {suggestion.text} Origem: {suggestion.origins.join(", ")}.
              </p>
            ))}
          </div>
        )}
      </section>

      {/* Participantes (campaign_members) — versão mínima da Fase 1; painel
          completo "Jogadores e convites" com nome de exibição é Fase 3/4. */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={h2}>Participantes ({membros.length})</h2>
        <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
          Quem aceitou um convite desta campanha. Conceder/remover controle de personagem é feito na
          seção "Personagens da mesa" acima.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {membros.map((m) => (
            <div key={m.id} data-testid="det-membro" style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "monospace", fontSize: 12 }}>{m.user_id}</span>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 11, opacity: 0.7 }}>{m.role === "owner" ? "Narrador" : "Jogador"} · {m.status}</span>
                {m.role !== "owner" && m.status === "active" && (
                  <button data-testid={`det-remover-participante-${m.user_id}`} onClick={() => removerParticipante(m.user_id)} style={btn}>
                    Remover
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Convites — dois tipos (aditivo §6/§7): limpo (reutilizável, sempre
          Jogador) e por e-mail (ativação automática para a conta certa). */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={h2}>Convites ({convites.length})</h2>

        <h3 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, opacity: 0.5, marginBottom: 8 }}>Convite por e-mail</h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <input data-testid="det-convite-email" type="email" value={conviteEmail} onChange={(e) => setConviteEmail(e.target.value)} placeholder="e-mail@exemplo.com" style={{ ...input, flex: 1, minWidth: 180 }} />
          <input data-testid="det-convite-email-label" value={conviteEmailLabel} onChange={(e) => setConviteEmailLabel(e.target.value)} placeholder="Rótulo (opcional)" style={{ ...input, flex: 1, minWidth: 140 }} />
          <button data-testid="det-criar-convite-email" onClick={criarConviteEmail} disabled={!conviteEmail.trim()} style={{ ...btn, opacity: conviteEmail.trim() ? 1 : 0.5 }}>
            Convidar por e-mail
          </button>
        </div>

        <h3 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, opacity: 0.5, marginBottom: 8 }}>Convite limpo</h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input data-testid="det-convite-label" value={conviteLabel} onChange={(e) => setConviteLabel(e.target.value)} placeholder="Rótulo (opcional)" style={{ ...input, flex: 1 }} />
          <button data-testid="det-criar-convite" onClick={criarConvite} style={btn}>Gerar convite limpo</button>
        </div>

        {linkNovo && (
          <div data-testid="det-link-novo" style={{ background: "#15301a", border: "1px solid #2a5a35", borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12 }}>
            <div style={{ opacity: 0.7, marginBottom: 4 }}>Link (mostrado só agora):</div>
            <code style={{ wordBreak: "break-all" }}>{linkNovo}</code>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {convites.map((c) => {
            const revogado = c.revoked_at != null || !c.is_active;
            const status = revogado ? "Revogado" : c.kind === "email" ? (c.activated_at ? "Ativado" : "Pendente") : "Ativo";
            const statusColor = revogado ? "#ff6b6b" : c.kind === "email" && !c.activated_at ? "#f5a623" : "#7fd99a";
            return (
              <div key={c.id} data-testid="det-convite" style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span>
                  {c.kind === "email" ? `E-mail: ${c.email}` : c.label ?? "(sem rótulo)"} ·{" "}
                  <span style={{ color: statusColor, fontSize: 11 }}>{status}</span>
                </span>
                <button data-testid={`det-revogar-${c.id}`} onClick={() => revogar(c.id)} disabled={revogado} style={{ ...btn, opacity: revogado ? 0.5 : 1 }}>Revogar</button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Log (narrador vê tudo) */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ ...h2, marginBottom: 0 }}>Log da mesa ({logs.length})</h2>
          <button data-testid="det-atualizar-log" onClick={reloadLogs} style={btn}>Atualizar</button>
        </div>
        <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>Como narrador dono, você vê tudo (public/private/gm).</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {logs.map((e) => (
            <div key={e.id} data-testid="det-log" style={{ ...card, fontSize: 12 }}>
              <span style={{ opacity: 0.5, fontSize: 11 }}>[{e.visibility}] {e.type}</span>{" "}
              {formatTableLogEntry(e)}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
