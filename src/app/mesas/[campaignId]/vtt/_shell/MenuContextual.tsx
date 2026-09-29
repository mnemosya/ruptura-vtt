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
  /**
   * Teclas do atalho, uma por entrada (ex.: `["Shift", "A"]`) — mostradas
   * só no hover/foco, na dica padrão (`.rv-dica`) com `<kbd>`. Nunca
   * escrever o atalho dentro do `rotulo`.
   */
  atalho?: string[];
}

const LARGURA_ESTIMADA = 216;
const MARGEM = 8;

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
    // Foco no MENU, não no primeiro item. Focar o item o fazia abrir já
    // "mirado" (fio e fundo de foco) mesmo quando o menu veio do mouse,
    // como se a escolha já estivesse feita. Com o foco no contêiner, as
    // setas continuam funcionando (a primeira ↓ entra no primeiro item)
    // e nada aparece selecionado antes de a pessoa escolher.
    const id = requestAnimationFrame(() => ref.current?.focus({ preventScroll: true }));
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
        // `atual === -1`: o foco ainda está no contêiner (recém-aberto).
        // ↓ entra no primeiro item, ↑ no último.
        const proximo = atual === -1
          ? (e.key === "ArrowDown" ? 0 : botoes.length - 1)
          : e.key === "ArrowDown"
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
  /* Com uma ou duas opções a espinha era mais alta que o próprio
     conteúdo — o código ("TOKEN") e o ponto ciano viravam ruído em
     volta de um botão só. O menu compacto fica sem ela; o cabeçalho
     (nome do alvo) continua dizendo sobre o que ele age. */
  const compacto = itens.length <= 2;

  return (
    <div
      ref={ref}
      className={`rv-menu-contextual${compacto ? " rv-menu-contextual--compacto" : ""}`}
      role="menu"
      tabIndex={-1}
      style={{ left: Math.max(MARGEM, left), top: Math.max(MARGEM, top), outline: "none" }}
    >
      {/* A espinha usa literalmente a classe da janela de ferramenta:
          o menu passa a ser a mesma peça de móvel, não um primo parecido. */}
      {!compacto && (
        <span className="rv-fp-espinha" aria-hidden="true">
          <span className="rv-fp-espinha-indice">::</span>
          <span className="rv-fp-espinha-codigo">{codigo}</span>
          <span className="rv-fp-espinha-ponto" />
        </span>
      )}
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
            {/* O atalho não disputa espaço com o rótulo: aparece só no
                hover/foco, na dica padrão da mesa (a mesma da barra de
                ferramentas), com as teclas em `<kbd>`. */}
            {item.atalho && (
              <span className="rv-dica rv-menu-item-dica" role="tooltip">
                Atalho {item.atalho.map((tecla) => <kbd key={tecla}>{tecla}</kbd>)}
              </span>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
