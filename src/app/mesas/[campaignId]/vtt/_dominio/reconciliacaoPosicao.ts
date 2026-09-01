/**
 * Reconciliação PURA da posição declarativa (`token.q/r`) de um token
 * contra eventos `onToken` (postgres_changes) que podem chegar fora de
 * ordem em relação ao movimento visual mais recente conhecido pelo
 * cliente (broadcast local ou remoto) — e arbitragem PURA de qual
 * movimento é de fato o mais NOVO quando dois candidatos (broadcasts,
 * ou broadcast vs. gesto local) chegam fora de ordem.
 *
 * Por que isto existe separado de `VttClient.tsx`: o guard de
 * `movementId` em `onAnimacaoConcluida` só protege a transição
 * ANIMAÇÃO→declarativo (o instante em que `movimentoVisual` some do
 * mapa). Ele NÃO protege contra o que acontece DEPOIS — um evento
 * `onToken` persistido de um movimento mais ANTIGO, cuja escrita no
 * banco só chega depois que um movimento mais NOVO já terminou e
 * fixou visualmente seu próprio destino. Sem isto, esse evento atrasado
 * reconciliaria `estadoCena.tokens[].q/r` pra trás, fazendo o token
 * "voltar" por um instante antes do evento do movimento novo confirmar.
 *
 * Cenário principal (não hipotético — pedido explícito da revisão):
 *   1. movimento A leva o token até A;
 *   2. movimento B, mais novo, leva o MESMO token até B;
 *   3. a animação de B termina e fixa visualmente B;
 *   4. chega DEPOIS o `onToken` persistido de A, com revisão
 *      intermediária;
 *   5. esse evento não pode fazer o token voltar temporariamente pra A;
 *   6. o evento persistido de B confirma B e encerra a proteção.
 *
 * Segundo cenário, igualmente real (broadcast, não `onToken` — achado
 * da rodada seguinte de auditoria): a REDE, não só o banco, pode
 * entregar fora de ordem. Se broadcast B (mais novo) chega primeiro e
 * broadcast A (mais antigo) chega DEPOIS, uma proteção que troca de
 * dono só por "cheguei por último" deixaria A substituir B — o mesmo
 * defeito do cenário principal, um passo antes. `decidirNovoMovimento`
 * resolve os dois com a MESMA função: nunca compara ordem de CHEGADA
 * neste cliente, sempre a ordem de ORIGEM do movimento (`iniciadoEm`,
 * quando o AUTOR o começou — carregado no próprio `EventoMovimentoToken`
 * pra broadcasts, e replicado pro mesmo valor usado localmente quando o
 * autor é este cliente).
 *
 * Tudo aqui é puro — nenhuma leitura de `useState`/DOM/relógio do
 * sistema além do que é passado explicitamente como parâmetro, e nenhum
 * `setTimeout`/`setInterval` (agendamento de expiração é
 * responsabilidade do chamador, em `VttClient.tsx` — só a DECISÃO de
 * "o que expirou agora" é pura, ver `removerProtecoesExpiradas`) — pra
 * poder ser testado direto, sem browser (ver
 * `scripts/dev/check-reconciliacao-posicao-token.ts`).
 */

import type { Hex } from "../_mapa/hex";

/**
 * O movimento visual mais recente CONHECIDO pelo cliente pra um token
 * — sobrevive à conclusão da animação (ao contrário da entrada em
 * `movimentosVisuais`, que é apagada assim que a animação termina).
 * Existe exatamente UMA por token: toda vez que um movimento NOVO é
 * ACEITO (`decidirNovoMovimento` decide isso, nunca a ordem de
 * chegada), ele substitui o que havia antes.
 */
export interface ProtecaoMovimentoVisual {
  tokenId: string;
  movementId: string;
  destino: Hex;
  /**
   * epoch ms de quando o AUTOR deste movimento o iniciou — NUNCA a hora
   * em que este cliente recebeu/processou o evento. Pra um broadcast
   * remoto, é `EventoMovimentoToken.iniciadoEm`, tal e qual. Pra um
   * movimento local, é o MESMO `Date.now()` usado ao publicar o
   * broadcast correspondente (nunca uma segunda chamada separada —
   * duas chamadas de `Date.now()` pro "mesmo" instante podem divergir
   * por alguns ms, o suficiente pra quebrar o desempate).
   */
  iniciadoEm: number;
  /** epoch ms além do qual a proteção deixa de valer MESMO sem confirmação — nunca protege pra sempre. */
  expiraEm: number;
  /** Revisão confirmada do PRÓPRIO movimento protegido, se já soubermos — preenchida quando o `onToken` que confirma o destino chega. Informativa; não participa de nenhuma decisão. */
  revisaoConfirmada?: number;
}

