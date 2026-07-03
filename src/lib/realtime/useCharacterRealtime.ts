"use client";

/**
 * Hook de Realtime mínimo para a FICHA (checkpoint v0.46) — assina
 * `characters` (o próprio `characterId`) e agenda um refetch debounced
 * quando o registro muda. Nunca decide regra: só avisa "algo mudou,
 * refaça a leitura canônica" — quem chama passa a função de refetch
 * de verdade (ex.: `getCharacter`/`getCharacterForProfileSession` +
 * `normalizeCharacter`, já existentes em `CharacterSheetClient.tsx`).
 */

import { useEffect, useRef, useState } from "react";
import {
  createDebouncedRefetcher,
  dedupeRealtimeEvent,
  makeRealtimeEventKey,
  subscribeToCharacterRealtime,
  type RealtimeStatus,
} from "./tableRealtime";

export function useCharacterRealtime(
  characterId: string | null,
  onRefetch: () => void,
  debounceMs = 200,
): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  // useRef guarda a versão mais recente de onRefetch sem recriar a
  // subscription a cada render (evita "subscription recria em todo
  // re-render" — só characterId/debounceMs disparam um novo canal).
  const onRefetchRef = useRef(onRefetch);
  onRefetchRef.current = onRefetch;

  useEffect(() => {
    if (!characterId) {
      setStatus("disabled");
      return;
    }

    let mounted = true;
    const seen = new Set<string>();
    const debounced = createDebouncedRefetcher(() => {
      if (mounted) onRefetchRef.current();
    }, debounceMs);

    const unsubscribe = subscribeToCharacterRealtime({
      characterId,
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
  }, [characterId, debounceMs]);

  return status;
}
