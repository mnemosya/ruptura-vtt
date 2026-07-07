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
 *
 * Equipamento defensivo/MIT/PD (v0.58): Caso B — `estatisticas.mit_base`
 * (armaduras) e `estatisticas.pd_max` (escudos) existem em 100% dos
 * respectivos itens do DB, mas o projeto ainda não tem um modelo de
 * "slot equipado" nem região corporal (PRD 13.7 trata sobreposição por
 * região, fora de escopo aqui). `equipDefensiveItem`/`getEquippedDefenseProfile`
 * implementam o modelo MÍNIMO seguro: só uma armadura e um escudo ativos
 * por vez, MIT/PD nunca somados entre itens. Aplicação de dano
 * (resolução de MIT/PD contra dano recebido) é escopo de checkpoint
 * seguinte — aqui só o estado (equipado, MIT/PD atual) é gerenciado.
 */

import type {
  Character,
  TechnicalItemPropertyInstance,
  TechnicalItemSourceType,
  TechnicalItemState,
} from "./types";
import type { TechnicalContentItem } from "../content";
import {
  deriveModoMunicao,
  hasExistingAljava,
  createAljavaInstance,
  parseKitQuantidade,
  getAljavaInstances,
  addFletchasToAljava,
  ALJAVA_ITEM_SLUG,
  clearBowSelectionsForAljava,
} from "./ammunition";

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
  /** Verdadeiro somente quando `estatisticas.municao_max` existe como número no modelo. */
  usesAmmunition: boolean;
  /** `estatisticas.municao_max` — capacidade do carregador/câmara. `null` = sem munição ou dado ausente. */
  municaoMax: number | null;
  /** `estatisticas.municao_compativel` — slug da família de munição aceita (ex.: "mun_pistola", "flecha_simples", "virotes"). `null` = ausente. */
  municaoCompativelSlug: string | null;
  /** `estatisticas.slots_runa_max` do payload real — `null` quando o item não aceita runa ou o dado está ausente (nunca inventado). */
  slotsRunaMax: number | null;
  /** `estatisticas.mit_base` (armaduras) — MIT máximo do modelo. `null` = item não é armadura ou o dado está ausente. */
  mitMax: number | null;
  /** `estatisticas.pd_max` (escudos) — PD máximo do modelo. `null` = item não é escudo ou o dado está ausente. */
  pdMax: number | null;
  /** `estatisticas.tipo_protecao` ("fisica"/"energetica"/"hibrida") — usado só para checar se o MIT/PD se aplica ao tipo de dano recebido. */
  tipoProtecao: string | null;
  /** `estatisticas.compatibilidade.familia` — família da munição (ex.: "flecha_simples", "mun_pistola"). `null` para não-munições. */
  ammoFamilia: string | null;
  /** `estatisticas.compatibilidade.itens` — slugs de armas compatíveis com esta munição. Vazio para não-munições. */
  ammoArmasCompativeis: string[];
  /** `estatisticas.kit` parsado como inteiro — quantidade de balas/flechas por kit comprado. `null` se ausente ou não é munição. */
  ammoKitQuantidade: number | null;
  /** `estatisticas.inclui_na_compra` — descritivo (ex.: "10 flechas simples") do que vem incluído na compra da arma. `null` se ausente. */
  inclui_na_compra?: string | null;
  /** `estatisticas.dado_dano` (ex.: "1d6") — dano-base da arma, textual. `null` se ausente/não estruturado. */
  danoBase: string | null;
  /** `estatisticas.tipo_dano` (ex.: "fisico"). `null` se ausente. */
  tipoDano: string | null;
  /** `estatisticas.subtipo_dano` (ex.: "perfurante"). `null` se ausente. */
  subtipoDano: string | null;
  /** `estatisticas.pericia_teste` (ex.: "luta", "balistica", "precisao") — perícia declarada pelo conteúdo para o teste de ataque. `null` se ausente. */
  periciaAtaque: string | null;
  /** `estatisticas.soma_atributo` (ex.: "corpo") — atributo somado ao teste de ataque, se o conteúdo declarar. `null` se ausente/não aplicável. */
  atributoAtaque: string | null;
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
    usesAmmunition: typeof estatisticas?.municao_max === "number",
    municaoMax: typeof estatisticas?.municao_max === "number" ? estatisticas.municao_max : null,
    municaoCompativelSlug: typeof estatisticas?.municao_compativel === "string" ? estatisticas.municao_compativel : null,
    slotsRunaMax: typeof estatisticas?.slots_runa_max === "number" ? estatisticas.slots_runa_max : null,
    mitMax: typeof estatisticas?.mit_base === "number" ? estatisticas.mit_base : null,
    pdMax: typeof estatisticas?.pd_max === "number" ? estatisticas.pd_max : null,
    tipoProtecao: typeof estatisticas?.tipo_protecao === "string" ? estatisticas.tipo_protecao : null,
    ammoFamilia: (() => {
      const compat = asRecord(estatisticas?.compatibilidade);
      return typeof compat?.familia === "string" ? compat.familia : null;
    })(),
    ammoArmasCompativeis: (() => {
      const compat = asRecord(estatisticas?.compatibilidade);
      return asStringArray(compat?.itens);
    })(),
    ammoKitQuantidade: parseKitQuantidade(estatisticas?.kit),
    inclui_na_compra: typeof estatisticas?.inclui_na_compra === "string" ? estatisticas.inclui_na_compra : undefined,
    danoBase: typeof estatisticas?.dado_dano === "string" ? estatisticas.dado_dano : null,
    tipoDano: typeof estatisticas?.tipo_dano === "string" ? estatisticas.tipo_dano : null,
    subtipoDano: typeof estatisticas?.subtipo_dano === "string" ? estatisticas.subtipo_dano : null,
    periciaAtaque: typeof estatisticas?.pericia_teste === "string" ? estatisticas.pericia_teste : null,
    atributoAtaque: typeof estatisticas?.soma_atributo === "string" ? estatisticas.soma_atributo : null,
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
  /**
   * Equipamento defensivo (checkpoint v0.58, PRD 13.5/13.6) — `true`
   * quando esta instância é a fonte ATIVA de MIT (armadura) ou PD
   * (escudo) do personagem. Só uma instância por `equipamentoSlot` fica
   * `true` por vez (a fonte não define regra de sobreposição sem
   * região corporal — ver `equipDefensiveItem`). Ainda NÃO aplica dano
   * automaticamente (isso é Fase 3 do checkpoint).
   */
  equipadoDefensivo?: boolean;
  /** Slot ocupado quando `equipadoDefensivo` — espelha `categoria` no momento de equipar. */
  equipamentoSlot?: "armadura" | "escudo";
  /** MIT atual da armadura — ausente até equipar pela primeira vez; então editável manualmente. */
  mitAtual?: number;
  /** PD atual do escudo — ausente até equipar/comprar; então editável manualmente. */
  pdAtual?: number;
  /**
   * Munição atual no carregador/câmara (checkpoint v0.59) — para armas
   * com `municao_max` no modelo (subtipo "fogo" e bestas). Ausente =
   * instância antiga ou arma sem munição. Para arcos, a munição fica
   * na aljava (`aljava`), não aqui.
   */
  municaoAtual?: number;
  /**
   * Conteúdo de flechas — presente SÓ em instâncias de Aljava
   * (itemSlug === "aljava", checkpoint v0.60). Um personagem pode ter
   * várias Aljavas; cada uma é uma instância própria com seu próprio
   * `aljava`. Ausente em tudo que não é uma Aljava.
   */
  aljava?: import("./ammunition").Aljava;
  /**
   * Em instâncias de ARCO (checkpoint v0.60): id da instância de
   * Aljava que este arco usa para atacar. Ausente = nenhuma
   * selecionada explicitamente (auto-seleciona se só existir 1 Aljava).
   */
  selectedAljavaInstanceId?: string;
  /**
   * Em instâncias de ARCO (checkpoint v0.60): slug do tipo de flecha
   * (dentro da Aljava selecionada) usado no próximo ataque. Ausente =
   * auto-seleciona se a Aljava selecionada só tiver 1 tipo.
   */
  selectedFlechaSlug?: string;
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
  const removida = atual.find((item) => item.id === instanceId);
  const next = atual.filter((item) => item.id !== instanceId);
  if (next.length === atual.length) return character;
  const nextChar = { ...character, inventario: next };
  // Se a instância removida era uma Aljava, limpar a referência em
  // qualquer arco que a tivesse selecionada (evita apontar para uma
  // Aljava inexistente).
  if (removida?.itemSlug === ALJAVA_ITEM_SLUG) {
    return clearBowSelectionsForAljava(nextChar, instanceId);
  }
  return nextChar;
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
  /**
   * Catálogo completo (opcional) — usado só para achar o nome exibível
   * real da munição de fábrica (`inclui_na_compra` de arma de fogo/besta)
   * quando o excedente cria uma instância nova de estoque. Sem isso,
   * cai num fallback humanizado do slug (ex.: "mun_pistola" → "Mun pistola").
   */
  catalog?: ItemContent[];
}): PurchaseItemResult {
  const { character, item, walletId, nowIso } = params;

  const quantidadeKits = Math.max(1, Math.trunc(params.quantidade));
  const precoUnitario = params.precoUnitario ?? item.preco;
  // Para munições: desempacotar kit → quantidade em inventário = kits × kitQuantidade.
  // Exemplo: comprar 1 "mun_pistola" (kit: "12 balas") → quantidade: 12 no inventário.
  // Para outros itens: quantidade = kits comprados (sem desempacotar).
  const quantidade =
    item.categoria === "municao" && item.ammoKitQuantidade != null
      ? quantidadeKits * item.ammoKitQuantidade
      : quantidadeKits;
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

  // Aljava: item solo, não empilhável por quantidade (cada unidade
  // comprada é uma Aljava PRÓPRIA e independente — nunca uma instância
  // com quantidade > 1). Um personagem pode ter várias.
  if (item.slug === ALJAVA_ITEM_SLUG) {
    const novasInstancias: InventoryItemInstance[] = Array.from({ length: quantidadeKits }, () => ({
      ...createAljavaInstance(nowIso),
      precoPago: precoUnitario,
    }));
    const nextChar: Character = {
      ...character,
      carteira: { ...carteira, [walletId]: walletAfter },
      inventario: [...(character.inventario ?? []), ...novasInstancias],
    };
    return {
      character: nextChar,
      ok: true,
      totalCost,
      walletBefore: saldoAtual,
      walletAfter,
      instance: novasInstancias[novasInstancias.length - 1],
    };
  }

  // Munição: derivar modo antes de criar instância.
  const modoMunicao = deriveModoMunicao(item.subtipo, item.municaoMax, item.municaoCompativelSlug);
  const isArco = modoMunicao === "aljava";
  const isCarregador = modoMunicao === "carregador" || modoMunicao === "virote";
  const isMunicao = item.categoria === "municao";

  // Munição: unificar com stack existente do mesmo tipo em vez de criar
  // instância duplicada (mesmo itemSlug, categoria "municao" → sempre
  // empilha; munição não tem estado individual como armas/armaduras).
  const existingStack = isMunicao
    ? (character.inventario ?? []).find((i) => i.itemSlug === item.slug && i.categoria === "municao")
    : undefined;

  const instance: InventoryItemInstance = existingStack
    ? { ...existingStack, quantidade: existingStack.quantidade + quantidade, precoPago: (existingStack.precoPago ?? 0) + totalCost }
    : {
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
        // MIT/PD atual iniciam no máximo canônico do modelo (checkpoint v0.58)
        // — nunca inventado quando o campo está ausente (fica undefined).
        mitAtual: item.mitMax ?? undefined,
        pdAtual: item.pdMax ?? undefined,
        // Munição atual (checkpoint v0.61): arma de fogo/besta nasce DESCARREGADA
        // (0) por padrão — comprar a arma não cria munição do nada. Só carrega
        // de fábrica se o modelo declarar `inclui_na_compra` (ver bloco abaixo,
        // que também lida com o excedente indo para o estoque). Arcos usam Aljava.
        municaoAtual: isCarregador && item.municaoMax != null ? 0 : undefined,
      };

  // Arcos: criar Aljava compartilhada na primeira compra; adicionar kit inicial à Aljava.
  let nextCharacterBase: Character = {
    ...character,
    carteira: { ...carteira, [walletId]: walletAfter },
    inventario: existingStack
      ? (character.inventario ?? []).map((i) => (i.id === existingStack.id ? instance : i))
      : [...(character.inventario ?? []), instance],
  };

  if (isArco) {
    // Se o personagem não tem NENHUMA Aljava ainda, a compra do
    // (primeiro) arco cria uma. Se já existe pelo menos uma, NÃO cria
    // outra automaticamente — o kit vai para a primeira Aljava por
    // padrão (documentado; usuário pode ter várias e mover flechas
    // manualmente depois).
    if (!hasExistingAljava(nextCharacterBase)) {
      nextCharacterBase = {
        ...nextCharacterBase,
        inventario: [...(nextCharacterBase.inventario ?? []), createAljavaInstance(nowIso)],
      };
    }
    const aljavaAlvo = getAljavaInstances(nextCharacterBase)[0];

    // Adicionar kit inicial de flechas à Aljava alvo
    const kitQtd = parseKitQuantidade(item.inclui_na_compra);
    const flechaSlug = item.municaoCompativelSlug || "flecha_simples";
    if (kitQtd && kitQtd > 0 && aljavaAlvo) {
      const { aljava: novaAljava, excedente } = addFletchasToAljava(
        aljavaAlvo.aljava,
        flechaSlug,
        "Flecha simples",
        kitQtd
      );

      // Atualizar Aljava alvo no inventário
      nextCharacterBase = {
        ...nextCharacterBase,
        inventario: (nextCharacterBase.inventario ?? []).map((i) =>
          i.id === aljavaAlvo.id ? { ...i, aljava: novaAljava } : i
        ),
      };

      // Se houver excedente (Aljava alvo cheia), adicionar ao estoque do inventário
      if (excedente > 0) {
        const existingAmmo = nextCharacterBase.inventario!.find(
          (i) => i.itemSlug === flechaSlug && i.itemSlug !== ALJAVA_ITEM_SLUG
        );
        if (existingAmmo) {
          nextCharacterBase = {
            ...nextCharacterBase,
            inventario: nextCharacterBase.inventario!.map((i) =>
              i.id === existingAmmo.id ? { ...i, quantidade: i.quantidade + excedente } : i
            ),
          };
        } else {
          const ammoInst: InventoryItemInstance = {
            id: crypto.randomUUID(),
            itemSlug: flechaSlug,
            itemNome: "Flecha simples",
            categoria: "municao",
            subtipo: "municao",
            quantidade: excedente,
            estado: "mochila",
            adquiridoEm: nowIso,
            precoPago: 0,
            propriedadesTecnicas: [],
            estadosTecnicos: [],
          };
          nextCharacterBase = {
            ...nextCharacterBase,
            inventario: [...nextCharacterBase.inventario!, ammoInst],
          };
        }
      }
    }
  }

  // Arma de fogo/besta (checkpoint v0.61): só carrega de fábrica se o
  // modelo declarar `inclui_na_compra` (ex.: besta_leve → "6 virotes").
  // A munição inicial vai PRIMEIRO para a própria arma (até municaoMax);
  // o excedente vira estoque comum — nunca cria munição além do declarado.
  if (isCarregador && !existingStack) {
    const kitInicial = parseKitQuantidade(item.inclui_na_compra);
    const municaoSlug = item.municaoCompativelSlug;
    if (kitInicial && kitInicial > 0 && municaoSlug) {
      const municaoMax = item.municaoMax ?? 0;
      const carregada = Math.min(kitInicial, municaoMax);
      const excedente = kitInicial - carregada;

      nextCharacterBase = {
        ...nextCharacterBase,
        inventario: (nextCharacterBase.inventario ?? []).map((i) =>
          i.id === instance.id ? { ...i, municaoAtual: carregada } : i,
        ),
      };

      if (excedente > 0) {
        const municaoNome =
          params.catalog?.find((i) => i.slug === municaoSlug)?.nome ??
          municaoSlug.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
        const existingAmmo = nextCharacterBase.inventario!.find((i) => i.itemSlug === municaoSlug && i.categoria === "municao");
        if (existingAmmo) {
          nextCharacterBase = {
            ...nextCharacterBase,
            inventario: nextCharacterBase.inventario!.map((i) =>
              i.id === existingAmmo.id ? { ...i, quantidade: i.quantidade + excedente } : i,
            ),
          };
        } else {
          const ammoInst: InventoryItemInstance = {
            id: crypto.randomUUID(),
            itemSlug: municaoSlug,
            itemNome: municaoNome,
            categoria: "municao",
            subtipo: "municao",
            quantidade: excedente,
            estado: "mochila",
            adquiridoEm: nowIso,
            precoPago: 0,
            propriedadesTecnicas: [],
            estadosTecnicos: [],
          };
          nextCharacterBase = {
            ...nextCharacterBase,
            inventario: [...nextCharacterBase.inventario!, ammoInst],
          };
        }
      }
    }
  }

  return { character: nextCharacterBase, ok: true, totalCost, walletBefore: saldoAtual, walletAfter, instance };
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

// ---------------------------------------------------------------------
// Equipamento defensivo — MIT (armadura) / PD (escudo) — checkpoint v0.58
// (PRD 13.5/13.6). Auditoria: `db_equipamentos_normalizado_v1_2.json`
// tem `estatisticas.mit_base` em TODAS as 18 armaduras e
// `estatisticas.pd_max` em TODOS os 6 escudos — dado canônico
// suficiente para MIT/PD (Caso B: falta só a regra de slot/equipamento,
// que este módulo implementa). O PRD (13.5 "sobreposição aplica maior
// MIT plausível") pressupõe região corporal, que este checkpoint
// explicitamente NÃO modela ainda — por isso a regra aqui é a mais
// simples e segura: só UMA armadura e UM escudo ativos por vez (trocar
// substitui o anterior), nunca somar MIT/PD de múltiplos itens.
// ---------------------------------------------------------------------

export type DefensiveEquipmentSlot = "armadura" | "escudo";

/** MIT máximo do modelo — `null` quando não é armadura ou o dado está ausente. */
export function getItemMit(item: Pick<ItemContent, "mitMax">): number | null {
  return item.mitMax;
}

/** PD máximo do modelo — `null` quando não é escudo ou o dado está ausente. */
export function getItemPdMax(item: Pick<ItemContent, "pdMax">): number | null {
  return item.pdMax;
}

/** PD atual da instância — cai no máximo do modelo se a instância ainda não tiver um valor próprio, e em 0 se nem o modelo souber (nunca inventa um número maior). */
export function getItemPdAtual(instance: Pick<InventoryItemInstance, "pdAtual">, item?: Pick<ItemContent, "pdMax">): number {
  return instance.pdAtual ?? item?.pdMax ?? 0;
}

/** MIT atual da instância — mesmo critério de `getItemPdAtual`. */
export function getItemMitAtual(instance: Pick<InventoryItemInstance, "mitAtual">, item?: Pick<ItemContent, "mitMax">): number {
  return instance.mitAtual ?? item?.mitMax ?? 0;
}

/**
 * Equipa uma instância como armadura/escudo ATIVO (fonte de MIT/PD).
 * Categoria fora de "armadura"/"escudo" não faz nada (fallback
 * defensivo — nunca inventa um slot). Qualquer OUTRA instância já
 * equipada no MESMO slot é desequipada automaticamente (regra mínima
 * segura — PRD 13.5 exige região corporal para "sobrepor", que este
 * checkpoint não modela; nunca soma MIT/PD de dois itens). Inicializa
 * `mitAtual`/`pdAtual` no máximo do modelo só se a instância ainda não
 * tiver um valor próprio (preserva dano já registrado ao reequipar).
 */
export function equipDefensiveItem(character: Character, instanceId: string, item: ItemContent): Character {
  const slot: DefensiveEquipmentSlot | null =
    item.categoria === "armadura" ? "armadura" : item.categoria === "escudo" ? "escudo" : null;
  if (!slot) return character;

  const inventario = character.inventario ?? [];
  if (!inventario.some((i) => i.id === instanceId)) return character;

  const nextInventario = inventario.map((i) => {
    if (i.id === instanceId) {
      return {
        ...i,
        equipadoDefensivo: true,
        equipamentoSlot: slot,
        mitAtual: slot === "armadura" ? i.mitAtual ?? item.mitMax ?? undefined : i.mitAtual,
        pdAtual: slot === "escudo" ? i.pdAtual ?? item.pdMax ?? undefined : i.pdAtual,
      };
    }
    if (i.equipamentoSlot === slot && i.equipadoDefensivo) {
      return { ...i, equipadoDefensivo: false };
    }
    return i;
  });

  return { ...character, inventario: nextInventario };
}

/** Desequipa uma instância — nunca apaga `mitAtual`/`pdAtual` (histórico de dano preservado até reequipar). */
export function unequipDefensiveItem(character: Character, instanceId: string): Character {
  const inventario = character.inventario ?? [];
  const next = inventario.map((i) => (i.id === instanceId ? { ...i, equipadoDefensivo: false } : i));
  return { ...character, inventario: next };
}

/** Ajusta MIT atual manualmente — nunca negativo, nunca acima do máximo conhecido (se houver). */
export function setItemMitAtual(character: Character, instanceId: string, value: number, mitMax?: number | null): Character {
  const clamped = Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0));
  const bounded = mitMax != null ? Math.min(clamped, mitMax) : clamped;
  const inventario = character.inventario ?? [];
  const next = inventario.map((i) => (i.id === instanceId ? { ...i, mitAtual: bounded } : i));
  return { ...character, inventario: next };
}

