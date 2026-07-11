/**
 * Modelo canônico de efeitos temporários/buffs — checkpoint pós-v0.71.
 *
 * Resolve a pendência documentada de "buff temporário com duração
 * rastreada" (relatório pós-v0.61; `manualPending` de
 * buildEndRoundPreview/Scene). Módulo PURO: nenhuma função aqui lê ou
 * escreve estado fora dos argumentos — sempre devolve um novo
 * `Character` (nunca muta) ou dados derivados.
 *
 * Princípios (mesmos dos demais módulos data-driven):
 *   - nunca hardcoda nome de talento/item/magia — só interpreta payload
 *     estruturado (`buildTemporaryEffectFromStructuredPayload`);
 *   - efeito textual/sem estrutura NÃO vira automação — vira lembrete,
 *     e o chamador continua registrando o cartão/lembrete como hoje;
 *   - preserva a FONTE do efeito e nunca apaga histórico (expirar/
 *     remover marca `active: false`, mesmo padrão de `ActiveCondition`);
 *   - o ÚNICO modificador aplicado automaticamente é `target: "roll"/
 *     "skill"/"attribute"` com `appliesTo` (tags de rolagem) — vira
 *     `ActiveEffect` (`deriveActiveEffectsFromTemporaryEffects`) e soma
 *     nas rolagens do RollsTab, mesmo pipeline de condições/talentos.
 *     `resource`/`damage`/`defense`/`dc`/`manual` são exibidos e viram
 *     lembrete (sem ponto de integração canônico ainda — pendência).
 */

import type { ActiveEffect } from "./activeEffects";
import type { Character, TemporaryEffect, TemporaryEffectModifier } from "./types";

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Efeitos temporários ATIVOS (active !== false). Histórico (active:false) é ignorado. */
export function getActiveTemporaryEffects(character: Pick<Character, "efeitos_temporarios">): TemporaryEffect[] {
  return (character.efeitos_temporarios ?? []).filter((e) => e.active);
}

/**
 * Adiciona um efeito temporário respeitando `stackingMode`:
 *   - "ignore": se já existe um efeito ATIVO da mesma fonte
 *     (`sourceType`+`sourceId`+`name`), não adiciona (retorna o mesmo
 *     personagem — evita duplicata);
 *   - "replace": expira o efeito ativo equivalente antes de adicionar o novo;
 *   - "stack": incrementa `stacks` do efeito ativo equivalente (até
 *     `maxStacks`), sem criar um segundo registro; se não existir, cria;
 *   - "manual"/ausente: sempre adiciona um novo registro (sem regra de
 *     stack automática — o narrador resolve duplicatas na UI).
 */
export function addTemporaryEffect(character: Character, effect: TemporaryEffect): Character {
  const atuais = character.efeitos_temporarios ?? [];
  const mode = effect.stackingMode ?? "manual";
  const mesmaFonte = (e: TemporaryEffect) =>
    e.active && e.sourceType === effect.sourceType && (e.sourceId ?? null) === (effect.sourceId ?? null) && e.name === effect.name;
  const existente = atuais.find(mesmaFonte);

  if (existente && mode === "ignore") {
    return character;
  }
  if (existente && mode === "stack") {
    const max = existente.maxStacks ?? effect.maxStacks;
    const nextStacks = Math.min(max ?? Infinity, (existente.stacks ?? 1) + (effect.stacks ?? 1));
    return {
      ...character,
      efeitos_temporarios: atuais.map((e) => (e.id === existente.id ? { ...e, stacks: nextStacks } : e)),
    };
  }
  if (existente && mode === "replace") {
    return {
      ...character,
      efeitos_temporarios: [
        ...atuais.map((e) => (e.id === existente.id ? { ...e, active: false, endedAt: effect.createdAt, endedReason: "manual" as const } : e)),
        effect,
      ],
    };
  }
  return { ...character, efeitos_temporarios: [...atuais, effect] };
}

