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
      alvo.setPointerCapture(e.pointerId);
      const offsetX = e.clientX - geo.x;
      const offsetY = e.clientY - geo.y;

      function mover(ev: PointerEvent) {
        setGeo((atual) =>
          atual ? limitarPosicao({ ...atual, x: ev.clientX - offsetX, y: ev.clientY - offsetY }, viewport()) : atual,
        );
      }
      function soltar(ev: PointerEvent) {
        alvo.releasePointerCapture(ev.pointerId);
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
      alvo.setPointerCapture(e.pointerId);
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
        alvo.releasePointerCapture(ev.pointerId);
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

  const alternarMaximizar = useCallback(() => {
    setMode((atual) => {
      if (atual === "maximized") {
        const anterior = geoAntesDeMaximizar.current;
        if (anterior) setGeo(anterior);
        geoAntesDeMaximizar.current = null;
        return "normal";
      }
      setGeo((g) => {
        if (g) geoAntesDeMaximizar.current = g;
        return geometriaMaximizada(viewport());
      });
      return "maximized";
    });
  }, []);

  const minimizar = useCallback(() => setMode("minimized"), []);

  /**
   * Restaurar do dock devolve ao modo anterior à minimização. Como
   * minimizar não altera a geometria, basta voltar para "normal" —
   * salvo se a janela estava maximizada, caso em que `geoAntesDeMaximizar`
   * ainda guarda o estado e o modo volta a "maximized".
   */
  const restaurar = useCallback(() => {
    setMode(geoAntesDeMaximizar.current ? "maximized" : "normal");
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
