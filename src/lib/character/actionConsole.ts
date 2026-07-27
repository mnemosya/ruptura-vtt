/**
 * Console de Ação — checkpoint v0.42 (PRD, capítulo Combate).
 *
 * Camada de interpretação data-driven: NUNCA lista ações manualmente.
 * A fonte de verdade é o conteúdo publicado na Biblioteca do Sistema
 * (content_type="combat_action", ver db_acoes_combate_normalizado e
 * scripts/seed-content.ts) — este módulo só transforma o payload bruto
 * em itens operacionais de UI (ActionConsoleItem) e executa a fração
 * de automação explicitamente pedida neste checkpoint (consumo de
 * PA/Reação + remoção simples de condição no próprio personagem).
 *
 * Fora de escopo aqui (ver payload_automacao.efeitos não tratados):
 * resolver_ataque, controle_corpo_a_corpo, estrangular_alvo,
 * aplicar_condicao em alvo, movimento_forcado, desarmar_alvo,
 * recarregar_arma, acumular_bonus_mirar, criar_preparacao_turno,
 * executar_protocolo_malha, defesa_ativa completa, efeitos_por_margem,
 * dano, região do corpo — todos aparecem como "efeito pendente"
 * textual, nunca simulados.
 */

import type { ActiveCondition, Character } from "./types";
import type { TechnicalContentItem } from "../content";
import {
  deriveItemProperties,
  type InventoryItemInstance,
  type ItemContent,
} from "./inventory";
import {
  canUseReactionAction,
  spendReactionForDefense,
  type ReactionRules,
} from "./reactions";
import { isActionAllowedInWindow, type TurnWindow } from "../table/turnTrack";
import type { ActiveEffect } from "./activeEffects";

// ---------------------------------------------------------------------
// Tipos de conteúdo bruto (subconjunto lido de content_documents.payload)
// ---------------------------------------------------------------------

export interface CombatActionContent {
  id: string;
  slug: string;
  nome: string;
  categoria: string;
  tipo: string;
  custo: unknown;
  janela?: string;
  visibilidade: string;
  tags: string[];
  descricao_curta?: string;
  descricao_longa?: string;
  payload_automacao?: unknown;
  status: string;
  versao?: string;
  teste?: unknown;
  variantes?: unknown;
  requisitos?: unknown;
  sucesso?: unknown;
  falha?: unknown;
  efeitos_por_margem?: unknown;
  /** Modos por tipo de arma (ex.: "corpo_a_corpo", "distancia_arma_fogo") — usado só por "Atacar" para achar o bloco `desarmado`. */
  modos?: unknown;
}

export interface ActionConsoleItem {
  id: string;
  slug: string;
  nome: string;
  categoria: string;
  tipo: string;
  custoLabel: string;
  custoPA?: number;
  custoReacao?: number;
  custoLivre: boolean;
  custoComposto: boolean;
  tagsRolagem: string[];
  visibilidade: string;
  descricaoCurta?: string;
  descricaoLonga?: string;
  requisitoTexto?: string;
  itemRequirements: ActionItemRequirement[];
  testeTexto?: string;
  efeitoTexto?: string;
  payloadAutomacao?: unknown;
  enabled: boolean;
  disabledReason?: string;
  contentIssues: string[];
  isConditionEnabled: boolean;
  enabledByConditions: string[];
  automatedEffects: string[];
  pendingEffects: string[];
  rollSkillId?: string;
  rollDisabledReason?: string;
  defenseWithoutReaction: boolean;
  reactionPenalty: number;
  reactionWarning?: string;
  sortOrder: number;
}

export interface ActionItemRequirement {
  type: "property" | "protection" | "ammunition";
  key: string;
  label: string;
  satisfied: boolean;
  matchingItems: { instanceId: string; itemName: string }[];
  explanation: string;
}

export interface ActionItemContext {
  items: ItemContent[];
  properties: TechnicalContentItem[];
  runes?: TechnicalContentItem[];
}

// ---------------------------------------------------------------------
// Normalização do conteúdo bruto
// ---------------------------------------------------------------------

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Preserva o payload inteiro do registro — não achata nem descarta campos. */
export function normalizeCombatActionContent(raw: Record<string, unknown>): CombatActionContent {
  return {
    id: String(raw.id ?? raw.slug ?? ""),
    slug: String(raw.slug ?? raw.id ?? ""),
    nome: String(raw.nome ?? raw.slug ?? "Ação"),
    categoria: String(raw.categoria ?? ""),
    tipo: String(raw.tipo ?? ""),
    custo: raw.custo,
    janela: typeof raw.janela === "string" ? raw.janela : undefined,
    // Ausência não pode virar "sempre": conteúdo inválido deve falhar
    // fechado, nunca criar uma ação visível/executável por acidente.
    visibilidade: typeof raw.visibilidade === "string" ? raw.visibilidade : "",
    tags: asStringArray(raw.tags),
    descricao_curta: typeof raw.descricao_curta === "string" ? raw.descricao_curta : undefined,
    descricao_longa: typeof raw.descricao_longa === "string" ? raw.descricao_longa : undefined,
    payload_automacao: raw.payload_automacao,
    status: String(raw.status ?? "published"),
    versao: typeof raw.versao === "string" ? raw.versao : undefined,
    teste: raw.teste,
    variantes: raw.variantes,
    requisitos: raw.requisitos,
    sucesso: raw.sucesso,
    falha: raw.falha,
    efeitos_por_margem: raw.efeitos_por_margem,
    modos: raw.modos,
  };
}

