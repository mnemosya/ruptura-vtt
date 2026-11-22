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

import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useCamada } from "../../../../../_design/camadas";

/**
 * Liga a dica ao controle por `aria-describedby` enquanto ela está
 * aberta, a menos que o texto repita o nome que o controle já tem (o
 * leitor de tela leria duas vezes) ou que quem chama já descreva o
 * controle por conta própria.
 * Devolve quem desfaz a ligação.
 */
export function descreverAlvo(el: HTMLElement, texto: ReactNode, id: string): (() => void) | null {
  if (el.hasAttribute("aria-describedby")) return null;
  if (typeof texto === "string") {
    const limpar = (t: string) => t.replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");
    const nome = el.getAttribute("aria-label") ?? el.textContent ?? "";
    if (limpar(texto) === limpar(nome)) return null;
  }
  el.setAttribute("aria-describedby", id);
  return () => {
    if (el.getAttribute("aria-describedby") === id) el.removeAttribute("aria-describedby");
  };
}

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
  const id = useId();
  const soltar = useRef<(() => void) | null>(null);
  const abrir = useCallback((el: HTMLElement) => {
    soltar.current?.();
    soltar.current = descreverAlvo(el, texto, id);
    const r = el.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: lado === "acima" ? r.top : r.bottom });
  }, [lado, texto, id]);
  const fechar = useCallback(() => {
    soltar.current?.();
    soltar.current = null;
    setPos(null);
  }, []);
  // Esc dispensa a dica sem tirar o mouse nem o foco do controle.
  useCamada({ aberta: pos !== null, fechar });

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
              id={id}
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
