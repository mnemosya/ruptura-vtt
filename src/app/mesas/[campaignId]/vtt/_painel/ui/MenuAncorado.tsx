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
}: {
  /** Elemento que abriu o menu — âncora de posição E destino do foco ao fechar. */
  ancora: HTMLElement | null;
  aberto: boolean;
  onFechar: () => void;
  itens: ItemMenu[];
  rotulo: string;
  testId?: string;
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
    const alturaEstimada = el?.offsetHeight ?? Math.min(itens.length * 30 + 16, 260);
    const larguraEstimada = el?.offsetWidth ?? 190;
    const abaixo = r.bottom + 6;
    const acima = r.top - alturaEstimada - 6;
    const cabeAbaixo = abaixo + alturaEstimada <= window.innerHeight - MARGEM;
    setPos({
      left: Math.max(MARGEM, Math.min(r.left, window.innerWidth - larguraEstimada - MARGEM)),
      top: cabeAbaixo ? abaixo : Math.max(MARGEM, acima),
    });
  }, [aberto, ancora, itens.length]);

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
      className="pn-menu"
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
            className="pn-menu-item"
            disabled={item.desabilitado}
            title={item.descricao}
            onClick={() => {
              item.onSelecionar();
              fechar();
            }}
          >
            {item.icone}
            {item.rotulo}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
