/**
 * CARGA — quantos espaços um item ocupa e quantos o personagem tem.
 *
 * Este módulo preenche uma lacuna REAL do domínio, e é importante que
 * quem mexer aqui saiba exatamente qual é o tamanho dela. Antes deste
 * arquivo:
 *
 *   - o custo em espaços de um item NÃO existe em campo nenhum. Cheguei
 *     a derivá-lo de `estatisticas.classe_porte` (leve/media/pesada) e
 *     estava errado: porte é como a arma se maneja, não quanto ela
 *     ocupa de mochila. Enquanto a regra não existir, todo item conta
 *     1 — ver `espacosDoItem`.
 *
 *   - a capacidade total NÃO existia. `regras_personagem.derivados` tem
 *     oito entradas (pv_max, pe_max, mana_max, integridade_max,
 *     reacoes_por_rodada, andar_m, correr_m, pa_max) e nenhuma delas é
 *     capacidade de carga.
 *
 * Nenhuma das duas é decisão de front-end, então elas ficam isoladas e
 * anotadas em vez de diluídas no componente. E a capacidade PROCURA a
 * regra publicada antes de usar o padrão: no dia em que um derivado
 * `espacos_max` for publicado em `regras_personagem.derivados`, este
 * módulo passa a obedecê-lo sozinho, sem ninguém precisar voltar aqui.
 * O padrão só existe enquanto esse derivado não existir.
 */

import { computeDerivedById } from "./derived";
import type { Character, CharacterAttributes, CharacterRulesPayload } from "./types";
import type { InventoryItemInstance, ItemContent, ItemLoadoutState } from "./inventory";

/** Id do derivado que, se um dia existir no conteúdo, manda aqui. */
export const DERIVADO_ESPACOS_MAX = "espacos_max";

/**
 * QUANTOS ESPAÇOS UM ITEM OCUPA — e o buraco que isso ainda é.
 *
 * Eu tinha ligado isto a `estatisticas.classe_porte` (leve/media/
 * pesada), e estava ERRADO: classe de porte diz como a arma ou a
 * armadura se maneja, não quanto ela ocupa de mochila. São dois eixos
 * diferentes e o campo não é fonte para este.
 *
 * Nenhum outro campo do conteúdo publicado diz o custo em espaços.
 * Então, até a regra existir, TODO item conta 1 — que é o único valor
 * que não inventa nada: não dá desconto e não pune. A função existe
 * assim mesmo, com este nome, porque é ela que o resto do sistema
 * chama; no dia em que a fonte aparecer (campo novo por item, tabela
 * por categoria, o que for), é só este corpo que muda, e a grade já
 * sabe estender o cartão que ocupar mais de um.
 */
export function espacosDoItem(_modelo: ItemContent | undefined): number {
  return 1;
}

/**
 * Estados que PESAM no personagem. "abrigo" é o único que não conta:
 * é o que ficou guardado fora do corpo, e guardar existe justamente
 * para não carregar. Os outros quatro estão todos no personagem —
 * equipado, empunhado e acesso rápido são formas de carregar, não
 * alternativas a carregar.
 */
export const ESTADOS_QUE_OCUPAM: readonly ItemLoadoutState[] = [
  "equipado",
  "empunhado",
  "acesso_rapido",
  "mochila",
];

export function ocupaEspaco(estado: ItemLoadoutState): boolean {
  return ESTADOS_QUE_OCUPAM.includes(estado);
}

export interface ResumoDeCarga {
  /** Espaços em uso — soma de quantidade × porte de tudo que não está no abrigo. */
  ocupados: number;
  /** Capacidade total. */
  capacidade: number;
  /** `true` quando passou do limite (a UI decide o que fazer; a regra de penalidade ainda não existe). */
  excedido: boolean;
}

/**
 * Capacidade de carga, em espaços.
 *
 * Ordem: derivado publicado > padrão documentado. O padrão é
 * `10 + Corpo`, que é a forma de TODO derivado físico já publicado
 * (`pv_max` = 10 + Corpo, `andar_m` = 10 + Corpo) — escolhido por
 * coerência com o sistema que existe, não por balanceamento, que não
 * é decisão deste arquivo.
 */
export function capacidadeDeEspacos(
  atributos: CharacterAttributes,
  regras: CharacterRulesPayload | null,
): number {
  // Reusa o interpretador de fórmulas em vez de reimplementá-lo: se a
  // fórmula publicada referenciar outro derivado, ele resolve.
  const publicado = computeDerivedById(DERIVADO_ESPACOS_MAX, atributos, regras);
  if (publicado != null) return publicado;
  return 10 + (atributos.corpo ?? 0);
}

/** Espaços ocupados por uma instância (quantidade × porte). */
export function espacosDaInstancia(
  instancia: Pick<InventoryItemInstance, "quantidade" | "estado">,
  modelo: ItemContent | undefined,
): number {
  if (!ocupaEspaco(instancia.estado)) return 0;
  return Math.max(1, instancia.quantidade) * espacosDoItem(modelo);
}

export function resumoDeCarga(
  character: Character,
  catalogo: Map<string, ItemContent>,
  regras: CharacterRulesPayload | null,
): ResumoDeCarga {
  let ocupados = 0;
  for (const instancia of character.inventario ?? []) {
    ocupados += espacosDaInstancia(instancia, catalogo.get(instancia.itemSlug));
  }
  const capacidade = capacidadeDeEspacos(character.atributos, regras);
  return { ocupados, capacidade, excedido: ocupados > capacidade };
}
