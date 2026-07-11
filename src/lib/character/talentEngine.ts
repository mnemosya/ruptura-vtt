/**
 * Engine de operação canônica de talentos (checkpoint CP1).
 *
 * Camada de leitura/derivação ÚNICA sobre o catálogo canônico
 * (`content_documents`, `db_talentos_normalizado_v1_3.json`) e o estado
 * de instância no personagem (`talentos_adquiridos`, `talentos_estado`,
 * `efeitos_temporarios`). NUNCA inventa regra, nunca lista talento
 * manualmente: só interpreta os campos já presentes no payload.
 *
 * Reaproveita os primitivos de `talents.ts` (modificadores passivos,
 * usos/cadência, toggles, efeitos temporários) e adiciona:
 *   - API canônica nomeada (getTalentDefinition, getLearnedTalentLevels,
 *     getTalentCurrentLevel, getTalentUsageState, canUseTalent,
 *     consumeTalentUse, resetTalentCadence, getTalentPassiveModifiers,
 *     getTalentAvailableActions, getTalentContextualOpportunities);
 *   - catálogo de TODAS as cadências (turno/rodada/cena/combate/dia/
 *     sessão/missão/descanso longo/uma vez ao adquirir) com política de
 *     reset (automática vs manual — reset manual do narrador SEMPRE
 *     logado, nunca silencioso);
 *   - gatilhos tipados leves (TalentTrigger) que casam efeitos
 *     contextuais com eventos de mesa;
 *   - oportunidades contextuais (efêmeras derivadas + persistidas em
 *     `talentos_estado.oportunidades` só quando precisam sobreviver a
 *     reload);
 *   - construtores dos logs extras (talent_triggered,
 *     talent_opportunity_resolved, talent_resource_changed,
 *     talent_effect_applied) — sempre texto formatado, nunca JSON cru.
 */

import type { ActiveEffect } from "./activeEffects";
import type { Character } from "./types";
import {
  deriveActiveEffectsFromTalents,
  getTalentEffectKey,
  getTalentLevelEffects,
  getUsableTalentEffects,
  describeTalentEffect,
  resetTalentUses,
  type TalentContent,
  type TalentLevelContent,
  type TalentLevelEffect,
  type UsableTalentEffect,
} from "./talents";

// ---------------------------------------------------------------------
// Cadências canônicas
// ---------------------------------------------------------------------

export type TalentResetMode = "automatica" | "manual" | "permanente";

export interface TalentCadenceInfo {
  slug: string;
  label: string;
  /** Como a cadência renova o recurso no app. */
  reset: TalentResetMode;
  /** Evento canônico do app que dispara o reset automático (quando houver). */
  gatilhoReset?: "encerrar_rodada" | "encerrar_cena" | "descanso_longo";
}

/**
 * Todas as cadências do capítulo canônico. "turno" e "rodada" resetam no
 * Encerrar Rodada; "cena"/"combate" no Encerrar Cena; "dia"/"descanso
 * longo" no descanso longo. "sessão", "sessao_malha", "missão" e "uma vez
 * ao adquirir" não têm gatilho canônico no app — reset manual do narrador
 * (sempre logado). "permanente"/"ao adquirir" nunca reseta.
 */
export const TALENT_CADENCES: Record<string, TalentCadenceInfo> = {
  turno: { slug: "turno", label: "por turno", reset: "automatica", gatilhoReset: "encerrar_rodada" },
  rodada: { slug: "rodada", label: "por rodada", reset: "automatica", gatilhoReset: "encerrar_rodada" },
  cena: { slug: "cena", label: "por cena", reset: "automatica", gatilhoReset: "encerrar_cena" },
  combate: { slug: "combate", label: "por combate", reset: "automatica", gatilhoReset: "encerrar_cena" },
  dia: { slug: "dia", label: "por dia", reset: "automatica", gatilhoReset: "descanso_longo" },
  descanso_longo: { slug: "descanso_longo", label: "por descanso longo", reset: "automatica", gatilhoReset: "descanso_longo" },
  sessao: { slug: "sessao", label: "por sessão", reset: "manual" },
  sessao_malha: { slug: "sessao_malha", label: "por sessão de Malha", reset: "manual" },
  missao: { slug: "missao", label: "por missão", reset: "manual" },
  permanente: { slug: "permanente", label: "permanente", reset: "permanente" },
  ao_adquirir: { slug: "ao_adquirir", label: "uma vez ao adquirir", reset: "permanente" },
};

