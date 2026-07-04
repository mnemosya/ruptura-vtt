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

import type { Character } from "./types";
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
