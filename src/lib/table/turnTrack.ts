/**
 * A JANELA de turno — Rápida (até 2 PA) e Lenta (3+), PRD 6.1/6.2.
 *
 * O que sobrou aqui, e por quê: este arquivo já foi o motor inteiro de
 * um SEGUNDO sistema de turnos, persistido em `campaigns.turn_track`
 * (migration 0036). O combate de verdade da mesa passou a viver em
 * `vtt_turn_tracks` (migration 0088) com `vtt/_turnos/modelo.ts` — que
 * tem elenco escolhido, declaração por janela, PA comprometido,
 * alternância entre lados e fragmentação, coisas que o motor daqui
 * nunca teve. Os dois conviveram por um tempo e discordavam na mesma
 * tela: o dock da casca mostrava um, os trilhos do mapa mostravam
 * outro, e a ficha lia o que ninguém escrevia.
 *
 * Com a unificação, o motor antigo perdeu todos os consumidores e saiu.
 * Ficou só o que é MECÂNICA DE AÇÃO e não de trilha: o teto de PA por
 * janela, que `lib/character/actionConsole.ts` aplica ao decidir se uma
 * ação cabe na janela em curso. `TurnTrackState` fica porque a coluna
 * `campaigns.turn_track` ainda existe no banco e o tipo de `Campaign`
 * precisa descrevê-la — ninguém mais a lê nem escreve.
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
  reflexos: number;
  active: boolean;
}

export interface TurnParticipant extends TurnParticipantInput {
  actedRapida: boolean;
  actedLenta: boolean;
}

/** Forma da coluna herdada `campaigns.turn_track`. Sem leitor nem escritor. */
export interface TurnTrackState {
  round: number;
  window: TurnWindow | null;
  participants: TurnParticipant[];
  order: string[];
  currentIndex: number;
  lastOverrideAt: string | null;
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
