"use client";

/**
 * O MENU DE AÇÕES DE UMA PASTA — o mesmo em dois lugares.
 *
 * Abre com o botão direito na LINHA da pasta (no trilho) e também
 * dentro da pasta ABERTA, na área de conteúdo: quem está lá dentro
 * decidindo o que fazer com o conjunto não deveria ter que voltar ao
 * trilho, achar a linha e clicar nela de novo.
 *
 * `fixed` e posicionado no cursor: as duas superfícies que o hospedam
 * são caixas com `overflow-y: auto`, e caixa de rolagem recorta o que
 * sai dela — mesma razão do menu do cartão de cena.
 */

import { useEffect, useRef } from "react";
import { Archive, ChevronDown, FolderOpen, Pencil, Trash2, Undo2 } from "lucide-react";

/** Medidas usadas pra manter o menu inteiro dentro da janela. */
export const LARGURA_MENU = 176;
export const ALTURA_MENU = 148;

export interface PosicaoMenu { left: number; top: number }

/** Onde o menu cabe quando vem de um BOTÃO: colado nele, à direita. */
export function posicaoAbaixoDe(el: HTMLElement | null): PosicaoMenu {
  if (!el) return { left: 8, top: 8 };
  const b = el.getBoundingClientRect();
  const cabeEmbaixo = window.innerHeight - b.bottom > ALTURA_MENU + 8;
  return {
    left: Math.max(8, Math.min(b.left, window.innerWidth - LARGURA_MENU - 8)),
    top: cabeEmbaixo ? b.bottom + 4 : Math.max(8, b.top - ALTURA_MENU - 4),
  };
}

/** Onde o menu cabe, a partir do clique que o abriu. */
export function posicaoNoCursor(e: { clientX: number; clientY: number }): PosicaoMenu {
  return {
    left: Math.min(e.clientX, window.innerWidth - LARGURA_MENU - 8),
    top: Math.min(e.clientY, window.innerHeight - ALTURA_MENU - 8),
  };
}

export interface PropsMenuPasta {
  posicao: PosicaoMenu;
  ocupada: boolean;
  /** Já estamos DENTRO dela — aí "Abrir" e "Ver as cenas" não têm o que fazer. */
  dentro?: boolean;
  expandida?: boolean;
  quantidade?: number;
  onFechar: () => void;
  onAbrir?: () => void;
  onAlternarExpansao?: () => void;
  onRenomear: () => void;
  onExcluir: () => void;
  onArquivar?: () => void;
  onDesarquivar?: () => void;
  testId?: string;
  /**
   * O botão que abriu o menu, quando houve um.
   *
   * O `mousedown` do próprio disparador conta como "clique fora" e
   * fechava o menu ANTES de o clique chegar ao `onClick` que o
   * alternaria — resultado: clicar no botão com o menu aberto o fechava
   * e reabria, e ele parecia não fechar nunca. Ignorando o disparador,
   * o alternar volta a ser alternar.
   */
  disparadorRef?: React.RefObject<HTMLElement | null>;
}

export function MenuPasta(p: PropsMenuPasta) {
  const ref = useRef<HTMLDivElement | null>(null);

  /* As duas saídas que quem abre menu espera: clique fora e Escape. */
  useEffect(() => {
    const foraDaqui = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (ref.current?.contains(alvo)) return;
      if (p.disparadorRef?.current?.contains(alvo)) return;
      p.onFechar();
    };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") p.onFechar(); };
    document.addEventListener("mousedown", foraDaqui);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", foraDaqui);
      document.removeEventListener("keydown", escape);
    };
  });

  const item = (acao: () => void) => () => { p.onFechar(); acao(); };

  return (
    <div
      ref={ref}
      className="rv-cena-menu" role="menu"
      data-testid={p.testId ?? "pasta-menu"}
      style={{ left: p.posicao.left, top: p.posicao.top }}
    >
      {!p.dentro && p.onAbrir && (
        <button
          type="button" role="menuitem" className="rv-cena-menu-item"
          data-testid="pasta-menu-abrir" disabled={p.ocupada} onClick={item(p.onAbrir)}
        >
          <FolderOpen size={13} aria-hidden /> Abrir a pasta
        </button>
      )}
      {!p.dentro && p.onAlternarExpansao && (
        <button
          type="button" role="menuitem" className="rv-cena-menu-item"
          data-testid="pasta-menu-expandir"
          disabled={p.ocupada || p.quantidade === 0}
          onClick={item(p.onAlternarExpansao)}
        >
          <ChevronDown size={13} aria-hidden /> {p.expandida ? "Recolher as cenas" : "Ver as cenas"}
        </button>
      )}
      {!p.dentro && <span className="rv-cena-menu-fio" aria-hidden="true" />}

      <button
        type="button" role="menuitem" className="rv-cena-menu-item"
        data-testid="pasta-renomear" disabled={p.ocupada} onClick={item(p.onRenomear)}
      >
        <Pencil size={13} aria-hidden /> Renomear
      </button>
      {p.onDesarquivar && (
        <button
          type="button" role="menuitem" className="rv-cena-menu-item"
          data-testid="pasta-desarquivar" disabled={p.ocupada} onClick={item(p.onDesarquivar)}
        >
          <Undo2 size={13} aria-hidden /> Devolver ao catálogo
        </button>
      )}
      {p.onArquivar && (
        <button
          type="button" role="menuitem" className="rv-cena-menu-item"
          data-testid="pasta-arquivar" disabled={p.ocupada} onClick={item(p.onArquivar)}
        >
          <Archive size={13} aria-hidden /> Arquivar
        </button>
      )}
      <span className="rv-cena-menu-fio" aria-hidden="true" />
      <button
        type="button" role="menuitem" className="rv-cena-menu-item" data-tipo="perigo"
        data-testid="pasta-excluir" disabled={p.ocupada} onClick={item(p.onExcluir)}
      >
        <Trash2 size={13} aria-hidden /> Excluir
      </button>
    </div>
  );
}
