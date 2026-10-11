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
 *     sua e a básica tem 10. Nenhum item de mochila existe publicado
 *     ainda — ver `capacidadeDeEspacos`.
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
