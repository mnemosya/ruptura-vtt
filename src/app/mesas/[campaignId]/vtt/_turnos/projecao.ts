/**
 * A leitura COMPACTA da trilha — "em que pé está o combate agora".
 *
 * Existe porque a trilha passou a ter mais de um leitor. Além dos
 * trilhos do VTT, que mostram o elenco inteiro, o dock da casca da
 * campanha precisa de uma frase: rodada, janela, quem age, quem vem, e
 * se sou eu. Sem esta projeção, cada superfície reimplementaria "quem
 * é o próximo" a partir de `ultimoLado`/`agiuEm`/`declaracao` — e foi
 * assim que a mesa acabou com DOIS sistemas de turno discordando na
 * mesma tela.
 *
 * Módulo PURO: sem React, sem rede, sem banco. As regras continuam em
 * `modelo.ts`; aqui só se pergunta a ele.
 */

import {
  elegiveisAgora, ladoDaVez, sugestaoDesempate,
  ROTULO_JANELA_CURTO,
  type EstadoTrilha, type Lado, type Participante,
} from "./modelo";

export interface ResumoTrilha {
  rodada: number;
  /** "Rápidos" / "Lentos" — o rótulo curto, pronto pra caber numa linha. */
  janela: string;
  /** Lado a quem cabe a vez pela alternância; `null` quando ninguém está apto. */
  ladoDaVez: Lado | null;
  /** Quem tem um turno ABERTO agora. `null` entre turnos. */
  agindo: Participante | null;
  /**
   * Quem o motor aponta como próximo — o primeiro do desempate entre os
   * elegíveis, excluído quem já está agindo. É sugestão, não decreto: a
   * escolha final continua sendo do grupo, como manda a regra.
   */
  proximo: Participante | null;
  /** Ainda há alguém apto a agir nesta janela. */
  temElegiveis: boolean;
}

/** `null` quando não há combate — a ausência de trilha é um estado legítimo. */
export function resumirTrilha(estado: EstadoTrilha | null): ResumoTrilha | null {
  if (!estado) return null;
  const agindo = estado.agindoId
    ? (estado.participantes.find((p) => p.id === estado.agindoId) ?? null)
    : null;
  const elegiveis = elegiveisAgora(estado).filter((p) => p.id !== estado.agindoId);
  const proximo = sugestaoDesempate(elegiveis)[0] ?? null;
  return {
    rodada: estado.rodada,
    janela: ROTULO_JANELA_CURTO[estado.janela],
    ladoDaVez: ladoDaVez(estado),
    agindo,
    proximo,
    temElegiveis: elegiveis.length > 0 || agindo !== null,
  };
}

/**
 * O participante DESTA pessoa que está agindo agora, se houver.
 *
 * A chave é o TOKEN, não o personagem: `Participante.id` é um id de
 * token (o elenco do combate é montado a partir do mapa, em
 * `PainelRodadas`). Quem decide o que é "meu" é o próprio servidor —
 * `pode_controlar`, da projeção `read_vtt_scene_tokens` — então aqui
 * basta receber essa lista pronta, sem reimplementar autorização no
 * cliente.
 */
export function meuParticipanteNaVez(
  estado: EstadoTrilha | null,
  tokensQueControlo: readonly string[],
): Participante | null {
  if (!estado?.agindoId) return null;
  const agindo = estado.participantes.find((p) => p.id === estado.agindoId);
  if (!agindo) return null;
  return tokensQueControlo.includes(agindo.id) ? agindo : null;
}