/** Cadências que o app reseta sozinho a partir de eventos canônicos. */
export const AUTO_RESET_CADENCES = new Set(
  Object.values(TALENT_CADENCES).filter((c) => c.reset === "automatica").map((c) => c.slug),
);

/** Cadências dos eventos → lista de slugs a resetar. */
export function cadencesForEvent(evento: TalentCadenceInfo["gatilhoReset"]): string[] {
  return Object.values(TALENT_CADENCES)
    .filter((c) => c.gatilhoReset === evento)
    .map((c) => c.slug);
}

export function describeCadence(cadencia: string | null | undefined): string {
  if (!cadencia) return "sem cadência";
  return TALENT_CADENCES[cadencia]?.label ?? cadencia.replace(/_/g, " ");
}

export function cadenceResetsAutomatically(cadencia: string | null | undefined): boolean {
  return cadencia != null && AUTO_RESET_CADENCES.has(cadencia);
}

// ---------------------------------------------------------------------
// Classificação de padrão operacional (os 4 destinos do capítulo)
// ---------------------------------------------------------------------

export type TalentOperationPattern = "automatico" | "contextual" | "atividade" | "narrativo";

const CONTEXTUAL_FAMILIES = new Set(["reacao", "buff_empilhavel", "aplicar_condicao", "propagacao_efeito"]);
const CONTEXTUAL_TIPOS = new Set([
  "promocao_margem",
  "piso_margem",
  "forcar_margem",
  "substituir_bonus_acao",
  "reposicionamento_pos_acerto",
  "marcar_inimigo_afetado",
  "companheiro_script",
]);
const NARRATIVE_TIPOS = new Set([
  "acao_narrativa",
  "invocar_contato",
  "encontrar_local_seguro",
  "escape_narrativo",
  "recrutar_pn_aliado_temporario",
  "compra_fiada",
  "ler_vulnerabilidade_social",
  "forcar_abertura_social",
  "briefing_pre_cena",
  "marcar_alvo_ou_detalhe",
]);
const ACTIVITY_FAMILIES = new Set(["dado_gatilho", "recurso", "economia_loja", "runa", "magia"]);

/** Classifica UM efeito num dos 4 padrões operacionais (só campos do payload). */
export function classifyTalentEffect(efeito: TalentLevelEffect): TalentOperationPattern {
  const familia = typeof efeito.familia === "string" ? efeito.familia : "";
  const tipo = efeito.tipo;
  // Modificador passivo de rolagem aplicado direto no fluxo.
  if (tipo === "modificador") return "automatico";
  if (NARRATIVE_TIPOS.has(tipo)) return "narrativo";
  // Atividade própria: tem contador de uso OU é recurso/loja/runa acionável.
  const temUsos = typeof efeito.usos === "number" && efeito.usos > 0;
  if (tipo === "toggle_condicional") return "contextual";
  if (CONTEXTUAL_FAMILIES.has(familia) || CONTEXTUAL_TIPOS.has(tipo)) return "contextual";
  if (ACTIVITY_FAMILIES.has(familia) || temUsos) return "atividade";
  if (familia === "companheiro") return "atividade";
  if (familia === "troca_atributo") return "automatico";
  if (familia === "trama") return "atividade";
  // Modificadores estruturais passivos (alcance de magia, espaços de runa, etc.).
  return "automatico";
}

// ---------------------------------------------------------------------
// API canônica — definição, níveis aprendidos, nível atual
// ---------------------------------------------------------------------

export function getTalentDefinition(talents: TalentContent[], talentoId: string): TalentContent | null {
  return talents.find((t) => t.id === talentoId || t.slug === talentoId) ?? null;
}

export interface LearnedTalentLevel {
  talent: TalentContent;
  nivel: TalentLevelContent;
  acquiredId: string;
  adquiridoEm: string;
}

/** Todos os NÍVEIS de talento adquiridos, resolvidos contra o catálogo (ordenados por árvore/nível). */
export function getLearnedTalentLevels(
  character: Pick<Character, "talentos_adquiridos">,
  talents: TalentContent[],
): LearnedTalentLevel[] {
  const acquired = character.talentos_adquiridos ?? [];
  const byLevelId = new Map(acquired.map((a) => [a.nivelId, a]));
  const out: LearnedTalentLevel[] = [];
  for (const talent of talents) {
    if (talent.status !== "published") continue;
    for (const nivel of talent.niveis) {
      const a = byLevelId.get(nivel.id);
      if (!a) continue;
      out.push({ talent, nivel, acquiredId: a.id, adquiridoEm: a.adquiridoEm });
    }
  }
  return out.sort((x, y) => x.talent.nome.localeCompare(y.talent.nome) || x.nivel.nivel - y.nivel.nivel);
}

