/**
 * Lógica PURA da aba Participantes: ordenação do roster e o estado de
 * presença de cada linha.
 *
 * O ponto sensível está todo aqui: `onlineUserIds` vazio é AMBÍGUO —
 * pode ser "ninguém online" ou "o canal ainda não sincronizou/falhou".
 * Tratar o segundo caso como o primeiro é o estado enganoso que o
 * `CampaignRealtimeProvider` documenta e que esta aba não pode
 * reintroduzir. Por isso `estadoPresenca` recebe o STATUS do canal e
 * devolve quatro estados distintos, nunca um booleano.
 */

import type { RealtimeStatus } from "../../../../../lib/realtime/tableRealtime";

export type EstadoPresenca = "online" | "offline" | "conectando" | "indisponivel";

export const ROTULO_PRESENCA: Record<EstadoPresenca, string> = {
  online: "Online",
  offline: "Offline",
  conectando: "Conectando…",
  indisponivel: "Presença indisponível",
};

/**
 * Estado de presença de UM participante.
 *
 *  · canal `subscribed` → online/offline de verdade (o Set é confiável);
 *  · canal `connecting` → "conectando" para todo mundo — ainda não dá
 *    pra afirmar nada sobre ninguém;
 *  · canal `error`/`disabled` → "indisponível" para todo mundo.
 *
 * Nunca devolve "offline" fora do primeiro caso.
 */
export function estadoPresenca(status: RealtimeStatus, onlineUserIds: ReadonlySet<string>, userId: string): EstadoPresenca {
  if (status === "subscribed") return onlineUserIds.has(userId) ? "online" : "offline";
  if (status === "error" || status === "disabled") return "indisponivel";
  return "conectando";
}

/** A presença só decora a lista quando o canal de fato sincronizou. */
export function presencaDisponivel(status: RealtimeStatus): boolean {
  return status === "subscribed";
}

export interface ParticipanteLinha {
  userId: string;
  displayName: string;
  role: "narrator" | "player";
  presenca: EstadoPresenca;
  /** Personagens que esta conta controla, quando existe fonte SEGURA para isso. Vazio nunca significa "não controla nada" se `controlesConhecidos` for falso. */
  personagens: { id: string; nome: string }[];
}

/**
 * Narrador primeiro, depois os demais em ordem alfabética (pt-BR,
 * insensível a acento e caixa). Ordem TOTAL: empate de nome desempata
 * por `userId`, então a lista não pisca entre renders.
 */
export function ordenarParticipantes<T extends { userId: string; displayName: string; role: "narrator" | "player" }>(
  roster: readonly T[],
): T[] {
  return [...roster].sort((a, b) => {
    if (a.role !== b.role) return a.role === "narrator" ? -1 : 1;
    const porNome = a.displayName.localeCompare(b.displayName, "pt-BR", { sensitivity: "base" });
    if (porNome !== 0) return porNome;
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  });
}

/**
 * Quantos participantes estão online AGORA — `null` quando a presença
 * não está disponível. O contador da aba mostra o número só nesse
 * caso; nunca um "0" que pareceria "a mesa está vazia" enquanto o
 * canal está apenas conectando.
 */
export function contarOnline(roster: readonly { userId: string }[], status: RealtimeStatus, onlineUserIds: ReadonlySet<string>): number | null {
  if (!presencaDisponivel(status)) return null;
  return roster.reduce((n, p) => n + (onlineUserIds.has(p.userId) ? 1 : 0), 0);
}

/**
 * Monta as linhas prontas. `controlesPorUsuario` vem de
 * `character_controllers` (RLS: o narrador vê todas as linhas da
 * campanha; o jogador, só as próprias) — nunca de inferência pelo
 * token selecionado nem de qualquer outra adivinhação.
 */
export function montarLinhasParticipantes(params: {
  roster: readonly { userId: string; displayName: string; role: "narrator" | "player" }[];
  status: RealtimeStatus;
  onlineUserIds: ReadonlySet<string>;
  controlesPorUsuario: ReadonlyMap<string, { id: string; nome: string }[]>;
}): ParticipanteLinha[] {
  return ordenarParticipantes(params.roster).map((p) => ({
    userId: p.userId,
    displayName: p.displayName,
    role: p.role,
    presenca: estadoPresenca(params.status, params.onlineUserIds, p.userId),
    personagens: params.controlesPorUsuario.get(p.userId) ?? [],
  }));
}
