/**
 * Projeção de slots corporais do Console do Personagem — Tempo 1.
 *
 * ESTA É UMA PROJEÇÃO DE LEITURA. Nenhuma função aqui grava no
 * personagem, e NENHUM campo novo é adicionado ao payload. O paper doll
 * do Console precisa de regiões corporais (cabeça, tronco, membros,
 * arma primária/secundária, escudo, acesso rápido), mas o modelo atual
 * só tem o enum plano `InventoryItemInstance.estado`
 * ("equipado" | "empunhado" | "acesso_rapido" | "mochila") mais
 * `equipamentoSlot` ("armadura" | "escudo") — ver o comentário de
 * cabeçalho de `inventory.ts`, que registra explicitamente que o
 * projeto "ainda não tem um modelo de 'slot equipado' nem região
 * corporal (PRD 13.7)".
 *
 * Consequência honesta: três slots do desenho (cabeça, membro superior,
 * membro inferior) NÃO têm fonte de dado nenhuma hoje. Eles são
 * marcados com `supported: false` para a UI poder distinguir
 * "slot vazio porque você não equipou nada" de "slot que o sistema
 * ainda não sabe preencher". Nada é inventado para preenchê-los.
 *
 * Quando o Tempo 2 acrescentar `slotCorporal?` à instância (campo
 * opcional no payload JSONB + normalizeCharacter, sem migração SQL),
 * esta projeção passa a preferir o campo explícito e cai nestas regras
 * só como retrocompatibilidade. `estado` continua sendo a verdade de
 * "está na mochila ou não" — `attack.ts`, `defense.ts` e
 * `ammunition.ts` leem esse campo e não podem ser quebrados.
 */

import type { InventoryItemInstance } from "./inventory";
import type { Character } from "./types";

export type BodySlotId =
  | "cabeca"
  | "membro_superior"
  | "tronco"
  | "membro_inferior"
  | "arma_primaria"
  | "arma_secundaria"
  | "escudo"
  | "acesso_rapido_1"
  | "acesso_rapido_2";

export interface BodySlot {
  id: BodySlotId;
  label: string;
  /** Instância ocupando o slot; `null` = vazio. */
  instance: InventoryItemInstance | null;
  /**
   * `false` quando o modelo atual não tem NENHUMA fonte capaz de
   * preencher este slot (cabeça/membros). A UI deve mostrar esses slots
   * como indisponíveis, não como "vazio/desequipado" — a diferença é
   * informação real para quem está jogando.
   */
  supported: boolean;
}

export interface BodySlotProjection {
  slots: BodySlot[];
  /**
   * Instâncias vestidas/empunhadas que sobraram sem slot — ex.: uma
   * terceira arma empunhada, ou uma armadura com `estado: "equipado"`
   * que não é a fonte defensiva ativa. Existem no inventário e o
   * Console precisa admitir isso em vez de sumir com elas.
   */
  semSlot: InventoryItemInstance[];
}

export const BODY_SLOT_LABELS: Record<BodySlotId, string> = {
  cabeca: "equip cabeça",
  membro_superior: "equip membro superior",
  tronco: "equip tronco",
  membro_inferior: "equip membro inferior",
  arma_primaria: "arma primária",
  arma_secundaria: "arma secundária",
  escudo: "escudo",
  acesso_rapido_1: "quick access #1",
  acesso_rapido_2: "quick access #2",
};

/** Slots sem nenhuma fonte de dado no modelo atual (ver cabeçalho). */
const UNSUPPORTED_SLOTS: readonly BodySlotId[] = ["cabeca", "membro_superior", "membro_inferior"];

/**
 * Ordem estável entre instâncias do mesmo estado. Usa `adquiridoEm` com
 * desempate por `id` — NUNCA o índice do array, que muda quando
 * qualquer outro item do inventário é comprado ou descartado (o que
 * faria a arma primária virar secundária sozinha).
 */
function ordemEstavel(a: InventoryItemInstance, b: InventoryItemInstance): number {
  if (a.adquiridoEm !== b.adquiridoEm) return a.adquiridoEm < b.adquiridoEm ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}

export function projectBodySlots(character: Character): BodySlotProjection {
  const inventario = (character.inventario ?? []) as InventoryItemInstance[];

  const empunhados = inventario.filter((i) => i.estado === "empunhado").sort(ordemEstavel);
  const acessoRapido = inventario.filter((i) => i.estado === "acesso_rapido").sort(ordemEstavel);

  // Fonte defensiva ATIVA — `equipadoDefensivo` é o que realmente
  // fornece MIT/PD hoje (getEquippedDefenseProfile). Uma armadura só
  // com `estado: "equipado"` não é a fonte ativa e não ocupa o tronco.
  const armadura = inventario.find((i) => i.equipadoDefensivo && i.equipamentoSlot === "armadura") ?? null;
  const escudo = inventario.find((i) => i.equipadoDefensivo && i.equipamentoSlot === "escudo") ?? null;

  const ocupadas = new Map<BodySlotId, InventoryItemInstance | null>([
    ["cabeca", null],
    ["membro_superior", null],
    ["tronco", armadura],
    ["membro_inferior", null],
    ["arma_primaria", empunhados[0] ?? null],
    ["arma_secundaria", empunhados[1] ?? null],
    ["escudo", escudo],
    ["acesso_rapido_1", acessoRapido[0] ?? null],
    ["acesso_rapido_2", acessoRapido[1] ?? null],
  ]);

  const usados = new Set<string>();
  for (const instancia of ocupadas.values()) {
    if (instancia) usados.add(instancia.id);
  }

  const semSlot = inventario.filter((i) => i.estado !== "mochila" && !usados.has(i.id));

  const slots: BodySlot[] = [...ocupadas.entries()].map(([id, instance]) => ({
    id,
    label: BODY_SLOT_LABELS[id],
    instance,
    supported: !UNSUPPORTED_SLOTS.includes(id),
  }));

  return { slots, semSlot };
}
