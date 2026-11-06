"use client";

/**
 * Menu compacto ancorado a um botão — o substituto de `window.prompt`,
 * `window.confirm` e do `<select>` nativo dentro do painel.
 *
 * Por que existe: a spec proíbe diálogos nativos e exige que TODA
 * escolha aconteça no contexto, sem navegar e sem tirar o foco do VTT.
 * `<select>` nativo também está fora — ele abre um popup do sistema
 * operacional, com tipografia e cores que nada têm a ver com a estação
 * operacional do Ruptura.
 *
 * Comportamento: portal em `document.body` (para não ser recortado pelo
 * `overflow` da aba), posição calculada a partir do botão âncora e
 * clampada ao viewport, fechamento por Esc/clique fora, navegação por
 * setas e devolução de foco ao âncora — com `preventScroll`, que é o
 * que impede o salto de rolagem que a spec manda corrigir.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface ItemMenu {
  id: string;
  rotulo: string;
  descricao?: string;
  icone?: ReactNode;
  selecionado?: boolean;
  desabilitado?: boolean;
  /** Cabeçalho de grupo antes deste item. */
  grupoAntes?: string;
  /** Cor do símbolo no menu do compositor. */
  acento?: string;
  onSelecionar: () => void;
}

const MARGEM = 8;

