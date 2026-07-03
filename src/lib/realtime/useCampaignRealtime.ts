"use client";

/**
 * Hook de Realtime mínimo para a MESA (checkpoint v0.46) — assina
 * `campaigns` (a própria campanha), `characters` (por `campaign_id`) e
 * `table_logs` (INSERT, por `campaign_id`) e agenda refetches
 * debounced independentes para cada recurso. Mesmo princípio de
 * `useCharacterRealtime`: nunca decide regra, só avisa "refaça a
 * leitura canônica" — os refetches de verdade (`getCampaign`,
 * `listCharactersForNarratorCampaign`, `listLogsForViewer`) já existem
 * em `MesaDetailClient.tsx` e continuam sendo a única fonte de dados.
 *
 * Status agregado: "error" se qualquer canal falhar, senão
 * "connecting" até todos assinarem, "subscribed" quando todos
 * assinaram, "disabled" se o client de browser não existir.
 */

import { useEffect, useRef, useState } from "react";
import {
  createDebouncedRefetcher,
  dedupeRealtimeEvent,
  makeRealtimeEventKey,
  subscribeToCampaignCharactersRealtime,
  subscribeToCampaignRealtime,
  subscribeToTableLogsRealtime,
  type RealtimeStatus,
} from "./tableRealtime";

export interface CampaignRealtimeCallbacks {
  onCampaignChange: () => void;
  onCharactersChange: () => void;
  onTableLogsChange: () => void;
}

function aggregateStatus(statuses: RealtimeStatus[]): RealtimeStatus {
  if (statuses.some((s) => s === "error")) return "error";
  if (statuses.every((s) => s === "disabled")) return "disabled";
  if (statuses.every((s) => s === "subscribed")) return "subscribed";
  return "connecting";
}

export function useCampaignRealtime(
  campaignId: string | null,
  callbacks: CampaignRealtimeCallbacks,
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
    const perChannelStatus: Record<"campaign" | "characters" | "table_logs", RealtimeStatus> = {
      campaign: "connecting",
      characters: "connecting",
      table_logs: "connecting",
    };
    function reportStatus(key: keyof typeof perChannelStatus, value: RealtimeStatus) {
      perChannelStatus[key] = value;
      if (mounted) setStatus(aggregateStatus(Object.values(perChannelStatus)));
    }

    const seenCampaign = new Set<string>();
    const seenCharacters = new Set<string>();
    const seenLogs = new Set<string>();

    const debouncedCampaign = createDebouncedRefetcher(() => {
      if (mounted) callbacksRef.current.onCampaignChange();
    }, debounceMs);
    const debouncedCharacters = createDebouncedRefetcher(() => {
      if (mounted) callbacksRef.current.onCharactersChange();
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
    const unsubscribeCharacters = subscribeToCampaignCharactersRealtime({
      campaignId,
      onChange: (payload) => {
        if (!dedupeRealtimeEvent(seenCharacters, makeRealtimeEventKey(payload))) return;
        debouncedCharacters.schedule();
      },
      onStatusChange: (s) => reportStatus("characters", s),
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
      debouncedCharacters.cancel();
      debouncedLogs.cancel();
      unsubscribeCampaign();
      unsubscribeCharacters();
      unsubscribeLogs();
    };
  }, [campaignId, debounceMs]);

  return status;
}
