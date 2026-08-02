/**
 * Slots de equipamento do Console — projeção de leitura e regra de
 * compatibilidade, ambas DERIVADAS do conteúdo publicado.
 *
 * A compatibilidade não é inventada: sai de `ItemContent.categoria` e,
 * para armaduras, de `ItemContent.regioes` (`estatisticas.regioes` do
 * DB, presente em 100% das armaduras — "cabeca" | "tronco" | "bracos" |
 * "pernas"). Mesmo precedente de `rune.slots_possiveis`.
 *
 * O que ocupa cada slot hoje sai do estado que o modelo já tem
 * (`estado`, `equipadoDefensivo`, `equipamentoSlot`) — nenhum campo
 * novo é gravado no payload do personagem por este módulo.
 */

import type { InventoryItemInstance, ItemContent } from "../../../lib/character";

export type BodySlotId =
  | "cabeca"
  | "tronco"
  | "membro_superior"
  | "membro_inferior"
  | "escudo"
  | "arma_primaria"
  | "arma_secundaria"
  | "acesso_rapido_1"
  | "acesso_rapido_2";

export const BODY_SLOT_LABELS: Record<BodySlotId, string> = {
  cabeca: "Cabeça",
  tronco: "Tronco",
  membro_superior: "Membro superior",
  membro_inferior: "Membro inferior",
  escudo: "Escudo",
  arma_primaria: "Arma primária",
  arma_secundaria: "Arma secundária",
  acesso_rapido_1: "Acesso rápido 1",
  acesso_rapido_2: "Acesso rápido 2",
};

/** Slot corporal → valor esperado em `ItemContent.regioes`. */
const SLOT_PARA_REGIAO: Partial<Record<BodySlotId, string>> = {
  cabeca: "cabeca",
  tronco: "tronco",
  membro_superior: "bracos",
  membro_inferior: "pernas",
};

/**
 * Categorias aceitas nos acessos rápidos. Consumíveis e granadas, como
 * a spec pede — derivado de `categoria`, que é enum fechado do DB
 * ("farmacia" | "explosivo" | "vertina").
 */
const CATEGORIAS_ACESSO_RAPIDO = new Set(["farmacia", "explosivo", "vertina"]);

/**
 * Um item cabe neste slot? Só usa dado do conteúdo publicado; itens
 * sem o dado necessário simplesmente não passam (nunca "passa por
 * padrão", que deixaria equipar um capacete no slot de arma).
 */
export function itemCabeNoSlot(item: ItemContent | undefined, slot: BodySlotId): boolean {
  if (!item) return false;

  if (slot === "arma_primaria" || slot === "arma_secundaria") return item.categoria === "arma";
  if (slot === "escudo") return item.categoria === "escudo";
  if (slot === "acesso_rapido_1" || slot === "acesso_rapido_2") {
    return CATEGORIAS_ACESSO_RAPIDO.has(item.categoria);
  }

  const regiao = SLOT_PARA_REGIAO[slot];
  if (!regiao) return false;
  return item.categoria === "armadura" && item.regioes.includes(regiao);
}

export interface BodySlot {
  id: BodySlotId;
  label: string;
  /** Instância ocupando o slot; `null` = vazio. */
  instance: InventoryItemInstance | null;
}

export interface BodySlotProjection {
  slots: BodySlot[];
  /**
   * Instâncias vestidas/empunhadas que sobraram sem slot — existem no
   * inventário e o Console admite isso em vez de sumir com elas.
   */
  semSlot: InventoryItemInstance[];
}

/**
 * Ordem estável entre instâncias do mesmo estado: `adquiridoEm` com
 * desempate por `id`. NUNCA o índice do array, que muda quando outro
 * item é comprado ou descartado — o que faria a arma primária virar
 * secundária sozinha.
 */
function ordemEstavel(a: InventoryItemInstance, b: InventoryItemInstance): number {
  if (a.adquiridoEm !== b.adquiridoEm) return a.adquiridoEm < b.adquiridoEm ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}

export function projectBodySlots(
  inventario: InventoryItemInstance[],
  catalogo: Map<string, ItemContent>,
): BodySlotProjection {
  const empunhados = inventario.filter((i) => i.estado === "empunhado").sort(ordemEstavel);
  const acessoRapido = inventario.filter((i) => i.estado === "acesso_rapido").sort(ordemEstavel);

  // Fonte defensiva ATIVA — `equipadoDefensivo` é o que realmente
  // fornece MIT/PD hoje (ver getEquippedDefenseProfile em defense.ts).
  const escudo = inventario.find((i) => i.equipadoDefensivo && i.equipamentoSlot === "escudo") ?? null;

  // Armaduras vestidas ocupam a região declarada pelo próprio modelo.
  const armaduras = inventario.filter((i) => i.estado === "equipado" && catalogo.get(i.itemSlug)?.categoria === "armadura");
  function armaduraDaRegiao(slot: BodySlotId): InventoryItemInstance | null {
    const regiao = SLOT_PARA_REGIAO[slot];
    if (!regiao) return null;
    return armaduras.find((i) => catalogo.get(i.itemSlug)?.regioes.includes(regiao)) ?? null;
  }

  const ocupadas: [BodySlotId, InventoryItemInstance | null][] = [
    ["cabeca", armaduraDaRegiao("cabeca")],
    ["tronco", armaduraDaRegiao("tronco")],
    ["membro_superior", armaduraDaRegiao("membro_superior")],
    ["membro_inferior", armaduraDaRegiao("membro_inferior")],
    ["escudo", escudo],
    ["arma_primaria", empunhados[0] ?? null],
    ["arma_secundaria", empunhados[1] ?? null],
    ["acesso_rapido_1", acessoRapido[0] ?? null],
    ["acesso_rapido_2", acessoRapido[1] ?? null],
  ];

  const usados = new Set<string>();
  for (const [, inst] of ocupadas) if (inst) usados.add(inst.id);

  return {
    slots: ocupadas.map(([id, instance]) => ({ id, label: BODY_SLOT_LABELS[id], instance })),
    semSlot: inventario.filter((i) => i.estado !== "mochila" && !usados.has(i.id)),
  };
}

/** Itens da mochila compatíveis com um slot — usado ao clicar num slot vazio. */
export function itensCompativeisComSlot(
  inventario: InventoryItemInstance[],
  catalogo: Map<string, ItemContent>,
  slot: BodySlotId,
): InventoryItemInstance[] {
  return inventario.filter((i) => i.estado === "mochila" && itemCabeNoSlot(catalogo.get(i.itemSlug), slot));
}
