"use client";

/**
 * O VÉU DE ROLAGEM — o degradê que diz "tem mais coisa aqui".
 *
 * Devolve um `ref` e os atributos que a folha lê:
 *
 *   `data-rolavel` — há mais conteúdo do que altura;
 *   `data-inicio`  — está no topo (o véu de cima some);
 *   `data-fim`     — está no fim (o véu de baixo some).
 *
 * POR QUE MEDIR, e não resolver só em CSS: a técnica clássica (as
 * camadas de `background-attachment: local`) pinta no FUNDO do
 * container, e as listas daqui têm cartões de fundo opaco — o véu
 * ficava atrás deles, aparecendo só nos vãos. Desenhar por cima exige
 * um elemento sticky, e sticky não sabe sozinho se a lista rola: sem a
 * medida, uma lista que cabe inteira ganharia uma vinheta permanente.
 *
 * Mede em três momentos: na montagem, a cada rolagem e quando o
 * tamanho muda (`ResizeObserver`, no container E nos filhos) — abrir
 * uma pasta, filtrar pela busca ou a janela mudar de altura são todos
 * "o conteúdo agora é outro".
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface RolagemVelada<T extends HTMLElement> {
  ref: React.RefObject<T | null>;
  /** Espalhe no elemento que rola: `<div {...veu.atributos}>`. */
  atributos: {
    ref: React.RefObject<T | null>;
    onScroll: () => void;
    "data-rolavel"?: true;
    "data-inicio"?: true;
    "data-fim"?: true;
  };
}

export function useRolagemVelada<T extends HTMLElement>(): RolagemVelada<T> {
  const ref = useRef<T | null>(null);
  const [estado, setEstado] = useState({ rolavel: false, inicio: true, fim: false });

  const medir = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // 1px de folga: alturas fracionárias (zoom do navegador, telas com
    // DPR não inteiro) fazem `scrollTop + clientHeight` parar a meio
    // pixel do fim, e sem a folga o véu de baixo nunca sumia.
    const proximo = {
      rolavel: el.scrollHeight - el.clientHeight > 1,
      inicio: el.scrollTop <= 1,
      fim: el.scrollTop + el.clientHeight >= el.scrollHeight - 1,
    };
    // Só reescreve quando muda de verdade: `onScroll` dispara a cada
    // quadro do gesto, e um `setState` por quadro rerenderizaria a
    // lista inteira enquanto ela rola.
    setEstado((a) => (
      a.rolavel === proximo.rolavel && a.inicio === proximo.inicio && a.fim === proximo.fim ? a : proximo
    ));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    for (const filho of Array.from(el.children)) observador.observe(filho);
    return () => observador.disconnect();
  });

  return {
    ref,
    atributos: {
      ref,
      onScroll: medir,
      "data-rolavel": estado.rolavel || undefined,
      "data-inicio": estado.inicio || undefined,
      "data-fim": estado.fim || undefined,
    },
  };
}
