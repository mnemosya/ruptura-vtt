"use client";

/**
 * Hook de Realtime mínimo para `table_logs` (checkpoint v0.46) — usado
 * pela aba Mesa da FICHA (a mesa já usa `useCampaignRealtime`, que
 * inclui sua própria assinatura de `table_logs`). Mesmo princípio:
 * INSERT novo agenda um refetch debounced da listagem canônica
 * (`listLogsForViewer`, já usada por `MesaTab.tsx`).
 */

import { useEffect, useRef, useState } from "react";
import {
  createDebouncedRefetcher,
  dedupeRealtimeEvent,
  makeRealtimeEventKey,
  subscribeToTableLogsRealtime,
  type RealtimeStatus,
} from "./tableRealtime";

export function useTableLogsRealtime(
  campaignId: string | null,
  onRefetch: () => void,
  debounceMs = 200,
): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const onRefetchRef = useRef(onRefetch);
  onRefetchRef.current = onRefetch;

  useEffect(() => {
    if (!campaignId) {
      setStatus("disabled");
      return;
    }

    let mounted = true;
    const seen = new Set<string>();
    const debounced = createDebouncedRefetcher(() => {
      if (mounted) onRefetchRef.current();
    }, debounceMs);

    const unsubscribe = subscribeToTableLogsRealtime({
      campaignId,
      onChange: (payload) => {
        const key = makeRealtimeEventKey(payload);
        if (!dedupeRealtimeEvent(seen, key)) return;
        debounced.schedule();
      },
      onStatusChange: setStatus,
    });

    return () => {
      mounted = false;
      debounced.cancel();
      unsubscribe();
    };
  }, [campaignId, debounceMs]);

  return status;
}
