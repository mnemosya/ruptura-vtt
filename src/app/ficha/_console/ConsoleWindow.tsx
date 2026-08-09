"use client";

/**
 * Casca da janela do Console: modal, topbar arrastável, resize pelo
 * canto inferior direito, minimizar (com item no dock), maximizar e
 * fechar.
 *
 * Minimizar NÃO desmonta o conteúdo — a janela continua no DOM com
 * `visibility:hidden` + `inert`. É o que preserva aba ativa, scroll,
 * campos em edição e seleção, como a spec exige; desmontar perderia
 * tudo isso.
 *
 * Cursor HUD: reusa o MESMO componente do resto do VTT (`HudCursor`,
 * exportado de `GlobalShell.tsx`) — nenhum tracking paralelo. O
 * Console não passa por `GlobalShell`, então monta sua própria
 * instância, escopada por `.rc-cursor-scope` (regra compartilhada em
 * `cursor.css`, a mesma que `.ra-root` usa).
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Minus, Square, Minimize2, Maximize2, X } from "lucide-react";
import { useConsoleWindow } from "./useConsoleWindow";
import { Scrollbar } from "./scrollbar";
import { HudCursor } from "../../mesas/_global/GlobalShell";
import "../../_design/console.css";

/** Não inicia arraste quando o clique nasce num elemento interativo. */
function ehInterativo(alvo: EventTarget | null): boolean {
  return alvo instanceof Element && alvo.closest("button, a, input, select, textarea, [role='button'], [data-no-drag]") !== null;
}

