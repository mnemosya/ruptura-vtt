"use client";

/**
 * UMA LISTA QUE DIZ QUE ROLA.
 *
 * As sombras de rolagem em CSS puro (as camadas `background-attachment:
 * local`) não servem aqui: elas pintam no FUNDO do container, e os
 * cartões desta lista têm fundo opaco próprio — a sombra ficava atrás
 * deles, aparecendo só nos 8px de vão. O que se vê tem que estar POR
 * CIMA do conteúdo, e "por cima" só some na hora certa se alguém medir.
 *
 * Então mede: marca `data-rolavel` quando há mais conteúdo do que
 * altura, `data-inicio`/`data-fim` conforme a posição — e a folha
 * desenha os véus (`.rv-pasta-cenas::before/::after`) a partir disso.
 * Nenhuma sombra aparece numa lista que cabe inteira, que é o defeito
 * de qualquer solução "sempre ligada".
 *
 * Mede em três momentos: na montagem, a cada rolagem e quando o
 * tamanho muda (`ResizeObserver`) — abrir a pasta, filtrar pela busca
 * ou a janela mudar de altura são todos "o conteúdo agora é outro".
 */

import { useCallback, useEffect, useRef, useState } from "react";

export function ListaRolavel({ children, ...resto }: React.ComponentProps<"ul">) {
  const ref = useRef<HTMLUListElement | null>(null);
  const [estado, setEstado] = useState({ rolavel: false, inicio: true, fim: false });

  const medir = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // 1px de folga: alturas fracionárias (zoom do navegador, telas
    // com DPR não inteiro) fazem `scrollTop + clientHeight` parar a
    // meio pixel do fim, e sem a folga o véu de baixo nunca sumia.
    const rolavel = el.scrollHeight - el.clientHeight > 1;
    setEstado({
      rolavel,
      inicio: el.scrollTop <= 1,
      fim: el.scrollTop + el.clientHeight >= el.scrollHeight - 1,
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    for (const filho of Array.from(el.children)) observador.observe(filho);
    return () => observador.disconnect();
  }, [medir, children]);

  return (
    <ul
      {...resto}
      ref={ref}
      onScroll={medir}
      data-rolavel={estado.rolavel || undefined}
      data-inicio={estado.inicio || undefined}
      data-fim={estado.fim || undefined}
    >
      {children}
    </ul>
  );
}
