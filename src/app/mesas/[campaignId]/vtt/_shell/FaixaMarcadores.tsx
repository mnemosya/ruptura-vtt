"use client";

/**
 * Faixa de marcadores sobre o mapa — os relógios de segmentos da
 * campanha, soltos no topo do palco (sem caixa por baixo).
 *
 * Com o HUD de rodadas na tela (`.rv-rodadas`, topo central), a faixa
 * desce para a base: os dois disputariam o mesmo lugar.
 *
 * PURAMENTE APRESENTACIONAL: recebe os marcadores e devolve intenção
 * (`onAjustar`). Só o narrador interage; o jogador vê e lê o tooltip.
 */

import type { CSSProperties, MouseEvent } from "react";
import {
  estaCompleto, gradienteAnel, rotuloAcessivel, ROTULO_TIPO, SELO_CONCLUSAO, type MarcadorVtt, type TipoMarcador,
} from "../_dominio/marcadores";

export function IconeTipoMarcador({ tipo, tamanho }: { tipo: TipoMarcador; tamanho: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
      {tipo === "progresso"
        ? <path d="M5 6l6 6-6 6M12 6l6 6-6 6" />
        : <path d="M7 3h10M7 21h10M8 3l8 9-8 9M16 3l-8 9 8 9" />}
    </svg>
  );
}

export function FaixaMarcadores({ marcadores, ehNarrador, emCombate, onAjustar, onRemover, removido, onDesfazerRemocao }: {
  marcadores: MarcadorVtt[];
  ehNarrador: boolean;
  emCombate: boolean;
  onAjustar: (id: string, delta: number) => void;
  onRemover: (id: string) => void;
  /** Último marcador removido, enquanto o "Desfazer" está na tela. */
  removido: MarcadorVtt | null;
  onDesfazerRemocao: () => void;
}) {
  if (marcadores.length === 0 && !removido) return null;
  return (
    <div className="rv-mk-faixa" data-combate={emCombate || undefined} aria-label="Marcadores">
      {marcadores.map((m) => {
        const completo = estaCompleto(m);
        // A paridade troca o nome da animação a cada mudança, o que a
        // reinicia: o flash confirma o clique sem estado extra.
        const flash = completo ? (m.preenchidos % 2 ? "rv-mk-d1" : "rv-mk-d2") : (m.preenchidos % 2 ? "rv-mk-p1" : "rv-mk-p2");
        const recuar = (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          if (ehNarrador) onAjustar(m.id, -1);
        };
        return (
          <div key={m.id} className="rv-mk-item" data-tipo={m.tipo} data-completo={completo || undefined}>
            <button
              type="button"
              className={`rv-mk-anel ${flash}`}
              aria-label={rotuloAcessivel(m)}
              aria-disabled={!ehNarrador || undefined}
              onClick={() => { if (ehNarrador) onAjustar(m.id, 1); }}
              onContextMenu={recuar}
            >
              <span className="rv-mk-anel-segmentos" style={{ "--mk-anel": gradienteAnel(m.total, m.preenchidos) } as CSSProperties} />
              <span className="rv-mk-anel-miolo"><IconeTipoMarcador tipo={m.tipo} tamanho={20} /></span>
            </button>
            {/* Remover: só o narrador, aparece no hover. Sem confirmação —
                o "Desfazer" logo abaixo cobre o clique errado. */}
            {ehNarrador && (
              <button type="button" className="rv-mk-remover" aria-label={`Remover ${m.nome ?? ROTULO_TIPO[m.tipo]}`}
                onClick={(e) => { e.stopPropagation(); onRemover(m.id); }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            )}
            {m.nome && <span className="rv-mk-nome">{m.nome}</span>}
            {completo && <span className="rv-mk-selo"><span className="rv-mk-caps">{SELO_CONCLUSAO[m.tipo]}</span></span>}
            <span className="rv-mk-dica" role="tooltip">
              <span className="rv-mk-dica-topo">
                <span className="rv-mk-dica-tipo">{ROTULO_TIPO[m.tipo]}</span>
                <span className="rv-mk-dica-conta">{m.preenchidos}/{m.total}</span>
              </span>
              {m.nome && <span className="rv-mk-dica-nome">{m.nome}</span>}
              {ehNarrador && <span className="rv-mk-dica-ajuda">CLIQUE +1 · BOTÃO DIREITO −1</span>}
            </span>
          </div>
        );
      })}
      {removido && ehNarrador && (
        <div className="rv-mk-aviso" role="status">
          <span>Marcador removido</span>
          <button type="button" className="rv-mk-aviso-desfazer" onClick={onDesfazerRemocao}>Desfazer</button>
        </div>
      )}
    </div>
  );
}
