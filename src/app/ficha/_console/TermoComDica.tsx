"use client";

/**
 * Um termo de regra com a dica dele — a peça que TextoComRegras (termos
 * no meio de uma frase) e a lista de propriedades de um item (termos
 * soltos, em linha própria) compartilham.
 *
 * Existe separado porque as duas precisam do MESMO comportamento —
 * abrir no hover e no foco, respirar antes de fechar, posicionar em
 * `fixed` — e só diferem no que está escrito dentro. Duplicar isso
 * daria dois tooltips que divergem no primeiro ajuste.
 */

import { useRef, useState, type ReactNode } from "react";
import type { TermoDeRegra } from "./types";

export function TermoComDica({
  termo,
  className = "rc-termo",
  children,
}: {
  termo: TermoDeRegra;
  className?: string;
  children: ReactNode;
}) {
  const [em, setEm] = useState<{ x: number; y: number } | null>(null);
  const timerRef = useRef<number | null>(null);

  const abrir = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setEm({ x: r.left + r.width / 2, y: r.top });
  };

  return (
    <>
      <span
        className={className}
        data-tipo={termo.tipo}
        tabIndex={0}
        role="button"
        onMouseEnter={(e) => abrir(e.currentTarget)}
        onMouseLeave={() => {
          /* Um respiro antes de sumir: sem isso, atravessar o termo com
             o mouse pisca o tooltip a cada passagem. */
          timerRef.current = window.setTimeout(() => setEm(null), 80);
        }}
        onFocus={(e) => abrir(e.currentTarget)}
        onBlur={() => setEm(null)}
      >
        {children}
      </span>
      {em && (
        <span
          role="tooltip"
          className="rc-termo-dica"
          data-tipo={termo.tipo}
          /* `fixed` + coordenadas de viewport: o painel rola por dentro
             (`overflow: auto`), então um tooltip absoluto dentro dele
             seria recortado na primeira linha. */
          style={{ left: `${em.x}px`, top: `${em.y}px` }}
        >
          <span className="rc-termo-dica-cab">
            {termo.nome}
            <em>{ROTULO_DO_TIPO[termo.tipo]}</em>
          </span>
          {termo.descricao ? (
            <span className="rc-termo-dica-txt">{termo.descricao}</span>
          ) : (
            /* O termo existe publicado mas sem descrição. Dizer isso é
               melhor que um tooltip vazio ou que inventar texto. */
            <span className="rc-termo-dica-txt rc-termo-dica-txt--vazio">
              Sem descrição publicada para este termo.
            </span>
          )}
        </span>
      )}
    </>
  );
}

const ROTULO_DO_TIPO: Record<TermoDeRegra["tipo"], string> = {
  acao: "ação",
  condicao: "condição",
  propriedade: "propriedade",
};
