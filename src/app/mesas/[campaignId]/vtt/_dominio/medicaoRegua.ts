/**
 * Estado da régua MULTI-SEGMENTO (ferramenta "Medir").
 *
 * Lógica pura, sem React e sem DOM — testável direto no node
 * (`scripts/test-vtt-medicao-regua.ts`), e é a MESMA lógica que
 * `MapaHex.tsx` usa nos handlers de `pointermove`/`keydown`. Mesma
 * disciplina de `_dominio/arrastoToken.ts`, e de propósito: o gesto de
 * fixar dobra com `Q` aqui é o análogo direto de `adicionarWaypoint`
 * lá, então quem já conhece um entende o outro sem reaprender nada.
 *
 * O que este módulo NÃO faz: distância, custo de terreno e bloqueio.
 * Isso é `medir()` (`_dominio/movimento.ts`), que já monta rota
 * multi-ponto com segmento a segmento e totais — a régua só decide
 * QUAIS pontos entram, nunca reimplementa o cálculo.
 */

import { type Hex, hexIguais } from "../_mapa/hex";

/**
 * DURAÇÃO — quanto tempo a régua existe.
 *
 * Instantânea: some assim que a medição conclui (soltar sem dobra, ou
 * `Enter` com dobra), nunca persiste. Permanente: vira linha em
 * `vtt_measurements` e some só quando alguém apaga.
 */
export type DuracaoMedicao = "instantanea" | "permanente";

/**
 * VISIBILIDADE — quem enxerga a régua.
 *
 * Privada: só o autor, nem o narrador (migration 0128). Mesa: todos os
 * participantes da campanha.
 */
export type VisibilidadeMedicao = "privada" | "mesa";

/**
 * Os dois eixos, juntos — e são de fato INDEPENDENTES, o que o painel
 * antigo escondia ao oferecer só "instantânea (só pra você)" ou
 * "permanente (fica pra mesa)". As quatro combinações têm uso:
 *
 *   instantânea + privada  — conferir alcance sem telegrafar nada.
 *   instantânea + mesa     — "olha, daqui até ali não alcança": a mesa
 *                            vê a régua AO VIVO e ela some no fim do
 *                            gesto (broadcast, nada persistido).
 *   permanente  + mesa     — deixar a medida no mapa pra todos.
 *   permanente  + privada  — anotação de distância que só o autor vê.
 */
export interface ModoMedicao {
  duracao: DuracaoMedicao;
  visibilidade: VisibilidadeMedicao;
}

/** Começo de sessão: efêmera e privada — o modo que não deixa rastro nem interrompe ninguém. */
export const MODO_MEDICAO_PADRAO: ModoMedicao = { duracao: "instantanea", visibilidade: "privada" };

/**
 * Máquina de estados explícita — um só `useState`, nunca vários
 * paralelos que possam divergir.
 *
 * `ociosa → pressionada → medindo → concluida`. `pressionada` nunca
 * renderiza nada: só vira `medindo` depois de cruzar o limiar de
 * arraste, que é o que faz um clique simples nunca desenhar régua nem
 * criar dobra.
 */
export type EstadoMedicao =
  | { fase: "ociosa" }
  | { fase: "pressionada"; origem: Hex; inicioPx: { x: number; y: number } }
  | {
      fase: "medindo";
      /** Origem + dobras fixadas com `Q`, em ordem. Sempre tem ao menos a origem. */
      pontos: Hex[];
      /** Ponta viva, sob o cursor — substituída a cada movimento, nunca acumulada. */
      atual: Hex;
      /**
       * `true` quando o botão já foi solto mas a medição CONTINUA viva,
       * porque existe pelo menos uma dobra fixada. É o que permite
       * atravessar o mapa (com zoom/pan) sem manter o botão pressionado
       * — segurar o botão numa medição de vários trechos é impraticável.
       * Sem dobra nenhuma, soltar conclui igual a antes: o gesto simples
       * de clicar-arrastar-soltar fica idêntico ao de sempre.
       */
      livre: boolean;
    }
  | { fase: "concluida"; pontos: Hex[]; atual: Hex };