/** Marca um efeito como removido manualmente (mantém histórico). No-op se já inativo/ausente. */
export function removeTemporaryEffect(character: Character, effectId: string, nowIso: string): Character {
  const atuais = character.efeitos_temporarios ?? [];
  if (!atuais.some((e) => e.id === effectId && e.active)) return character;
  return {
    ...character,
    efeitos_temporarios: atuais.map((e) =>
      e.id === effectId && e.active ? { ...e, active: false, endedAt: nowIso, endedReason: "manual" as const } : e,
    ),
  };
}

/** Expira um efeito específico por um motivo dado (rounds/scene/rest/manual). Mantém histórico. */
export function expireTemporaryEffect(
  character: Character,
  effectId: string,
  reason: NonNullable<TemporaryEffect["endedReason"]>,
  nowIso: string,
): Character {
  const atuais = character.efeitos_temporarios ?? [];
  if (!atuais.some((e) => e.id === effectId && e.active)) return character;
  return {
    ...character,
    efeitos_temporarios: atuais.map((e) =>
      e.id === effectId && e.active ? { ...e, active: false, endedAt: nowIso, endedReason: reason } : e,
    ),
  };
}

export interface TemporaryEffectTickResult {
  character: Character;
  /** Efeitos que TIVERAM `remainingRounds` reduzido (e continuam ativos). */
  ticked: TemporaryEffect[];
  /** Efeitos que chegaram a 0 e expiraram nesta rodada. */
  expired: TemporaryEffect[];
}

/**
 * Reduz `remainingRounds` de cada efeito ATIVO com `durationType:
 * "rounds"` e expira os que chegam a 0. Efeitos de outra duração
 * (scene/rest/manual) não são tocados. Puro — não persiste nada.
 */
export function tickRoundTemporaryEffects(character: Character, nowIso: string): TemporaryEffectTickResult {
  const atuais = character.efeitos_temporarios ?? [];
  const ticked: TemporaryEffect[] = [];
  const expired: TemporaryEffect[] = [];

  const next = atuais.map((e) => {
    if (!e.active || e.durationType !== "rounds" || typeof e.remainingRounds !== "number") return e;
    const restante = e.remainingRounds - 1;
    if (restante <= 0) {
      const expiredEffect = { ...e, remainingRounds: 0, active: false, endedAt: nowIso, endedReason: "rounds" as const };
      expired.push(expiredEffect);
      return expiredEffect;
    }
    const tickedEffect = { ...e, remainingRounds: restante };
    ticked.push(tickedEffect);
    return tickedEffect;
  });

  return { character: { ...character, efeitos_temporarios: next }, ticked, expired };
}

export interface TemporaryEffectExpireResult {
  character: Character;
  expired: TemporaryEffect[];
}

/** Expira todos os efeitos ATIVOS com `durationType: "scene"`. Puro. */
export function expireSceneTemporaryEffects(character: Character, nowIso: string): TemporaryEffectExpireResult {
  return expireByDuration(character, "scene", nowIso);
}

/** Expira todos os efeitos ATIVOS com `durationType: "rest"` (descanso longo). Puro. */
export function expireRestTemporaryEffects(character: Character, nowIso: string): TemporaryEffectExpireResult {
  return expireByDuration(character, "rest", nowIso);
}

function expireByDuration(
  character: Character,
  durationType: "scene" | "rest",
  nowIso: string,
): TemporaryEffectExpireResult {
  const atuais = character.efeitos_temporarios ?? [];
  const expired: TemporaryEffect[] = [];
  const next = atuais.map((e) => {
    if (!e.active || e.durationType !== durationType) return e;
    const expiredEffect = { ...e, active: false, endedAt: nowIso, endedReason: durationType };
    expired.push(expiredEffect);
    return expiredEffect;
  });
  return { character: { ...character, efeitos_temporarios: next }, expired };
}

/**
 * Modificadores estruturados dos efeitos ativos, opcionalmente filtrados
 * pelas tags de contexto de uma rolagem (`context.tags`). Só retorna os
 * modificadores APLICÁVEIS automaticamente (target roll/skill/attribute
 * com `appliesTo`). Usado por quem quiser inspecionar os números; a
 * aplicação real nas rolagens acontece via
 * `deriveActiveEffectsFromTemporaryEffects` (mesmo pipeline de ActiveEffect).
 */