function useCursorHabilitado(): boolean {
  const [habilitado, setHabilitado] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setHabilitado(!mq.matches);
    const onChange = () => setHabilitado(!mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return habilitado;
}

export function ConsoleWindow({
  aberto,
  onClose,
  titulo,
  titlebarExtra,
  dockContent,
  tablist,
  larguraMaximaFixa,
  alturaFallbackInicial,
  conteudoChave = "",
  children,
}: {
  aberto: boolean;
  onClose: () => void;
  titulo: string;
  /** Conteúdo extra da topbar (ex.: status de sync) — opcional. */
  titlebarExtra?: ReactNode;
  /** Conteúdo do console minimizado — domínio de quem chama (nome,
      avatar, recursos); a janela só fornece a moldura/controles. */
  dockContent: ReactNode;
  /** Trilho de abas — vive FORA do conteúdo rolável da janela, rente à
      borda direita (spec "JANELA CONSOLE"). Opcional pra manter
      `ConsoleWindow` reutilizável por quem não tem abas. */
  tablist?: ReactNode;
  /** Largura MÁXIMA fixa da janela (spec modo Foco: 818px) — quando
      informada, substitui a largura medida de `.rc-grid`. `undefined`
      no modo Painel (largura volta a ser medida). */
  larguraMaximaFixa?: number;
  /** Altura de PARTIDA antes da 1ª medição do conteúdo ativo (spec
      modo Foco: 726px) — só o valor inicial, não um teto; some assim
      que a medição real chega. */
  alturaFallbackInicial?: number;
  /** Muda sempre que o conteúdo medido (`.rc-aside`/`.rc-grid` ou
      `.rc-foco-content`) troca de identidade — ex.: alternar Painel↔
      Foco, ou trocar de aba dentro do Foco — pra recolocar o
      `ResizeObserver` no elemento certo. */
  conteudoChave?: string | number;
  children: ReactNode;
}) {
  const win = useConsoleWindow(aberto, { larguraMaximaFixa, alturaFallbackInicial });
  const cursorHabilitado = useCursorHabilitado();
  const windowRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  /** Elemento que abriu o console — o foco volta para ele ao fechar. */
  const abridorRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (aberto) abridorRef.current = document.activeElement as HTMLElement | null;
  }, [aberto]);

  const fechar = useCallback(() => {
    onClose();
    // Devolve o foco a quem abriu (spec §1).
    abridorRef.current?.focus?.();
  }, [onClose]);

  const minimizada = win.mode === "minimized";

  // A altura máxima da janela é a altura NATURAL do conteúdo que HUGA
  // (não estica) — coluna 1 (`.rc-aside`) no modo Painel, ou a aba
  // Personagem (`.rc-foco-personagem`) no modo Foco — e a largura
  // máxima é a largura NATURAL do `.rc-grid` (só existe no Painel; no
  // Foco a largura é fixa, ver `larguraMaximaFixa`). Spec: a janela
  // não estica além do conteúdo quando a viewport sobra.
  //
  // Só `.rc-foco-personagem` é medida no Foco, NÃO `.rc-foco-content`
  // (que hoje estica pra preencher `.rc-body`, então medi-la seria
  // circular) nem as abas de navegação comuns (`.rc-tabsarea-outer`,
  // que também esticam lá dentro — ver console.css) — quando a aba
  // ativa não é "Personagem", a altura da janela simplesmente não é
  // re-sincronizada, e o conteúdo rola por dentro se precisar.
  //
  // `.rc-aside`/`.rc-grid`/`.rc-foco-personagem` só existem depois que
  // `win.geo` monta o conteúdo (por isso o `!!win.geo` na dependência,
  // não só `aberto`) — a janela abre num tamanho provisório e se
  // ajusta assim que a medição chega. `conteudoChave` força reconectar
  // o observer quando o elemento medido troca de identidade (alternar
  // Painel↔Foco, ou trocar de aba dentro do Foco).
  useEffect(() => {
    if (!aberto || !win.geo) return;
    const raiz = windowRef.current;
    if (!raiz) return;
    const alvoAltura = raiz.querySelector<HTMLElement>(".rc-aside") ?? raiz.querySelector<HTMLElement>(".rc-foco-personagem");
    const alvoLargura = raiz.querySelector<HTMLElement>(".rc-grid");
    const observers: ResizeObserver[] = [];
    if (alvoAltura) {
      const roAltura = new ResizeObserver((entries) => {
        const altura = entries[0]?.contentRect.height;
        if (altura != null) win.registrarAlturaColuna1(altura);
      });
      roAltura.observe(alvoAltura);
      observers.push(roAltura);
    }
    if (alvoLargura) {
      const roLargura = new ResizeObserver((entries) => {
        const largura = entries[0]?.contentRect.width;
        if (largura != null) win.registrarLarguraGrid(largura);
      });
      roLargura.observe(alvoLargura);
      observers.push(roLargura);
    }
    return () => observers.forEach((ro) => ro.disconnect());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, !!win.geo, conteudoChave, win.registrarAlturaColuna1, win.registrarLarguraGrid]);

  // Foco inicial e armadilha de foco enquanto a janela está visível.
  useEffect(() => {
    if (!aberto || minimizada) return;
    const el = windowRef.current;
    if (!el) return;
    if (!el.contains(document.activeElement)) {
      el.querySelector<HTMLElement>("[data-foco-inicial]")?.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // Escape pertence primeiro a quem está aberto por cima: uma
        // edição inline ou um modal auxiliar. Só fecha a janela quando
        // não há nada mais específico para cancelar — sem isso, cancelar
        // a edição de PV fechava o Console inteiro.
        const alvo = e.target;
        const emCampo =
          alvo instanceof Element && alvo.closest("input, textarea, select, [contenteditable='true']") !== null;
        if (emCampo || document.querySelector(".rc-aux")) return;
        e.stopPropagation();
        fechar();
        return;
      }
      if (e.key !== "Tab") return;
      const alvos = el!.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (alvos.length === 0) return;
      const primeiro = alvos[0];
      const ultimo = alvos[alvos.length - 1];
      if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      } else if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [aberto, minimizada, fechar]);

  if (!aberto || !win.geo) return null;

  const conteudo = (
    <div className="rc-cursor-scope">
      <HudCursor enabled={cursorHabilitado} />

      {!minimizada && <div className="rc-backdrop" onMouseDown={(e) => e.preventDefault()} />}

      <div
        ref={windowRef}
        className="rc-window-wrap"
        data-mode={win.mode}
        role="dialog"
        aria-modal={!minimizada}
        aria-labelledby={tituloId}
        // `inert` enquanto minimizada: some da navegação por teclado sem
        // desmontar (o que preservaria o estado interno). Vive aqui (não
        // só em `.rc-window`) pra cobrir o trilho de abas também, que
        // agora é irmão da janela, fora do seu conteúdo interno.
        inert={minimizada || undefined}
        style={{ left: win.geo.x, top: win.geo.y }}
      >
        <div className="rc-window" data-testid="console-window" style={{ width: win.geo.w, height: win.geo.h }}>
          <div
            className="rc-topbar"
            data-draggable={win.podeManipular}
            onPointerDown={(e) => {
              if (!ehInterativo(e.target)) win.iniciarArraste(e);
            }}
          >
            <span className="rc-topbar-title" id={tituloId}>
              {titulo}
            </span>
            <div className="rc-topbar-right">
              {titlebarExtra}
              <div className="rc-winbtns">
                <button
                  type="button"
                  className="rc-winbtn"
                  onClick={win.minimizar}
                  aria-label="Minimizar console"
                  title="Minimizar"
                >
                  <Minus size={15} />
                </button>
                <button
                  type="button"
                  className="rc-winbtn"
                  onClick={win.alternarMaximizar}
                  aria-label={win.mode === "maximized" ? "Restaurar console" : "Maximizar console"}
                  title={win.mode === "maximized" ? "Restaurar" : "Maximizar"}
                  data-testid="console-maximizar"
                >
                  {win.mode === "maximized" ? <Minimize2 size={13} /> : <Square size={13} />}
                </button>
                <button
                  type="button"
                  className="rc-winbtn rc-winbtn--close"
                  onClick={fechar}
                  aria-label="Fechar console"
                  title="Fechar"
                  data-foco-inicial
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>

          <div className="rc-body" ref={bodyRef}>
            {children}
          </div>
          <Scrollbar targetRef={bodyRef} orientacao="horizontal" />
          <Scrollbar targetRef={bodyRef} orientacao="vertical" />

          {win.podeManipular && (
            <>
              <div
                className="rc-resize rc-resize--direita"
                data-testid="console-resize"
                onPointerDown={win.iniciarResize}
                role="separator"
                aria-label="Redimensionar console"
                aria-orientation="vertical"
                tabIndex={0}
              />
              <div
                className="rc-resize rc-resize--esquerda"
                data-testid="console-resize-esquerda"
                onPointerDown={win.iniciarResizeEsquerda}
                role="separator"
                aria-label="Redimensionar console pelo canto esquerdo"
                aria-orientation="vertical"
                tabIndex={0}
              />
            </>
          )}
        </div>

        {tablist}
      </div>

      {minimizada && (
        <div className="rc-dock" data-testid="console-dock">
          {dockContent}
          <div className="rc-dock-acoes">
            <button
              type="button"
              className="rc-winbtn"
              onClick={win.restaurar}
              aria-label="Restaurar console"
              title="Restaurar"
              data-testid="console-restaurar"
            >
              {/* Cantos se afastando — comunica expansão, não "desfazer". */}
              <Maximize2 size={14} />
            </button>
            <button
              type="button"
              className="rc-winbtn rc-winbtn--close"
              onClick={fechar}
              aria-label="Fechar console"
              title="Fechar"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(conteudo, document.body);
}