/** Todos os pontos da régua, na ordem — o que alimenta `medir()`. */
export function pontosDaMedicao(e: EstadoMedicao): Hex[] {
  if (e.fase === "medindo" || e.fase === "concluida") return [...e.pontos, e.atual];
  return [];
}

/** Quantas dobras o usuário fixou (a origem não conta como dobra). */
export function totalDobras(e: EstadoMedicao): number {
  if (e.fase === "medindo" || e.fase === "concluida") return e.pontos.length - 1;
  return 0;
}

/**
 * Tecla `Q` — fixa a ponta viva como dobra e segue medindo a partir
 * dela. Devolve a MESMA referência (recusa silenciosa) quando não há
 * trecho novo pra fixar: a ponta já é a última dobra. Sem isso, marte-
 * lar `Q` parado empilharia dobras de comprimento zero.
 */
export function fixarDobra(e: EstadoMedicao): EstadoMedicao {
  if (e.fase !== "medindo") return e;
  const ultimo = e.pontos[e.pontos.length - 1];
  if (ultimo && hexIguais(ultimo, e.atual)) return e;
  return { ...e, pontos: [...e.pontos, e.atual] };
}

/**
 * Tecla `Backspace` — remove só a ÚLTIMA dobra fixada; a medição volta
 * a sair da dobra anterior (ou da origem) e continua viva. Nunca
 * remove a origem: sem ela não há régua, e o jeito de descartar tudo é
 * `Esc`, não ir apagando até o vazio. No-op (mesma referência) quando
 * só resta a origem.
 */
export function removerUltimaDobra(e: EstadoMedicao): EstadoMedicao {
  if (e.fase !== "medindo") return e;
  if (e.pontos.length <= 1) return e;
  return { ...e, pontos: e.pontos.slice(0, -1) };
}

/**
 * Move a ponta viva. No-op quando o cursor continua no MESMO hexágono
 * — evita re-render a cada pixel dentro da mesma célula.
 */
export function moverPonta(e: EstadoMedicao, hex: Hex): EstadoMedicao {
  if (e.fase !== "medindo") return e;
  return hexIguais(e.atual, hex) ? e : { ...e, atual: hex };
}

/**
 * `Enter` (ou soltar o botão sem nenhuma dobra) — encerra a medição
 * mantendo o resultado na tela. No-op fora de `medindo`.
 */
export function concluir(e: EstadoMedicao): EstadoMedicao {
  if (e.fase !== "medindo") return e;
  return { fase: "concluida", pontos: e.pontos, atual: e.atual };
}

/**
 * Soltar o botão. Sem dobra nenhuma conclui (gesto clássico de
 * clicar-arrastar-soltar, preservado ao pé da letra); com dobras,
 * a medição segue viva em modo `livre` pra receber mais trechos.
 */
export function soltarBotao(e: EstadoMedicao): EstadoMedicao {
  if (e.fase === "pressionada") return { fase: "ociosa" };
  if (e.fase !== "medindo") return e;
  if (e.pontos.length > 1) return e.livre ? e : { ...e, livre: true };
  return concluir(e);
}

/**
 * Decide se um gesto que ainda está em `pressionada` já virou medição:
 * ou o ponteiro andou o bastante em TELA, ou mudou de hexágono. Os
 * dois critérios juntos evitam que um clique trêmulo vire régua e que
 * um arraste curto entre células vizinhas seja ignorado.
 */
export function cruzouLimiar(
  e: EstadoMedicao,
  hexSobCursor: Hex,
  px: { x: number; y: number },
  limiarPx: number,
): boolean {
  if (e.fase !== "pressionada") return false;
  const dist = Math.hypot(px.x - e.inicioPx.x, px.y - e.inicioPx.y);
  return dist >= limiarPx || !hexIguais(hexSobCursor, e.origem);
}

/** Transição `pressionada → medindo`, já com a origem como primeiro ponto. */
export function comecarAMedir(e: EstadoMedicao, hexSobCursor: Hex): EstadoMedicao {
  if (e.fase !== "pressionada") return e;
  return { fase: "medindo", pontos: [e.origem], atual: hexSobCursor, livre: false };
}