export function getTemporaryEffectModifiers(
  character: Pick<Character, "efeitos_temporarios">,
  context?: { tags?: string[] },
): TemporaryEffectModifier[] {
  const tags = context?.tags ?? null;
  const mods: TemporaryEffectModifier[] = [];
  for (const effect of getActiveTemporaryEffects(character)) {
    for (const mod of effect.modifiers ?? []) {
      if (!isRollModifier(mod)) continue;
      if (tags && !(mod.appliesTo ?? []).some((t) => tags.includes(t))) continue;
      mods.push(mod);
    }
  }
  return mods;
}

/** Resumo textual de um efeito para log/UI — nunca JSON cru. */
export function formatTemporaryEffectSummary(effect: TemporaryEffect): string {
  const partes: string[] = [];
  partes.push(effect.name);
  partes.push(`fonte ${sourceTypeLabel(effect.sourceType)}: ${effect.sourceName}`);
  partes.push(describeDuration(effect));
  if ((effect.stacks ?? 1) > 1) partes.push(`${effect.stacks} pilhas${effect.maxStacks ? `/${effect.maxStacks}` : ""}`);
  const modTexto = (effect.modifiers ?? []).map(describeModifier).filter(Boolean);
  if (modTexto.length > 0) partes.push(modTexto.join(", "));
  return partes.join(" · ");
}

const SOURCE_TYPE_LABELS: Record<TemporaryEffect["sourceType"], string> = {
  talent: "talento",
  item: "item",
  spell: "magia",
  surge: "surto",
  manual: "manual",
};

function sourceTypeLabel(t: TemporaryEffect["sourceType"]): string {
  return SOURCE_TYPE_LABELS[t] ?? t;
}

/** Descrição legível da duração restante de um efeito. */
export function describeDuration(effect: TemporaryEffect): string {
  switch (effect.durationType) {
    case "rounds":
      return typeof effect.remainingRounds === "number" ? `${effect.remainingRounds} rodada(s) restante(s)` : "por rodadas";
    case "scene":
      return "até o fim da cena";
    case "rest":
      return "até o próximo descanso longo";
    case "manual":
      return "duração manual (remover à mão)";
    default:
      return "duração indefinida";
  }
}

/** Descrição legível de um modificador (para exibição/log). */
export function describeModifier(mod: TemporaryEffectModifier): string {
  if (mod.label) return mod.label;
  const alvo = mod.appliesTo && mod.appliesTo.length > 0 ? mod.appliesTo.join("/") : mod.targetKey ?? mod.target;
  if (typeof mod.value === "number" && (mod.operation === "add" || mod.operation === "subtract")) {
    const sinal = mod.operation === "subtract" || mod.value < 0 ? "-" : "+";
    return `${sinal}${Math.abs(mod.value)} em ${alvo}`;
  }
  if (mod.dice) return `${mod.dice} em ${alvo}`;
  if (mod.reminder) return mod.reminder;
  return `efeito em ${alvo}`;
}

/** Um modificador que é aplicado AUTOMATICAMENTE nas rolagens (vira ActiveEffect). */
function isRollModifier(mod: TemporaryEffectModifier): boolean {
  return (
    (mod.target === "roll" || mod.target === "skill" || mod.target === "attribute") &&
    (mod.appliesTo?.length ?? 0) > 0 &&
    typeof mod.value === "number" &&
    (mod.operation === "add" || mod.operation === "subtract")
  );
}

/**
 * Converte os efeitos temporários ATIVOS em `ActiveEffect[]` — ponte
 * para o pipeline de rolagens já existente (RollsTab soma os
 * `kind: "modifier"` com `affectedTags` compatíveis). Só os
 * modificadores de rolagem entram; os demais são exibidos como aviso
 * (kind "warning"), nunca somados. Mesmo formato de
 * `deriveActiveEffectsFromConditions`/`deriveActiveEffectsFromTalents`.
 */
