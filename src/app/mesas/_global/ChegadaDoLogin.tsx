"use client";

import { useLayoutEffect, useRef } from "react";

/** Continua a transição do login antes da pintura, inclusive na navegação cliente. */
export function ChegadaDoLogin() {
  const veuRef = useRef<HTMLDivElement>(null);
  const chegadaRef = useRef<boolean | null>(null);

  useLayoutEffect(() => {
    if (chegadaRef.current === null) {
      chegadaRef.current = false;
      try {
        chegadaRef.current = Boolean(sessionStorage.getItem("ruptura:chegada"));
        sessionStorage.removeItem("ruptura:chegada");
      } catch {
        // Sem armazenamento, a área abre sem a transição.
      }
    }

    const veu = veuRef.current;
    if (!chegadaRef.current || !veu || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    veu.setAttribute("data-ativa", "");
    // Duração casada com `.v1-chegada` em areaV1.css.
    const timer = window.setTimeout(() => veu.removeAttribute("data-ativa"), 1700);
    return () => {
      window.clearTimeout(timer);
      veu.removeAttribute("data-ativa");
    };
  }, []);

  return (
    <div ref={veuRef} id="v1-chegada" className="v1-chegada" aria-hidden="true">
      <span className="v1-chegada-ponto" />
      ENTRANDO NA MALHA
    </div>
  );
}
