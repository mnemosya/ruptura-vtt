/**
 * Inventário, carteira e loja do Mercado Noturno — checkpoint v0.49
 * (PRD 13), modelo de slots de runa no v0.56. Catálogo inteiro de
 * itens vem de `content_documents` (content_type="item", `listItems()`,
 * já existente — 119 itens publicados: armas, armaduras, escudos,
 * explosivos, farmácia, vertinas, ferramentas, dispositivos, veículos,
 * munição). A ficha NUNCA depende de lista hardcoded — cada item no
 * inventário é uma INSTÂNCIA ligada ao slug do modelo publicado, com
 * estado próprio (quantidade, loadout, runas instaladas).
 *
 * Escopo deliberadamente pequeno (mesmo critério de v0.47/v0.48):
 * comprar item da loja (desconta carteira, cria instância) e gerenciar
 * loadout simples (equipado/empunhado/acesso rápido/mochila). NÃO
 * implementado (PRD 13.4–13.9, nenhum checkpoint anterior cobriu):
 * MIT/PD por região, munição/Rajada, propriedades em crítico, kravita,
 * ações de item (granadas/farmácia/vertinas aplicando efeito
 * automático), desconto/fiado do Mercador, envio para inventário do
 * bando. Tudo isso fica como pendência documentada.
 *
 * Runas instaladas (v0.56, achado Caso B do checkpoint anterior):
 * auditoria de `db_runas_normalizado_v1_2.json` e
 * `db_equipamentos_normalizado_v1_2.json` encontrou regra canônica
 * SUFICIENTE (Caso A) — `rune.slots_possiveis` (categoria: "arma"/
 * "armadura"/"escudo"), `rune.restricao_subtipo` (opcional, casa com
 * `item.subtipo` só em armas) e `item.estatisticas.slots_runa_max`
 * (limite real por item, presente em TODAS as armas/armaduras/escudos
 * do DB). `getRuneCompatibility`/`installRuneOnItem` implementam essa
 * validação completa — nunca inventam limite quando o dado existe.
 */

import type {
  Character,
  TechnicalItemPropertyInstance,
  TechnicalItemSourceType,
  TechnicalItemState,
} from "./types";
import type { TechnicalContentItem } from "../content";

// ---------------------------------------------------------------------
// Conteúdo bruto (subconjunto lido de content_documents.payload)
// ---------------------------------------------------------------------

