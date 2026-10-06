"use client";

import { useEffect } from "react";

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

export function useTemaVtt(): void {
  useEffect(() => {
    const raiz = document.documentElement;
    const tema = lerTema();
    if (tema === "atual") raiz.removeAttribute("data-tema");
    else raiz.setAttribute("data-tema", tema);
    return () => raiz.removeAttribute("data-tema");
  }, []);
}
