"use client";

/**
 * MENU DO CARD DO CHAT (CHAT-02/CHAT-03) — excluir, fixar e abrir a
 * ficha de quem agiu.
 *
 * Dois acessos para o MESMO menu: o botão direito do mouse no card e o
 * botão "⋯" que aparece no hover/foco — o segundo é o que dá acesso por
 * teclado e por toque, onde não existe clique direito.
 *
 * Quem pode o quê é decidido por quem monta os itens (`ChatTab`) e,
 * de verdade, pelas RPCs da migration 0152; aqui só se desenha.
 */

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { Ellipsis, Pin, PinOff, Trash2, UserRound } from "lucide-react";
import { MenuContextual, type ItemMenuContextual } from "../../_shell/MenuContextual";
import type { CartaoFeed } from "./contratos";

/* O botão "⋯" mora DENTRO da linha de cabeçalho de cada card (depois
   da hora), para empurrá-la ao aparecer em vez de cobri-la. O embrulho
   entrega o botão por contexto e o cabeçalho o posiciona. */
const BotaoMenuContext = createContext<ReactNode>(null);

/** Onde o cabeçalho do card quer o botão de ações — `null` fora do chat ou sem ações. */
export function BotaoMenuCard() {
  return <>{useContext(BotaoMenuContext)}</>;
}

export interface AcoesMenuCard {
  onAbrirFicha?: () => void;
  onFixar?: (fixar: boolean) => void;
  onExcluir?: () => void;
}

/** Cards que representam UM log e aceitam as ações do menu. Os agrupados e os derivados ficam de fora. */
export function cardTemMenu(cartao: CartaoFeed): boolean {
  if (cartao.id.startsWith("local-")) return false;
  return cartao.kind !== "divisor" && cartao.kind !== "resolucao" && cartao.kind !== "pendencia";
}

/** Uma linha curta que identifica o card na faixa de fixados. */
export function resumoDoCartao(cartao: CartaoFeed): string {
  const c = cartao as unknown as Record<string, unknown>;
  for (const k of ["texto", "nome", "tipoTeste"]) {
    const v = c[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return cartao.origem;
}

export function ItemFeedComMenu({
  cartao,
  acoes,
  children,
}: {
  cartao: CartaoFeed;
  acoes: AcoesMenuCard;
  children: ReactNode;
}) {
  const [posicao, setPosicao] = useState<{ x: number; y: number } | null>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const fixado = !!cartao.fixadoEm;

  const itens: ItemMenuContextual[] = [];
  if (acoes.onAbrirFicha) {
    itens.push({ id: "ficha", rotulo: "Abrir ficha", icone: <UserRound size={14} />, onSelecionar: acoes.onAbrirFicha });
  }
  if (acoes.onFixar) {
    const fixar = acoes.onFixar;
    itens.push(fixado
      ? { id: "desafixar", rotulo: "Desafixar", icone: <PinOff size={14} />, onSelecionar: () => fixar(false) }
      : { id: "fixar", rotulo: "Fixar no topo", icone: <Pin size={14} />, onSelecionar: () => fixar(true) });
  }
  if (acoes.onExcluir) {
    itens.push({ id: "excluir", rotulo: "Excluir", icone: <Trash2 size={14} />, perigoso: true, separadorAntes: itens.length > 0, onSelecionar: acoes.onExcluir });
  }

  const temItens = itens.length > 0;
  const botao = temItens ? (
    <button
      ref={botaoRef}
      type="button"
      className="pn-feed-menu-btn"
      aria-label="Ações do card"
      aria-haspopup="menu"
      aria-expanded={posicao ? true : undefined}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setPosicao({ x: r.right - 4, y: r.bottom + 4 });
      }}
    >
      <Ellipsis size={15} aria-hidden="true" />
    </button>
  ) : null;

  return (
    <div
      className="pn-feed-item"
      id={`feed-card-${cartao.id}`}
      data-fixado={fixado ? "true" : undefined}
      data-menu-aberto={posicao ? "true" : undefined}
      onContextMenu={temItens ? (e) => {
        // Texto selecionado: o menu do navegador (copiar) continua valendo.
        if (window.getSelection()?.toString()) return;
        e.preventDefault();
        setPosicao({ x: e.clientX, y: e.clientY });
      } : undefined}
    >
      <BotaoMenuContext.Provider value={botao}>{children}</BotaoMenuContext.Provider>
      {fixado && (
        <span className="pn-feed-fixado" aria-label="Fixado">
          <Pin size={10} aria-hidden="true" /> Fixado
        </span>
      )}
      {temItens && (
        <MenuContextual
          posicao={posicao}
          itens={itens}
          onFechar={() => setPosicao(null)}
          retornarFocoPara={botaoRef.current}
          semEspinha
        />
      )}
    </div>
  );
}