// ---------------------------------------------------------------------
// Visibilidade condicional
// ---------------------------------------------------------------------

/** Normalização única para IDs canônicos e fallback de condições manuais. */
export function normalizeConditionSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/** Slugs de condição ativos — conditionId canônico tem prioridade sobre o nome manual. */
function activeConditionSlugs(activeConditions: ActiveCondition[]): Set<string> {
  const slugs = new Set<string>();
  for (const c of activeConditions) {
    if (!c.ativa) continue;
    const slug = c.conditionId ? normalizeConditionSlug(c.conditionId) : normalizeConditionSlug(c.nome);
    if (slug) slugs.add(slug);
  }
  return slugs;
}

export interface ActionVisibility {
  valid: boolean;
  always: boolean;
  requiredConditions: string[];
  reason?: string;
}

/** Faz parse estrito do contrato de `visibilidade`; formatos novos falham fechados. */
export function parseActionVisibility(action: CombatActionContent): ActionVisibility {
  if (action.visibilidade === "sempre") {
    return { valid: true, always: true, requiredConditions: [] };
  }
  if (action.visibilidade.startsWith("condicao:")) {
    const requiredConditions = [
      ...new Set(
        action.visibilidade
          .slice("condicao:".length)
          .split(",")
          .map(normalizeConditionSlug)
          .filter(Boolean),
      ),
    ];
    if (requiredConditions.length > 0) {
      return { valid: true, always: false, requiredConditions };
    }
  }
  return {
    valid: false,
    always: false,
    requiredConditions: [],
    reason: "Formato de visibilidade não suportado.",
  };
}

/**
 * Interpreta `acao.visibilidade`:
 *   - "sempre" -> sempre visível.
 *   - "condicao:slug1,slug2" -> visível se QUALQUER slug estiver ativo.
 */
export function isActionVisibleForCharacter(
  action: CombatActionContent,
  activeConditions: ActiveCondition[],
): boolean {
  const visibility = parseActionVisibility(action);
  if (!visibility.valid) return false;
  if (visibility.always) return true;
  const active = activeConditionSlugs(activeConditions);
  return visibility.requiredConditions.some((slug) => active.has(slug));
}

/** Slugs de ação habilitados pelas condições ativas via `condicoes[].acoes_habilitadas`. */
function actionsEnabledByConditions(
  activeConditions: ActiveCondition[],
  conditions: { slug: string; acoes_habilitadas?: { acao: string }[] }[],
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const active = activeConditionSlugs(activeConditions);
  for (const cond of conditions) {
    const conditionSlug = normalizeConditionSlug(cond.slug);
    if (!active.has(conditionSlug)) continue;
    for (const entry of cond.acoes_habilitadas ?? []) {
      const actionSlug = normalizeConditionSlug(entry.acao);
      if (!actionSlug) continue;
      const list = result.get(actionSlug) ?? [];
      list.push(conditionSlug);
      result.set(actionSlug, list);
    }
  }
  return result;
}

/**
 * Condições que declaram habilitar cada ação, independentemente de estarem
 * ativas. Serve para validar a redundância intencional entre os dois DBs.
 */
function declaredConditionEnablers(
  conditions: { slug: string; acoes_habilitadas?: { acao: string }[] }[],
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const condition of conditions) {
    const conditionSlug = normalizeConditionSlug(condition.slug);
    for (const entry of condition.acoes_habilitadas ?? []) {
      const actionSlug = normalizeConditionSlug(entry.acao);
      if (!conditionSlug || !actionSlug) continue;
      const current = result.get(actionSlug) ?? [];
      current.push(conditionSlug);
      result.set(actionSlug, current);
    }
  }
  return result;
}

/** Valida se uma ação condicional declara exatamente as mesmas condições nos dois DBs. */
export function validateConditionalActionConsistency(
  action: CombatActionContent,
  conditions: { slug: string; acoes_habilitadas?: { acao: string }[] }[],
): string | undefined {
  const visibility = parseActionVisibility(action);
  if (!visibility.valid || visibility.always) return undefined;

  const declared = declaredConditionEnablers(conditions).get(normalizeConditionSlug(action.slug)) ?? [];
  const fromVisibility = [...visibility.requiredConditions].sort();
  const fromConditions = [...new Set(declared)].sort();
  if (
    fromVisibility.length !== fromConditions.length ||
    fromVisibility.some((slug, index) => slug !== fromConditions[index])
  ) {
    return `Conteúdo inconsistente: visibilidade exige [${fromVisibility.join(", ")}], mas acoes_habilitadas declara [${fromConditions.join(", ")}].`;
  }
  return undefined;
}

// ---------------------------------------------------------------------
// Custo
// ---------------------------------------------------------------------

export interface ActionCost {
  pa?: number;
  reacao?: number;
  livre: boolean;
  composto: boolean;
  label: string;
  valid: boolean;
  invalidReason?: string;
}

