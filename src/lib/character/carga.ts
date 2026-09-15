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
 *   - a capacidade é da MOCHILA, não do personagem: cada modelo tem a
 *     sua e a básica tem 10. Nenhum item de mochila existe publicado
 *     ainda — ver `capacidadeDeEspacos`.
 *
 * Nenhuma das duas é decisão de front-end, então elas ficam isoladas e
 * anotadas em vez de diluídas no componente.
 */

import type { Character } from "./types";
import type { InventoryItemInstance, ItemContent, ItemLoadoutState } from "./inventory";

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
 * Espaços da MOCHILA BÁSICA. A capacidade é da mochila, não do
 * personagem: cada modelo tem a sua, e a básica tem 10.
 */
export const ESPACOS_MOCHILA_BASICA = 10;

/**
 * Capacidade de carga, em espaços — a da mochila EQUIPADA.
 *
 * A regra é por mochila, não por atributo: cada modelo declara quantos
 * espaços oferece, e só UMA pode estar equipada por vez. Quem ainda
 * não tem mochila nenhuma carrega o básico, `ESPACOS_MOCHILA_BASICA`.
 *
 * ESTADO ATUAL: nenhum item de mochila existe no conteúdo publicado —
 * o único item de armazenamento é a Aljava (`tipo_armazenamento:
 * "flechas"`, capacidade 15), que guarda flecha, não carga geral. Por
 * isso esta função hoje sempre devolve o básico. Quando a mochila
 * existir como item, o que muda aqui é só de onde vem o número: achar
 * a instância equipada e ler a capacidade declarada no modelo dela.
 *
 * EM ABERTO — COMO SE TROCA DE MOCHILA. A pergunta é onde a mochila
 * que NÃO está em uso fica, já que ela própria não pode ocupar espaço
 * da mochila em uso. O "abrigo" é o candidato natural (é o único
 * estado que não pesa, ver `ESTADOS_QUE_OCUPAM`), mas isso levanta o
 * caso de trocar longe do abrigo — e a regra de o que acontece com o
 * que não couber na mochila menor também não existe. Nada disso está
 * decidido; não invente aqui.
 */
export function capacidadeDeEspacos(
  _character: Character,
  _catalogo: Map<string, ItemContent>,
): number {
  return ESPACOS_MOCHILA_BASICA;
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
): ResumoDeCarga {
  let ocupados = 0;
  for (const instancia of character.inventario ?? []) {
    ocupados += espacosDaInstancia(instancia, catalogo.get(instancia.itemSlug));
  }
  const capacidade = capacidadeDeEspacos(character, catalogo);
  return { ocupados, capacidade, excedido: ocupados > capacidade };
}