/** Maior nível adquirido de uma árvore (0 = nenhum). */
export function getTalentCurrentLevel(
  character: Pick<Character, "talentos_adquiridos">,
  talents: TalentContent[],
  talentoId: string,
): number {
  const def = getTalentDefinition(talents, talentoId);
  if (!def) return 0;
  const levelIds = new Set(def.niveis.map((n) => n.id));
  const acquired = (character.talentos_adquiridos ?? []).filter((a) => levelIds.has(a.nivelId));
  return acquired.reduce((max, a) => Math.max(max, a.nivel), 0);
}

// ---------------------------------------------------------------------
// Estado de uso / recurso
// ---------------------------------------------------------------------

export interface TalentUsageState {
  key: string;
  usosMax: number | null;
  usosGastos: number;
  usosRestantes: number | null;
  cadencia: string | null;
  esgotado: boolean;
}

export function getTalentUsageState(
  character: Pick<Character, "talentos_estado">,
  key: string,
  usosMax: number | null,
  cadencia: string | null,
): TalentUsageState {
  const usados = character.talentos_estado?.usos?.[key]?.usados ?? 0;
  const restantes = usosMax == null ? null : Math.max(0, usosMax - usados);
  return {
    key,
    usosMax,
    usosGastos: usados,
    usosRestantes: restantes,
    cadencia,
    esgotado: usosMax != null && usados >= usosMax,
  };
}

export interface CanUseResult {
  ok: boolean;
  reason?: string;
}

/** Checa se um efeito usável pode ser usado agora (usos + PA). Não muta. */
export function canUseTalent(usable: UsableTalentEffect, paDisponivel: number): CanUseResult {
  if (usable.kind !== "limited_use") return { ok: false, reason: "Efeito não é de usos limitados." };
  if (usable.usosMax != null && usable.usosGastos >= usable.usosMax) {
    return { ok: false, reason: `Sem usos restantes (${usable.usosGastos}/${usable.usosMax} ${describeCadence(usable.cadencia)}).` };
  }
  if (usable.custoPa != null && usable.custoPa > paDisponivel) {
    return { ok: false, reason: `PA insuficiente (atual: ${paDisponivel}, necessário: ${usable.custoPa}).` };
  }
  return { ok: true };
}

/**
 * Reset de UMA cadência inteira — usado pelos gatilhos automáticos e
 * pelo reset manual do narrador. Delega a `resetTalentUses`; devolve o
 * mesmo objeto quando nada muda. O CHAMADOR deve logar o reset (manual
 * nunca é silencioso).
 */
export function resetTalentCadence(character: Character, cadencia: string): { character: Character; resetCount: number } {
  return resetTalentUses(character, [cadencia]);
}

// ---------------------------------------------------------------------
// Recursos próprios (ex.: dados de gatilho do Pistoleiro)
// ---------------------------------------------------------------------

export interface TalentResourceState {
  key: string;
  disponivel: number;
  max: number;
  cadenciaRecuperacao: string | null;
}

export function getTalentResourceState(
  character: Pick<Character, "talentos_estado">,
  key: string,
  max: number,
  cadenciaRecuperacao: string | null,
): TalentResourceState {
  const stored = character.talentos_estado?.recursos?.[key];
  return {
    key,
    disponivel: stored?.disponivel ?? max,
    max: stored?.max ?? max,
    cadenciaRecuperacao: stored?.cadenciaRecuperacao ?? cadenciaRecuperacao,
  };
}

/** Ajusta a reserva de um recurso (delta negativo = gastar). Faz clamp em [0, max]. */
export function adjustTalentResource(
  character: Character,
  key: string,
  delta: number,
  max: number,
  cadenciaRecuperacao: string | null,
  nowIso: string,
): { character: Character; state: TalentResourceState } {
  const before = getTalentResourceState(character, key, max, cadenciaRecuperacao);
  const disponivel = Math.max(0, Math.min(before.max, before.disponivel + delta));
  const recursos = { ...(character.talentos_estado?.recursos ?? {}) };
  recursos[key] = { disponivel, max: before.max, cadenciaRecuperacao: before.cadenciaRecuperacao, atualizadoEm: nowIso };
  return {
    character: { ...character, talentos_estado: { ...character.talentos_estado, recursos } },
    state: { key, disponivel, max: before.max, cadenciaRecuperacao: before.cadenciaRecuperacao },
  };
}

