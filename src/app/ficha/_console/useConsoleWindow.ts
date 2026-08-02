"use client";

/**
 * Estado da janela do Console: geometria, modo (normal/maximizada/
 * minimizada), arraste e redimensionamento.
 *
 * A geometria vive só na sessão (spec §1: não criar persistência no
 * banco só para isso). Ao maximizar, a geometria anterior é guardada e
 * devolvida EXATAMENTE no restaurar.
 *
 * Arraste e resize usam Pointer Events com `setPointerCapture` — um só
 * caminho para mouse, caneta e toque, em vez de handlers separados que
 * divergem.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  geometriaInicial,
  geometriaMaximizada,
  limitarPosicao,
  redimensionar,
  MIN_H,
  MIN_W,
  type Geometry,
} from "./geometry";

export type WindowMode = "normal" | "maximized" | "minimized";

function viewport() {
  return { w: window.innerWidth, h: window.innerHeight };
}

export function useConsoleWindow(aberto: boolean) {
  const [mode, setMode] = useState<WindowMode>("normal");
  const [geo, setGeo] = useState<Geometry | null>(null);
  /** Geometria de antes de maximizar — devolvida intacta no restaurar. */
  const geoAntesDeMaximizar = useRef<Geometry | null>(null);

  // Geometria inicial só no cliente (depende da viewport real).
  useEffect(() => {
    if (!aberto || geo) return;
    setGeo(geometriaInicial(viewport()));
  }, [aberto, geo]);

  // Viewport mudou de tamanho: reposiciona para a janela continuar
  // alcançável, e reajusta a maximizada para a nova área útil.
  useEffect(() => {
    if (!aberto) return;
    function onResize() {
      const vp = viewport();
      setGeo((atual) => {
        if (!atual) return atual;
        return mode === "maximized" ? geometriaMaximizada(vp) : limitarPosicao(atual, vp);
      });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [aberto, mode]);

  const podeManipular = mode === "normal";

  /** Arraste pela topbar. O chamador decide se o alvo permite arrastar. */
  const iniciarArraste = useCallback(
    (e: React.PointerEvent) => {
      if (!podeManipular || !geo) return;
      const alvo = e.currentTarget as HTMLElement;
      // `setPointerCapture` lança se o ponteiro não estiver ativo; sem o
      // try/catch uma falha aqui abortaria o arraste inteiro.
      try {
        alvo.setPointerCapture(e.pointerId);
      } catch {
        /* segue sem captura — o arraste ainda funciona via listeners. */
      }
      const offsetX = e.clientX - geo.x;
      const offsetY = e.clientY - geo.y;

      function mover(ev: PointerEvent) {
        setGeo((atual) =>
          atual ? limitarPosicao({ ...atual, x: ev.clientX - offsetX, y: ev.clientY - offsetY }, viewport()) : atual,
        );
      }
      function soltar(ev: PointerEvent) {
        try { alvo.releasePointerCapture(ev.pointerId); } catch { /* já liberado */ }
        alvo.removeEventListener("pointermove", mover);
        alvo.removeEventListener("pointerup", soltar);
        alvo.removeEventListener("pointercancel", soltar);
      }
      alvo.addEventListener("pointermove", mover);
      alvo.addEventListener("pointerup", soltar);
      alvo.addEventListener("pointercancel", soltar);
    },
    [geo, podeManipular],
  );

  /** Resize pelo canto inferior direito. */
  const iniciarResize = useCallback(
    (e: React.PointerEvent) => {
      if (!podeManipular || !geo) return;
      e.stopPropagation();
      const alvo = e.currentTarget as HTMLElement;
      try {
        alvo.setPointerCapture(e.pointerId);
      } catch {
        /* idem ao arraste. */
      }
      const inicioX = e.clientX;
      const inicioY = e.clientY;
      const larguraInicial = geo.w;
      const alturaInicial = geo.h;

      function mover(ev: PointerEvent) {
        setGeo((atual) =>
          atual
            ? redimensionar(
                atual,
                larguraInicial + (ev.clientX - inicioX),
                alturaInicial + (ev.clientY - inicioY),
                viewport(),
              )
            : atual,
        );
      }
      function soltar(ev: PointerEvent) {
        try { alvo.releasePointerCapture(ev.pointerId); } catch { /* já liberado */ }
        alvo.removeEventListener("pointermove", mover);
        alvo.removeEventListener("pointerup", soltar);
        alvo.removeEventListener("pointercancel", soltar);
      }
      alvo.addEventListener("pointermove", mover);
      alvo.addEventListener("pointerup", soltar);
      alvo.addEventListener("pointercancel", soltar);
    },
    [geo, podeManipular],
  );

  /**
   * Alterna maximizado/normal.
   *
   * O cálculo acontece FORA dos updaters de estado: aninhar `setGeo`
   * dentro do updater de `setMode` fazia o efeito rodar duas vezes em
   * StrictMode e a segunda passada guardava a geometria já maximizada,
   * quebrando o restaurar.
   */
  const alternarMaximizar = useCallback(() => {
    if (mode === "maximized") {
      const anterior = geoAntesDeMaximizar.current;
      geoAntesDeMaximizar.current = null;
      if (anterior) setGeo(anterior);
      setMode("normal");
      return;
    }
    if (geo) geoAntesDeMaximizar.current = geo;
    setGeo(geometriaMaximizada(viewport()));
    setMode("maximized");
  }, [geo, mode]);

  /** Modo de antes de minimizar — para o dock devolver ao estado certo. */
  const modoAntesDeMinimizar = useRef<Exclude<WindowMode, "minimized">>("normal");

  const minimizar = useCallback(() => {
    if (mode !== "minimized") modoAntesDeMinimizar.current = mode;
    setMode("minimized");
  }, [mode]);

  /**
   * Restaurar do dock devolve ao modo exato de antes da minimização
   * (inclusive maximizado). Minimizar não altera a geometria, então
   * nada precisa ser recalculado aqui.
   */
  const restaurar = useCallback(() => {
    setMode(modoAntesDeMinimizar.current);
  }, []);

  return {
    mode,
    geo,
    minWidth: MIN_W,
    minHeight: MIN_H,
    podeManipular,
    iniciarArraste,
    iniciarResize,
    alternarMaximizar,
    minimizar,
    restaurar,
  };
}