export function deriveActiveEffectsFromTemporaryEffects(
  character: Pick<Character, "efeitos_temporarios">,
): ActiveEffect[] {
  const effects: ActiveEffect[] = [];
  for (const effect of getActiveTemporaryEffects(character)) {
    const stacks = Math.max(1, effect.stacks ?? 1);
    (effect.modifiers ?? []).forEach((mod, index) => {
      if (isRollModifier(mod)) {
        const perStack = mod.operation === "subtract" ? -(mod.value as number) : (mod.value as number);
        const total = perStack * stacks;
        effects.push({
          id: `temp:${effect.id}:${index}`,
          sourceType: "temporary",
          sourceId: effect.sourceId ?? effect.id,
          sourceName: `${effect.name}${stacks > 1 ? ` (${stacks}x)` : ""}`,
          affectedTags: mod.appliesTo ?? [],
          modifier: total,
          explanation: `${effect.name}: ${total >= 0 ? "+" : ""}${total} em ${(mod.appliesTo ?? []).join(", ")} (${describeDuration(effect)}).`,
          enabledByDefault: true,
          kind: "modifier",
          reversible: true,
        });
      } else if (mod.reminder || mod.target !== "manual") {
        // Modificador estruturado mas SEM ponto de integração automático
        // (recurso/dano/defesa/dc) — exibido como aviso, nunca somado.
        effects.push({
          id: `temp:${effect.id}:${index}`,
          sourceType: "temporary",
          sourceId: effect.sourceId ?? effect.id,
          sourceName: effect.name,
          affectedTags: mod.appliesTo ?? [],
          modifier: 0,
          explanation: `${effect.name}: ${mod.reminder ?? describeModifier(mod)} — aplicação manual.`,
          enabledByDefault: true,
          kind: "warning",
          reversible: true,
        });
      }
    });
  }
  return effects;
}

// ---------------------------------------------------------------------
// Construção a partir de payload estruturado (data-driven).
// ---------------------------------------------------------------------

export interface TemporaryEffectSource {
  sourceType: TemporaryEffect["sourceType"];
  sourceId?: string;
  sourceName: string;
  /** Rodada/cena atuais do personagem, para `createdRound`/`createdScene`. */
  round?: number;
  scene?: number;
}

interface ParsedDuration {
  durationType: TemporaryEffect["durationType"];
  remainingRounds?: number;
}

/**
 * Interpreta a duração declarada num payload (`duracao` textual e/ou
 * `cadencia`). Reconhece só padrões inequívocos; qualquer coisa fora
 * disso vira `manual` (rastreado, removível à mão) — nunca inventa um
 * número de rodadas.
 */
function parseDuration(payload: Record<string, unknown>): ParsedDuration {
  const duracao = typeof payload.duracao === "string" ? payload.duracao.toLowerCase() : "";
  const cadencia = typeof payload.cadencia === "string" ? payload.cadencia.toLowerCase() : "";

  // "6_rodadas", "3 rodadas", "1 rodada"
  const rodadasMatch = duracao.match(/(\d+)\s*[_ ]?rodada/);
  if (rodadasMatch) {
    return { durationType: "rounds", remainingRounds: Math.max(1, parseInt(rodadasMatch[1], 10)) };
  }
  if (duracao.includes("fim_da_rodada") || duracao.includes("fim da rodada") || cadencia === "rodada") {
    return { durationType: "rounds", remainingRounds: 1 };
  }
  if (duracao.includes("cena") || cadencia === "cena") {
    return { durationType: "scene" };
  }
  if (duracao.includes("descanso") || cadencia === "dia") {
    return { durationType: "rest" };
  }
  return { durationType: "manual" };
}

/**
 * Extrai os modificadores estruturados de um payload de buff. Cobre as
 * formas conhecidas do conteúdo real (`buff_temporario` de itens):
 * `valor`+`alvo_tags` (bônus de rolagem), `bonus_pericia` (bônus de
 * perícia), `pa_bonus` (recurso), além de `modificador`/`mit_bonus`/
 * `pd_bonus`/`dano`/`dano_extra` quando aparecerem. Nunca inventa alvo:
 * modificador sem alvo estruturado é ignorado.
 */