/** Ajusta PD atual manualmente — mesmo critério de `setItemMitAtual`. */
export function setItemPdAtual(character: Character, instanceId: string, value: number, pdMax?: number | null): Character {
  const clamped = Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0));
  const bounded = pdMax != null ? Math.min(clamped, pdMax) : clamped;
  const inventario = character.inventario ?? [];
  const next = inventario.map((i) => (i.id === instanceId ? { ...i, pdAtual: bounded } : i));
  return { ...character, inventario: next };
}

export interface EquippedDefenseProfile {
  armadura?: { instance: InventoryItemInstance; item: ItemContent; mitMax: number; mitAtual: number; tipoProtecao: string | null };
  escudo?: { instance: InventoryItemInstance; item: ItemContent; pdMax: number; pdAtual: number; tipoProtecao: string | null };
}

/**
 * Perfil defensivo ATIVO do personagem — só instâncias com
 * `equipadoDefensivo:true` e modelo publicado com MIT/PD conhecido.
 * Usado pela Fase 2/3 (resolução de dano) e pela UI; nunca soma mais
 * de uma armadura/escudo (ver `equipDefensiveItem`).
 */
export function getEquippedDefenseProfile(character: Pick<Character, "inventario">, items: ItemContent[]): EquippedDefenseProfile {
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  const profile: EquippedDefenseProfile = {};

  for (const instance of character.inventario ?? []) {
    if (!instance.equipadoDefensivo) continue;
    const item = bySlug.get(instance.itemSlug);
    if (!item || item.status !== "published") continue;

    if (instance.equipamentoSlot === "armadura" && item.mitMax != null) {
      profile.armadura = { instance, item, mitMax: item.mitMax, mitAtual: getItemMitAtual(instance, item), tipoProtecao: item.tipoProtecao };
    }
    if (instance.equipamentoSlot === "escudo" && item.pdMax != null) {
      profile.escudo = { instance, item, pdMax: item.pdMax, pdAtual: getItemPdAtual(instance, item), tipoProtecao: item.tipoProtecao };
    }
  }

  return profile;
}