export function MenuAncorado({
  ancora,
  aberto,
  onFechar,
  itens,
  rotulo,
  testId,
  comDescricao,
  alinhar = "inicio",
  variante,
}: {
  /** Elemento que abriu o menu — âncora de posição E destino do foco ao fechar. */
  ancora: HTMLElement | null;
  aberto: boolean;
  onFechar: () => void;
  itens: ItemMenu[];
  rotulo: string;
  testId?: string;
  /**
   * Mostra a `descricao` de cada item como segunda linha, em vez de só
   * no `title`. Pra escolhas cuja diferença PRECISA ser lida antes do
   * clique (ex.: Visualizar × Editar em "Configurar permissões").
   */
  comDescricao?: boolean;
  /**
   * Qual borda do âncora o menu acompanha. `"fim"` alinha a borda
   * DIREITA do menu à do botão — pra âncoras encostadas à direita de
   * uma linha, onde abrir pela esquerda deixava o menu "pendurado".
   */
  alinhar?: "inicio" | "fim";
  variante?: "autoria" | "visibilidade";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  // Posiciona ACIMA do âncora quando não há espaço embaixo — o composer
  // vive no rodapé, então o caso comum é abrir para cima.
  useLayoutEffect(() => {
    if (!aberto || !ancora) return;
    const r = ancora.getBoundingClientRect();
    const el = ref.current;
    const alturaEstimada = el?.offsetHeight ?? Math.min(itens.length * (variante ? 40 : 30) + 16, 420);
    const larguraEstimada = el?.offsetWidth ?? (variante === "autoria" ? 270 : variante === "visibilidade" ? 295 : 190);
    const abaixo = r.bottom + 6;
    const acima = r.top - alturaEstimada - 6;
    const cabeAbaixo = !variante && abaixo + alturaEstimada <= window.innerHeight - MARGEM;
    setPos({
      left: Math.max(MARGEM, Math.min(
        alinhar === "fim" ? r.right - larguraEstimada : r.left,
        window.innerWidth - larguraEstimada - MARGEM,
      )),
      top: cabeAbaixo ? abaixo : Math.max(MARGEM, acima),
    });
  }, [aberto, ancora, itens.length, alinhar, variante]);

  // A 1ª posição sai de uma largura ESTIMADA (o menu ainda não existe).
  // Alinhado pela direita, o erro da estimativa vira desalinhamento
  // visível — então, já montado, mede de verdade e corrige uma vez.
  useLayoutEffect(() => {
    if (!aberto || !ancora || !pos) return;
    const el = ref.current;
    if (!el) return;
    const r = ancora.getBoundingClientRect();
    const left = Math.max(MARGEM, Math.min(alinhar === "fim" ? r.right - el.offsetWidth : r.left, window.innerWidth - el.offsetWidth - MARGEM));
    const abaixo = r.bottom + 6;
    const top = variante || abaixo + el.offsetHeight > window.innerHeight - MARGEM
      ? Math.max(MARGEM, r.top - el.offsetHeight - 6)
      : abaixo;
    if (Math.abs(left - pos.left) > 0.5 || Math.abs(top - pos.top) > 0.5) setPos({ left, top });
  }, [aberto, ancora, pos, alinhar, variante]);

  const fechar = useCallback(() => {
    onFechar();
    // `preventScroll`: devolver o foco não pode arrastar o feed nem a
    // página — é o bug de scroll que a spec manda corrigir.
    ancora?.focus({ preventScroll: true });
  }, [onFechar, ancora]);

  useEffect(() => {
    if (!aberto) return;
    const id = requestAnimationFrame(() => {
      const alvo =
        ref.current?.querySelector<HTMLButtonElement>('button[aria-checked="true"]:not(:disabled)') ??
        ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
      alvo?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        fechar();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const botoes = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
      if (botoes.length === 0) return;
      const i = botoes.indexOf(document.activeElement as HTMLButtonElement);
      const prox = e.key === "ArrowDown" ? (i + 1) % botoes.length : (i - 1 + botoes.length) % botoes.length;
      botoes[prox]?.focus({ preventScroll: true });
    }
    function aoApontar(e: PointerEvent) {
      const alvo = e.target as Node;
      if (ref.current?.contains(alvo)) return;
      if (ancora?.contains(alvo)) return;
      onFechar();
    }
    window.addEventListener("keydown", aoTeclar, true);
    window.addEventListener("pointerdown", aoApontar);
    return () => {
      window.removeEventListener("keydown", aoTeclar, true);
      window.removeEventListener("pointerdown", aoApontar);
    };
  }, [aberto, fechar, onFechar, ancora]);

  if (!aberto || !montado || !pos) return null;

  return createPortal(
    <div
      ref={ref}
      className={`pn-menu${variante ? ` pn-menu--${variante}` : ""}`}
      role="menu"
      aria-label={rotulo}
      style={{ left: pos.left, top: pos.top }}
      data-testid={testId}
    >
      {itens.map((item) => (
        <div key={item.id}>
          {item.grupoAntes && <div className="pn-menu-cap">{item.grupoAntes}</div>}
          <button
            type="button"
            role="menuitemradio"
            aria-checked={!!item.selecionado}
            className={`pn-menu-item${variante ? " pn-menu-item--composer" : ""}`}
            style={variante ? { ["--pn-menu-item-accent" as string]: item.acento ?? "#7f95b3" } : undefined}
            disabled={item.desabilitado}
            title={variante || comDescricao ? undefined : item.descricao}
            data-com-descricao={comDescricao && item.descricao ? "true" : undefined}
            onClick={() => {
              item.onSelecionar();
              fechar();
            }}
          >
            {variante === "autoria" ? (
              <>
                <span className="pn-menu-diamante" aria-hidden="true" />
                <span className="pn-menu-item-nome">{item.rotulo}</span>
                <span className="pn-menu-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg></span>
              </>
            ) : variante === "visibilidade" ? (
              <>
                <span className="pn-menu-item-icone" aria-hidden="true">{item.icone}</span>
                <span className="pn-menu-item-info"><span className="pn-menu-item-nome">{item.rotulo}</span><span className="pn-menu-item-desc">{item.descricao}</span></span>
                <span className="pn-menu-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg></span>
              </>
            ) : <>{item.icone}
            {comDescricao && item.descricao ? (
              <span className="pn-menu-item-texto">
                <span className="pn-menu-item-rotulo">{item.rotulo}</span>
                <span className="pn-menu-item-desc">{item.descricao}</span>
              </span>
            ) : item.rotulo}</>}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
