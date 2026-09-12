"use client";

/**
 * Realtime da MESA (checkpoint v0.46) — assina `campaigns` (a própria
 * campanha), `characters` (por `campaign_id`) e `table_logs` (INSERT,
 * por `campaign_id`) e agenda refetches debounced independentes para
 * cada recurso. Mesmo princípio de `useCharacterRealtime`: nunca decide
 * regra, só avisa "refaça a leitura canônica" — os refetches de verdade
 * (`getCampaign`, `listCharactersForNarratorCampaign`,
 * `listLogsForViewer`) continuam sendo a única fonte de dados.
 *
 * Dividido em hooks SEPARADOS (o original era um só, que abria os três
 * primeiros canais juntos):
 *
 *   - `useCampaignSessionRealtime` — `campaigns` + `table_logs`. É o
 *     que vive na casca da campanha (CampaignRealtimeProvider), ligado
 *     em qualquer rota, alimentando o dock de turno e o log persistente.
 *   - `useCampaignCharactersRealtime` — só `characters`. Vive na Mesa
 *     do narrador, junto de "Resolver Ataque", que é a única coisa que
 *     precisa da lista de personagens fresca.
 *   - `useCampaignPresence` (Fase 3b) — canal de Presence, não
 *     `postgres_changes`: quem está com a campanha aberta AGORA, dado
 *     efêmero (nunca grava em `campaign_members`). Vive na casca, como
 *     `useCampaignSessionRealtime` — presença não é de uma ferramenta
 *     específica de rota.
 *
 * O motivo de não ser mais um hook só: os três têm ciclos de vida e
 * status DIFERENTES. Um hook combinado forçaria a casca a abrir o canal
 * de personagens em toda rota (custo de subscription que ninguém usa
 * fora da Mesa) e, pior, jogaria o status desse canal no mesmo agregado
 * — um indicador único diria "Sincronizado" com o canal de personagens
 * em erro, ou o contrário, sem quem lê saber qual dos dois quebrou.
 *
 * Status agregado (dentro de `useCampaignSessionRealtime`): "error" se
 * qualquer canal falhar, senão "connecting" até todos assinarem,
 * "subscribed" quando todos assinaram, "disabled" se o client de
 * browser não existir. `useCampaignPresence` expõe o próprio status,
 * sem se misturar ao de `campaigns`/`table_logs` — Presence é dado
 * decorativo (ver `presenceRealtime.ts`); um erro ali não deveria
 * marcar a sessão inteira como fora de sincronia.
 */

import { useEffect, useRef, useState } from "react";
import {
  createDebouncedRefetcher,
  dedupeRealtimeEvent,
  makeRealtimeEventKey,
  subscribeToCampaignCharacterControllersRealtime,
  subscribeToCampaignCharactersRealtime,
  subscribeToCampaignRealtime,
  subscribeToTableLogsRealtime,
  type RealtimeStatus,
} from "./tableRealtime";
import { subscribeToCampaignPresence } from "./presenceRealtime";

export interface CampaignSessionRealtimeCallbacks {
  onCampaignChange: () => void;
  onTableLogsChange: () => void;
}

/** Exportado — `MesaClient.tsx` agrega o canal de personagens + o de controle num único indicador "Personagens" pro jogador, mesmo princípio já usado aqui pra "Sessão" (campanha + log). */
export function aggregateRealtimeStatus(statuses: RealtimeStatus[]): RealtimeStatus {
  if (statuses.some((s) => s === "error")) return "error";
  if (statuses.every((s) => s === "disabled")) return "disabled";
  if (statuses.every((s) => s === "subscribed")) return "subscribed";
  return "connecting";
}

/** Canais de SESSÃO: a campanha e o log da mesa. (A trilha de turnos tem canal próprio — `subscribeToTrilhaDaMesa`.) */
export function useCampaignSessionRealtime(
  campaignId: string | null,
  callbacks: CampaignSessionRealtimeCallbacks,
  debounceMs = 200,
): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    if (!campaignId) {
      setStatus("disabled");
      return;
    }

    let mounted = true;
    const perChannelStatus: Record<"campaign" | "table_logs", RealtimeStatus> = {
      campaign: "connecting",
      table_logs: "connecting",
    };
    function reportStatus(key: keyof typeof perChannelStatus, value: RealtimeStatus) {
      perChannelStatus[key] = value;
      if (mounted) setStatus(aggregateRealtimeStatus(Object.values(perChannelStatus)));
    }

    const seenCampaign = new Set<string>();
    const seenLogs = new Set<string>();

    const debouncedCampaign = createDebouncedRefetcher(() => {
      if (mounted) callbacksRef.current.onCampaignChange();
    }, debounceMs);
    const debouncedLogs = createDebouncedRefetcher(() => {
      if (mounted) callbacksRef.current.onTableLogsChange();
    }, debounceMs);

    const unsubscribeCampaign = subscribeToCampaignRealtime({
      campaignId,
      onChange: (payload) => {
        if (!dedupeRealtimeEvent(seenCampaign, makeRealtimeEventKey(payload))) return;
        debouncedCampaign.schedule();
      },
      onStatusChange: (s) => reportStatus("campaign", s),
    });
    const unsubscribeLogs = subscribeToTableLogsRealtime({
      campaignId,
      onChange: (payload) => {
        if (!dedupeRealtimeEvent(seenLogs, makeRealtimeEventKey(payload))) return;
        debouncedLogs.schedule();
      },
      onStatusChange: (s) => reportStatus("table_logs", s),
    });

    return () => {
      mounted = false;
      debouncedCampaign.cancel();
      debouncedLogs.cancel();
      unsubscribeCampaign();
      unsubscribeLogs();
    };
  }, [campaignId, debounceMs]);

  return status;
}