export function getActionCost(action: CombatActionContent): ActionCost {
  const custo = action.custo as Record<string, unknown> | undefined;
  const tipo = typeof custo?.tipo === "string" ? custo.tipo : undefined;

  if (tipo === "pa") {
    const valor = custo?.valor;
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) {
      return {
        livre: false,
        composto: false,
        label: "Custo inválido",
        valid: false,
        invalidReason: "Custo de PA inválido.",
      };
    }
    return { pa: valor, livre: false, composto: false, label: `${valor} PA`, valid: true };
  }
  if (tipo === "reacao") {
    const valor = custo?.valor;
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) {
      return {
        livre: false,
        composto: false,
        label: "Custo inválido",
        valid: false,
        invalidReason: "Custo de Reação inválido.",
      };
    }
    return { reacao: valor, livre: false, composto: false, label: `${valor} Reação`, valid: true };
  }
  if (tipo === "livre") {
    return { livre: true, composto: false, label: "Livre", valid: true };
  }
  if (tipo === "composto") {
    return { livre: false, composto: true, label: "Composto (não automatizado)", valid: true };
  }
  return {
    livre: false,
    composto: false,
    label: "Custo inválido",
    valid: false,
    invalidReason: "Formato de custo não suportado.",
  };
}

export interface CanPayResult {
  ok: boolean;
  reason?: string;
}

/**
 * Enforcement das 17 condições (checkpoint pós-v0.94, fase 7) — a
 * ÚNICA fonte de verdade é `deriveActiveEffectsFromConditions`
 * (activeEffects.ts), que já interpreta `payload_automacao.efeitos`
 * das condições publicadas em `kind: "lock"` (`bloquear_acoes`/
 * `bloquear_reacoes`). Este módulo não reimplementa a leitura do
 * payload — só decide, dado esse resultado já computado, se ELE
 * bloqueia ESTA ação.
 *
 * `affectedTags` vazio = `bloquear_reacoes` (bloqueia qualquer ação
 * com custo de Reação). `affectedTags` contendo "acao" = wildcard de
 * "bloqueia toda e qualquer ação" (Atordoado/Inconsciente) — "acao"
 * não é uma tag real de nenhuma ação do catálogo (só "ofensiva",
 * "defensiva", "movimento", "reacao", etc.), então é tratada como
 * curinga. Fora isso, bloqueia só quando a própria ação carrega uma
 * das tags listadas (ex.: Imobilizado bloqueia "ofensiva"/"defensiva",
 * não "movimento" — que é travado à parte por `definir_deslocamento`,
 * ainda sem tag de ação real para "movimento" ser bloqueada aqui além
 * do que já está mapeado nas 28 ações publicadas).
 */
export function getConditionLockReason(action: CombatActionContent, activeEffects: ActiveEffect[]): string | undefined {
  const cost = getActionCost(action);
  const actionTags = new Set(action.tags ?? []);
  for (const effect of activeEffects) {
    if (effect.kind !== "lock") continue;
    if (effect.affectedTags.length === 0) {
      if (cost.reacao != null || actionTags.has("reacao")) return effect.explanation;
      continue;
    }
    if (effect.affectedTags.includes("acao")) return effect.explanation;
    if (effect.affectedTags.some((tag) => actionTags.has(tag))) return effect.explanation;
  }
  return undefined;
}

