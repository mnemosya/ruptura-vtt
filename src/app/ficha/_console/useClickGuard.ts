"use client";

import { useCallback, useRef } from "react";

/**
 * Protege contra clique duplo/rápido em controles que mutam o
 * personagem diretamente (Integridade, PA, Reações, MIT/PD, Colapso).
 * Sem isso, dois eventos de clique disparados antes do primeiro
 * re-render leriam o mesmo valor "antigo" e aplicariam o delta duas
 * vezes.
 */
export function useClickGuard(windowMs = 220) {
  const last = useRef(0);
  return useCallback(
    (fn: () => void) => {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (now - last.current < windowMs) return;
      last.current = now;
      fn();
    },
    [windowMs],
  );
}
