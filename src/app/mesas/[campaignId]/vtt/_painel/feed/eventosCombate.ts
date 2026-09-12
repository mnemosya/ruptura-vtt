/**
 * Eventos SEMÂNTICOS de combate, derivados da trilha REAL do VTT
 * (`vtt_turn_tracks`).
 *
 * O Chat não pode mostrar mutação crua de trilha — nem JSON, nem "o
 * participante X mudou de janela". O que a mesa precisa ler é: o
 * combate começou, a rodada virou, a janela mudou, alguém encerrou o
 * turno. Este módulo COMPARA dois estados da trilha e diz quais desses
 * eventos aconteceram.
 *
 * Fonte correta, de propósito: `vtt_turn_tracks` (a trilha da CENA,
 * com Rápidos/Lentos, elenco e PA), não `campaigns.turn_track` — o
 * sistema antigo, que continua existindo para o dock da casca mas não
 * é o combate atual do VTT.
 *
 * Módulo PURO: sem React, sem rede, sem banco. Quem grava é
 * `_acoes/sceneActions.ts`, no mesmo lugar onde a trilha é persistida.
 */

/** Recorte mínimo da trilha que interessa aos eventos — evita acoplar ao formato inteiro. */
export interface TrilhaComparavel {
  modo: string;
  rodada: number;
  janela: string;
  participantes: { id: string; nome: string; encerrouEm?: string | null; incapaz?: boolean }[];
}

export type EventoCombate =
  | { evento: "combate_iniciado"; rodada: number; janela: string }
  | { evento: "combate_encerrado"; rodada: number }
  | { evento: "rodada_avancou"; rodada: number; janela: string }
  | { evento: "janela_mudou"; rodada: number; janela: string }
  | { evento: "turno_encerrado"; rodada: number; janela: string; participanteId: string; participanteNome: string };

const ROTULO_JANELA: Record<string, string> = { rapidos: "Turnos rápidos", lentos: "Turnos lentos" };

export function rotuloDaJanela(janela: string): string {
  return ROTULO_JANELA[janela] ?? janela;
}

/** Um estado nulo/ausente significa "sem combate". */
function emCombate(t: TrilhaComparavel | null): boolean {
  return !!t && t.modo !== "exploracao";
}

/**
 * Diferença semântica entre dois estados da trilha.
 *
 * Regras deliberadas:
 *   · nunca emite mais de UM evento estrutural por transição (começar,
 *     encerrar, virar rodada e mudar janela são exclusivos entre si —
 *     virar a rodada já implica a janela nova);
 *   · "turno encerrado" sai por participante que passou a ter
 *     `encerrouEm`, e só por ele;
 *   · nada é emitido quando nada mudou, para o feed não encher de
 *     ruído a cada salvamento otimista da trilha.
 */
export function diffTrilha(antes: TrilhaComparavel | null, depois: TrilhaComparavel | null): EventoCombate[] {
  const eventos: EventoCombate[] = [];

  if (!emCombate(antes) && emCombate(depois) && depois) {
    eventos.push({ evento: "combate_iniciado", rodada: depois.rodada, janela: depois.janela });
    return eventos;
  }
  if (emCombate(antes) && !emCombate(depois) && antes) {
    eventos.push({ evento: "combate_encerrado", rodada: antes.rodada });
    return eventos;
  }
  if (!antes || !depois || !emCombate(depois)) return eventos;

  if (depois.rodada !== antes.rodada) {
    eventos.push({ evento: "rodada_avancou", rodada: depois.rodada, janela: depois.janela });
  } else if (depois.janela !== antes.janela) {
    eventos.push({ evento: "janela_mudou", rodada: depois.rodada, janela: depois.janela });
  }

  const antesPorId = new Map(antes.participantes.map((p) => [p.id, p]));
  for (const p of depois.participantes) {
    const anterior = antesPorId.get(p.id);
    const encerrouAgora = !!p.encerrouEm && !anterior?.encerrouEm;
    if (encerrouAgora) {
      eventos.push({
        evento: "turno_encerrado",
        rodada: depois.rodada,
        janela: depois.janela,
        participanteId: p.id,
        participanteNome: p.nome,
      });
    }
  }

  return eventos;
}

/**
 * Payload do log para um evento — pronto para `addLog` com o tipo
 * `combate_vtt`, que a allowlist do feed projeta como divisor. Nunca
 * grava o estado bruto da trilha.
 */
export function payloadDoEvento(e: EventoCombate): Record<string, unknown> {
  const base: Record<string, unknown> = { evento: e.evento, source: "vtt_trilha" };
  if (e.evento === "combate_encerrado") return { ...base, rodada: e.rodada };
  if (e.evento === "turno_encerrado") {
    return {
      ...base,
      rodada: e.rodada,
      janela: e.janela,
      janelaRotulo: rotuloDaJanela(e.janela),
      participanteId: e.participanteId,
      characterNome: e.participanteNome,
    };
  }
  return { ...base, rodada: e.rodada, janela: e.janela, janelaRotulo: rotuloDaJanela(e.janela) };
}

/** Normaliza o estado persistido (jsonb) para a forma comparável. `null` quando irreconhecível. */
export function paraComparavel(estado: unknown): TrilhaComparavel | null {
  if (!estado || typeof estado !== "object") return null;
  const e = estado as Record<string, unknown>;
  if (typeof e.rodada !== "number" || typeof e.janela !== "string" || typeof e.modo !== "string") return null;
  const brutos = Array.isArray(e.participantes) ? (e.participantes as Record<string, unknown>[]) : [];
  return {
    modo: e.modo,
    rodada: e.rodada,
    janela: e.janela,
    participantes: brutos
      .filter((p) => typeof p.id === "string")
      .map((p) => ({
        id: p.id as string,
        nome: typeof p.nome === "string" ? p.nome : "—",
        encerrouEm: typeof p.encerrouEm === "string" ? p.encerrouEm : null,
        incapaz: p.incapaz === true,
      })),
  };
}
