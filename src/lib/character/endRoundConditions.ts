/**
 * Fim de rodada real para condições data-driven — checkpoint v0.44.
 *
 * A fonte de verdade é o payload de `content_conditions` (C2) — este
 * módulo só interpreta os TIPOS de efeito já publicados em
 * `payload_automacao.efeitos` (dano_fim_de_rodada, teste_fim_de_rodada,
 * teste_fim_de_rodada_para_remover_condicao, teste_apos_exposicao,
 * reduzir_pa) e executa a fração determinística (dano) ou cria
 * pendência (teste) — NUNCA lista regra de condição hardcoded como
 * fonte primária. Não reimplementa `remover_ao_recuperar_pv`: essa
 * regra já existe em `autoHeal.ts` (checkpoint v0.34) e continua sendo
 * a fonte para Sangrando/Contundido/Envenenado saírem ao curar 1+ PV.
 *
 * Fora de escopo aqui (ver `EFFECT_TYPE` não tratado): mapa/token/alvo,
 * ataque contestado, dano de arma, `aplicar_condicao_apos_tempo`,
 * `morte_apos_tempo` (Sufocando), `alterar_custo_mana` e modificadores
 * de conjuração (Saturado/Insaturado, motor de magia não existe ainda),
 * efeitos ambientais complexos — todos ficam de fora silenciosamente
 * (não geram pendência nem erro), documentados como pendência no
 * relatório.
 */

import { normalizeConditionSlug } from "./actionConsole";
import { detectCollapseOnResourceChange } from "./collapse";
import type { ActiveCondition, Character, ConditionEffectHistoryEntry, ConditionResistanceCheck } from "./types";

// ---------------------------------------------------------------------
// Conteúdo bruto de condição (subconjunto lido de content_documents.payload)
// ---------------------------------------------------------------------

export interface ConditionContent {
  id: string;
  slug: string;
  nome: string;
  categoria: string;
  status: string;
  payload_automacao?: unknown;
  remove_por?: unknown;
}

