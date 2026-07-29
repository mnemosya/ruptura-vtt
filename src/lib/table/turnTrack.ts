/**
 * Trilha de turnos — janela Rápida/Lenta (PRD seção 6 "Combate e
 * iniciativa por janelas", checkpoint pós-v0.94, migration 0036).
 *
 * Motor PURO (sem I/O) — toda persistência/concorrência fica em
 * `turnTrackActions.ts`. Regras implementadas, todas tiradas do PRD
 * literal (nenhuma inventada):
 *
 *   - Janela Rápida: ações de até 2 PA. Janela Lenta: ações de 3+ PA
 *     (seção 6.1) — o limite em si é MECÂNICA de ação (enforced em
 *     `isActionAllowedInWindow`, usado por actionConsole.ts), não do
 *     motor de turno.
 *   - A rodada alterna entre PJ e PNJ dentro da janela (seção 6.1).
 *     "PJ" = personagem com pelo menos um controlador em
 *     `character_controllers` (vinculado a uma conta de jogador); "PNJ"
 *     = sem controlador (só o narrador) — não existe uma coluna
 *     dedicada no schema de personagem para isto, então esta é a única
 *     distinção disponível nos dados e é a usada aqui (calculada em
 *     `turnTrackActions.ts`, este módulo só recebe `side` já pronto).
 *   - Desempate por Reflexos quando jogadores não entram em consenso
 *     (seção 6.1) — o valor de Reflexos de cada participante é
 *     CALCULADO FORA deste módulo (perícia derivada, não atributo cru)
 *     e passado pronto em `TurnParticipantInput.reflexos`.
 *   - Ao avançar para Lentos, quem não agiu em Rápidos não volta para
 *     a janela Rápida (seção 6.1) — não há mecanismo de "retorno"
 *     automático; a única forma de voltar é override do narrador
 *     (seção 6.1, "exceção operacional"), implementado em
 *     `narratorOverrideToParticipant`.
 */

export const TURN_WINDOWS = ["rapida", "lenta"] as const;
export type TurnWindow = (typeof TURN_WINDOWS)[number];

export const TURN_SIDES = ["pj", "pnj"] as const;
export type TurnSide = (typeof TURN_SIDES)[number];

/** PA acima do qual uma ação não pode ser feita em Turnos Rápidos (PRD 6.1/6.2). */
export const RAPIDA_MAX_PA = 2;

export interface TurnParticipantInput {
  characterId: string;
  characterNome: string;
  side: TurnSide;
  /** Reflexos já calculado (perícia derivada) — usado só para desempate. */
  reflexos: number;
  /** false = arquivado/removido da mesa/incapacitado — não entra na ordem. */
  active: boolean;
}

export interface TurnParticipant extends TurnParticipantInput {
  actedRapida: boolean;
  actedLenta: boolean;
}

export interface TurnTrackState {
  round: number;
  window: TurnWindow | null;
  participants: TurnParticipant[];
  /** IDs na ordem alternada computada para a janela atual. */
  order: string[];
  /** Índice em `order` de quem age agora; -1 = ninguém (janela não iniciada/encerrada). */
  currentIndex: number;
  lastOverrideAt: string | null;
}

export function emptyTurnTrackState(round = 1): TurnTrackState {
  return { round, window: null, participants: [], order: [], currentIndex: -1, lastOverrideAt: null };
}

/**
 * Constrói a ordem alternada PJ/PNJ para uma janela: dentro de cada
 * lado, desempate por Reflexos (maior primeiro; empate mantém ordem de
 * entrada, estável). Começa pelo lado com o participante de maior
 * Reflexos entre os dois primeiros de cada fila — sem essa regra no
 * PRD, usar Reflexos também para decidir quem abre é a extensão mais
 * direta da regra de desempate já descrita (não é uma regra nova,
 * apenas sua aplicação também ao primeiro turno).
 */
export function buildTurnOrder(participants: TurnParticipant[]): string[] {
  const active = participants.filter((p) => p.active);
  const bySide = (side: TurnSide) =>
    active
      .filter((p) => p.side === side)
      .slice()
      .sort((a, b) => b.reflexos - a.reflexos);

  const pjQueue = bySide("pj");
  const pnjQueue = bySide("pnj");
  const order: string[] = [];

  let turn: TurnSide = (pjQueue[0]?.reflexos ?? -Infinity) >= (pnjQueue[0]?.reflexos ?? -Infinity) ? "pj" : "pnj";
  while (pjQueue.length > 0 || pnjQueue.length > 0) {
    const queue = turn === "pj" ? pjQueue : pnjQueue;
    const other = turn === "pj" ? pnjQueue : pjQueue;
    if (queue.length > 0) {
      order.push(queue.shift()!.characterId);
      turn = other.length > 0 ? (turn === "pj" ? "pnj" : "pj") : turn;
    } else {
      turn = turn === "pj" ? "pnj" : "pj";
    }
  }
  return order;
}

function actedFlagKey(window: TurnWindow): "actedRapida" | "actedLenta" {
  return window === "rapida" ? "actedRapida" : "actedLenta";
}

/** Índice do primeiro participante em `order` que ainda não agiu na janela. -1 se todos agiram. */
function firstUnactedIndex(state: TurnTrackState, order: string[], window: TurnWindow): number {
  const flag = actedFlagKey(window);
  const byId = new Map(state.participants.map((p) => [p.characterId, p]));
  for (let i = 0; i < order.length; i++) {
    const participant = byId.get(order[i]);
    if (participant && !participant[flag]) return i;
  }
  return -1;
}

