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
  testeTexto?: string;
  efeitoTexto?: string;
  payloadAutomacao?: unknown;
  enabled: boolean;
  disabledReason?: string;
  isConditionEnabled: boolean;
  enabledByConditions: string[];
  automatedEffects: string[];
  pendingEffects: string[];
  sortOrder: number;
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
    visibilidade: typeof raw.visibilidade === "string" ? raw.visibilidade : "sempre",
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
  };
}

// ---------------------------------------------------------------------
// Visibilidade condicional
// ---------------------------------------------------------------------

/** Slugs de condição ativos no personagem — considera conditionId, senão cai para o nome em minúsculas. */
function activeConditionSlugs(activeConditions: ActiveCondition[]): Set<string> {
  const slugs = new Set<string>();
  for (const c of activeConditions) {
    if (!c.ativa) continue;
    if (c.conditionId) slugs.add(c.conditionId);
    else slugs.add(c.nome.trim().toLowerCase());
  }
  return slugs;
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
  if (action.visibilidade === "sempre") return true;
  if (action.visibilidade.startsWith("condicao:")) {
    const required = action.visibilidade
      .slice("condicao:".length)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const active = activeConditionSlugs(activeConditions);
    return required.some((slug) => active.has(slug));
  }
  // Visibilidade desconhecida — não inventar regra; mostra por padrão
  // (comportamento mais seguro para não esconder uma ação nova).
  return true;
}

/** Slugs de ação habilitados pelas condições ativas via `condicoes[].acoes_habilitadas`. */
function actionsEnabledByConditions(
  activeConditions: ActiveCondition[],
  conditions: { slug: string; acoes_habilitadas?: { acao: string }[] }[],
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const active = activeConditionSlugs(activeConditions);
  for (const cond of conditions) {
    if (!active.has(cond.slug)) continue;
    for (const entry of cond.acoes_habilitadas ?? []) {
      const list = result.get(entry.acao) ?? [];
      list.push(cond.slug);
      result.set(entry.acao, list);
    }
  }
  return result;
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
}

export function getActionCost(action: CombatActionContent): ActionCost {
  const custo = action.custo as Record<string, unknown> | undefined;
  const tipo = typeof custo?.tipo === "string" ? custo.tipo : undefined;

  if (tipo === "pa") {
    const valor = typeof custo?.valor === "number" ? custo.valor : 0;
    return { pa: valor, livre: false, composto: false, label: `${valor} PA` };
  }
  if (tipo === "reacao") {
    const valor = typeof custo?.valor === "number" ? custo.valor : 0;
    return { reacao: valor, livre: false, composto: false, label: `${valor} Reação` };
  }
  if (tipo === "livre") {
    return { livre: true, composto: false, label: "Livre" };
  }
  if (tipo === "composto") {
    return { livre: false, composto: true, label: "Composto (não automatizado)" };
  }
  return { livre: false, composto: false, label: "—" };
}

export interface CanPayResult {
  ok: boolean;
  reason?: string;
}