function extractModifiers(payload: Record<string, unknown>): TemporaryEffectModifier[] {
  const mods: TemporaryEffectModifier[] = [];

  const valor = payload.valor;
  const alvoTags = asStringArray(payload.alvo_tags);
  if (typeof valor === "number" && alvoTags.length > 0) {
    mods.push({ target: "roll", operation: valor < 0 ? "subtract" : "add", value: Math.abs(valor), appliesTo: alvoTags });
  }

  const bonusPericia = asRecord(payload.bonus_pericia);
  if (bonusPericia && typeof bonusPericia.pericia === "string" && typeof bonusPericia.valor === "number") {
    mods.push({
      target: "skill",
      operation: bonusPericia.valor < 0 ? "subtract" : "add",
      value: Math.abs(bonusPericia.valor),
      appliesTo: [bonusPericia.pericia],
    });
  }

  if (typeof payload.pa_bonus === "number") {
    mods.push({
      target: "resource",
      targetKey: "pa",
      operation: "add",
      value: payload.pa_bonus,
      reminder: `+${payload.pa_bonus} PA — ajuste manual (sem automação de PA máximo por buff ainda).`,
    });
  }
  if (typeof payload.mit_bonus === "number") {
    mods.push({
      target: "defense",
      targetKey: "mit",
      operation: "add",
      value: payload.mit_bonus,
      reminder: `+${payload.mit_bonus} MIT — aplique ao resolver dano em /dev/table.`,
    });
  }
  if (typeof payload.pd_bonus === "number") {
    mods.push({
      target: "defense",
      targetKey: "pd",
      operation: "add",
      value: payload.pd_bonus,
      reminder: `+${payload.pd_bonus} PD — aplique ao resolver dano em /dev/table.`,
    });
  }
  const danoExtra = payload.dano_extra ?? payload.dano;
  if (typeof danoExtra === "string") {
    mods.push({ target: "damage", operation: "add", dice: danoExtra, reminder: `dano extra ${danoExtra} — aplique manualmente ao resolver o ataque.` });
  } else if (typeof payload.modificador_dano === "number") {
    mods.push({ target: "damage", operation: "add", value: payload.modificador_dano, reminder: `+${payload.modificador_dano} de dano — aplique manualmente.` });
  }

  return mods;
}

function collectReminders(payload: Record<string, unknown>): string[] {
  const reminders: string[] = [];
  if (typeof payload.nota === "string") reminders.push(payload.nota);
  return reminders;
}

/**
 * `true` quando o payload tem ESTRUTURA suficiente para virar um efeito
 * temporário automático: pelo menos um modificador estruturado E uma
 * duração reconhecível (rounds/scene/rest). Sem isso, o chamador deve
 * manter o comportamento de lembrete/cartão de hoje.
 */
export function canApplyTemporaryEffect(payload: unknown): boolean {
  const rec = asRecord(payload);
  if (!rec) return false;
  const mods = extractModifiers(rec);
  if (mods.length === 0) return false;
  const duration = parseDuration(rec);
  return duration.durationType !== "manual";
}

/**
 * Constrói um `TemporaryEffect` a partir de uma fonte + payload
 * estruturado. Retorna `null` quando `canApplyTemporaryEffect` é falso
 * (o chamador então registra lembrete como hoje). `idFactory` injeta o
 * uuid (o módulo é puro e não chama crypto.randomUUID diretamente).
 */
export function buildTemporaryEffectFromStructuredPayload(
  source: TemporaryEffectSource,
  payload: unknown,
  nowIso: string,
  idFactory: () => string,
): TemporaryEffect | null {
  const rec = asRecord(payload);
  if (!rec || !canApplyTemporaryEffect(rec)) return null;

  const duration = parseDuration(rec);
  const modifiers = extractModifiers(rec);
  const reminders = collectReminders(rec);
  const nome =
    typeof rec.nome === "string" ? rec.nome : source.sourceName;

  const effect: TemporaryEffect = {
    id: idFactory(),
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    name: nome,
    durationType: duration.durationType,
    stackingMode: "replace",
    active: true,
    createdAt: nowIso,
    endedAt: null,
    modifiers,
    reminders: reminders.length > 0 ? reminders : undefined,
  };
  if (duration.remainingRounds != null) effect.remainingRounds = duration.remainingRounds;
  if (source.round != null) effect.createdRound = source.round;
  if (source.scene != null) effect.createdScene = source.scene;
  return effect;
}