// ---------------------------------------------------------------------
// Modificadores passivos / atividades disponíveis
// ---------------------------------------------------------------------

/** Modificadores passivos (padrão "automático") aplicados direto nas rolagens. */
export function getTalentPassiveModifiers(
  character: Pick<Character, "talentos_adquiridos">,
  talents: TalentContent[],
): ActiveEffect[] {
  return deriveActiveEffectsFromTalents(character, talents);
}

/** Efeitos com botão próprio (usos limitados) — o padrão "atividade própria". */
export function getTalentAvailableActions(
  character: Pick<Character, "talentos_adquiridos" | "talentos_estado" | "efeitos_temporarios">,
  talents: TalentContent[],
): UsableTalentEffect[] {
  return getUsableTalentEffects(character, talents).filter((u) => u.kind === "limited_use");
}

// ---------------------------------------------------------------------
// Gatilhos tipados + oportunidades contextuais
// ---------------------------------------------------------------------

export type TalentTriggerType =
  | "sofrer_dano"
  | "atacar"
  | "defender"
  | "inimigo_erra"
  | "critico"
  | "chegar_a_zero_pv"
  | "aliado_em_queda"
  | "aplicar_efeito_positivo"
  | "aplicar_efeito_negativo"
  | "ataque_furtivo"
  | "mirar";

export interface TalentTrigger {
  type: TalentTriggerType;
  /** Contexto livre para casar com `efeito.contexto`/`gatilho` (opcional). */
  detalhe?: string;
}

/** Mapa gatilho-do-app → substrings que aparecem em `efeito.gatilho`/`contexto`/`tipo`. */
const TRIGGER_MATCHERS: Record<TalentTriggerType, string[]> = {
  sofrer_dano: ["sofrer_dano", "sofre dano", "buff_empilhavel"],
  atacar: ["atacar", "ataque", "acerto"],
  defender: ["bloquear", "aparar", "desviar", "defensiva"],
  inimigo_erra: ["inimigo", "erra", "reacao_gatilho", "erro"],
  critico: ["critico", "crítico"],
  chegar_a_zero_pv: ["zero_pv", "0 pv", "prevenir_zero"],
  aliado_em_queda: ["queda", "aliado", "0_pv", "estabilizar"],
  aplicar_efeito_positivo: ["efeito_positivo", "positivo", "bencao"],
  aplicar_efeito_negativo: ["efeito_negativo", "negativo", "marca", "contagio"],
  ataque_furtivo: ["furtiv", "nao percebe", "não percebe", "não percebe sua presença"],
  mirar: ["mirar", "mira"],
};

export interface TalentContextualOpportunity {
  id: string;
  talentNome: string;
  nivelNome: string;
  nivelId: string;
  efeitoIndex: number;
  pattern: TalentOperationPattern;
  rotulo: string;
  descricao: string;
  /** true quando veio de `talentos_estado.oportunidades` (persistida). */
  persistida: boolean;
}

/**
 * Oportunidades contextuais dos talentos adquiridos — efeitos que
 * disparam em GATILHO de evento (padrão "contextual"). Sem `trigger`,
 * devolve todas as oportunidades latentes (para a aba mostrar "dispara
 * quando…"); com `trigger`, filtra as que casam com o evento atual.
 * Sempre inclui as oportunidades PERSISTIDAS em `talentos_estado`.
 */
