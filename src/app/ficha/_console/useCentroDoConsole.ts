"use client";

import { useEffect, useState } from "react";

export type CentroDoConsole = { x: number; y: number };

/**
 * Centro VISUAL da janela do Console em coordenadas de tela.
 *
 * As janelas auxiliares vivem fora de `.rc-window-wrap`, portanto 50%
 * da viewport não representa 50% do Console. O observer acompanha
 * tamanho e também as mudanças de `style` produzidas por arraste,
 * resize, maximização e restauração.
 */
export function useCentroDoConsole(): CentroDoConsole | null {
  const [centro, setCentro] = useState<CentroDoConsole | null>(null);

  useEffect(() => {
    const janela = document.querySelector<HTMLElement>(".rc-window");
    if (!janela) return;
    const moldura = janela.closest<HTMLElement>(".rc-window-wrap");
    let frame = 0;

    const medir = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const caixa = janela.getBoundingClientRect();
        setCentro({ x: caixa.left + caixa.width / 2, y: caixa.top + caixa.height / 2 });
      });
    };

    medir();
    const tamanho = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(medir);
    tamanho?.observe(janela);
    if (moldura) tamanho?.observe(moldura);

    const posicao = typeof MutationObserver === "undefined" ? null : new MutationObserver(medir);
    if (moldura) posicao?.observe(moldura, { attributes: true, attributeFilter: ["style", "data-mode"] });
    posicao?.observe(janela, { attributes: true, attributeFilter: ["style"] });

    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      cancelAnimationFrame(frame);
      tamanho?.disconnect();
      posicao?.disconnect();
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, []);

  return centro;
}