export interface ItemContent {
  id: string;
  slug: string;
  nome: string;
  categoria: string;
  categoria_label?: string;
  /** subtipo do modelo (ex.: "corpo_a_corpo" em armas) — usado só para checar `restricao_subtipo` de runa. */
  subtipo?: string;
  raridade?: string;
  preco: number;
  descricao_curta?: string;
  tags: string[];
  /** Slugs canônicos de `estatisticas.propriedades` do modelo. */
  propertySlugs: string[];
  /** Campo de modelo presente em armaduras/escudos; não representa o estado atual da instância. */
  ocultavel?: "sim" | "parcial" | "nao";
  /** `estatisticas.slots_runa_max` do payload real — `null` quando o item não aceita runa ou o dado está ausente (nunca inventado). */
  slotsRunaMax: number | null;
  status: string;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Preserva o payload inteiro do registro — não achata nem descarta campos (estatísticas completas ficam disponíveis para checkpoints futuros). */
export function normalizeItemContent(raw: Record<string, unknown>): ItemContent {
  const estatisticas = asRecord(raw.estatisticas);
  return {
    id: String(raw.id ?? raw.slug ?? ""),
    slug: String(raw.slug ?? raw.id ?? ""),
    nome: String(raw.nome ?? raw.slug ?? "Item"),
    categoria: String(raw.categoria ?? ""),
    categoria_label: typeof raw.categoria_label === "string" ? raw.categoria_label : undefined,
    subtipo: typeof raw.subtipo === "string" ? raw.subtipo : undefined,
    raridade: typeof raw.raridade === "string" ? raw.raridade : undefined,
    preco: typeof raw.preco === "number" && Number.isFinite(raw.preco) ? raw.preco : 0,
    descricao_curta: typeof raw.descricao_curta === "string" ? raw.descricao_curta : undefined,
    tags: asStringArray(raw.tags),
    propertySlugs: asStringArray(estatisticas?.propriedades),
    ocultavel:
      raw.ocultavel === "sim" || raw.ocultavel === "parcial" || raw.ocultavel === "nao"
        ? raw.ocultavel
        : undefined,
    slotsRunaMax: typeof estatisticas?.slots_runa_max === "number" ? estatisticas.slots_runa_max : null,
    status: String(raw.status ?? "published"),
  };
}

// ---------------------------------------------------------------------
// Carteira (PRD 13.1) — três "carteiras" simples, nunca uma soma única.
// ---------------------------------------------------------------------

export type WalletId = "aretz_informal" | "cdi" | "cdi_craqueada";

export interface Wallet {
  aretz_informal: number;
  cdi: number;
  cdi_craqueada: number;
}

export const WALLET_LABELS: Record<WalletId, string> = {
  aretz_informal: "Aretz informal",
  cdi: "CDI",
  cdi_craqueada: "CDI Craqueada",
};

// ---------------------------------------------------------------------
// Instância de item no inventário — loadout simples (PRD 13.3).
// ---------------------------------------------------------------------

export type ItemLoadoutState = "equipado" | "empunhado" | "acesso_rapido" | "mochila";

export const ITEM_LOADOUT_STATES: readonly ItemLoadoutState[] = ["equipado", "empunhado", "acesso_rapido", "mochila"];

export interface InstalledRune {
  id: string;
  /** slug do content_documents (content_type="rune"). */
  runeContentId: string;
  installedAt: string;
  notas?: string;
}

export interface InventoryItemInstance {
  id: string;
  itemSlug: string;
  itemNome: string;
  categoria: string;
  /** subtipo do modelo no momento da compra — ausente em instâncias antigas (checkpoint anterior ao v0.56). */
  subtipo?: string;
  quantidade: number;
  estado: ItemLoadoutState;
  adquiridoEm: string;
  precoPago?: number;
  /** Runas instaladas nesta instância (checkpoint v0.56) — ausente = nenhuma ainda. */
  runasInstaladas?: InstalledRune[];
  /** Camada textual/rastreável da instância; nunca gera ActiveEffect por si só. */
  propriedadesTecnicas?: TechnicalItemPropertyInstance[];
  /** Estado manual da instância; qualquer custo guardado é apenas informativo. */
  estadosTecnicos?: TechnicalItemState[];
}

export type ItemPropertyClassification =
  | "renderable_text"
  | "action_requirement"
  | "passive_modifier"
  | "critical_suggestion"
  | "requires_system"
  | "ambiguous";

export type ResolvedItemPropertySourceType = "item_base" | "rune" | "manual" | "technical";

export interface NormalizedItemProperty {
  id: string;
  slug: string;
  label: string;
  description?: string;
  classification: ItemPropertyClassification;
  classificationLabel: string;
  payloadAutomacao?: unknown;
  triggers: string[];
  critical: boolean;
  status: string;
}

export interface ResolvedItemPropertySource {
  type: ResolvedItemPropertySourceType;
  id: string;
  label: string;
}

export interface ResolvedItemProperty extends NormalizedItemProperty {
  key: string;
  value?: string | number | boolean | null;
  sources: ResolvedItemPropertySource[];
  missingCatalog?: boolean;
}

const TECHNICAL_ITEM_SOURCE_TYPES: readonly TechnicalItemSourceType[] = ["rune", "property", "manual"];

function normalizeTechnicalProperty(value: unknown): TechnicalItemPropertyInstance | null {
  const raw = asRecord(value);
  if (!raw) return null;
  if (
    typeof raw.id !== "string" ||
    !TECHNICAL_ITEM_SOURCE_TYPES.includes(raw.sourceType as TechnicalItemSourceType) ||
    typeof raw.sourceContentId !== "string" ||
    typeof raw.key !== "string" ||
    typeof raw.label !== "string"
  ) {
    return null;
  }
  return {
    ...raw,
    id: raw.id,
    sourceType: raw.sourceType as TechnicalItemSourceType,
    sourceContentId: raw.sourceContentId,
    sourceInstanceId: typeof raw.sourceInstanceId === "string" ? raw.sourceInstanceId : undefined,
    sourceLabel: typeof raw.sourceLabel === "string" ? raw.sourceLabel : undefined,
    key: raw.key,
    label: raw.label,
    value:
      raw.value === null || ["string", "number", "boolean"].includes(typeof raw.value)
        ? (raw.value as string | number | boolean | null)
        : undefined,
    description: typeof raw.description === "string" ? raw.description : undefined,
    mechanicalEffectAutomated: raw.mechanicalEffectAutomated === true,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : undefined,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
  };
}

function normalizeTechnicalState(value: unknown): TechnicalItemState | null {
  const raw = asRecord(value);
  if (!raw) return null;
  if (
    typeof raw.id !== "string" ||
    !TECHNICAL_ITEM_SOURCE_TYPES.includes(raw.sourceType as TechnicalItemSourceType) ||
    typeof raw.sourceContentId !== "string" ||
    typeof raw.key !== "string" ||
    typeof raw.label !== "string" ||
    typeof raw.active !== "boolean"
  ) {
    return null;
  }
  return {
    ...raw,
    id: raw.id,
    sourceType: raw.sourceType as TechnicalItemSourceType,
    sourceContentId: raw.sourceContentId,
    sourceInstanceId: typeof raw.sourceInstanceId === "string" ? raw.sourceInstanceId : undefined,
    sourceLabel: typeof raw.sourceLabel === "string" ? raw.sourceLabel : undefined,
    key: raw.key,
    label: raw.label,
    active: raw.active,
    activeLabel: typeof raw.activeLabel === "string" ? raw.activeLabel : undefined,
    inactiveLabel: typeof raw.inactiveLabel === "string" ? raw.inactiveLabel : undefined,
    activationHint: typeof raw.activationHint === "string" ? raw.activationHint : undefined,
    actionPointCost:
      typeof raw.actionPointCost === "number" && Number.isFinite(raw.actionPointCost)
        ? raw.actionPointCost
        : undefined,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : undefined,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
  };
}

/**
 * Normaliza apenas a camada técnica de uma instância. Payload legado,
 * ausente ou malformado vira arrays vazios/filtrados; campos desconhecidos
 * dentro de entradas válidas são preservados pelo spread.
 */
export function normalizeItemTechnicalState(rawItem: unknown): {
  propriedadesTecnicas: TechnicalItemPropertyInstance[];
  estadosTecnicos: TechnicalItemState[];
} {
  const raw = asRecord(rawItem);
  const propriedadesTecnicas = Array.isArray(raw?.propriedadesTecnicas)
    ? raw.propriedadesTecnicas.map(normalizeTechnicalProperty).filter((item): item is TechnicalItemPropertyInstance => item !== null)
    : [];
  const estadosTecnicos = Array.isArray(raw?.estadosTecnicos)
    ? raw.estadosTecnicos.map(normalizeTechnicalState).filter((item): item is TechnicalItemState => item !== null)
    : [];
  return { propriedadesTecnicas, estadosTecnicos };
}

/**
 * Combina propriedades persistidas e derivadas sem repetir a mesma
 * chave da mesma fonte de conteúdo. A primeira ocorrência é preservada.
 */
export function deriveItemTechnicalProperties(
  instance: Pick<InventoryItemInstance, "propriedadesTecnicas">,
  derived: TechnicalItemPropertyInstance[] = [],
): TechnicalItemPropertyInstance[] {
  const all = [...normalizeItemTechnicalState(instance).propriedadesTecnicas, ...derived];
  const seen = new Set<string>();
  return all.filter((property) => {
    const identity = `${property.sourceType}:${property.sourceContentId}:${property.key}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

/**
 * Traduz somente o efeito textual canônico e inequivocamente
 * renderizável `torna_ocultavel` de runas INSTALADAS. É uma projeção
 * passiva: não cria estado ligado/desligado, não consome PA e não entra
 * em ActiveEffects. Remover a instalação remove a propriedade na próxima
 * derivação, sem precisar mutar/corrigir o payload salvo.
 */
export function deriveRuneItemProperties(
  instance: Pick<InventoryItemInstance, "runasInstaladas">,
  runes: TechnicalContentItem[],
): TechnicalItemPropertyInstance[] {
  const bySlug = new Map(runes.map((rune) => [rune.slug, rune]));
  const properties: TechnicalItemPropertyInstance[] = [];

  for (const installation of instance.runasInstaladas ?? []) {
    const rune = bySlug.get(installation.runeContentId);
    if (!rune || rune.status !== "published") continue;
    const payload = asRecord(rune.payloadAutomacao);
    const effects = Array.isArray(payload?.efeitos) ? payload.efeitos : [];

    effects.forEach((effectValue, index) => {
      const effect = asRecord(effectValue);
      if (!effect || effect.tipo !== "modificador" || effect.efeito !== "torna_ocultavel") return;
      properties.push({
        id: `rune-property:${installation.id}:${index}:ocultavel`,
        sourceType: "rune",
        sourceContentId: rune.slug,
        sourceInstanceId: installation.id,
        sourceLabel: `Runa: ${rune.nome}`,
        key: "ocultavel",
        label: "Ocultável",
        value: true,
        description: "O item pode ser recolhido ou ocultado conforme a descrição da runa.",
        mechanicalEffectAutomated: false,
        createdAt: installation.installedAt,
      });
    });
  }

  return deriveItemTechnicalProperties({ propriedadesTecnicas: [] }, properties);
}

function propertyEffects(property: TechnicalContentItem): {
  effects: Record<string, unknown>[];
  malformed: boolean;
} {
  const payload = asRecord(property.payloadAutomacao);
  if (property.payloadAutomacao == null) return { effects: [], malformed: false };
  if (!payload || !Array.isArray(payload.efeitos)) return { effects: [], malformed: true };
  const effects = payload.efeitos
    .map(asRecord)
    .filter((effect): effect is Record<string, unknown> => effect !== null);
  return { effects, malformed: effects.length !== payload.efeitos.length };
}

const PROPERTY_CLASSIFICATION_LABELS: Record<ItemPropertyClassification, string> = {
  renderable_text: "texto",
  action_requirement: "pré-requisito",
  passive_modifier: "passivo",
  critical_suggestion: "crítico",
  requires_system: "sistema futuro",
  ambiguous: "ambígua",
};

/**
 * Normaliza uma propriedade publicada sem catálogo paralelo por slug:
 * a classificação nasce do próprio payload/gatilhos.
 */
export function normalizeItemProperty(property: TechnicalContentItem): NormalizedItemProperty {
  const triggers = asStringArray(property.raw.gatilhos);
  const margemMinima = property.raw.margem_minima;
  const parsed = propertyEffects(property);
  let classification: ItemPropertyClassification;

  if (!property.slug || parsed.malformed) {
    classification = "ambiguous";
  } else if (margemMinima === "sucesso_critico" || triggers.includes("sucesso_critico")) {
    classification = "critical_suggestion";
  } else if (parsed.effects.some((effect) => effect.tipo === "habilitar_acao_defensiva")) {
    classification = "action_requirement";
  } else if (
    parsed.effects.length > 0 &&
    parsed.effects.every((effect) => {
      const tags = asStringArray(effect.alvo_tags);
      const value = effect.valor ?? effect.bonus;
      return (
        effect.tipo === "modificador" &&
        typeof value === "number" &&
        tags.length > 0 &&
        effect.quando == null &&
        effect.gatilho == null &&
        effect.restrito_a == null
      );
    })
  ) {
    classification = "passive_modifier";
  } else if (parsed.effects.length === 0) {
    classification = "renderable_text";
  } else {
    classification = "requires_system";
  }

  return {
    id: property.id,
    slug: property.slug,
    label: property.nome,
    description: property.descricaoCurta,
    classification,
    classificationLabel: PROPERTY_CLASSIFICATION_LABELS[classification],
    payloadAutomacao: property.payloadAutomacao,
    triggers,
    critical: classification === "critical_suggestion",
    status: property.status,
  };
}

/** Resolve os slugs do modelo contra o catálogo publicado, preservando referências órfãs como diagnóstico. */
export function getItemModelProperties(
  item: ItemContent,
  properties: TechnicalContentItem[],
): ResolvedItemProperty[] {
  const bySlug = new Map(properties.map((property) => [property.slug, property]));
  const resolved: ResolvedItemProperty[] = item.propertySlugs.map((slug) => {
    const content = bySlug.get(slug);
    const source: ResolvedItemPropertySource = {
      type: "item_base",
      id: item.slug,
      label: `Item base: ${item.nome}`,
    };
    if (!content) {
      return {
        id: `missing-property:${item.slug}:${slug}`,
        slug,
        key: slug,
        label: slug,
        description: "Propriedade referenciada pelo item, mas ausente do catálogo carregado.",
        classification: "ambiguous",
        classificationLabel: PROPERTY_CLASSIFICATION_LABELS.ambiguous,
        triggers: [],
        critical: false,
        status: "missing",
        sources: [source],
        missingCatalog: true,
      };
    }
    const normalized = normalizeItemProperty(content);
    return { ...normalized, key: normalized.slug, sources: [source] };
  });

  if (item.ocultavel) {
    const valueLabel = item.ocultavel === "sim" ? "Sim" : item.ocultavel === "parcial" ? "Parcial" : "Não";
    resolved.push({
      id: `item-property:${item.slug}:ocultavel`,
      slug: "ocultavel",
      key: "ocultavel",
      label: "Ocultável",
      value: valueLabel,
      description: `Ocultabilidade declarada no modelo do item: ${valueLabel.toLowerCase()}.`,
      classification: "renderable_text",
      classificationLabel: PROPERTY_CLASSIFICATION_LABELS.renderable_text,
      triggers: [],
      critical: false,
      status: item.status,
      sources: [{ type: "item_base", id: item.slug, label: `Item base: ${item.nome}` }],
    });
  }

  return resolved;
}

function technicalPropertySource(property: TechnicalItemPropertyInstance): ResolvedItemPropertySource {
  const type: ResolvedItemPropertySourceType =
    property.sourceType === "rune" ? "rune" : property.sourceType === "manual" ? "manual" : "technical";
  return {
    type,
    id: property.sourceInstanceId ?? property.sourceContentId,
    label: property.sourceLabel ?? property.sourceContentId,
  };
}

/**
 * Visão única das propriedades do item: camadas da instância/runa têm
 * precedência sobre o modelo; fontes duplicadas são agregadas por chave.
 */
export function deriveItemProperties(params: {
  instance: InventoryItemInstance;
  item?: ItemContent;
  properties: TechnicalContentItem[];
  runes?: TechnicalContentItem[];
}): ResolvedItemProperty[] {
  const technical = deriveItemTechnicalProperties(
    params.instance,
    deriveRuneItemProperties(params.instance, params.runes ?? []),
  ).map((property): ResolvedItemProperty => ({
    id: property.id,
    slug: property.key,
    key: property.key,
    label: property.label,
    value: property.value,
    description: property.description,
    classification: "renderable_text",
    classificationLabel: PROPERTY_CLASSIFICATION_LABELS.renderable_text,
    triggers: [],
    critical: false,
    status: "instance",
    sources: [technicalPropertySource(property)],
  }));
  const fromModel = params.item ? getItemModelProperties(params.item, params.properties) : [];
  const merged = new Map<string, ResolvedItemProperty>();

  for (const property of [...technical, ...fromModel]) {
    const existing = merged.get(property.key);
    if (!existing) {
      merged.set(property.key, property);
      continue;
    }
    const sourceKeys = new Set(existing.sources.map((source) => `${source.type}:${source.id}`));
    const newSources = property.sources.filter((source) => !sourceKeys.has(`${source.type}:${source.id}`));
    merged.set(property.key, { ...existing, sources: [...existing.sources, ...newSources] });
  }

  return [...merged.values()];
}

/** Alterna somente um estado técnico já existente; nunca consome PA ou gera log/efeito. */
export function setItemTechnicalState(
  character: Character,
  instanceId: string,
  stateId: string,
  active: boolean,
  updatedAt?: string,
): Character {
  const inventario = character.inventario ?? [];
  let changed = false;
  const next = inventario.map((item) => {
    if (item.id !== instanceId) return item;
    const technical = normalizeItemTechnicalState(item);
    const estadosTecnicos = technical.estadosTecnicos.map((state) => {
      if (state.id !== stateId || state.active === active) return state;
      changed = true;
      return { ...state, active, updatedAt: updatedAt ?? state.updatedAt };
    });
    return changed ? { ...item, estadosTecnicos } : item;
  });
  return changed ? { ...character, inventario: next } : character;
}

/** Remove propriedades derivadas de uma fonte sem tocar no restante do item. */
export function removeItemTechnicalPropertyBySource(
  character: Character,
  instanceId: string,
  sourceType: TechnicalItemSourceType,
  sourceContentId: string,
): Character {
  const inventario = character.inventario ?? [];
  let changed = false;
  const next = inventario.map((item) => {
    if (item.id !== instanceId) return item;
    const technical = normalizeItemTechnicalState(item);
    const propriedadesTecnicas = technical.propriedadesTecnicas.filter(
      (property) => property.sourceType !== sourceType || property.sourceContentId !== sourceContentId,
    );
    if (propriedadesTecnicas.length === technical.propriedadesTecnicas.length) return item;
    changed = true;
    return { ...item, propriedadesTecnicas };
  });
  return changed ? { ...character, inventario: next } : character;
}

export function setItemLoadoutState(character: Character, instanceId: string, estado: ItemLoadoutState): Character {
  const atual = character.inventario ?? [];
  const next = atual.map((item) => (item.id === instanceId ? { ...item, estado } : item));
  return { ...character, inventario: next };
}

export function removeItemFromInventory(character: Character, instanceId: string): Character {
  const atual = character.inventario ?? [];
  const next = atual.filter((item) => item.id !== instanceId);
  if (next.length === atual.length) return character;
  return { ...character, inventario: next };
}

/** Ajusta a quantidade de uma instância — nunca abaixo de 1 (para chegar a 0, use `removeItemFromInventory`). */
export function adjustItemQuantity(character: Character, instanceId: string, delta: number): Character {
  const atual = character.inventario ?? [];
  const next = atual.map((item) =>
    item.id === instanceId ? { ...item, quantidade: Math.max(1, item.quantidade + delta) } : item,
  );
  return { ...character, inventario: next };
}

// ---------------------------------------------------------------------
// Loja do Mercado Noturno (PRD 13.2) — compra simples, sem desconto/fiado.
// ---------------------------------------------------------------------

export interface PurchaseItemResult {
  character: Character;
  ok: boolean;
  reason?: string;
  totalCost?: number;
  walletBefore?: number;
  walletAfter?: number;
  instance?: InventoryItemInstance;
}

/**
 * Compra `quantidade` unidades de `item` pagando de `walletId`. Preço
 * unitário editável (`precoUnitario`, PRD 13.2 "preço do livro como
 * padrão editável") — default é `item.preco`. Sem fundos suficientes,
 * devolve `ok:false` sem mutar o personagem.
 */
export function purchaseItem(params: {
  character: Character;
  item: ItemContent;
  quantidade: number;
  walletId: WalletId;
  precoUnitario?: number;
  nowIso: string;
}): PurchaseItemResult {
  const { character, item, walletId, nowIso } = params;
  const quantidade = Math.max(1, Math.trunc(params.quantidade));
  const precoUnitario = params.precoUnitario ?? item.preco;
  const totalCost = precoUnitario * quantidade;

  const carteira: Wallet = character.carteira ?? { aretz_informal: 0, cdi: 0, cdi_craqueada: 0 };
  const saldoAtual = carteira[walletId];

  if (totalCost > saldoAtual) {
    return {
      character,
      ok: false,
      reason: `Saldo insuficiente em ${WALLET_LABELS[walletId]} (necessário ${totalCost}, disponível ${saldoAtual}).`,
      totalCost,
      walletBefore: saldoAtual,
      walletAfter: saldoAtual,
    };
  }

  const walletAfter = saldoAtual - totalCost;
  const instance: InventoryItemInstance = {
    id: crypto.randomUUID(),
    itemSlug: item.slug,
    itemNome: item.nome,
    categoria: item.categoria,
    subtipo: item.subtipo,
    quantidade,
    estado: "mochila",
    adquiridoEm: nowIso,
    precoPago: totalCost,
    propriedadesTecnicas: [],
    estadosTecnicos: [],
  };

  const nextCharacter: Character = {
    ...character,
    carteira: { ...carteira, [walletId]: walletAfter },
    inventario: [...(character.inventario ?? []), instance],
  };

  return { character: nextCharacter, ok: true, totalCost, walletBefore: saldoAtual, walletAfter, instance };
}

// ---------------------------------------------------------------------
// Runas instaladas em item (checkpoint v0.56) — modelo de slots.
// ---------------------------------------------------------------------

export type RuneCompatibility = "compatible" | "incompatible" | "unknown";

/**
 * Compatibilidade de uma runa com um item, a partir do payload
 * canônico: `rune.slots_possiveis` (categoria do item) e
 * `rune.restricao_subtipo` (opcional, só existe em runas de arma).
 * `"unknown"` quando o dado necessário para decidir está ausente —
 * NUNCA vira bloqueio automático (ver `installRuneOnItem`).
 */
export function getRuneCompatibility(
  item: { categoria: string; subtipo?: string },
  rune: TechnicalContentItem,
): RuneCompatibility {
  const slotsPossiveis = asStringArray(rune.raw.slots_possiveis);
  if (slotsPossiveis.length === 0) return "unknown"; // payload sem slots_possiveis — não inventa regra.
  if (!slotsPossiveis.includes(item.categoria)) return "incompatible";

  const restricaoSubtipo = typeof rune.raw.restricao_subtipo === "string" ? rune.raw.restricao_subtipo : null;
  if (!restricaoSubtipo) return "compatible";
  if (!item.subtipo) return "unknown"; // restrição existe, mas a instância não tem subtipo registrado (item antigo).
  return restricaoSubtipo === item.subtipo ? "compatible" : "incompatible";
}

/** Runas atualmente instaladas numa instância — nunca undefined. */
export function countInstalledRunes(instance: Pick<InventoryItemInstance, "runasInstaladas">): number {
  return instance.runasInstaladas?.length ?? 0;
}

export interface InstallRuneResult {
  character: Character;
  ok: boolean;
  reason?: string;
  compatibility: RuneCompatibility;
  installation?: InstalledRune;
}

/**
 * Instala uma runa (referência ao modelo por slug) numa instância de
 * item — sem nenhum efeito mecânico. Bloqueia só quando a
 * incompatibilidade é INEQUÍVOCA (`getRuneCompatibility` ===
 * "incompatible") ou quando `itemContent.slotsRunaMax` (canônico) já
 * foi atingido; `"unknown"` (dado ausente) NUNCA bloqueia — a UI só
 * avisa. `itemContent` é opcional: sem o modelo completo do item (ex.:
 * catálogo indisponível), o limite de slots simplesmente não é
 * verificado (permissivo, nunca inventa um número).
 */
export function installRuneOnItem(params: {
  character: Character;
  instanceId: string;
  itemContent?: ItemContent;
  rune: TechnicalContentItem;
  notas?: string;
  nowIso: string;
}): InstallRuneResult {
  const { character, instanceId, itemContent, rune, nowIso } = params;
  const inventario = character.inventario ?? [];
  const instance = inventario.find((i) => i.id === instanceId);
  if (!instance) {
    return { character, ok: false, reason: "Item não encontrado no inventário.", compatibility: "unknown" };
  }

  const compatibility = getRuneCompatibility({ categoria: instance.categoria, subtipo: instance.subtipo }, rune);
  if (compatibility === "incompatible") {
    return { character, ok: false, reason: "Runa incompatível com este item.", compatibility };
  }

  const slotsRunaMax = itemContent?.slotsRunaMax ?? null;
  if (slotsRunaMax != null && countInstalledRunes(instance) >= slotsRunaMax) {
    return {
      character,
      ok: false,
      reason: `Limite de slots de runa atingido (máx. ${slotsRunaMax}).`,
      compatibility,
    };
  }

  const installation: InstalledRune = {
    id: crypto.randomUUID(),
    runeContentId: rune.slug,
    installedAt: nowIso,
    notas: params.notas?.trim() || undefined,
  };

  const nextInventario = inventario.map((i) =>
    i.id === instanceId ? { ...i, runasInstaladas: [...(i.runasInstaladas ?? []), installation] } : i,
  );

  return {
    character: { ...character, inventario: nextInventario },
    ok: true,
    compatibility,
    installation,
  };
}

/** Remove só a instalação da runa (nunca o modelo da Biblioteca, nunca o item). */
export function removeRuneFromItem(character: Character, instanceId: string, runeInstallationId: string): Character {
  const inventario = character.inventario ?? [];
  let changed = false;
  const nextInventario = inventario.map((i) => {
    if (i.id !== instanceId) return i;
    const runas = i.runasInstaladas ?? [];
    const next = runas.filter((r) => r.id !== runeInstallationId);
    if (next.length !== runas.length) changed = true;
    return { ...i, runasInstaladas: next };
  });
  if (!changed) return character;
  return { ...character, inventario: nextInventario };
}