/**
 * Canal de PERSONAGENS da campanha. Separado porque só "Resolver
 * Ataque" (Mesa do narrador) depende dessa lista — e ela vem com um
 * payload pesado que nenhuma outra rota deveria pagar.
 */
export function useCampaignCharactersRealtime(
  campaignId: string | null,
  onCharactersChange: () => void,
  debounceMs = 200,
): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const callbackRef = useRef(onCharactersChange);
  callbackRef.current = onCharactersChange;

  useEffect(() => {
    if (!campaignId) {
      setStatus("disabled");
      return;
    }

    let mounted = true;
    const seenCharacters = new Set<string>();
    const debouncedCharacters = createDebouncedRefetcher(() => {
      if (mounted) callbackRef.current();
    }, debounceMs);

    const unsubscribe = subscribeToCampaignCharactersRealtime({
      campaignId,
      onChange: (payload) => {
        if (!dedupeRealtimeEvent(seenCharacters, makeRealtimeEventKey(payload))) return;
        debouncedCharacters.schedule();
      },
      onStatusChange: (s) => {
        if (mounted) setStatus(s);
      },
    });

    return () => {
      mounted = false;
      debouncedCharacters.cancel();
      unsubscribe();
    };
  }, [campaignId, debounceMs]);

  return status;
}

/**
 * Canal de CONTROLE (`character_controllers`) — auditoria da Fase 4:
 * grant/revoke não toca a linha de `characters`, então
 * `useCampaignCharactersRealtime` (acima) nunca vê esse evento. Sem
 * isto, "Seus personagens" só descobria uma mudança de controle
 * quando a janela recuperava o foco (`reloadViewer`, Fase 3) — se o
 * jogador ficasse com a Mesa aberta e em foco a sessão inteira, o
 * card do personagem recém-atribuído/removido nunca aparecia/sumia
 * sozinho. Hook GEMEO de `useCampaignCharactersRealtime`, mesmo
 * princípio de debounce/dedupe/status.
 */
export function useCampaignCharacterControllersRealtime(
  campaignId: string | null,
  onControllersChange: () => void,
  debounceMs = 200,
): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const callbackRef = useRef(onControllersChange);
  callbackRef.current = onControllersChange;

  useEffect(() => {
    if (!campaignId) {
      setStatus("disabled");
      return;
    }

    let mounted = true;
    const seenControllers = new Set<string>();
    const debouncedControllers = createDebouncedRefetcher(() => {
      if (mounted) callbackRef.current();
    }, debounceMs);

    const unsubscribe = subscribeToCampaignCharacterControllersRealtime({
      campaignId,
      onChange: (payload) => {
        if (!dedupeRealtimeEvent(seenControllers, makeRealtimeEventKey(payload))) return;
        debouncedControllers.schedule();
      },
      onStatusChange: (s) => {
        if (mounted) setStatus(s);
      },
    });

    return () => {
      mounted = false;
      debouncedControllers.cancel();
      unsubscribe();
    };
  }, [campaignId, debounceMs]);

  return status;
}

export interface CampaignPresenceResult {
  /** `userId`s com a campanha aberta agora — vazio até o primeiro `sync`, nunca `null`/`undefined`. */
  onlineUserIds: Set<string>;
  status: RealtimeStatus;
}

const SEM_ONLINE = new Set<string>();

/**
 * Canal de PRESENÇA da campanha (Fase 3b — ver `presenceRealtime.ts`
 * pro porquê de cada decisão). Vive no `CampaignRealtimeProvider`,
 * como `useCampaignSessionRealtime` — presença é sobre "quem está com
 * a campanha aberta", não sobre uma ferramenta específica de uma rota,
 * então faz sentido estar ativo em qualquer lugar da campanha, não só
 * na Mesa.
 */
export function useCampaignPresence(campaignId: string | null, userId: string | null): CampaignPresenceResult {
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(SEM_ONLINE);
  const [status, setStatus] = useState<RealtimeStatus>("connecting");

  useEffect(() => {
    if (!campaignId || !userId) {
      setStatus("disabled");
      setOnlineUserIds(SEM_ONLINE);
      return;
    }

    let mounted = true;
    const unsubscribe = subscribeToCampaignPresence({
      campaignId,
      userId,
      onOnlineChange: (ids) => {
        if (mounted) setOnlineUserIds(ids);
      },
      onStatusChange: (s) => {
        if (mounted) setStatus(s);
      },
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [campaignId, userId]);

  return { onlineUserIds, status };
}
