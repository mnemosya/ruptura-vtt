"use client";

/**
 * Scrollbar customizada (horizontal OU vertical) — SEMPRE visível
 * quando há overflow, independente da preferência do SO/navegador de
 * esconder scrollbars até o usuário rolar ativamente (macOS
 * "Automatically based on mouse or trackpad" faz exatamente isso, e
 * nem `::-webkit-scrollbar` estilizado escapa dele em todo browser).
 * A única forma de garantir "sempre visível" de verdade é não
 * depender da scrollbar NATIVA: escondemos ela (ver `.rc-body`/
 * `.rc-tabpanel` em console.css) e desenhamos essa barra por cima,
 * sincronizada por `scroll`/`ResizeObserver`.
 *
 * Só renderiza (retorna algo) quando o eixo correspondente tem
 * overflow de verdade — não aparece se o conteúdo já cabe.
 */

import { useCallback, useEffect, useRef, useState } from "react";

type Orientacao = "horizontal" | "vertical";

export function Scrollbar({ targetRef, orientacao }: { targetRef: React.RefObject<HTMLElement | null>; orientacao: Orientacao }) {
  const [estado, setEstado] = useState<{ ratio: number; progresso: number } | null>(null);
  const trilhoRef = useRef<HTMLDivElement>(null);
  const horizontal = orientacao === "horizontal";

  const atualizar = useCallback(() => {
    const el = targetRef.current;
    if (!el) return;
    const tamanhoTotal = horizontal ? el.scrollWidth : el.scrollHeight;
    const tamanhoVisivel = horizontal ? el.clientWidth : el.clientHeight;
    const posicao = horizontal ? el.scrollLeft : el.scrollTop;
    if (tamanhoTotal <= tamanhoVisivel + 1) {
      setEstado(null);
      return;
    }
    const ratio = tamanhoVisivel / tamanhoTotal;
    const maxScroll = tamanhoTotal - tamanhoVisivel;
    const progresso = maxScroll > 0 ? posicao / maxScroll : 0;
    setEstado({ ratio, progresso });
  }, [targetRef, horizontal]);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    atualizar();
    el.addEventListener("scroll", atualizar, { passive: true });
    // O elemento em si pode não mudar de tamanho, mas o CONTEÚDO dele
    // (ex.: `.rc-grid`, com dimensão própria) sim — observa os dois.
    const ro = new ResizeObserver(atualizar);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", atualizar);
      ro.disconnect();
    };
  }, [targetRef, atualizar]);

  /** Arrasta o polegar — traduz delta de mouse em delta de scroll. */
  const iniciarArraste = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = targetRef.current;
      const trilho = trilhoRef.current;
      if (!el || !trilho) return;
      e.preventDefault();
      e.stopPropagation();
      const alvo = e.currentTarget;
      try {
        alvo.setPointerCapture(e.pointerId);
      } catch {
        /* segue sem captura — o arraste ainda funciona via listeners. */
      }
      const trilhoRect = trilho.getBoundingClientRect();
      const trilhoTamanho = horizontal ? trilhoRect.width : trilhoRect.height;

      function mover(ev: PointerEvent) {
        const elAtual = targetRef.current;
        if (!elAtual || trilhoTamanho <= 0) return;
        if (horizontal) {
          const maxScroll = elAtual.scrollWidth - elAtual.clientWidth;
          const deltaScroll = (ev.movementX / trilhoTamanho) * elAtual.scrollWidth;
          elAtual.scrollLeft = Math.max(0, Math.min(maxScroll, elAtual.scrollLeft + deltaScroll));
        } else {
          const maxScroll = elAtual.scrollHeight - elAtual.clientHeight;
          const deltaScroll = (ev.movementY / trilhoTamanho) * elAtual.scrollHeight;
          elAtual.scrollTop = Math.max(0, Math.min(maxScroll, elAtual.scrollTop + deltaScroll));
        }
      }
      function soltar(ev: PointerEvent) {
        try {
          alvo.releasePointerCapture(ev.pointerId);
        } catch {
          /* já liberado */
        }
        alvo.removeEventListener("pointermove", mover);
        alvo.removeEventListener("pointerup", soltar);
        alvo.removeEventListener("pointercancel", soltar);
      }
      alvo.addEventListener("pointermove", mover);
      alvo.addEventListener("pointerup", soltar);
      alvo.addEventListener("pointercancel", soltar);
    },
    [targetRef, horizontal],
  );

  /** Clique no trilho (fora do polegar) pula uma página na direção clicada. */
  const clicarTrilho = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = targetRef.current;
      const trilho = trilhoRef.current;
      if (!el || !trilho || e.target !== trilho) return;
      const rect = trilho.getBoundingClientRect();
      const ratio = estado?.ratio ?? 1;
      const progresso = estado?.progresso ?? 0;
      if (horizontal) {
        const cliqueX = e.clientX - rect.left;
        const thumbInicio = progresso * (1 - ratio) * rect.width;
        const direcao = cliqueX < thumbInicio ? -1 : 1;
        el.scrollLeft += direcao * el.clientWidth * 0.9;
      } else {
        const cliqueY = e.clientY - rect.top;
        const thumbInicio = progresso * (1 - ratio) * rect.height;
        const direcao = cliqueY < thumbInicio ? -1 : 1;
        el.scrollTop += direcao * el.clientHeight * 0.9;
      }
    },
    [targetRef, estado, horizontal],
  );

  if (!estado) return null;

  const tamanhoPct = estado.ratio * 100;
  const posicaoPct = estado.progresso * (100 - tamanhoPct);

  const polegarStyle = horizontal
    ? { width: `${tamanhoPct}%`, left: `${posicaoPct}%` }
    : { height: `${tamanhoPct}%`, top: `${posicaoPct}%` };

  return (
    <div className={horizontal ? "rc-hscroll" : "rc-vscroll"} aria-hidden="true">
      <div
        ref={trilhoRef}
        className={horizontal ? "rc-hscroll-trilho" : "rc-vscroll-trilho"}
        onMouseDown={clicarTrilho}
      >
        <div
          className={horizontal ? "rc-hscroll-polegar" : "rc-vscroll-polegar"}
          style={polegarStyle}
          onPointerDown={iniciarArraste}
        />
      </div>
    </div>
  );
}

/** Atalho — mesma coisa que `<Scrollbar orientacao="horizontal">`. */
export function HorizontalScrollbar({ targetRef }: { targetRef: React.RefObject<HTMLElement | null> }) {
  return <Scrollbar targetRef={targetRef} orientacao="horizontal" />;
}