/** Identidade + origem temporal de um movimento — o suficiente pra `decidirNovoMovimento` arbitrar, sem precisar do objeto `ProtecaoMovimentoVisual` inteiro (o candidato ainda não tem `destino`/`expiraEm` decididos no momento em que a arbitragem acontece). */
export interface OrigemMovimento {
  movementId: string;
  iniciadoEm: number;
}

export type DecisaoNovoMovimento = "aplicar" | "duplicata" | "ignorar";

/**
 * Decide se um movimento CANDIDATO (local ou remoto) deve substituir o
 * que está atualmente protegido/ativo pra um token — usando a ORDEM DE
 * ORIGEM real (`iniciadoEm`), NUNCA a ordem em que os eventos chegam
 * neste cliente. É a MESMA decisão usada tanto pra `movimentosVisuais`
 * (a animação ativa) quanto pra `protecoesPosicaoRef` (a proteção de
 * posição) — as duas nunca podem divergir sobre qual movimento é o
 * vigente.
 *
 * - sem proteção atual: `"aplicar"` — nada a disputar.
 * - mesmo `movementId`: `"duplicata"` — o MESMO movimento, só
 *   redelivery (Realtime pode reentregar um broadcast); nunca reinicia
 *   o relógio local da animação em voo.
 * - candidato mais NOVO (`iniciadoEm` maior): `"aplicar"`.
 * - candidato mais ANTIGO (`iniciadoEm` menor): `"ignorar"` — é
 *   exatamente o caso do broadcast atrasado que não pode reverter um
 *   mais novo já aplicado.
 * - empate exato de `iniciadoEm`, `movementId` diferentes: desempate
 *   determinístico por comparação de string do `movementId` — não tem
 *   significado semântico nenhum no valor em si, só precisa ser
 *   ESTÁVEL (mesma decisão em qualquer cliente, dado o mesmo par de
 *   IDs) e nunca depender da ordem de chegada.
 */
export function decidirNovoMovimento(
  atual: OrigemMovimento | null,
  candidato: OrigemMovimento,
): DecisaoNovoMovimento {
  if (!atual) return "aplicar";
  if (atual.movementId === candidato.movementId) return "duplicata";
  if (candidato.iniciadoEm > atual.iniciadoEm) return "aplicar";
  if (candidato.iniciadoEm < atual.iniciadoEm) return "ignorar";
  return candidato.movementId > atual.movementId ? "aplicar" : "ignorar";
}

/** Constrói a proteção pra um candidato JÁ ACEITO por `decidirNovoMovimento` — nunca chamado sem essa checagem antes. */
export function criarProtecaoMovimento(params: {
  tokenId: string;
  movementId: string;
  destino: Hex;
  iniciadoEm: number;
  agora: number;
  janelaMs: number;
}): ProtecaoMovimentoVisual {
  return {
    tokenId: params.tokenId,
    movementId: params.movementId,
    destino: params.destino,
    iniciadoEm: params.iniciadoEm,
    expiraEm: params.agora + params.janelaMs,
  };
}

export interface DecisaoReconciliacaoPosicao {
  /** Posição a aplicar de verdade em `estadoCena.tokens[].q/r` pra este evento — só relevante quando o chamador ainda vai ESCREVER a linha (revisão nova o suficiente; ver nota abaixo sobre `jaAplicado`). */
  posicao: Hex;
  /** `true` quando o chamador deve REMOVER a proteção do mapa (destino confirmado, ou janela expirada) — independente de a linha do token ter sido reescrita ou não. `false` quando a proteção deve continuar. */
  limparProtecao: boolean;
}

