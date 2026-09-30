"use client";

/**
 * Dica PADRÃO do VTT (`.rv-dica`: etiqueta em caixa alta, fio e espinha
 * de acento) para controles que vivem dentro de JANELAS.
 *
 * `useDicaFlutuante` (`_shell/DicaFlutuante`) posiciona com
 * `position: fixed` no próprio lugar — e dentro de `.pn-jan` isso não
 * vale: a janela cria um novo referencial para `fixed`, e a dica ia
 * parar longe do botão. Aqui ela sai por PORTAL para o `body`, medida
 * a partir do alvo, e abre ACIMA dele, centrada.
 */

import { useCallback, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function useDicaPortal(texto: ReactNode, opcoes: { lado?: "acima" | "abaixo" } = {}): {
  alvo: {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => void;
    onMouseLeave: () => void;
    onFocus: (e: React.FocusEvent<HTMLElement>) => void;
    onBlur: () => void;
  };
  dica: ReactNode;
} {
  const lado = opcoes.lado ?? "acima";
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const abrir = useCallback((el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: lado === "acima" ? r.top : r.bottom });
  }, [lado]);
  const fechar = useCallback(() => setPos(null), []);

  return {
    alvo: {
      onMouseEnter: (e) => abrir(e.currentTarget),
      onMouseLeave: fechar,
      onFocus: (e) => abrir(e.currentTarget),
      onBlur: fechar,
    },
    dica: pos && typeof document !== "undefined"
      ? createPortal(
          <span className="rv-dica-portal">
            <span
              className="rv-dica rv-dica--portal"
              data-lado={lado}
              role="tooltip"
              style={{ left: pos.x, top: pos.y }}
            >
              {texto}
            </span>
          </span>,
          document.body,
        )
      : null,
  };
}