export function canPayActionCost(
  character: Character,
  cost: ActionCost,
  derivedPaMax: number | undefined,
  derivedReacaoMax: number | undefined,
): CanPayResult {
  if (cost.composto) {
    return { ok: false, reason: "Custo composto ainda não automatizado." };
  }
  if (cost.livre) return { ok: true };

  if (cost.pa != null) {
    const paMax = derivedPaMax ?? 0;
    const paGastos = character.estado_jogo?.pa_gastos ?? 0;
    const paAtual = Math.max(0, paMax - paGastos);
    if (paAtual < cost.pa) {
      return { ok: false, reason: `PA insuficiente (atual: ${paAtual}, necessário: ${cost.pa}).` };
    }
    return { ok: true };
  }
  if (cost.reacao != null) {
    const reacaoMax = derivedReacaoMax ?? 0;
    const reacoesUsadas = character.estado_jogo?.reacoes_usadas ?? 0;
    const reacaoAtual = Math.max(0, reacaoMax - reacoesUsadas);
    if (reacaoAtual < cost.reacao) {
      return { ok: false, reason: `Reação insuficiente (atual: ${reacaoAtual}, necessário: ${cost.reacao}).` };
    }
    return { ok: true };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------
// Efeitos automatizados (subconjunto simples deste checkpoint)
// ---------------------------------------------------------------------

const AUTOMATED_EFFECT_TYPES = ["remover_condicao", "remover_condicoes", "remover_restricao_movimento", "aplicar_postura"] as const;

interface AutomacaoEfeito {
  tipo: string;
  [key: string]: unknown;
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
  aplicar_postura: "Aplica postura (registrado no log — sem modificador ativo automático ainda)",
  habilitar_deslocamento_em_partes: "Deslocamento fracionável (não automatizado)",
  incrementar_custo_por_repeticao_no_turno: "Repetição no turno incrementa custo (não automatizado)",
  criar_abertura: "Cria abertura tática (não automatizado)",
  resolver_acao: "Resolução livre pelo narrador (não automatizado)",
  sacar_ou_guardar: "Sacar/guardar equipamento (não automatizado)",
  recarregar_arma: "Recarrega arma (não automatizado)",
  modificador: "Modificador de rolagem (não automatizado)",
  resolver_ataque: "Resolução de ataque (não automatizado)",
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

// ---------------------------------------------------------------------
// Construção dos itens de UI
// ---------------------------------------------------------------------

function requisitoTextoDe(action: CombatActionContent): string | undefined {
  const req = action.requisitos;
  if (!Array.isArray(req) || req.length === 0) return undefined;
  return req
    .map((r) => {
      if (r && typeof r === "object" && "tipo" in r) return String((r as Record<string, unknown>).tipo);
      return String(r);
    })
    .join("; ");
}

function testeTextoDe(action: CombatActionContent): string | undefined {
  const teste = action.teste as Record<string, unknown> | undefined;
  if (!teste || typeof teste !== "object") return undefined;
  const tipo = typeof teste.tipo === "string" ? teste.tipo : "teste";
  const pericias = asStringArray(teste.pericias);
  return pericias.length > 0 ? `${tipo} (${pericias.join(", ")})` : tipo;
}

export function buildActionConsoleItems(
  character: Character,
  combatActions: CombatActionContent[],
  conditions: { slug: string; acoes_habilitadas?: { acao: string }[] }[],
  derivedPaMax: number | undefined,
  derivedReacaoMax: number | undefined,
): ActionConsoleItem[] {
  const activeConditions = character.condicoes_ativas ?? [];
  const enabledByConditionsMap = actionsEnabledByConditions(activeConditions, conditions);

  return combatActions
    .filter((action) => action.status === "published")
    .filter((action) => {
      const visibleByFlag = isActionVisibleForCharacter(action, activeConditions);
      const visibleByCondition = enabledByConditionsMap.has(action.slug);
      return visibleByFlag || visibleByCondition;
    })
    .map((action, index) => {
      const cost = getActionCost(action);
      const canPay = canPayActionCost(character, cost, derivedPaMax, derivedReacaoMax);
      const payloadEffects = getPayloadEffects(action);

      const automatedEffects: string[] = [];
      const pendingEffects: string[] = [];
      for (const efeito of payloadEffects) {
        if ((AUTOMATED_EFFECT_TYPES as readonly string[]).includes(efeito.tipo)) {
          automatedEffects.push(effectLabel(efeito.tipo));
        } else {
          pendingEffects.push(effectLabel(efeito.tipo));
        }
      }
      if (Array.isArray(action.sucesso)) {
        for (const efeito of action.sucesso as AutomacaoEfeito[]) {
          if (efeito?.tipo && !(AUTOMATED_EFFECT_TYPES as readonly string[]).includes(efeito.tipo)) {
            pendingEffects.push(`Sucesso: ${effectLabel(efeito.tipo)}`);
          }
        }
      }

      const enabledByConditions = enabledByConditionsMap.get(action.slug) ?? [];

      return {
        id: action.id,
        slug: action.slug,
        nome: action.nome,
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
        testeTexto: testeTextoDe(action),
        efeitoTexto: pendingEffects.length > 0 ? pendingEffects.join(" · ") : undefined,
        payloadAutomacao: action.payload_automacao,
        enabled: canPay.ok,
        disabledReason: canPay.reason,
        isConditionEnabled: enabledByConditions.length > 0,
        enabledByConditions,
        automatedEffects,
        pendingEffects,
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
  warnings: string[];
}

/** Remove (ativa: false) as condições cujo slug/conditionId/nome bate com algum de `slugs`, no próprio personagem. */
function removeConditionsBySlug(condicoes: ActiveCondition[], slugs: string[], nowIso: string): { next: ActiveCondition[]; removed: string[] } {
  const targets = new Set(slugs.map((s) => s.toLowerCase()));
  const removed: string[] = [];
  const next = condicoes.map((c) => {
    if (!c.ativa) return c;
    const chaveConditionId = (c.conditionId ?? "").toLowerCase();
    const chaveNome = c.nome.trim().toLowerCase();
    if (targets.has(chaveConditionId) || targets.has(chaveNome)) {
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
): ExecuteActionResult {
  const cost = getActionCost(action);
  const paBefore = Math.max(0, (derivedPaMax ?? 0) - (character.estado_jogo?.pa_gastos ?? 0));
  const reactionBefore = Math.max(0, (derivedReacaoMax ?? 0) - (character.estado_jogo?.reacoes_usadas ?? 0));

  const canPay = canPayActionCost(character, cost, derivedPaMax, derivedReacaoMax);
  if (!canPay.ok) {
    return {
      character,
      paBefore,
      paAfter: paBefore,
      reactionBefore,
      reactionAfter: reactionBefore,
      removedConditions: [],
      automatedEffects: [],
      pendingEffects: [],
      warnings: [canPay.reason ?? "Ação não pôde ser executada."],
    };
  }

  let nextCharacter: Character = character;
  let paAfter = paBefore;
  let reactionAfter = reactionBefore;

  if (cost.pa != null) {
    const paGastosAntes = character.estado_jogo?.pa_gastos ?? 0;
    nextCharacter = { ...nextCharacter, estado_jogo: { ...nextCharacter.estado_jogo, pa_gastos: paGastosAntes + cost.pa } };
    paAfter = paBefore - cost.pa;
  } else if (cost.reacao != null) {
    const reacoesAntes = character.estado_jogo?.reacoes_usadas ?? 0;
    nextCharacter = { ...nextCharacter, estado_jogo: { ...nextCharacter.estado_jogo, reacoes_usadas: reacoesAntes + cost.reacao } };
    reactionAfter = reactionBefore - cost.reacao;
  }

  const removal = getActionRemovalEffects(action);
  let removedConditions: string[] = [];
  if (removal.conditionsToRemove.length > 0) {
    const result = removeConditionsBySlug(nextCharacter.condicoes_ativas ?? [], removal.conditionsToRemove, nowIso);
    nextCharacter = { ...nextCharacter, condicoes_ativas: result.next };
    removedConditions = result.removed;
  }

  const automatedEffects: string[] = [];
  const pendingEffects: string[] = [];
  const warnings: string[] = [];
  for (const efeito of getPayloadEffects(action)) {
    if (efeito.tipo === "remover_condicao" || efeito.tipo === "remover_condicoes" || efeito.tipo === "remover_restricao_movimento") {
      automatedEffects.push(effectLabel(efeito.tipo));
    } else if (efeito.tipo === "aplicar_postura") {
      automatedEffects.push(effectLabel(efeito.tipo));
      warnings.push("Posturas ainda não geram modificador ativo automático — só registradas no log.");
    } else {
      pendingEffects.push(effectLabel(efeito.tipo));
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
    warnings,
  };
}
