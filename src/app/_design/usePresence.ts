"use client";

/**
 * Mantém uma superfície MONTADA durante a animação de saída.
 *
 * O problema que resolve é estrutural, não estético: em React,
 * `{aberto && <Modal/>}` remove o nó no mesmo frame do clique — não
 * existe frame nenhum em que um `@keyframes` ou uma `transition` de
 * saída pudesse rodar. É por isso que TODAS as superfícies do projeto
 * tinham entrada e nenhuma tinha saída: modal, overlay, drawer e véu
 * apareciam com cuidado e sumiam secos.
 *
 * Onde a superfície já é permanente no DOM e só muda de estado (o
 * drawer da campanha, os véus das duas cascas), a solução é 100% CSS —
 * `transition-behavior: allow-discrete` + `@starting-style`, ver
 * `.mo-scrim` em motion.css. Este hook é para o outro caso: conteúdo
 * que NÃO pode ficar montado (um formulário que precisa nascer limpo a
 * cada abertura, como o de criar campanha).
 *
 * Contrato:
 *   - `montado`  — se o componente deve ser renderizado.
 *   - `visivel`  — se ele deve estar no estado "aberto" (vira
 *                  `data-open` no DOM, e é o CSS que interpola).
 *
 * O atraso de um frame entre montar e marcar `visivel` não é
 * cosmético: montar já com `data-open="true"` faria o browser ver
 * apenas o estado final (React comita as duas coisas juntas) e a
 * ENTRADA não animaria. `requestAnimationFrame` duplo é o mínimo
 * confiável — o primeiro só garante que o frame de layout com o estado
 * inicial já aconteceu.
 *
 * Timers e rAF são sempre cancelados no cleanup, inclusive no unmount
 * do componente que usa o hook: nenhum `setTimeout` sobrevive à saída
 * da tela, e reabrir no meio de um fechamento cancela o fechamento em
 * vez de enfileirar um segundo (a animação interrompida simplesmente
 * inverte, que é o comportamento esperado de quem clica rápido).
 */

import { useEffect, useRef, useState } from "react";

export interface Presence {
  /** Renderize o componente enquanto isto for `true`. */
  montado: boolean;
  /** Passe como `data-open` — é o que o CSS interpola. */
  visivel: boolean;
}

export function usePresence(aberto: boolean, saidaMs = 150): Presence {
  const [montado, setMontado] = useState(aberto);
  const [visivel, setVisivel] = useState(aberto);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Qualquer transição nova cancela a anterior — é o que faz
    // abrir/fechar/abrir rápido inverter a animação em vez de
    // acumular um fechamento agendado que dispararia depois.
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (aberto) {
      setMontado(true);
      // Dois frames: monta com `data-open="false"`, o browser pinta esse
      // estado, e só então vira `true` — é o que dá ao CSS um ponto de
      // partida real pra interpolar.
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          setVisivel(true);
        });
      });
    } else {
      setVisivel(false);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setMontado(false);
      }, saidaMs);
    }

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      timerRef.current = null;
      rafRef.current = null;
    };
  }, [aberto, saidaMs]);

  return { montado, visivel };
}