export interface ConditionEndRoundEffect {
  tipo: string;
  [key: string]: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Preserva o payload inteiro do registro — não achata nem descarta campos. */
export function normalizeConditionContent(raw: Record<string, unknown>): ConditionContent {
  return {
    id: String(raw.id ?? raw.slug ?? ""),
    slug: String(raw.slug ?? raw.id ?? ""),
    nome: String(raw.nome ?? raw.slug ?? "Condição"),
    categoria: String(raw.categoria ?? ""),
    status: String(raw.status ?? "published"),
    payload_automacao: raw.payload_automacao,
    remove_por: raw.remove_por,
  };
}

/** Efeitos de `payload_automacao.efeitos` da condição — array vazio se ausente/malformado. */
export function getConditionEndRoundEffects(condition: ConditionContent): ConditionEndRoundEffect[] {
  const payload = asRecord(condition.payload_automacao);
  const efeitos = payload?.efeitos;
  return Array.isArray(efeitos) ? (efeitos as ConditionEndRoundEffect[]) : [];
}

/**
 * `tipo` de efeito que este motor efetivamente resolve no ciclo de fim
 * de rodada (`resolveEndRoundConditionsForCharacter` acima e
 * `applyRoundScopedPaReductions`, mais abaixo) — a MESMA lista, não uma
 * cópia; se um novo `tipo` passar a ser tratado nessas funções, precisa
 * ser adicionado aqui também para o indicador continuar correto.
 */
const END_ROUND_EFFECT_TYPES = new Set([
  "dano_fim_de_rodada",
  "teste_fim_de_rodada",
  "teste_fim_de_rodada_para_remover_condicao",
  "teste_apos_exposicao",
  "reduzir_pa",
]);

/**
 * Indica se a condição tem pelo menos um efeito resolvido no ciclo de
 * fim de rodada — substitui o antigo `FIM_DE_RODADA_SLUGS` hardcoded
 * (achado A2 da auditoria v0.50, duplicado em `ActiveStateStrip.tsx` e
 * `endRound.ts`). Fonte única: `payload_automacao.efeitos`, não a tag
 * `"fim_de_rodada"` do payload (que Insaturado/Saturado não têm, mesmo
 * resolvendo no mesmo ritmo via `teste_apos_exposicao` — ver histórico
 * do achado). Condição sem payload válido devolve `false` — nunca
 * inventa um piso manual de slugs.
 */
export function conditionHasEndRoundEffect(condition: ConditionContent): boolean {
  return getConditionEndRoundEffects(condition).some((efeito) => END_ROUND_EFFECT_TYPES.has(efeito.tipo));
}

/** Slugs canônicos das condições ATIVAS do personagem (conditionId com prioridade sobre nome manual). */
export function getActiveConditionIds(character: Pick<Character, "condicoes_ativas">): string[] {
  const ids = new Set<string>();
  for (const c of character.condicoes_ativas ?? []) {
    if (!c.ativa) continue;
    const slug = c.conditionId ? normalizeConditionSlug(c.conditionId) : normalizeConditionSlug(c.nome);
    if (slug) ids.add(slug);
  }
  return [...ids];
}

function findActiveConditionInstance(character: Character, conditionSlug: string): ActiveCondition | undefined {
  return (character.condicoes_ativas ?? []).find(
    (c) =>
      c.ativa &&
      (c.conditionId ? normalizeConditionSlug(c.conditionId) : normalizeConditionSlug(c.nome)) === conditionSlug,
  );
}

// ---------------------------------------------------------------------
// Idempotência
// ---------------------------------------------------------------------

/**
 * Chave única de um efeito de fim de rodada/exposição — combina
 * characterId (implícito: o histórico já vive dentro do personagem),
 * conditionId, effectType e, quando fizer sentido, round/scene/índice
 * do efeito no payload. Usada tanto para o guard de idempotência
 * (dano/pendência) quanto para a cadência "uma vez por cena".
 */
export function getEndRoundEffectKey(params: {
  conditionId: string;
  effectType: string;
  round?: number;
  scene?: number;
  effectIndex?: number;
}): string {
  const parts = [params.conditionId, params.effectType];
  if (params.round != null) parts.push(`round:${params.round}`);
  if (params.scene != null) parts.push(`scene:${params.scene}`);
  if (params.effectIndex != null) parts.push(`idx:${params.effectIndex}`);
  return parts.join(":");
}

export function hasExposureCheckAlreadyHappenedThisScene(
  character: Pick<Character, "condition_effect_history">,
  conditionId: string,
  effectType: string,
  scene: number,
): boolean {
  const key = getEndRoundEffectKey({ conditionId, effectType, scene });
  return Boolean(character.condition_effect_history?.[key]);
}

export function markExposureCheckCreated(
  character: Character,
  conditionId: string,
  effectType: string,
  round: number,
  scene: number,
  nowIso: string,
): Character {
  const key = getEndRoundEffectKey({ conditionId, effectType, scene });
  const entry: ConditionEffectHistoryEntry = { conditionId, effectType, round, scene, createdAt: nowIso };
  return { ...character, condition_effect_history: { ...(character.condition_effect_history ?? {}), [key]: entry } };
}

// ---------------------------------------------------------------------
// Dano de condição (dano_fim_de_rodada)
// ---------------------------------------------------------------------

/** Rola "NdM" (ex.: "1d6") com RNG injetável — sem dependência do módulo de dice para não acoplar UI/parsing genérico. */
function rollConditionFormula(formula: string, rng: () => number): number {
  const match = /^(\d+)d(\d+)$/.exec(formula.trim());
  if (!match) return 0;
  const quantidade = Number(match[1]);
  const lados = Number(match[2]);
  let total = 0;
  for (let i = 0; i < quantidade; i++) {
    total += 1 + Math.floor(rng() * lados);
  }
  return total;
}

export interface ConditionDamageEvent {
  conditionId: string;
  conditionName: string;
  formula: string;
  damageType: string;
  rollResult: number;
  pvBefore: number;
  pvAfter: number;
}

export interface ApplyConditionDamageResult {
  character: Character;
  event: ConditionDamageEvent;
  collapseStarted: boolean;
  collapseTipo: "pv" | "pe" | null;
  collapseWarnings: string[];
}

/**
 * Aplica dano direto de condição ao PV (nunca MIT/PD/armadura/escudo,
 * nunca pede alvo) e aciona a lógica de Colapso já existente
 * (`detectCollapseOnResourceChange`, checkpoint v0.38) quando o PV
 * chega a 0.
 */
export function applyConditionEndRoundDamage(params: {
  character: Character;
  conditionId: string;
  conditionName: string;
  formula: string;
  damageType: string;
  nowIso: string;
  rng?: () => number;
}): ApplyConditionDamageResult {
  const rng = params.rng ?? Math.random;
  const rollResult = rollConditionFormula(params.formula, rng);
  const pvBefore = params.character.recursos_atuais?.pv ?? 0;
  const peAtual = params.character.recursos_atuais?.pe ?? 0;
  const pvAfter = Math.max(0, pvBefore - rollResult);

  const withDamage: Character = {
    ...params.character,
    recursos_atuais: { ...params.character.recursos_atuais, pv: pvAfter },
  };
  const collapse = detectCollapseOnResourceChange(
    withDamage,
    { pv: pvBefore, pe: peAtual },
    { pv: pvAfter, pe: peAtual },
    params.nowIso,
  );

  return {
    character: collapse.character,
    event: {
      conditionId: params.conditionId,
      conditionName: params.conditionName,
      formula: params.formula,
      damageType: params.damageType,
      rollResult,
      pvBefore,
      pvAfter,
    },
    collapseStarted: collapse.started,
    collapseTipo: collapse.tipo,
    collapseWarnings: collapse.warnings,
  };
}

// ---------------------------------------------------------------------
// Pendências de teste de resistência
// ---------------------------------------------------------------------

export function buildConditionResistanceCheck(params: {
  conditionId: string;
  conditionName: string;
  effectType: ConditionResistanceCheck["effectType"];
  round: number;
  scene: number;
  nowIso: string;
  resistance: { pericia: string; cd: number };
  onFailure?: unknown;
  onSuccess?: unknown;
  targetConditionId?: string;
}): ConditionResistanceCheck {
  return {
    id: crypto.randomUUID(),
    conditionId: params.conditionId,
    conditionName: params.conditionName,
    effectType: params.effectType,
    round: params.round,
    scene: params.scene,
    createdAt: params.nowIso,
    status: "pending",
    resistance: params.resistance,
    onFailure: params.onFailure,
    onSuccess: params.onSuccess,
    targetConditionId: params.targetConditionId,
    source: "end_round_condition",
  };
}

// ---------------------------------------------------------------------
// Orquestração de fim de rodada
// ---------------------------------------------------------------------

export interface EndRoundTableLog {
  type: string;
  payload: Record<string, unknown>;
}

export interface EndRoundConditionResult {
  character: Character;
  logs: string[];
  tableLogs: EndRoundTableLog[];
  damageEvents: ConditionDamageEvent[];
  pendingChecks: ConditionResistanceCheck[];
  removedConditions: string[];
  appliedConditions: string[];
  paReductions: { conditionId: string; conditionName: string; value: number }[];
  warnings: string[];
}

/**
 * Resolve os efeitos de fim de rodada das condições ATIVAS do
 * personagem para a rodada `round`/cena `scene` informadas — chamado
 * pelo botão "Encerrar Rodada" da ficha ANTES de renovar PA/Reações
 * (ver ordem operacional no relatório). Idempotente: reprocessar a
 * mesma `round` não duplica dano nem pendência (guard via
 * `condition_effect_history`).
 */
export function resolveEndRoundConditionsForCharacter(params: {
  character: Character;
  conditions: ConditionContent[];
  round: number;
  scene: number;
  nowIso: string;
  rng?: () => number;
}): EndRoundConditionResult {
  const { conditions, round, scene, nowIso } = params;
  let character = params.character;

  const logs: string[] = [];
  const tableLogs: EndRoundTableLog[] = [];
  const damageEvents: ConditionDamageEvent[] = [];
  const pendingChecks: ConditionResistanceCheck[] = [];
  const removedConditions: string[] = [];
  const appliedConditions: string[] = [];
  const paReductions: { conditionId: string; conditionName: string; value: number }[] = [];
  const warnings: string[] = [];

  const conditionBySlug = new Map(conditions.map((c) => [normalizeConditionSlug(c.slug), c]));
  const activeSlugs = getActiveConditionIds(character);
  const existingPending = character.pending_condition_checks ?? [];
  let history: Record<string, ConditionEffectHistoryEntry> = { ...(character.condition_effect_history ?? {}) };

  for (const slug of activeSlugs) {
    const instance = findActiveConditionInstance(character, slug);
    const content = conditionBySlug.get(slug);
    if (!instance || !content || content.status !== "published") continue;
    const effects = getConditionEndRoundEffects(content);

    effects.forEach((efeito, effectIndex) => {
      if (efeito.tipo === "dano_fim_de_rodada") {
        const key = getEndRoundEffectKey({ conditionId: slug, effectType: "dano_fim_de_rodada", round, effectIndex });
        if (history[key]) return; // idempotência: mesma rodada já processada.
        const formula = typeof efeito.dano === "string" ? efeito.dano : "";
        const damageType = typeof efeito.tipo_dano === "string" ? efeito.tipo_dano : "";
        if (!formula) return;
        const result = applyConditionEndRoundDamage({
          character,
          conditionId: slug,
          conditionName: content.nome,
          formula,
          damageType,
          nowIso,
          rng: params.rng,
        });
        character = result.character;
        damageEvents.push(result.event);
        history = { ...history, [key]: { conditionId: slug, effectType: "dano_fim_de_rodada", round, createdAt: nowIso } };
        logs.push(`${content.nome} causou ${result.event.rollResult} de dano ${damageType} no fim da rodada.`);
        tableLogs.push({
          type: "condition_end_round_damage",
          payload: {
            conditionId: slug,
            conditionName: content.nome,
            formula,
            rollResult: result.event.rollResult,
            damage: result.event.rollResult,
            damageType,
            resource: "pv",
            before: result.event.pvBefore,
            after: result.event.pvAfter,
            round,
            scene,
            source: "end_round",
          },
        });
        if (result.collapseStarted) {
          warnings.push(`Colapso (${result.collapseTipo}) iniciado por dano de condição (${content.nome}).`);
        }
      } else if (efeito.tipo === "teste_fim_de_rodada") {
        const key = getEndRoundEffectKey({ conditionId: slug, effectType: "teste_fim_de_rodada", round, effectIndex });
        if (history[key]) return;
        const jaPendente = existingPending.some(
          (p) => p.status === "pending" && p.conditionId === slug && p.effectType === "teste_fim_de_rodada" && p.round === round,
        );
        if (jaPendente) return;
        const resistance = asRecord(efeito.resistencia);
        if (!resistance || typeof resistance.pericia !== "string" || typeof resistance.cd !== "number") return;
        const check = buildConditionResistanceCheck({
          conditionId: slug,
          conditionName: content.nome,
          effectType: "teste_fim_de_rodada",
          round,
          scene,
          nowIso,
          resistance: { pericia: resistance.pericia, cd: resistance.cd },
          onFailure: efeito.falha,
        });
        pendingChecks.push(check);
        history = { ...history, [key]: { conditionId: slug, effectType: "teste_fim_de_rodada", round, createdAt: nowIso } };
        logs.push(`${content.nome}: teste de ${resistance.pericia} CD ${resistance.cd} pendente (fim de rodada).`);
        tableLogs.push({
          type: "condition_end_round_check_created",
          payload: {
            conditionId: slug,
            conditionName: content.nome,
            checkId: check.id,
            effectType: "teste_fim_de_rodada",
            resistance: check.resistance,
            onFailure: efeito.falha ?? null,
            onSuccess: null,
            round,
            scene,
          },
        });
      } else if (efeito.tipo === "teste_fim_de_rodada_para_remover_condicao") {
        const targetSlug = typeof efeito.condicao === "string" ? normalizeConditionSlug(efeito.condicao) : "";
        if (!targetSlug || !activeSlugs.includes(targetSlug)) return; // só se a condição referenciada estiver ativa.
        const key = getEndRoundEffectKey({
          conditionId: slug,
          effectType: "teste_fim_de_rodada_para_remover_condicao",
          round,
          effectIndex,
        });
        if (history[key]) return;
        const jaPendente = existingPending.some(
          (p) =>
            p.status === "pending" &&
            p.conditionId === slug &&
            p.effectType === "teste_fim_de_rodada_para_remover_condicao" &&
            p.round === round &&
            p.targetConditionId === targetSlug,
        );
        if (jaPendente) return;
        const resistance = asRecord(efeito.resistencia);
        if (!resistance || typeof resistance.pericia !== "string" || typeof resistance.cd !== "number") return;
        const check = buildConditionResistanceCheck({
          conditionId: slug,
          conditionName: content.nome,
          effectType: "teste_fim_de_rodada_para_remover_condicao",
          round,
          scene,
          nowIso,
          resistance: { pericia: resistance.pericia, cd: resistance.cd },
          targetConditionId: targetSlug,
        });
        pendingChecks.push(check);
        history = {
          ...history,
          [key]: { conditionId: slug, effectType: "teste_fim_de_rodada_para_remover_condicao", round, createdAt: nowIso },
        };
        logs.push(`${content.nome}: teste de ${resistance.pericia} CD ${resistance.cd} para remover ${targetSlug} pendente.`);
        tableLogs.push({
          type: "condition_end_round_check_created",
          payload: {
            conditionId: slug,
            conditionName: content.nome,
            checkId: check.id,
            effectType: "teste_fim_de_rodada_para_remover_condicao",
            resistance: check.resistance,
            targetConditionId: targetSlug,
            round,
            scene,
          },
        });
      } else if (efeito.tipo === "teste_apos_exposicao") {
        const aposRodadas = typeof efeito.apos_rodadas === "number" ? efeito.apos_rodadas : 1;
        const cadenciaCena = efeito.cadencia === "cena";

        // Marca o início da exposição na primeira vez que a condição é
        // observada ativa (chave sem round/scene — persiste enquanto a
        // condição permanecer ativa).
        const exposureStartKey = getEndRoundEffectKey({ conditionId: slug, effectType: "teste_apos_exposicao_inicio" });
        let exposureStartRound = history[exposureStartKey]?.round;
        if (exposureStartRound == null) {
          history = {
            ...history,
            [exposureStartKey]: { conditionId: slug, effectType: "teste_apos_exposicao_inicio", round, createdAt: nowIso },
          };
          exposureStartRound = round;
        }
        if (round - exposureStartRound < aposRodadas) return; // ainda dentro da janela de exposição.

        const jaNestaCena = cadenciaCena
          ? hasExposureCheckAlreadyHappenedThisScene({ condition_effect_history: history }, slug, "teste_apos_exposicao", scene)
          : Boolean(history[getEndRoundEffectKey({ conditionId: slug, effectType: "teste_apos_exposicao", round })]);
        if (jaNestaCena) return;
        const jaPendente = existingPending.some(
          (p) => p.status === "pending" && p.conditionId === slug && p.effectType === "teste_apos_exposicao",
        );
        if (jaPendente) return;

        const resistance = asRecord(efeito.resistencia);
        if (!resistance || typeof resistance.pericia !== "string" || typeof resistance.cd !== "number") return;
        const check = buildConditionResistanceCheck({
          conditionId: slug,
          conditionName: content.nome,
          effectType: "teste_apos_exposicao",
          round,
          scene,
          nowIso,
          resistance: { pericia: resistance.pericia, cd: resistance.cd },
          onFailure: efeito.falha,
        });
        pendingChecks.push(check);
        const characterWithMark = markExposureCheckCreated(
          { ...character, condition_effect_history: history },
          slug,
          "teste_apos_exposicao",
          round,
          scene,
          nowIso,
        );
        history = characterWithMark.condition_effect_history ?? history;
        logs.push(`${content.nome}: teste de exposição (${resistance.pericia} CD ${resistance.cd}) pendente.`);
        tableLogs.push({
          type: "condition_end_round_check_created",
          payload: {
            conditionId: slug,
            conditionName: content.nome,
            checkId: check.id,
            effectType: "teste_apos_exposicao",
            resistance: check.resistance,
            onFailure: efeito.falha ?? null,
            round,
            scene,
          },
        });
      }
      // reduzir_pa: tratado em applyRoundScopedPaReductions (depois da
      // renovação de PA da nova rodada). remover_ao_recuperar_pv: já
      // coberto por autoHeal.ts (v0.34) — não reimplementado aqui.
    });
  }

  character = {
    ...character,
    pending_condition_checks: [...existingPending, ...pendingChecks],
    condition_effect_history: history,
  };

  return {
    character,
    logs,
    tableLogs,
    damageEvents,
    pendingChecks,
    removedConditions,
    appliedConditions,
    paReductions,
    warnings,
  };
}

// ---------------------------------------------------------------------
// Resolução manual de pendência (Sucesso/Falha)
// ---------------------------------------------------------------------

export interface ResolveConditionCheckResult {
  character: Character;
  check: ConditionResistanceCheck;
  outcome: "success" | "failure";
  damageEvent?: ConditionDamageEvent;
  appliedConditionSlug?: string;
  removedConditionSlug?: string;
  logs: string[];
  tableLogs: EndRoundTableLog[];
  warnings: string[];
}

/**
 * Resolve manualmente uma pendência ("Marcar sucesso"/"Marcar falha").
 * Em sucesso: nunca aplica a consequência de falha, nunca remove a
 * condição de origem (só `teste_fim_de_rodada_para_remover_condicao`
 * remove — a condição REFERENCIADA, em sucesso). Em falha: aplica
 * `onFailure` (dano ou condição), conforme o `effectType`.
 */
export function resolveConditionResistanceCheck(params: {
  character: Character;
  check: ConditionResistanceCheck;
  outcome: "success" | "failure";
  conditions: ConditionContent[];
  nowIso: string;
  rng?: () => number;
}): ResolveConditionCheckResult {
  const { check, outcome, conditions, nowIso } = params;
  let character = params.character;
  const logs: string[] = [];
  const tableLogs: EndRoundTableLog[] = [];
  const warnings: string[] = [];
  let damageEvent: ConditionDamageEvent | undefined;
  let appliedConditionSlug: string | undefined;
  let removedConditionSlug: string | undefined;

  if (check.effectType === "teste_fim_de_rodada") {
    if (outcome === "failure") {
      const falha = asRecord(check.onFailure);
      const formula = typeof falha?.dano === "string" ? falha.dano : undefined;
      if (formula) {
        const damageType = typeof falha?.tipo_dano === "string" ? falha.tipo_dano : "";
        const result = applyConditionEndRoundDamage({
          character,
          conditionId: check.conditionId,
          conditionName: check.conditionName,
          formula,
          damageType,
          nowIso,
          rng: params.rng,
        });
        character = result.character;
        damageEvent = result.event;
        logs.push(
          `${check.conditionName}: falha no teste de ${check.resistance.pericia} CD ${check.resistance.cd} causou ${result.event.rollResult} de dano ${damageType}.`,
        );
        tableLogs.push({
          type: "condition_end_round_damage",
          payload: {
            conditionId: check.conditionId,
            conditionName: check.conditionName,
            formula,
            rollResult: result.event.rollResult,
            damage: result.event.rollResult,
            damageType,
            resource: "pv",
            before: result.event.pvBefore,
            after: result.event.pvAfter,
            round: check.round,
            scene: check.scene,
            source: "end_round_condition_check",
          },
        });
        if (result.collapseStarted) {
          warnings.push(`Colapso (${result.collapseTipo}) iniciado por falha em teste de condição (${check.conditionName}).`);
        }
      }
    } else {
      logs.push(`${check.conditionName}: sucesso no teste de ${check.resistance.pericia} CD ${check.resistance.cd}.`);
    }
  } else if (check.effectType === "teste_fim_de_rodada_para_remover_condicao") {
    if (outcome === "success" && check.targetConditionId) {
      const target = check.targetConditionId;
      const next = (character.condicoes_ativas ?? []).map((c) => {
        const slug = c.conditionId ? normalizeConditionSlug(c.conditionId) : normalizeConditionSlug(c.nome);
        if (c.ativa && slug === target) {
          removedConditionSlug = target;
          return { ...c, ativa: false, removidaEm: nowIso, removidaOrigem: "end_round_condition_check" as const };
        }
        return c;
      });
      if (removedConditionSlug) {
        character = { ...character, condicoes_ativas: next };
        logs.push(`${check.conditionName}: sucesso removeu ${target}.`);
        tableLogs.push({
          type: "condition_removed",
          payload: {
            conditionId: target,
            conditionName: target,
            sourceConditionId: check.conditionId,
            source: "end_round_condition_check",
            round: check.round,
            scene: check.scene,
          },
        });
      }
    } else {
      logs.push(`${check.conditionName}: falha — ${check.targetConditionId ?? "condição"} continua ativa.`);
    }
  } else if (check.effectType === "teste_apos_exposicao") {
    if (outcome === "failure") {
      const falha = asRecord(check.onFailure);
      const targetSlug = typeof falha?.aplicar_condicao === "string" ? normalizeConditionSlug(falha.aplicar_condicao) : undefined;
      if (targetSlug) {
        const jaAtiva = (character.condicoes_ativas ?? []).some((c) => {
          const slug = c.conditionId ? normalizeConditionSlug(c.conditionId) : normalizeConditionSlug(c.nome);
          return c.ativa && slug === targetSlug;
        });
        if (!jaAtiva) {
          const conditionContent = conditions.find((c) => normalizeConditionSlug(c.slug) === targetSlug);
          const duracao = typeof falha?.duracao === "string" ? falha.duracao : undefined;
          const novaCondicao: ActiveCondition = {
            id: crypto.randomUUID(),
            conditionId: targetSlug,
            nome: conditionContent?.nome ?? targetSlug,
            origem: `Falha em teste de exposição (${check.conditionName})`,
            duracao,
            aplicadaEm: nowIso,
            removidaEm: null,
            ativa: true,
          };
          character = { ...character, condicoes_ativas: [...(character.condicoes_ativas ?? []), novaCondicao] };
          appliedConditionSlug = targetSlug;
          logs.push(`${check.conditionName}: falha aplicou ${novaCondicao.nome}.`);
          tableLogs.push({
            type: "condition_applied",
            payload: {
              conditionId: targetSlug,
              conditionName: novaCondicao.nome,
              sourceConditionId: check.conditionId,
              source: "end_round_condition_check",
              round: check.round,
              scene: check.scene,
            },
          });
        } else {
          warnings.push(`${targetSlug} já estava ativa — não duplicada.`);
        }
      }
    } else {
      logs.push(`${check.conditionName}: sucesso no teste de exposição.`);
    }
  }

  const resolvedCheck: ConditionResistanceCheck = { ...check, status: outcome, resolvedAt: nowIso };
  character = {
    ...character,
    pending_condition_checks: (character.pending_condition_checks ?? []).filter((p) => p.id !== check.id),
  };

  const appliedEffects: string[] = [];
  if (damageEvent) appliedEffects.push(`dano:${damageEvent.rollResult}`);
  if (appliedConditionSlug) appliedEffects.push(`aplicou:${appliedConditionSlug}`);
  if (removedConditionSlug) appliedEffects.push(`removeu:${removedConditionSlug}`);

  tableLogs.push({
    type: "condition_end_round_check_resolved",
    payload: {
      conditionId: check.conditionId,
      conditionName: check.conditionName,
      checkId: check.id,
      result: outcome,
      appliedEffects,
      round: check.round,
      scene: check.scene,
    },
  });

  return { character, check: resolvedCheck, outcome, damageEvent, appliedConditionSlug, removedConditionSlug, logs, tableLogs, warnings };
}

// ---------------------------------------------------------------------
// Redução de PA por condição (reduzir_pa, escopo "rodada")
// ---------------------------------------------------------------------

export interface PaReductionResult {
  character: Character;
  totalReduction: number;
  paBefore: number;
  paAfter: number;
  reductions: { conditionId: string; conditionName: string; value: number }[];
  logs: string[];
  tableLogs: EndRoundTableLog[];
}

/**
 * Aplica a redução de PA de condições ativas (ex.: Envenenado -1 PA) —
 * chamado DEPOIS de renovar o PA da nova rodada (pa_gastos já resetado
 * a 0 pelo chamador). PA final nunca fica negativo: a redução total é
 * clampada ao PA máximo.
 */
export function applyRoundScopedPaReductions(params: {
  character: Character;
  conditions: ConditionContent[];
  paMax: number;
  round: number;
  scene: number;
}): PaReductionResult {
  const { conditions, paMax, round, scene } = params;
  const character = params.character;
  const activeSlugs = getActiveConditionIds(character);
  const conditionBySlug = new Map(conditions.map((c) => [normalizeConditionSlug(c.slug), c]));

  const reductions: { conditionId: string; conditionName: string; value: number }[] = [];
  let total = 0;
  for (const slug of activeSlugs) {
    const content = conditionBySlug.get(slug);
    if (!content) continue;
    for (const efeito of getConditionEndRoundEffects(content)) {
      if (efeito.tipo === "reduzir_pa" && efeito.escopo === "rodada" && typeof efeito.valor === "number") {
        total += efeito.valor;
        reductions.push({ conditionId: slug, conditionName: content.nome, value: efeito.valor });
      }
    }
  }

  const paGastosAntes = character.estado_jogo?.pa_gastos ?? 0;
  const paBefore = Math.max(0, paMax - paGastosAntes);
  const applied = Math.max(0, Math.min(total, paBefore));
  const nextCharacter: Character =
    applied > 0 ? { ...character, estado_jogo: { ...character.estado_jogo, pa_gastos: paGastosAntes + applied } } : character;
  const paAfter = Math.max(0, paMax - (paGastosAntes + applied));

  const logs = reductions.map((r) => `${r.conditionName} reduziu ${r.value} PA nesta rodada.`);
  const tableLogs: EndRoundTableLog[] = reductions.map((r) => ({
    type: "round_pa_reduced_by_condition",
    payload: {
      conditionId: r.conditionId,
      conditionName: r.conditionName,
      value: r.value,
      paBefore,
      paAfter,
      round,
      scene,
    },
  }));

  return { character: nextCharacter, totalReduction: applied, paBefore, paAfter, reductions, logs, tableLogs };
}
