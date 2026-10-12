import { ehMochilaMk } from "./backpacks";
/**
 * CARGA — quantos espaços um item ocupa e quantos o personagem tem.
 *
 * Este módulo preenche uma lacuna REAL do domínio, e é importante que
 * quem mexer aqui saiba exatamente qual é o tamanho dela. Antes deste
 * arquivo:
 *
 *   - o custo em espaços de um item vem de `estatisticas.espacos_texto`
 *     — ver `espacosDoItem`.
 *
 *   - a capacidade é da MOCHILA, não do personagem: cada modelo tem a
 *     sua e a MK-I tem 10 — ver `capacidadeDeEspacos`.
 *
 * Nenhuma das duas é decisão de front-end, então elas ficam isoladas e
 * anotadas em vez de diluídas no componente.
 */

import type { Character } from "./types";
import type { InventoryItemInstance, ItemContent, ItemLoadoutState } from "./inventory";

/**
 * QUANTOS ESPAÇOS UM ITEM OCUPA — lido de `estatisticas.espacos_texto`
 * (ver `ItemContent.espacosTexto`). Os valores publicados são:
 *
 *   - um número, às vezes com nota: "3", "1 (kit)", "1 (6 shurikens)"
 *     → o número inicial (o kit/pacote inteiro conta como um item);
 *   - "Carga" (lança, alabarda, escudo torre, bicicleta…) → 0: é levado
 *     à mão ou à parte, não cabe dentro da mochila;
 *   - "Não aplicável" (CDI craqueada) → 0.
 *
 * Sem o campo (modelo ausente ou item sem o dado), conta 1 — o valor
 * que não dá desconto nem pune. `classe_porte` NÃO é fonte: diz como a
 * arma se maneja, não quanto ocupa.
 */
export function espacosDoItem(modelo: ItemContent | undefined): number {
  const texto = modelo?.espacosTexto?.trim();
  if (!texto) return 1;
  const numero = /^\d+/.exec(texto);
  if (numero) return Number(numero[0]);
  return 0;
}

/**
 * Estados que ocupam ESPAÇO DE MOCHILA. Só a própria mochila: a
 * capacidade é dela (ver `capacidadeDeCarga`), e o que está no corpo —
 * equipado, empunhado, acesso rápido — não está dentro dela. O abrigo
 * também não conta: é o que ficou guardado fora do personagem.
 */
export const ESTADOS_QUE_OCUPAM: readonly ItemLoadoutState[] = [
  "mochila",
];

export function ocupaEspaco(estado: ItemLoadoutState): boolean {
  return ESTADOS_QUE_OCUPAM.includes(estado);
}

export interface ResumoDeCarga {
  /** Espaços em uso — soma de quantidade × porte do que está na mochila. */
  ocupados: number;
  /** Capacidade total. */
  capacidade: number;
  /** `true` quando passou do limite (a UI decide o que fazer; a regra de penalidade ainda não existe). */
  excedido: boolean;
}

/**
 * Espaços da MOCHILA BÁSICA. A capacidade é da mochila, não do
 * personagem: cada modelo tem a sua, e a básica tem 10.
 */
export const ESPACOS_MOCHILA_BASICA = 10;

/** A capacidade vem exclusivamente da Mochila MK equipada; sem mochila, zero. */
export function capacidadeDeEspacos(character: Character, catalogo: Map<string, ItemContent>): number {
  const mochila = character.inventario?.find(i => i.estado === "equipado" && ehMochilaMk(catalogo.get(i.itemSlug)));
  return mochila ? catalogo.get(mochila.itemSlug)?.capacidadeMochila ?? 0 : 0;
}

/** Espaços ocupados por uma instância (quantidade × porte). */
export function espacosDaInstancia(
  instancia: Pick<InventoryItemInstance, "quantidade" | "estado">,
  modelo: ItemContent | undefined,
): number {
  if (!ocupaEspaco(instancia.estado)) return 0;
  const unidadesPorKit = modelo?.ammoKitQuantidade ?? 1;
  return Math.ceil(Math.max(1, instancia.quantidade) / unidadesPorKit) * espacosDoItem(modelo);
}

export function resumoDeCarga(
  character: Character,
  catalogo: Map<string, ItemContent>,
): ResumoDeCarga {
  let ocupados = 0;
  for (const instancia of character.inventario ?? []) {
    ocupados += espacosDaInstancia(instancia, catalogo.get(instancia.itemSlug));
    // Suporte guardado ocupa o espaço vazio mais os kits de munição dentro dele.
    if (instancia.estado === "mochila" && instancia.aljava) for (const stack of instancia.aljava.stacks) {
      ocupados += espacosDaInstancia({quantidade:stack.quantidade,estado:"mochila"},catalogo.get(stack.contentSlug));
    }
  }
  const capacidade = capacidadeDeEspacos(character, catalogo);
  return { ocupados, capacidade, excedido: ocupados > capacidade };
}
