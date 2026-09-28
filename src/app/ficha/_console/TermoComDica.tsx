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

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  const [em, setEm] = useState<{
    x: number;
    y: number;
    vertenteCor: string;
  } | null>(null);
  const timerRef = useRef<number | null>(null);

  const abrir = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const estilo = window.getComputedStyle(el);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setEm({
      x: r.left + r.width / 2,
      y: r.top,
      /* Esta variável nasce no item selecionado. Ao portar a dica para
         o body, ela precisa viajar junto para preservar a vertente. */
      vertenteCor: estilo.getPropertyValue("--rv-vertente-cor").trim(),
    });
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
      {em && typeof document !== "undefined" && createPortal(
        <span
          role="tooltip"
          className="rc-termo-dica rc-cursor-scope"
          data-tipo={termo.tipo}
          /* O portal tira a dica de dentro do overflow/clip-path da
             janela. As coordenadas continuam sendo as da viewport. */
          style={{
            left: `${em.x}px`,
            top: `${em.y}px`,
            "--rv-vertente-cor": em.vertenteCor,
          } as CSSProperties}
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
        </span>,
        document.body,
      )}
    </>
  );
}

const ROTULO_DO_TIPO: Record<TermoDeRegra["tipo"], string> = {
  acao: "ação",
  condicao: "condição",
  propriedade: "propriedade",
};
