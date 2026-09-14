"use client";

/**
 * A barra de abas do painel — HORIZONTAL no topo quando aberto,
 * VERTICAL como faixa de ícones quando recolhido.
 *
 * São os MESMOS elementos nos dois estados (só o flex e o `order`
 * mudam via CSS), então nem a aba ativa nem o foco se perdem ao
 * recolher/reabrir.
 *
 * Semântica de `tablist` do WAI-ARIA, de verdade:
 *   · `role="tablist"` no `<nav>`, `role="tab"` em cada botão,
 *     `aria-selected` e `aria-controls` apontando pro `role="tabpanel"`
 *     correspondente (renderizado por `PainelVtt`);
 *   · TABINDEX ROVING — só a aba selecionada é alcançável por Tab; as
 *     outras têm `tabIndex={-1}` e se alcançam pelas SETAS, que é o
 *     comportamento que um leitor de tela espera de um tablist (uma
 *     parada de Tab pro grupo inteiro, não cinco);
 *   · setas com wrap, Home/End nas pontas (`proximaAbaPorSeta`).
 *
 * O contador é o número REAL de cada aba (não lidos do Chat,
 * participantes online, itens do bando…) — `null` quando a aba não tem
 * o que contar, ou quando o número seria enganoso (presença
 * indisponível). Nunca um badge fixo.
 */

import { useRef } from "react";
import { ChevronsRight, Library, MessageSquare, UsersRound, Users, BookText } from "lucide-react";
import { ABAS_ORDEM, ROTULO_ABA, proximaAbaPorSeta, type AbaId } from "./tipos";

const ICONE: Record<AbaId, typeof MessageSquare> = {
  chat: MessageSquare,
  personagens: Users,
  participantes: UsersRound,
  bando: BookText,
  compendio: Library,
};

export function PainelAbas({
  abaAtiva,
  aberto,
  onSelecionar,
  onRecolher,
  idPainelDe,
}: {
  abaAtiva: AbaId;
  aberto: boolean;
  onSelecionar: (aba: AbaId) => void;
  onRecolher: () => void;
  /** `id` do `tabpanel` de cada aba — o alvo do `aria-controls`. */
  idPainelDe: (aba: AbaId) => string;
}) {
  const refs = useRef(new Map<AbaId, HTMLButtonElement | null>());

  function aoTeclar(e: React.KeyboardEvent<HTMLElement>) {
    const proxima = proximaAbaPorSeta(abaAtiva, e.key, ABAS_ORDEM);
    if (!proxima) return;
    e.preventDefault();
    onSelecionar(proxima);
    // Move o foco junto — sem isto a seta trocaria a aba visível mas
    // deixaria o foco do teclado para trás.
    refs.current.get(proxima)?.focus();
  }

  return (
    <nav className="rv-painel-abas" role="tablist" aria-label="Seções do painel" aria-orientation={aberto ? "horizontal" : "vertical"} onKeyDown={aoTeclar}>
      {ABAS_ORDEM.map((id) => {
        const Icone = ICONE[id];
        const ativa = aberto && abaAtiva === id;
        return (
          <button
            key={id}
            ref={(el) => {
              refs.current.set(id, el);
            }}
            type="button"
            role="tab"
            id={`rv-aba-${id}`}
            className="rv-aba"
            aria-selected={ativa}
            aria-controls={idPainelDe(id)}
            tabIndex={abaAtiva === id ? 0 : -1}
            aria-label={ROTULO_ABA[id]}
            onClick={() => onSelecionar(id)}
            data-testid={`painel-aba-${id}`}
          >
            <Icone size={17} strokeWidth={1.6} aria-hidden="true" />
            <span className="rv-dica">{ROTULO_ABA[id]}</span>
          </button>
        );
      })}
      <span className="rv-aba-fim" />
      {aberto && (
        <button
          type="button"
          className="rv-aba rv-aba--recolher"
          onClick={onRecolher}
          aria-label="Recolher painel"
          data-testid="painel-recolher"
        >
          <ChevronsRight size={17} aria-hidden="true" />
          <span className="rv-dica">Recolher painel</span>
        </button>
      )}
    </nav>
  );
}
