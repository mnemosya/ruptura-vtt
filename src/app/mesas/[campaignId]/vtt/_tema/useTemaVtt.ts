"use client";

import { useEffect } from "react";
import { oxanium } from "../../../../_design/oxanium";

/**
 * Tema do VTT: a linguagem da Forja.
 *
 * Começou como experimento ligado por `?tema=forja` e virou o único tema
 * (07/10/2026). O atributo `data-tema="forja"` continua existindo porque
 * é por ele que `tema-forja.css` sobrescreve o chassi; ele vai no
 * `<html>`, não no `.rv-mesa`, porque o Console e as janelas flutuantes
 * são da casca da campanha e ficam fora da árvore do VTT.
 */
export type TemaVtt = "forja";

const TEMA: TemaVtt = "forja";

export function useTemaVtt(): TemaVtt {
  useEffect(() => {
    const raiz = document.documentElement;
    // A Forja titula em Oxanium, que fica fora do layout raiz (ver
    // `oxanium.ts`); no `<html>` ela alcança também os portais.
    raiz.setAttribute("data-tema", TEMA);
    raiz.classList.add(oxanium.variable);

    // Restos do experimento: links antigos com `?tema=` e a escolha que
    // ficava guardada no navegador.
    const url = new URL(window.location.href);
    if (url.searchParams.has("tema")) {
      url.searchParams.delete("tema");
      window.history.replaceState(window.history.state, "", url);
    }
    try { localStorage.removeItem("rv-tema"); } catch {}

    return () => {
      raiz.removeAttribute("data-tema");
      raiz.classList.remove(oxanium.variable);
    };
  }, []);
  return TEMA;
}
