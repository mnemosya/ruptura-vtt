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
import { oxanium } from "../../_design/oxanium";
import { useConsoleWindow } from "./useConsoleWindow";
import { ladoDoTrilho, type LadoTrilho } from "./geometry";
import { useConsoleAncorado } from "./ConsoleCloseContext";
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
  larguraInicialMax,
  alturaInicialFallback,
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
  /** Largura com que a janela NASCE (Console: 818px) — teto só da
      abertura; arrastar e maximizar podem passar dela. Quando
      informada, substitui a largura medida de `.rc-grid`. */
  larguraInicialMax?: number;
  /** Altura de PARTIDA antes da 1ª medição do conteúdo ativo (Console:
      726px) — só o valor inicial, não um teto; some assim que a
      medição real chega. */
  alturaInicialFallback?: number;
  /** Muda sempre que o conteúdo medido troca de identidade (ex.: trocar
      de aba) — pra recolocar o `ResizeObserver` no elemento certo. */
  conteudoChave?: string | number;
  children: ReactNode;
}) {
  const win = useConsoleWindow(aberto, { larguraInicialMax, alturaInicialFallback });
  const cursorHabilitado = useCursorHabilitado();
  const ancorado = useConsoleAncorado();
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

  // Mede o tamanho NATURAL do conteúdo que não estica — coluna 1
  // (`.rc-aside`) ou a aba Personagem (`.rc-foco-personagem`) na
  // altura, `.rc-grid` na largura — pra janela ABRIR (e se ajustar
  // até o primeiro resize manual) sem sobrar espaço vazio. Não é teto
  // do resize: arrastar ou maximizar pode passar disso.
  //
  // `.rc-foco-content` e as abas de navegação esticam pra preencher
  // `.rc-body`, então medi-las seria circular — nelas o conteúdo rola
  // por dentro se precisar.
  //
  // Os alvos só existem depois que `win.geo` monta o conteúdo (por isso
  // o `!!win.geo` na dependência); `conteudoChave` reconecta o observer
  // quando o elemento medido troca de identidade (troca de aba).
  const alturaJaMedida = useRef(false);
  useEffect(() => {
    if (!aberto || !win.geo) return;
    const raiz = windowRef.current;
    if (!raiz) return;
    const alvoAltura = raiz.querySelector<HTMLElement>(".rc-aside") ?? raiz.querySelector<HTMLElement>(".rc-foco-personagem");
    const alvoLargura = raiz.querySelector<HTMLElement>(".rc-grid");
    const observers: ResizeObserver[] = [];
    // Aberta direto numa aba sem coluna medível (ex.: roda tática →
    // Ações): sem medida, a altura ficaria presa no fallback. Sem teto
    // de conteúdo, vale só o da viewport — o mesmo tamanho da abertura
    // pela aba Personagem.
    if (!alvoAltura && !alturaJaMedida.current) win.registrarAlturaColuna1(Number.MAX_SAFE_INTEGER);
    if (alvoAltura) {
      alturaJaMedida.current = true;
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
    // Ancorada, abrir a ficha não pode arrancar o foco de onde a
    // pessoa estava — ela abriu uma janela ao lado, não trocou de tela.
    if (!ancorado && !el.contains(document.activeElement)) {
      el.querySelector<HTMLElement>("[data-foco-inicial]")?.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      // O dossiê de escalpos acima da ficha gerencia seu próprio foco e Escape.
      if (document.querySelector(".hs-dialog")) return;
      // Ancorada, a janela divide o teclado com a tela de baixo: só
      // responde quando o foco está DENTRO dela. Sem isto, o Escape de
      // quem está mexendo no mapa fecharia a ficha pelas costas.
      if (ancorado && !el!.contains(document.activeElement)) return;
      if (e.key === "Escape") {
        // Escape pertence primeiro a quem está aberto por cima: uma
        // edição inline ou um modal auxiliar. Só fecha a janela quando
        // não há nada mais específico para cancelar — sem isso, cancelar
        // a edição de PV fechava o Console inteiro.
        const alvo = e.target;
        const emCampo =
          alvo instanceof Element && alvo.closest("input, textarea, select, [contenteditable='true']") !== null;
        const emSelecaoInventario = alvo instanceof Element && alvo.closest(".ih[data-selecao]") !== null;
        // `.rp-ficha`: detalhe de Marca/Traço na aba Ruptura, que fecha a si mesmo.
        if (emCampo || emSelecaoInventario || document.querySelector(".rc-aux, .rp-ficha")) return;
        e.stopPropagation();
        fechar();
        return;
      }
      // Armadilha de Tab é comportamento de MODAL: prender o foco numa
      // janela ancorada tiraria o resto da tela da navegação por
      // teclado sem que nada estivesse bloqueado de fato.
      if (e.key !== "Tab" || ancorado) return;
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
  }, [aberto, minimizada, fechar, ancorado]);

  /**
   * LADO DO TRILHO DE ABAS. Ele é irmão da janela e fica do lado de
   * FORA da borda — arrastar a janela até a borda direita da tela
   * levava as abas embora primeiro. Como elas são a navegação do
   * Console, perdê-las é perder o acesso ao conteúdo.
   *
   * Recalculado a cada mudança de geometria e a cada resize do
   * navegador; a decisão em si é pura e sem memória (`ladoDoTrilho`),
   * então o trilho volta pra direita assim que a janela para de
   * escondê-lo.
   */
  const [ladoTrilho, setLadoTrilho] = useState<LadoTrilho>("direita");
  const geoAtual = win.geo;
  useEffect(() => {
    if (!aberto || !geoAtual) return;
    const recalcular = () => setLadoTrilho(ladoDoTrilho(geoAtual, { w: window.innerWidth, h: window.innerHeight }));
    recalcular();
    window.addEventListener("resize", recalcular);
    return () => window.removeEventListener("resize", recalcular);
  }, [aberto, geoAtual]);

  if (!aberto || !win.geo) return null;

  const conteudo = (
    <div className={`rc-cursor-scope ${oxanium.variable}`}>
      <HudCursor enabled={cursorHabilitado} />

      {!minimizada && !ancorado && <div className="rc-backdrop" onMouseDown={(e) => e.preventDefault()} />}

      <div
        ref={windowRef}
        className="rc-window-wrap"
        data-mode={win.mode}
        data-trilho={ladoTrilho}
        role="dialog"
        aria-modal={!minimizada && !ancorado}
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
                >
                  <Minus size={15} />
                  <span className="rc-winbtn-dica" role="tooltip">Minimizar</span>
                </button>
                <button
                  type="button"
                  className="rc-winbtn"
                  onClick={win.alternarMaximizar}
                  aria-label={win.mode === "maximized" ? "Restaurar console" : "Maximizar console"}
                  data-testid="console-maximizar"
                >
                  {win.mode === "maximized" ? <Minimize2 size={13} /> : <Square size={13} />}
                  <span className="rc-winbtn-dica" role="tooltip">
                    {win.mode === "maximized" ? "Restaurar" : "Maximizar"}
                  </span>
                </button>
                <button
                  type="button"
                  className="rc-winbtn rc-winbtn--close"
                  onClick={fechar}
                  aria-label="Fechar console"
                  data-foco-inicial
                >
                  <X size={16} />
                  <span className="rc-winbtn-dica" role="tooltip">Fechar</span>
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
              data-testid="console-restaurar"
            >
              {/* Cantos se afastando — comunica expansão, não "desfazer". */}
              <Maximize2 size={14} />
              <span className="rc-winbtn-dica rc-winbtn-dica--acima" role="tooltip">Restaurar</span>
            </button>
            <button
              type="button"
              className="rc-winbtn rc-winbtn--close"
              onClick={fechar}
              aria-label="Fechar console"
            >
              <X size={14} />
              <span className="rc-winbtn-dica rc-winbtn-dica--acima" role="tooltip">Fechar</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(conteudo, document.body);
}
