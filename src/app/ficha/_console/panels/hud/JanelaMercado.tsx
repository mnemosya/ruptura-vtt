"use client";

/**
 * Janela PRÓPRIA do Mercado — fora da moldura do Console.
 *
 * O Mercado tem três colunas (categorias, produtos, ficha do produto) e
 * não cabe no corpo do Console sem espremer as três. Por isso abre num
 * portal em `document.body`, centrado na tela e com o tamanho dele,
 * por cima do Console.
 *
 * O Esc é dela primeiro: o Console escuta o Esc no `document` (fase de
 * captura) e fecharia a ficha inteira. Esta janela escuta no `window`,
 * que vem antes, fecha só a si mesma e não deixa o evento seguir. Pelo
 * mesmo caminho prende o Tab, e ao abrir puxa o foco para si — senão ele
 * ficaria no botão Mercado, dentro do Console.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./janela-mercado.css";

/** Duração da saída em `janela-mercado.css` — só desmonta depois dela. */
const SAIDA_MS = 500;

export function JanelaMercado({ onFechar: fecharDeVez, children }: { onFechar: () => void; children: (fechar: () => void) => ReactNode }) {
  const [montado, setMontado] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const saida = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFechar = useCallback(() => {
    if (saida.current) return;
    const reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setSaindo(true);
    saida.current = setTimeout(fecharDeVez, reduz ? 150 : SAIDA_MS);
  }, [fecharDeVez]);
  useEffect(() => () => { if (saida.current) clearTimeout(saida.current); }, []);
  const janela = useRef<HTMLDivElement>(null);
  useEffect(() => { setMontado(true); }, []);
  useEffect(() => { if (montado) janela.current?.focus(); }, [montado]);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onFechar();
        return;
      }
      const el = janela.current;
      if (e.key !== "Tab" || !el) return;
      e.stopPropagation();
      const alvos = [...el.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )].filter((alvo) => alvo.getClientRects().length > 0 && !alvo.closest("[inert]"));
      if (alvos.length === 0) { e.preventDefault(); return; }
      const primeiro = alvos[0], ultimo = alvos[alvos.length - 1];
      const dentro = el.contains(document.activeElement);
      if (!dentro || (!e.shiftKey && document.activeElement === ultimo)) { e.preventDefault(); primeiro.focus(); }
      else if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
    }
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [onFechar]);

  if (!montado) return null;

  return createPortal(
    <div
      className="rc-cursor-scope jm-fundo"
      data-saindo={saindo || undefined}
      onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}
    >
      <div
        ref={janela}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Mercado noturno"
        className="jm-janela"
      >
        {children(onFechar)}
      </div>
    </div>,
    document.body,
  );
}
