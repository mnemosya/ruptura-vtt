/**
 * Inventário, carteira e loja do Mercado Noturno — checkpoint v0.49
 * (PRD 13). Catálogo inteiro de itens vem de `content_documents`
 * (content_type="item", `listItems()`, já existente — 119 itens
 * publicados: armas, armaduras, escudos, explosivos, farmácia,
 * vertinas, ferramentas, dispositivos, veículos, munição). A ficha
 * NUNCA depende de lista hardcoded — cada item no inventário é uma
 * INSTÂNCIA ligada ao slug do modelo publicado, com estado próprio
 * (quantidade, loadout).
 *
 * Escopo deliberadamente pequeno (mesmo critério de v0.47/v0.48):
 * comprar item da loja (desconta carteira, cria instância) e gerenciar
 * loadout simples (equipado/empunhado/acesso rápido/mochila). NÃO
 * implementado (PRD 13.4–13.9, nenhum checkpoint anterior cobriu):
 * MIT/PD por região, munição/Rajada, propriedades em crítico, runas
 * instaladas, kravita, ações de item (granadas/farmácia/vertinas
 * aplicando efeito automático), desconto/fiado do Mercador, envio para
 * inventário do bando. Tudo isso fica como pendência documentada.
 */

import type { Character } from "./types";

// ---------------------------------------------------------------------
// Conteúdo bruto (subconjunto lido de content_documents.payload)
// ---------------------------------------------------------------------

export interface ItemContent {
  id: string;
  slug: string;
  nome: string;
  categoria: string;
  categoria_label?: string;
  raridade?: string;
  preco: number;
  descricao_curta?: string;
  tags: string[];
  status: string;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Preserva o payload inteiro do registro — não achata nem descarta campos (estatísticas completas ficam disponíveis para checkpoints futuros). */
export function normalizeItemContent(raw: Record<string, unknown>): ItemContent {
  return {
    id: String(raw.id ?? raw.slug ?? ""),
    slug: String(raw.slug ?? raw.id ?? ""),
    nome: String(raw.nome ?? raw.slug ?? "Item"),
    categoria: String(raw.categoria ?? ""),
    categoria_label: typeof raw.categoria_label === "string" ? raw.categoria_label : undefined,
    raridade: typeof raw.raridade === "string" ? raw.raridade : undefined,
    preco: typeof raw.preco === "number" && Number.isFinite(raw.preco) ? raw.preco : 0,
    descricao_curta: typeof raw.descricao_curta === "string" ? raw.descricao_curta : undefined,
    tags: asStringArray(raw.tags),
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

export interface InventoryItemInstance {
  id: string;
  itemSlug: string;
  itemNome: string;
  categoria: string;
  quantidade: number;
  estado: ItemLoadoutState;
  adquiridoEm: string;
  precoPago?: number;
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
