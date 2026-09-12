"use client";

/**
 * Menu contextual genérico do mapa — usado tanto pro clique direito
 * num hex vazio ("Adicionar token") quanto num token (editar/duplicar/
 * rotacionar/ocultar/bloquear/remover). Um componente só, quem chama
 * decide os itens — sem lógica de token/mapa aqui dentro.
 *
 * Abre com botão direito (quem chama decide onde — nunca aqui dentro,
 * pra não competir com pan de `MapaHex`), fecha com Esc/clique externo,
 * nunca inicia pan/movimento/medição/pintura por conta própria (é só
 * uma lista de botões, o clique NO ITEM é que dispara a ação — o
 * `contextmenu` nativo do navegador já foi `preventDefault()`ado por
 * quem abriu isto). Fica dentro da viewport (clampa x/y). Navegação
 * por teclado: setas move entre itens, Enter/Espaço ativa, Esc fecha.
 */

import { useEffect, useRef, type ReactNode } from "react";

export interface ItemMenuContextual {
  id: string;
  rotulo: string;
  onSelecionar: () => void;
  /** Ação destrutiva (ex.: remover) — estilo visual distinto, nunca só cor (ver `vtt.css`). */
  perigoso?: boolean;
  desabilitado?: boolean;
  /** Linha divisória ANTES deste item — agrupa itens relacionados sem precisar de sub-menus. */
  separadorAntes?: boolean;
  /** Dica nativa (`title`) — sobretudo pra EXPLICAR por que um item está desabilitado, nunca desabilitar em silêncio. */
  dica?: string;
  /** Glifo à esquerda do rótulo (ícone `lucide-react`, ex.: `<Pencil size={14} />`) — decorativo, `aria-hidden` por conta do próprio ícone. Opcional: um item sem ícone só perde a coluna, nunca desalinha os outros (grid fixo, ver CSS). */
  icone?: ReactNode;
}

const LARGURA_ESTIMADA = 216;
const MARGEM = 8;

/** Cantos em bracket — os mesmos quatro da janela de ferramenta (`.rv-fp-canto`). */
const CANTOS = ["tl", "tr", "bl", "br"] as const;

export function MenuContextual({
  posicao, itens, onFechar, retornarFocoPara, codigo = "A\u00e7\u00f5es", alvo,
}: {
  /** `null` = fechado. Coordenadas de TELA (`clientX/clientY`) de onde abrir. */
  posicao: { x: number; y: number } | null;
  itens: ItemMenuContextual[];
  onFechar: () => void;
  /** Elemento que recebe o foco de volta ao fechar (o alvo do clique direito, tipicamente). */
  retornarFocoPara?: HTMLElement | null;
  /** Texto VERTICAL da espinha — a mesma coluna das janelas de ferramenta. Curto: uma palavra. */
  codigo?: string;
  /** Sobre o que este menu age (nome do token, coordenada do hex) — vira o cabe\u00e7alho em mono. Sem ele o cabe\u00e7alho n\u00e3o aparece. */
  alvo?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!posicao) return;
    // Foco no primeiro item habilitado — a NAVEGAÇÃO por teclado só
    // funciona se ALGO dentro do menu tem foco desde a abertura.
    const id = requestAnimationFrame(() => {
      const botoes = ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
      botoes?.[0]?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [posicao]);

  useEffect(() => {
    if (!posicao) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onFechar(); retornarFocoPara?.focus(); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const botoes = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        if (botoes.length === 0) return;
        const atual = botoes.indexOf(document.activeElement as HTMLButtonElement);
        const proximo = e.key === "ArrowDown"
          ? (atual + 1) % botoes.length
          : (atual - 1 + botoes.length) % botoes.length;
        botoes[proximo]?.focus();
      }
    }
    function aoClicarFora(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onFechar();
    }
    window.addEventListener("keydown", aoTeclar);
    window.addEventListener("pointerdown", aoClicarFora);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("pointerdown", aoClicarFora);
    };
  }, [posicao, onFechar, retornarFocoPara]);

  if (!posicao) return null;

  const left = Math.min(posicao.x, window.innerWidth - LARGURA_ESTIMADA - MARGEM);
  const top = Math.min(posicao.y, window.innerHeight - itens.length * 34 - 60);

  return (
    <div
      ref={ref}
      className="rv-menu-contextual"
      role="menu"
      style={{ left: Math.max(MARGEM, left), top: Math.max(MARGEM, top) }}
    >
      {/* Brackets e espinha s\u00e3o LITERALMENTE as classes da janela de
          ferramenta (`.rv-fp-canto`, `.rv-fp-espinha`): o menu passa a
          ser a mesma pe\u00e7a de m\u00f3vel, n\u00e3o um primo parecido. */}
      {CANTOS.map((c) => (
        <span key={c} className="rv-fp-canto" data-canto={c} aria-hidden="true" />
      ))}
      <span className="rv-fp-espinha" aria-hidden="true">
        <span className="rv-fp-espinha-indice">::</span>
        <span className="rv-fp-espinha-codigo">{codigo}</span>
        <span className="rv-fp-espinha-ponto" />
      </span>
      {alvo && <p className="rv-menu-cab">{alvo}</p>}
      {itens.map((item, i) => (
        <div key={item.id}>
          {item.separadorAntes && <span className="rv-menu-sep" role="separator" />}
          <button
            type="button"
            role="menuitem"
            className={`rv-menu-item${item.perigoso ? " rv-menu-item--perigoso" : ""}`}
            disabled={item.desabilitado}
            title={item.dica}
            onClick={() => { item.onSelecionar(); onFechar(); }}
          >
            <span className="rv-menu-item-icone" aria-hidden="true">{item.icone}</span>
            {item.rotulo}
          </button>
        </div>
      ))}
    </div>
  );
}
