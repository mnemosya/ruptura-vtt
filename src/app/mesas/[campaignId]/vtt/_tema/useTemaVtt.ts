"use client";

import { useEffect, useState } from "react";
import { oxanium } from "../../../../_design/oxanium";

/**
 * Tema experimental do VTT (redesign na linguagem da Forja).
 *
 * Liga com `?tema=forja` na URL e fica lembrado neste navegador;
 * `?tema=atual` desliga. Sem o atributo, nenhuma regra de
 * `tema-forja.css` casa e o VTT é exatamente o de hoje.
 *
 * O atributo vai no `<html>`, não no `.rv-mesa`: o Console e as janelas
 * flutuantes são da casca da campanha e ficam fora da árvore do VTT.
 */
export type TemaVtt = "atual" | "forja";

const CHAVE = "rv-tema";
const TEMAS: readonly TemaVtt[] = ["atual", "forja"];

function lerTema(): TemaVtt {
  const daUrl = new URLSearchParams(window.location.search).get("tema");
  if (daUrl && (TEMAS as readonly string[]).includes(daUrl)) {
    try { localStorage.setItem(CHAVE, daUrl); } catch {}
    return daUrl as TemaVtt;
  }
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo && (TEMAS as readonly string[]).includes(salvo)) return salvo as TemaVtt;
  } catch {}
  return "atual";
}

export function useTemaVtt(): TemaVtt {
  const [temaAtivo, setTemaAtivo] = useState<TemaVtt>("atual");
  useEffect(() => {
    const raiz = document.documentElement;
    const tema = lerTema();
    setTemaAtivo(tema);
    if (tema === "atual") return;
    // A Forja titula em Oxanium, que fica fora do layout raiz (ver
    // `oxanium.ts`); no `<html>` ela alcança também os portais.
    raiz.setAttribute("data-tema", tema);
    raiz.classList.add(oxanium.variable);
    return () => {
      raiz.removeAttribute("data-tema");
      raiz.classList.remove(oxanium.variable);
    };
  }, []);
  return temaAtivo;
}