/**
 * A decisão de POSIÇÃO em si — separada, deliberadamente, da decisão
 * de se a linha do token deve ser reescrita (essa é sobre REVISÃO,
 * resolvida por quem chama, sempre monotônica, nunca aqui). Precisa
 * rodar SEMPRE que existir uma proteção pro token, mesmo quando o
 * evento é um eco cuja revisão já foi aplicada otimisticamente — um
 * eco que confirma exatamente o destino protegido tem que limpar a
 * proteção, e isso não pode depender de a linha ser reescrita ou não.
 *
 * Nunca compara `revision`: usa exclusivamente identidade de POSIÇÃO
 * (o evento aponta pro destino protegido ou não) mais a janela de
 * validade temporal.
 */
export function reconciliarPosicaoOnToken(params: {
  protecao: ProtecaoMovimentoVisual | null;
  eventoTokenId: string;
  eventoPosicao: Hex;
  agora: number;
}): DecisaoReconciliacaoPosicao {
  const { protecao, eventoTokenId, eventoPosicao, agora } = params;

  if (!protecao || protecao.tokenId !== eventoTokenId) {
    return { posicao: eventoPosicao, limparProtecao: false };
  }

  if (agora >= protecao.expiraEm) {
    return { posicao: eventoPosicao, limparProtecao: true };
  }

  const confirmaDestino = eventoPosicao.q === protecao.destino.q && eventoPosicao.r === protecao.destino.r;
  if (confirmaDestino) {
    return { posicao: eventoPosicao, limparProtecao: true };
  }

  return { posicao: protecao.destino, limparProtecao: false };
}

/** Remove a proteção de UM token — usado quando ele é removido, perde autorização, ou seu destino acabou de ser confirmado. Devolve a MESMA referência quando não havia nada a remover. */
export function limparProtecaoToken(
  protecoes: ReadonlyMap<string, ProtecaoMovimentoVisual>,
  tokenId: string,
): Map<string, ProtecaoMovimentoVisual> {
  if (!protecoes.has(tokenId)) return protecoes as Map<string, ProtecaoMovimentoVisual>;
  const novo = new Map(protecoes);
  novo.delete(tokenId);
  return novo;
}

/** Remove TODAS as proteções — usado numa troca de cena/desmontagem (nenhuma proteção de uma cena anterior faz sentido na cena nova). */
export function limparTodasAsProtecoes(): Map<string, ProtecaoMovimentoVisual> {
  return new Map();
}

/**
 * A menor `expiraEm` entre todas as proteções vigentes, ou `null` se
 * não há nenhuma — usado pra agendar UM ÚNICO `setTimeout` (nunca um
 * timer por token, nunca um timer por frame) pra próxima expiração
 * possível. Puro: só lê o mapa, nunca agenda nada.
 */
export function proximaExpiracao(protecoes: ReadonlyMap<string, ProtecaoMovimentoVisual>): number | null {
  let menor: number | null = null;
  for (const p of protecoes.values()) {
    if (menor === null || p.expiraEm < menor) menor = p.expiraEm;
  }
  return menor;
}

/**
 * Remove todas as proteções cuja janela já expirou em `agora` — sempre
 * a partir do mapa ATUAL passado por quem chama, nunca uma referência
 * capturada no instante em que um timer foi agendado. Por isso um
 * timer "antigo" (agendado pra quando uma proteção X expiraria) nunca
 * remove uma proteção MAIS NOVA do mesmo token por engano: se X foi
 * substituída antes do timer disparar, o mapa atual já tem outra
 * entrada (outro `movementId`, outro `expiraEm`) no lugar de X — o
 * disparo do timer velho simplesmente não encontra X pra remover, só
 * reavalia o que está de fato no mapa agora. Devolve a MESMA
 * referência quando nada expirou.
 */
export function removerProtecoesExpiradas(
  protecoes: ReadonlyMap<string, ProtecaoMovimentoVisual>,
  agora: number,
): Map<string, ProtecaoMovimentoVisual> {
  let mudou = false;
  const novo = new Map(protecoes);
  for (const [tokenId, p] of protecoes) {
    if (p.expiraEm <= agora) {
      novo.delete(tokenId);
      mudou = true;
    }
  }
  return mudou ? novo : (protecoes as Map<string, ProtecaoMovimentoVisual>);
}