export function getTalentContextualOpportunities(
  character: Pick<Character, "talentos_adquiridos" | "talentos_estado">,
  talents: TalentContent[],
  trigger?: TalentTrigger,
): TalentContextualOpportunity[] {
  const out: TalentContextualOpportunity[] = [];
  const learned = getLearnedTalentLevels(character, talents);

  for (const { talent, nivel } of learned) {
    getTalentLevelEffects(nivel).forEach((efeito, index) => {
      if (classifyTalentEffect(efeito) !== "contextual") return;
      const haystack = [
        efeito.tipo,
        typeof efeito.familia === "string" ? efeito.familia : "",
        typeof efeito.gatilho === "string" ? efeito.gatilho : "",
        typeof efeito.contexto === "string" ? efeito.contexto : "",
      ]
        .join(" ")
        .toLowerCase();

      if (trigger) {
        const matchers = TRIGGER_MATCHERS[trigger.type] ?? [];
        if (!matchers.some((m) => haystack.includes(m.toLowerCase()))) return;
      }

      out.push({
        id: `${nivel.id}:${index}`,
        talentNome: talent.nome,
        nivelNome: nivel.nome,
        nivelId: nivel.id,
        efeitoIndex: index,
        pattern: "contextual",
        rotulo: `${talent.nome} — ${nivel.nome}`,
        descricao: describeTalentEffect(efeito),
        persistida: false,
      });
    });
  }

  for (const p of character.talentos_estado?.oportunidades ?? []) {
    out.push({
      id: p.id,
      talentNome: p.talentoNome,
      nivelNome: "",
      nivelId: p.nivelId,
      efeitoIndex: p.efeitoIndex,
      pattern: "contextual",
      rotulo: p.rotulo,
      descricao: p.contexto ?? p.rotulo,
      persistida: true,
    });
  }

  return out;
}

/** Registra uma oportunidade contextual PERSISTIDA (que precisa sobreviver a reload). */
export function addPersistedOpportunity(
  character: Character,
  op: { talentoNome: string; nivelId: string; efeitoIndex: number; rotulo: string; contexto?: string },
  id: string,
  nowIso: string,
): Character {
  const lista = character.talentos_estado?.oportunidades ?? [];
  return {
    ...character,
    talentos_estado: {
      ...character.talentos_estado,
      oportunidades: [...lista, { id, ...op, criadaEm: nowIso }],
    },
  };
}

/** Resolve (remove) uma oportunidade persistida pelo id. Devolve o mesmo objeto se não existir. */
export function resolvePersistedOpportunity(character: Character, id: string): Character {
  const lista = character.talentos_estado?.oportunidades;
  if (!lista || !lista.some((o) => o.id === id)) return character;
  return {
    ...character,
    talentos_estado: { ...character.talentos_estado, oportunidades: lista.filter((o) => o.id !== id) },
  };
}

// ---------------------------------------------------------------------
// Construtores de log (texto formatado — nunca JSON cru)
// ---------------------------------------------------------------------

export interface TalentLogPayload {
  type: "talent_triggered" | "talent_opportunity_resolved" | "talent_resource_changed" | "talent_effect_applied";
  message: string;
  data: Record<string, unknown>;
}

export function buildTalentTriggeredLog(op: TalentContextualOpportunity, trigger: TalentTrigger): TalentLogPayload {
  return {
    type: "talent_triggered",
    message: `Gatilho de talento: ${op.rotulo} — ${op.descricao} (evento: ${trigger.type.replace(/_/g, " ")}).`,
    data: { nivelId: op.nivelId, efeitoIndex: op.efeitoIndex, trigger: trigger.type, rotulo: op.rotulo },
  };
}

export function buildTalentOpportunityResolvedLog(op: TalentContextualOpportunity, desfecho: string): TalentLogPayload {
  return {
    type: "talent_opportunity_resolved",
    message: `Oportunidade de talento resolvida: ${op.rotulo} — ${desfecho}.`,
    data: { id: op.id, nivelId: op.nivelId, efeitoIndex: op.efeitoIndex, desfecho },
  };
}

export function buildTalentResourceChangedLog(
  talentNome: string,
  state: TalentResourceState,
  delta: number,
): TalentLogPayload {
  const verbo = delta < 0 ? "gastou" : "recuperou";
  return {
    type: "talent_resource_changed",
    message: `${talentNome}: ${verbo} ${Math.abs(delta)} — reserva ${state.disponivel}/${state.max}.`,
    data: { key: state.key, disponivel: state.disponivel, max: state.max, delta },
  };
}

export function buildTalentEffectAppliedLog(
  talentNome: string,
  nivelNome: string,
  descricao: string,
  reminders: string[] = [],
): TalentLogPayload {
  const extras = reminders.length > 0 ? ` · ${reminders.join(" · ")}` : "";
  return {
    type: "talent_effect_applied",
    message: `${talentNome} — ${nivelNome}: ${descricao}${extras}.`,
    data: { talento: talentNome, nivel: nivelNome, descricao, reminders },
  };
}