export function canPayActionCost(
  character: Character,
  cost: ActionCost,
  derivedPaMax: number | undefined,
  derivedReacaoMax: number | undefined,
  reactionRules?: ReactionRules,
  turnWindow?: TurnWindow | null,
  narratorOverride = false,
): CanPayResult {
  if (!cost.valid) {
    return { ok: false, reason: cost.invalidReason ?? "Custo inválido." };
  }
  if (cost.composto) {
    return { ok: false, reason: "Custo composto ainda não automatizado." };
  }
  if (cost.livre) return { ok: true };

  if (cost.pa != null) {
    // Enforcement da janela (PRD 6.1/6.2) ANTES do saldo de PA — bloqueia
    // aqui, não só no botão, e vale tanto para preview quanto execução.
    const windowCheck = isActionAllowedInWindow(turnWindow ?? null, cost.pa, narratorOverride);
    if (!windowCheck.ok) {
      return { ok: false, reason: windowCheck.reason };
    }
    const paMax = derivedPaMax ?? 0;
    const paGastos = character.estado_jogo?.pa_gastos ?? 0;
    const paAtual = Math.max(0, paMax - paGastos);
    if (paAtual < cost.pa) {
      return { ok: false, reason: `PA insuficiente (atual: ${paAtual}, necessário: ${cost.pa}).` };
    }
    return { ok: true };
  }
  if (cost.reacao != null) {
    const fallbackRules: ReactionRules = reactionRules ?? {
      actionsConsumeReaction: false,
      allowDefenseWithoutReaction: false,
      cumulativePenalty: 0,
      resetAt: "",
      valid: false,
      invalidReason: "Regras de Reação indisponíveis.",
    };
    const canUse = canUseReactionAction(
      character,
      derivedReacaoMax,
      fallbackRules,
      cost.reacao,
    );
    return { ok: canUse.ok, reason: canUse.reason };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------
// Efeitos automatizados (subconjunto simples deste checkpoint)
// ---------------------------------------------------------------------

const AUTOMATED_EFFECT_TYPES = [
  "remover_condicao",
  "remover_condicoes",
  "remover_restricao_movimento",
  // Checkpoint v0.64 — postura vira estado ativo real (ver aplicarOuEncerrarPostura).
  "aplicar_postura",
] as const;

interface AutomacaoEfeito {
  tipo: string;
  [key: string]: unknown;
}

/** slug de condição para a postura (ex.: "ofensiva" → "postura_ofensiva"). */
function posturaConditionSlug(postura: string): string {
  return normalizeConditionSlug(`postura_${postura}`);
}

/** Verdadeiro se a ação tem um efeito `aplicar_postura` no payload — data-driven, nunca por slug fixo. */
export function hasAplicarPosturaEffect(action: CombatActionContent): boolean {
  return getPayloadEffects(action).some((e) => e.tipo === "aplicar_postura" && typeof e.postura === "string");
}

/** Slug da condição de postura desta ação, se ela tiver um efeito `aplicar_postura` (senão null). */
export function getPosturaConditionSlug(action: CombatActionContent): string | null {
  const efeito = getPayloadEffects(action).find((e) => e.tipo === "aplicar_postura" && typeof e.postura === "string");
  return efeito ? posturaConditionSlug(String(efeito.postura)) : null;
}

function getPayloadEffects(action: CombatActionContent): AutomacaoEfeito[] {
  const pa = action.payload_automacao as { efeitos?: AutomacaoEfeito[] } | undefined;
  return Array.isArray(pa?.efeitos) ? pa!.efeitos! : [];
}

/** Condições removidas no PRÓPRIO personagem pelos efeitos simples automatizados (para preview na UI). */
export function getActionRemovalEffects(action: CombatActionContent): { conditionsToRemove: string[] } {
  const conditionsToRemove: string[] = [];
  for (const efeito of getPayloadEffects(action)) {
    if (efeito.tipo === "remover_condicao" && typeof efeito.condicao === "string") {
      conditionsToRemove.push(efeito.condicao);
    } else if (efeito.tipo === "remover_condicoes" && Array.isArray(efeito.condicoes)) {
      conditionsToRemove.push(...efeito.condicoes.filter((c): c is string => typeof c === "string"));
    } else if (efeito.tipo === "remover_restricao_movimento") {
      conditionsToRemove.push("agarrado", "imobilizado");
    }
  }
  return { conditionsToRemove: [...new Set(conditionsToRemove)] };
}

const EFFECT_TYPE_LABELS: Record<string, string> = {
  remover_condicao: "Remove condição",
  remover_condicoes: "Remove condições",
  remover_restricao_movimento: "Remove restrição de movimento (Agarrado/Imobilizado)",
  aplicar_postura: "Aplica/encerra postura como estado ativo (modificadores refletidos automaticamente nas rolagens)",
  habilitar_deslocamento_em_partes: "Deslocamento fracionável (não automatizado)",
  incrementar_custo_por_repeticao_no_turno: "Repetição no turno incrementa custo (não automatizado)",
  criar_abertura: "Cria abertura tática (não automatizado)",
  resolver_acao: "Resolução livre pelo narrador (não automatizado)",
  sacar_ou_guardar: "Sacar/guardar equipamento (não automatizado)",
  recarregar_arma: "Recarrega arma (não automatizado)",
  modificador: "Modificador de rolagem (não automatizado)",
  resolver_ataque: "Resolução de ataque contestado básico (ver \"Resolver Ataque\" na mesa, checkpoint v0.47)",
  controle_corpo_a_corpo: "Controle corpo a corpo (não automatizado)",
  estrangular_alvo: "Estrangular alvo (não automatizado)",
  aplicar_condicao: "Aplica condição no alvo (não automatizado)",
  movimento_forcado: "Movimento forçado no alvo (não automatizado)",
  desarmar_alvo: "Desarma alvo (não automatizado)",
  defesa_ativa: "Defesa ativa (não automatizada)",
  acumular_bonus_mirar: "Acumula bônus de Mirar (não automatizado)",
  executar_protocolo_malha: "Protocolo Malha (não automatizado)",
  criar_preparacao_turno: "Preparação de turno (não automatizada)",
  acao_pericia_aberta: "Perícia aberta a critério do narrador (não automatizado)",
  acao_livre: "Ação livre narrativa",
};

function effectLabel(tipo: string): string {
  return EFFECT_TYPE_LABELS[tipo] ?? `${tipo} (não automatizado)`;
}

/**
 * Rótulo de um efeito para exibição na UI/log — igual a `effectLabel`
 * na maioria dos casos, mas com um texto específico para "modificador"
 * quando a ação também tem `aplicar_postura` (nesse caso o modificador
 * É automatizado, via postura virando estado ativo — o texto genérico
 * "não automatizado" ficaria contraditório dentro do bloco "Automatizado:").
 * Para "modificador" em qualquer OUTRA ação (sem postura), o texto
 * genérico continua correto — não é uma regra geral para o tipo.
 */
function describeEffect(efeito: AutomacaoEfeito, isPosturaAction: boolean): string {
  if (efeito.tipo === "modificador" && isPosturaAction) {
    const valor = typeof efeito.valor === "number" ? efeito.valor : 0;
    const tags = Array.isArray(efeito.alvo_tags) ? efeito.alvo_tags.filter((t): t is string => typeof t === "string") : [];
    const sinal = valor >= 0 ? "+" : "";
    return `${sinal}${valor} em ${tags.join(", ") || "?"} (aplicado automaticamente enquanto a postura estiver ativa)`;
  }
  return effectLabel(efeito.tipo);
}

// ---------------------------------------------------------------------
// Construção dos itens de UI
// ---------------------------------------------------------------------

function requisitoTextoDe(action: CombatActionContent): string | undefined {
  const req = action.requisitos;
  if (!Array.isArray(req) || req.length === 0) return undefined;
  const labels = req
    .map((r) => {
      if (r && typeof r === "object" && "tipo" in r) {
        const tipo = (r as Record<string, unknown>).tipo;
        if (tipo === "arma_com_propriedade" || tipo === "protecao_empunhada") return null;
        return String(tipo);
      }
      return String(r);
    })
    .filter((label): label is string => label !== null);
  return labels.length > 0 ? labels.join("; ") : undefined;
}

function readiedInventoryItems(character: Character): InventoryItemInstance[] {
  return (character.inventario ?? []).filter(
    (item): item is InventoryItemInstance => item.estado === "empunhado" || item.estado === "equipado",
  );
}

/**
 * Interpreta somente requisitos de item já declarados no conteúdo da
 * ação. A ausência nunca desabilita a ação: vira explicação/aviso para
 * teatro da mente.
 */
export function getActionItemRequirements(
  character: Character,
  action: CombatActionContent,
  context?: ActionItemContext,
): ActionItemRequirement[] {
  if (!context) return [];
  const modelBySlug = new Map(context.items.map((item) => [item.slug, item]));
  const readied = readiedInventoryItems(character);
  const requirements: ActionItemRequirement[] = [];
  const rawRequirements = Array.isArray(action.requisitos) ? action.requisitos : [];

  for (const rawRequirement of rawRequirements) {
    if (!rawRequirement || typeof rawRequirement !== "object" || Array.isArray(rawRequirement)) continue;
    const requirement = rawRequirement as Record<string, unknown>;
    if (requirement.tipo === "arma_com_propriedade" && typeof requirement.propriedade === "string") {
      const propertyKey = requirement.propriedade;
      const matchingItems = readied
        .filter((instance) => instance.categoria === "arma")
        .filter((instance) =>
          deriveItemProperties({
            instance,
            item: modelBySlug.get(instance.itemSlug),
            properties: context.properties,
            runes: context.runes,
          }).some((property) => property.key === propertyKey),
        )
        .map((instance) => ({ instanceId: instance.id, itemName: instance.itemNome }));
      const label = context.properties.find((property) => property.slug === propertyKey)?.nome ?? propertyKey;
      requirements.push({
        type: "property",
        key: propertyKey,
        label: `Requer ${label}`,
        satisfied: matchingItems.length > 0,
        matchingItems,
        explanation:
          matchingItems.length > 0
            ? `Requer ${label} — encontrado em: ${matchingItems.map((item) => item.itemName).join(", ")}.`
            : `Requer ${label} — requisito não encontrado na ficha.`,
      });
    } else if (requirement.tipo === "protecao_empunhada") {
      const matchingItems = readied
        .filter((instance) => instance.categoria === "escudo")
        .map((instance) => ({ instanceId: instance.id, itemName: instance.itemNome }));
      requirements.push({
        type: "protection",
        key: "protecao_empunhada",
        label: "Requer escudo/proteção",
        satisfied: matchingItems.length > 0,
        matchingItems,
        explanation:
          matchingItems.length > 0
            ? `Requer escudo/proteção — encontrado em: ${matchingItems.map((item) => item.itemName).join(", ")}.`
            : "Requer escudo/proteção — requisito não encontrado na ficha.",
      });
    }
  }

  const hasReloadEffect = getPayloadEffects(action).some((effect) => effect.tipo === "recarregar_arma");
  if (hasReloadEffect) {
    const matchingItems = readied
      .filter((instance) => modelBySlug.get(instance.itemSlug)?.usesAmmunition === true)
      .map((instance) => ({ instanceId: instance.id, itemName: instance.itemNome }));
    requirements.push({
      type: "ammunition",
      key: "arma_com_municao",
      label: "Requer arma com munição",
      satisfied: matchingItems.length > 0,
      matchingItems,
      explanation:
        matchingItems.length > 0
          ? `Requer arma com munição — encontrado em: ${matchingItems.map((item) => item.itemName).join(", ")}.`
          : "Requer arma com munição — requisito não encontrado na ficha.",
    });
  }

  return requirements;
}

function testeTextoDe(action: CombatActionContent): string | undefined {
  const teste = action.teste as Record<string, unknown> | undefined;
  if (!teste || typeof teste !== "object") return undefined;
  const tipo = typeof teste.tipo === "string" ? teste.tipo : "teste";
  const pericias = asStringArray(teste.pericias);
  return pericias.length > 0 ? `${tipo} (${pericias.join(", ")})` : tipo;
}

/**
 * Único formato de rolagem integrado neste checkpoint: teste simples, uma
 * perícia canônica diretamente em `teste.pericias`.
 */
export function getSimpleActionRollSkill(
  action: CombatActionContent,
  knownSkillIds: readonly string[],
): { skillId?: string; reason?: string } {
  const teste = action.teste as Record<string, unknown> | undefined;
  if (!teste || typeof teste !== "object") return {};
  const pericias = asStringArray(teste.pericias);
  if (teste.tipo !== "simples" || pericias.length !== 1) {
    return { reason: "Configure esta rolagem manualmente na aba Rolagens." };
  }
  const skillId = pericias[0];
  if (skillId === "variavel" || !knownSkillIds.includes(skillId)) {
    return { reason: "Configure esta rolagem manualmente na aba Rolagens." };
  }
  return { skillId };
}

export function buildActionConsoleItems(
  character: Character,
  combatActions: CombatActionContent[],
  conditions: { slug: string; acoes_habilitadas?: { acao: string }[] }[],
  derivedPaMax: number | undefined,
  derivedReacaoMax: number | undefined,
  knownSkillIds: readonly string[] = [],
  reactionRules?: ReactionRules,
  itemContext?: ActionItemContext,
  turnWindow?: TurnWindow | null,
  narratorOverride = false,
  activeEffects: ActiveEffect[] = [],
): ActionConsoleItem[] {
  const activeConditions = character.condicoes_ativas ?? [];
  const enabledByConditionsMap = actionsEnabledByConditions(activeConditions, conditions);

  return combatActions
    .filter((action) => action.status === "published")
    .filter((action) => {
      const visibility = parseActionVisibility(action);
      if (!visibility.valid) return true; // Exibe diagnóstico, mas nunca habilita.
      const visibleByFlag = isActionVisibleForCharacter(action, activeConditions);
      const visibleByCondition = enabledByConditionsMap.has(normalizeConditionSlug(action.slug));
      return visibleByFlag || visibleByCondition;
    })
    .map((action, index) => {
      const visibility = parseActionVisibility(action);
      const consistencyIssue = validateConditionalActionConsistency(action, conditions);
      const cost = getActionCost(action);
      const canPay = canPayActionCost(
        character,
        cost,
        derivedPaMax,
        derivedReacaoMax,
        reactionRules,
        turnWindow,
        narratorOverride,
      );
      const payloadEffects = getPayloadEffects(action);
      const contentIssues = [visibility.reason, consistencyIssue].filter((issue): issue is string => Boolean(issue));
      const conditionLockReason = getConditionLockReason(action, activeEffects);

      // Postura (checkpoint v0.64): a ação em si tem UM slug de conteúdo,
      // mas funciona como toggle — ativa se ainda não estiver ativa,
      // encerra se já estiver. `posturaSlug` é derivado do payload
      // (nunca hardcoded); `posturaJaAtiva` decide o rótulo exibido e é
      // reaproveitado pelo cliente para montar o log (ver ExecuteActionResult.postureChange).
      const posturaSlug = getPosturaConditionSlug(action);
      const posturaJaAtiva = posturaSlug != null && activeConditionSlugs(activeConditions).has(posturaSlug);

      const automatedEffects: string[] = [];
      const pendingEffects: string[] = [];
      for (const efeito of payloadEffects) {
        // Os efeitos "modificador" de uma ação de postura viram
        // modificador REAL de rolagem assim que a postura é um estado
        // ativo (via deriveActiveEffectsFromConditions, ver relatório) —
        // por isso contam como automatizados aqui também, mas só quando
        // acompanham um efeito `aplicar_postura` na mesma ação (não é uma
        // regra genérica para "modificador" em outras ações avulsas).
        const tratadoComoAutomatico =
          (AUTOMATED_EFFECT_TYPES as readonly string[]).includes(efeito.tipo) ||
          (efeito.tipo === "modificador" && posturaSlug != null);
        if (tratadoComoAutomatico) {
          automatedEffects.push(describeEffect(efeito, posturaSlug != null));
        } else {
          pendingEffects.push(describeEffect(efeito, posturaSlug != null));
        }
      }
      if (Array.isArray(action.sucesso)) {
        for (const efeito of action.sucesso as AutomacaoEfeito[]) {
          if (efeito?.tipo && !(AUTOMATED_EFFECT_TYPES as readonly string[]).includes(efeito.tipo)) {
            pendingEffects.push(`Sucesso: ${effectLabel(efeito.tipo)}`);
          }
        }
      }

      const enabledByConditions = enabledByConditionsMap.get(normalizeConditionSlug(action.slug)) ?? [];
      const roll = getSimpleActionRollSkill(action, knownSkillIds);
      const itemRequirements = getActionItemRequirements(character, action, itemContext);
      const reactionUse =
        cost.reacao != null
          ? canUseReactionAction(
              character,
              derivedReacaoMax,
              reactionRules ?? {
                actionsConsumeReaction: false,
                allowDefenseWithoutReaction: false,
                cumulativePenalty: 0,
                resetAt: "",
                valid: false,
                invalidReason: "Regras de Reação indisponíveis.",
              },
              cost.reacao,
            )
          : null;

      return {
        id: action.id,
        slug: action.slug,
        nome: posturaJaAtiva ? `Encerrar ${action.nome}` : action.nome,
        categoria: action.categoria,
        tipo: action.tipo,
        custoLabel: cost.label,
        custoPA: cost.pa,
        custoReacao: cost.reacao,
        custoLivre: cost.livre,
        custoComposto: cost.composto,
        tagsRolagem: action.tags,
        visibilidade: action.visibilidade,
        descricaoCurta: action.descricao_curta,
        descricaoLonga: action.descricao_longa,
        requisitoTexto: requisitoTextoDe(action),
        itemRequirements,
        testeTexto: testeTextoDe(action),
        efeitoTexto: pendingEffects.length > 0 ? pendingEffects.join(" · ") : undefined,
        payloadAutomacao: action.payload_automacao,
        enabled: contentIssues.length === 0 && canPay.ok && conditionLockReason == null,
        disabledReason: contentIssues[0] ?? conditionLockReason ?? canPay.reason,
        contentIssues,
        isConditionEnabled: enabledByConditions.length > 0,
        enabledByConditions,
        automatedEffects,
        pendingEffects,
        rollSkillId: roll.skillId,
        rollDisabledReason: roll.reason,
        defenseWithoutReaction: reactionUse?.defenseWithoutReaction ?? false,
        reactionPenalty: reactionUse?.penaltyApplied ?? 0,
        reactionWarning: reactionUse?.defenseWithoutReaction
          ? `Sem Reação: esta defesa será realizada com penalidade ${reactionUse.penaltyApplied}.`
          : undefined,
        sortOrder: index,
      } satisfies ActionConsoleItem;
    });
}

// ---------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------

export interface ExecuteActionResult {
  character: Character;
  paBefore: number;
  paAfter: number;
  reactionBefore: number;
  reactionAfter: number;
  removedConditions: string[];
  automatedEffects: string[];
  pendingEffects: string[];
  usedReaction: boolean;
  defenseWithoutReaction: boolean;
  defensesWithoutReactionBefore: number;
  defensesWithoutReactionAfter: number;
  reactionPenaltyApplied: number;
  warnings: string[];
  /**
   * Lembretes textuais para o narrador quando a remoção de uma condição
   * no PRÓPRIO personagem provavelmente tem um vínculo do outro lado
   * (ex.: Escapar remove Agarrado/Imobilizado de si, mas não há alvo
   * estruturado para remover Agarrando de quem prendia — checkpoint
   * v0.64). Nunca bloqueia a ação; é só texto para o log.
   */
  reminders: string[];
  /**
   * Presente só quando a ação tem um efeito `aplicar_postura` — diz
   * exatamente o que aconteceu com a postura (ativar/encerrar,
   * inclusive a outra postura desligada de brinde) para o chamador
   * montar o log sem duplicar essa lógica.
   */
  postureChange: {
    conditionSlug: string;
    conditionName: string;
    direction: "ativar" | "encerrar";
    /** Slug/nome da OUTRA postura desligada automaticamente, se havia uma ativa (só ao ativar). */
    replacedConditionSlug?: string;
    replacedConditionName?: string;
  } | null;
}

/** Remove (ativa: false) as condições cujo slug/conditionId/nome bate com algum de `slugs`, no próprio personagem. */
function removeConditionsBySlug(condicoes: ActiveCondition[], slugs: string[], nowIso: string): { next: ActiveCondition[]; removed: string[] } {
  const targets = new Set(slugs.map(normalizeConditionSlug).filter(Boolean));
  const removed: string[] = [];
  const next = condicoes.map((c) => {
    if (!c.ativa) return c;
    const conditionSlug = c.conditionId
      ? normalizeConditionSlug(c.conditionId)
      : normalizeConditionSlug(c.nome);
    if (targets.has(conditionSlug)) {
      removed.push(c.nome);
      return { ...c, ativa: false, removidaEm: nowIso, removidaOrigem: "acao_combate" as const };
    }
    return c;
  });
  return { next, removed };
}

export function executeActionOnCharacter(
  character: Character,
  action: CombatActionContent,
  derivedPaMax: number | undefined,
  derivedReacaoMax: number | undefined,
  nowIso: string,
  reactionRules?: ReactionRules,
  turnWindow?: TurnWindow | null,
  narratorOverride = false,
  activeEffects: ActiveEffect[] = [],
): ExecuteActionResult {
  const cost = getActionCost(action);
  const paBefore = Math.max(0, (derivedPaMax ?? 0) - (character.estado_jogo?.pa_gastos ?? 0));
  const reactionBefore = Math.max(0, (derivedReacaoMax ?? 0) - (character.estado_jogo?.reacoes_usadas ?? 0));

  const canPay = canPayActionCost(
    character,
    cost,
    derivedPaMax,
    derivedReacaoMax,
    reactionRules,
    turnWindow,
    narratorOverride,
  );
  // Enforcement de condições (fase 7): bloqueia AQUI, não só no botão
  // desabilitado do Console — mesma garantia de defesa em profundidade
  // já usada para o limite de PA em Turnos Rápidos.
  const conditionLockReason = getConditionLockReason(action, activeEffects);
  if (!canPay.ok || conditionLockReason != null) {
    return {
      character,
      paBefore,
      paAfter: paBefore,
      reactionBefore,
      reactionAfter: reactionBefore,
      removedConditions: [],
      automatedEffects: [],
      pendingEffects: [],
      usedReaction: false,
      defenseWithoutReaction: false,
      defensesWithoutReactionBefore: character.estado_jogo?.defesas_sem_reacao ?? 0,
      defensesWithoutReactionAfter: character.estado_jogo?.defesas_sem_reacao ?? 0,
      reactionPenaltyApplied: 0,
      warnings: [conditionLockReason ?? canPay.reason ?? "Ação não pôde ser executada."],
      reminders: [],
      postureChange: null,
    };
  }

  const payloadEffects = getPayloadEffects(action);

  // Ações "puras de remoção" (checkpoint v0.64: Escapar/Soltar alvo/Apagar
  // fogo) só cobram PA se a condição-alvo realmente existia e foi
  // removida — nunca cobram por um clique que não fez nada. Isso NÃO
  // muda o custo de nenhuma outra ação (postura, ataque, etc.), que
  // continuam cobrando ao executar como já funcionava.
  const isPureRemovalAction =
    payloadEffects.length > 0 &&
    payloadEffects.every((e) => e.tipo === "remover_condicao" || e.tipo === "remover_condicoes" || e.tipo === "remover_restricao_movimento");

  const removal = getActionRemovalEffects(action);
  let removedConditions: string[] = [];
  let characterAposRemocao: Character = character;
  if (removal.conditionsToRemove.length > 0) {
    const result = removeConditionsBySlug(character.condicoes_ativas ?? [], removal.conditionsToRemove, nowIso);
    characterAposRemocao = { ...character, condicoes_ativas: result.next };
    removedConditions = result.removed;
  }

  const deveCobrarPA = !isPureRemovalAction || removedConditions.length > 0;

  let nextCharacter: Character = characterAposRemocao;
  let paAfter = paBefore;
  let reactionAfter = reactionBefore;
  let usedReaction = false;
  let defenseWithoutReaction = false;
  let defensesWithoutReactionBefore = character.estado_jogo?.defesas_sem_reacao ?? 0;
  let defensesWithoutReactionAfter = defensesWithoutReactionBefore;
  let reactionPenaltyApplied = 0;

  if (cost.pa != null && deveCobrarPA) {
    const paGastosAntes = nextCharacter.estado_jogo?.pa_gastos ?? 0;
    nextCharacter = { ...nextCharacter, estado_jogo: { ...nextCharacter.estado_jogo, pa_gastos: paGastosAntes + cost.pa } };
    paAfter = paBefore - cost.pa;
  } else if (cost.reacao != null) {
    const spend = spendReactionForDefense(
      nextCharacter,
      derivedReacaoMax,
      reactionRules ?? {
        actionsConsumeReaction: false,
        allowDefenseWithoutReaction: false,
        cumulativePenalty: 0,
        resetAt: "",
        valid: false,
        invalidReason: "Regras de Reação indisponíveis.",
      },
      cost.reacao,
    );
    nextCharacter = spend.character;
    reactionAfter = spend.reactionAfter;
    usedReaction = spend.usedReaction;
    defenseWithoutReaction = spend.defenseWithoutReaction;
    defensesWithoutReactionBefore = spend.defensesWithoutReactionBefore;
    defensesWithoutReactionAfter = spend.defensesWithoutReactionAfter;
    reactionPenaltyApplied = spend.penaltyApplied;
  }

  // Postura (checkpoint v0.64): toggle sobre condicoes_ativas — ativa se
  // ainda não estiver ativa (desligando a outra postura de brinde, sem
  // custo extra), encerra se já estiver. Reaproveita o mesmo array/
  // shape de ActiveCondition que qualquer outra condição — nada de
  // estrutura paralela.
  let postureChange: ExecuteActionResult["postureChange"] = null;
  const posturaSlug = getPosturaConditionSlug(action);
  if (posturaSlug) {
    const atuais = nextCharacter.condicoes_ativas ?? [];
    const posturaAtiva = atuais.find((c) => c.ativa && c.conditionId === posturaSlug);
    if (posturaAtiva) {
      nextCharacter = {
        ...nextCharacter,
        condicoes_ativas: atuais.map((c) =>
          c.id === posturaAtiva.id ? { ...c, ativa: false, removidaEm: nowIso, removidaOrigem: "acao_combate" as const } : c,
        ),
      };
      postureChange = { conditionSlug: posturaSlug, conditionName: posturaAtiva.nome, direction: "encerrar" };
    } else {
      const outroSlug = posturaSlug === "postura_ofensiva" ? "postura_defensiva" : "postura_ofensiva";
      const outraAtiva = atuais.find((c) => c.ativa && c.conditionId === outroSlug);
      let proximasCondicoes = atuais;
      if (outraAtiva) {
        proximasCondicoes = proximasCondicoes.map((c) =>
          c.id === outraAtiva.id ? { ...c, ativa: false, removidaEm: nowIso, removidaOrigem: "acao_combate" as const } : c,
        );
      }
      const novaCondicao: ActiveCondition = {
        id: crypto.randomUUID(),
        conditionId: posturaSlug,
        nome: action.nome,
        origem: "action_console",
        aplicadaEm: nowIso,
        removidaEm: null,
        ativa: true,
      };
      nextCharacter = { ...nextCharacter, condicoes_ativas: [...proximasCondicoes, novaCondicao] };
      postureChange = {
        conditionSlug: posturaSlug,
        conditionName: action.nome,
        direction: "ativar",
        replacedConditionSlug: outraAtiva ? outroSlug : undefined,
        replacedConditionName: outraAtiva?.nome,
      };
    }
  }

  const automatedEffects: string[] = [];
  const pendingEffects: string[] = [];
  const warnings: string[] = [];
  for (const efeito of payloadEffects) {
    const tratadoComoAutomatico =
      efeito.tipo === "remover_condicao" ||
      efeito.tipo === "remover_condicoes" ||
      efeito.tipo === "remover_restricao_movimento" ||
      efeito.tipo === "aplicar_postura" ||
      (efeito.tipo === "modificador" && posturaSlug != null);
    if (tratadoComoAutomatico) {
      automatedEffects.push(describeEffect(efeito, posturaSlug != null));
    } else {
      pendingEffects.push(describeEffect(efeito, posturaSlug != null));
    }
  }

  // Lembretes de vínculo com outra criatura (checkpoint v0.64) — a
  // remoção acima só afeta o PRÓPRIO personagem; sem alvo estruturado,
  // o narrador precisa resolver o lado do vínculo manualmente.
  const reminders: string[] = [];
  if (removedConditions.length > 0) {
    if (removal.conditionsToRemove.includes("agarrado") || removal.conditionsToRemove.includes("imobilizado")) {
      reminders.push("Se havia uma criatura mantendo o agarrão, remova Agarrando dela manualmente.");
    }
    if (removal.conditionsToRemove.includes("agarrando")) {
      reminders.push("Se havia alvo vinculado, remova Agarrado/Imobilizado dele manualmente.");
    }
  }

  return {
    character: nextCharacter,
    paBefore,
    paAfter,
    reactionBefore,
    reactionAfter,
    removedConditions,
    automatedEffects,
    pendingEffects,
    usedReaction,
    defenseWithoutReaction,
    defensesWithoutReactionBefore,
    defensesWithoutReactionAfter,
    reactionPenaltyApplied,
    warnings,
    reminders,
    postureChange,
  };
}