/**
 * Inicia a rodada (sempre em Turnos Rápidos, PRD 6.2 — a trilha exibida
 * começa por "RÁPIDOS"). Reseta `actedRapida`/`actedLenta` de todos —
 * é uma rodada nova.
 */
export function startRound(participantsInput: TurnParticipantInput[], round: number): TurnTrackState {
  const participants: TurnParticipant[] = participantsInput.map((p) => ({ ...p, actedRapida: false, actedLenta: false }));
  const order = buildTurnOrder(participants);
  return {
    round,
    window: "rapida",
    participants,
    order,
    currentIndex: firstUnactedIndex({ round, window: "rapida", participants, order, currentIndex: -1, lastOverrideAt: null }, order, "rapida"),
    lastOverrideAt: null,
  };
}

/**
 * Avança de Rápidos para Lentos. Recomputa a ordem só com participantes
 * ainda ativos (podem ter sido removidos/incapacitados no meio da
 * janela); quem não agiu em Rápidos permanece "não agiu" mas NUNCA
 * volta para Rápidos (não existe mais essa janela nesta rodada).
 */
export function advanceToLenta(state: TurnTrackState, participantsInput?: TurnParticipantInput[]): TurnTrackState {
  const participants: TurnParticipant[] = participantsInput
    ? participantsInput.map((p) => {
        const prev = state.participants.find((existing) => existing.characterId === p.characterId);
        return { ...p, actedRapida: prev?.actedRapida ?? false, actedLenta: prev?.actedLenta ?? false };
      })
    : state.participants;
  const order = buildTurnOrder(participants);
  const next: TurnTrackState = { ...state, window: "lenta", participants, order, currentIndex: -1 };
  return { ...next, currentIndex: firstUnactedIndex(next, order, "lenta") };
}

export interface EndTurnResult {
  state: TurnTrackState;
  ok: boolean;
  reason?: string;
}

/**
 * Encerra o turno do participante indicado (ação do jogador dono ou do
 * narrador) — marca que agiu na janela atual e avança `currentIndex`
 * para o próximo que ainda não agiu. Falha (sem mudar estado) se não
 * for a vez desse participante — mesma defesa que impede duas abas
 * encerrando o mesmo turno (a concorrência real de version/DB fica na
 * camada de Server Action).
 */
export function endTurn(state: TurnTrackState, characterId: string): EndTurnResult {
  if (!state.window || state.currentIndex < 0 || state.currentIndex >= state.order.length) {
    return { state, ok: false, reason: "Não há turno ativo para encerrar." };
  }
  if (state.order[state.currentIndex] !== characterId) {
    return { state, ok: false, reason: "Não é o turno deste personagem." };
  }
  const flag = actedFlagKey(state.window);
  const participants = state.participants.map((p) => (p.characterId === characterId ? { ...p, [flag]: true } : p));
  const next: TurnTrackState = { ...state, participants };
  const nextIndex = firstUnactedIndex(next, state.order, state.window);
  return { state: { ...next, currentIndex: nextIndex }, ok: true };
}

/** Narrador avança para o próximo participante sem exigir "agiu" (override operacional, PRD 6.1/16). */
export function narratorAdvance(state: TurnTrackState, nowIso: string): TurnTrackState {
  if (!state.window) return state;
  const currentId = state.currentIndex >= 0 ? state.order[state.currentIndex] : undefined;
  const flag = actedFlagKey(state.window);
  const participants = currentId
    ? state.participants.map((p) => (p.characterId === currentId ? { ...p, [flag]: true } : p))
    : state.participants;
  const next: TurnTrackState = { ...state, participants };
  const nextIndex = firstUnactedIndex(next, state.order, state.window);
  return { ...next, currentIndex: nextIndex, lastOverrideAt: nowIso };
}

/**
 * Override do narrador: devolve o turno a um participante específico,
 * mesmo que já tenha agido (PRD 6.1 — "exceção operacional"). Marca-o
 * como "não agiu" de novo para a janela atual e posiciona o cursor nele.
 */
export function narratorOverrideToParticipant(state: TurnTrackState, characterId: string, nowIso: string): TurnTrackState {
  if (!state.window) return state;
  const index = state.order.indexOf(characterId);
  if (index < 0) return state;
  const flag = actedFlagKey(state.window);
  const participants = state.participants.map((p) => (p.characterId === characterId ? { ...p, [flag]: false } : p));
  return { ...state, participants, currentIndex: index, lastOverrideAt: nowIso };
}

/** true se o participante indicado age agora (usado pela UI para habilitar "Encerrar turno"). */
export function isParticipantTurnNow(state: TurnTrackState, characterId: string): boolean {
  return state.window != null && state.currentIndex >= 0 && state.order[state.currentIndex] === characterId;
}

/**
 * Enforcement do limite de PA em Turnos Rápidos (PRD 6.1/6.2/6.3):
 * ações de mais de 2 PA são bloqueadas na janela Rápida, exceto quando
 * o narrador concede override explícito para aquela execução.
 */
export function isActionAllowedInWindow(window: TurnWindow | null, paCost: number | undefined, narratorOverride = false): { ok: boolean; reason?: string } {
  if (!window || paCost == null) return { ok: true };
  if (window === "rapida" && paCost > RAPIDA_MAX_PA && !narratorOverride) {
    return { ok: false, reason: `Turnos Rápidos permitem no máximo ${RAPIDA_MAX_PA} PA por ação (custo: ${paCost} PA). Peça override ao narrador.` };
  }
  return { ok: true };
}
