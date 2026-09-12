"use client";

/**
 * JANELA INTERNA do VTT — a superfície que substitui TODA navegação
 * que o painel fazia.
 *
 * O invariante que ela existe para garantir: nenhuma interação do
 * painel troca de rota, recarrega a página, leva o scroll ao topo ou
 * desmonta o VTT. Bando, "Jogadores e convites", "Configurar acesso" e
 * o Console do Personagem abrem AQUI — mapa, cena, câmera, seleção e o
 * próprio painel continuam montados por baixo.
 *
 * A moldura é a do Console (`console.css`): topbar em gradiente com
 * título mono em caixa alta, controles quadrados com borda visível
 * (minimizar / maximizar / fechar), corpo rolável.
 *
 * MINIMIZAR NÃO DESMONTA — a janela fica no DOM com
 * `visibility:hidden` + `inert`, exatamente como o Console faz. É o que
 * preserva aba ativa, scroll, campo em edição e requisição em voo.
 *
 * Portal em `document.body`: fora do `overflow` do painel e acima do
 * mapa, sem depender de z-index de ancestral.
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, Minus, X } from "lucide-react";
import "../painel.css";

type Modo = "normal" | "maximizada" | "minimizada";

/** Não inicia arraste quando o gesto nasce num controle. */
function ehInterativo(alvo: EventTarget | null): boolean {
  return alvo instanceof Element && alvo.closest("button, a, input, select, textarea, [role='button']") !== null;
}

export function JanelaInterna({
  aberta,
  titulo,
  subtitulo,
  largura = 760,
  altura = 560,
  onFechar,
  children,
  testId,
}: {
  aberta: boolean;
  titulo: string;
  subtitulo?: string;
  largura?: number;
  altura?: number;
  onFechar: () => void;
  children: ReactNode;
  testId?: string;
}) {
  const [modo, setModo] = useState<Modo>("normal");
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [montado, setMontado] = useState(false);
  const janelaRef = useRef<HTMLDivElement>(null);
  const arrastoRef = useRef<{ dx: number; dy: number } | null>(null);
  const abridorRef = useRef<HTMLElement | null>(null);
  const tituloId = useId();

  useEffect(() => setMontado(true), []);

  useEffect(() => {
    if (aberta) {
      abridorRef.current = document.activeElement as HTMLElement | null;
      setModo("normal");
    }
  }, [aberta]);

  /** Posição inicial centrada, recalculada só ao abrir. */
  useEffect(() => {
    if (!aberta || pos) return;
    const w = Math.min(largura, window.innerWidth - 24);
    const h = Math.min(altura, window.innerHeight - 24);
    setPos({ x: Math.max(12, (window.innerWidth - w) / 2), y: Math.max(12, (window.innerHeight - h) / 2) });
  }, [aberta, pos, largura, altura]);

  const fechar = useCallback(() => {
    onFechar();
    // `preventScroll`: devolver o foco não pode arrastar o VTT.
    abridorRef.current?.focus?.({ preventScroll: true });
  }, [onFechar]);

  // Esc fecha; Tab fica contido na janela enquanto ela está modal.
  useEffect(() => {
    if (!aberta || modo === "minimizada") return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        fechar();
        return;
      }
      if (e.key !== "Tab") return;
      const raiz = janelaRef.current;
      if (!raiz) return;
      const focaveis = raiz.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus({ preventScroll: true });
      } else if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus({ preventScroll: true });
      }
    }
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [aberta, modo, fechar]);

  // Foco inicial dentro da janela, sem rolar nada.
  useEffect(() => {
    if (!aberta || modo === "minimizada") return;
    const id = requestAnimationFrame(() => {
      const alvo = janelaRef.current?.querySelector<HTMLElement>("button:not(:disabled)");
      alvo?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [aberta, modo]);

  /**
   * Arraste pela topbar. Mesma mecânica já provada em
   * `_shell/JanelaFerramenta.tsx` (pointer capture + clamp que mantém a
   * janela inteira dentro do viewport) — não é infraestrutura nova.
   */
  const aoPressionarTop = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (modo !== "normal" || ehInterativo(e.target) || !pos) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      arrastoRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    },
    [modo, pos],
  );
  const aoMoverTop = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const a = arrastoRef.current;
    const el = janelaRef.current;
    if (!a || !el) return;
    const r = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - a.dx, window.innerWidth - r.width));
    const y = Math.max(0, Math.min(e.clientY - a.dy, window.innerHeight - r.height));
    setPos({ x, y });
  }, []);
  const aoSoltarTop = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!arrastoRef.current) return;
    arrastoRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  if (!aberta || !montado) return null;

  const minimizada = modo === "minimizada";
  const maximizada = modo === "maximizada";
  const estilo: React.CSSProperties = maximizada
    ? { inset: 12, width: "auto", height: "auto" }
    : {
        left: pos?.x ?? 12,
        top: pos?.y ?? 12,
        width: Math.min(largura, typeof window !== "undefined" ? window.innerWidth - 24 : largura),
        height: Math.min(altura, typeof window !== "undefined" ? window.innerHeight - 24 : altura),
      };

  return createPortal(
    <>
      {!minimizada && <div className="pn-jan-fundo" role="presentation" onClick={fechar} data-testid="painel-janela-fundo" />}

      <div
        ref={janelaRef}
        className="pn-jan"
        style={estilo}
        role="dialog"
        aria-modal={!minimizada}
        aria-labelledby={tituloId}
        data-min={minimizada ? "true" : undefined}
        // `inert` enquanto minimizada: o conteúdo continua montado (é o
        // que preserva o estado) mas sai do foco e da leitura de tela.
        {...(minimizada ? { inert: "" as unknown as boolean } : {})}
        data-testid={testId}
      >
        <div
          className="pn-jan-top"
          onPointerDown={aoPressionarTop}
          onPointerMove={aoMoverTop}
          onPointerUp={aoSoltarTop}
          onPointerCancel={aoSoltarTop}
          style={{ cursor: modo === "normal" ? "grab" : "default", touchAction: "none" }}
        >
          <span className="pn-jan-titulo" id={tituloId}>
            {titulo}
            {subtitulo && <span style={{ opacity: 0.6 }}> · {subtitulo}</span>}
          </span>
          <div className="pn-jan-btns">
            <button type="button" className="pn-jan-btn" onClick={() => setModo("minimizada")} aria-label="Minimizar" data-testid="painel-janela-minimizar">
              <Minus size={13} />
            </button>
            <button
              type="button"
              className="pn-jan-btn"
              onClick={() => setModo((m) => (m === "maximizada" ? "normal" : "maximizada"))}
              aria-label={maximizada ? "Restaurar" : "Maximizar"}
              data-testid="painel-janela-maximizar"
            >
              {maximizada ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
            <button type="button" className="pn-jan-btn pn-jan-btn--fechar" onClick={fechar} aria-label="Fechar" data-testid="painel-janela-fechar">
              <X size={13} />
            </button>
          </div>
        </div>

        <div className="pn-jan-corpo" data-testid="painel-janela-corpo">
          {children}
        </div>
      </div>

      {minimizada && (
        <button type="button" className="pn-jan-dock" onClick={() => setModo("normal")} data-testid="painel-janela-restaurar">
          {titulo}
        </button>
      )}
    </>,
    document.body,
  );
}
