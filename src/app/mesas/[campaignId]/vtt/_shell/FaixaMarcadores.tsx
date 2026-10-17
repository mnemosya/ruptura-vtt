"use client";

/**
 * Faixa de marcadores sobre o mapa — os relógios de segmentos da
 * campanha, soltos no topo do palco (sem caixa por baixo).
 *
 * Com o HUD de rodadas na tela (`.rv-rodadas`, topo central), a faixa
 * desce para a base: os dois disputariam o mesmo lugar.
 *
 * ARRASTO: qualquer pessoa pode tirar um marcador da faixa e deixá-lo
 * onde quiser. É preferência LOCAL (`marcadoresPosicao.ts`): muda só a
 * tela de quem arrastou. Soltar de volta na zona da faixa devolve o
 * marcador ao centro. Até 4px o gesto é clique, então avançar e
 * arrastar convivem no mesmo anel.
 *
 * Apresentacional quanto aos DADOS: recebe os marcadores e devolve
 * intenção (`onAjustar`, `onRemover`). Só o narrador altera; o jogador
 * vê, lê o tooltip e arrasta.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import {
  estaCompleto, gradienteAnel, rotuloAcessivel, ROTULO_TIPO, SELO_CONCLUSAO, type MarcadorVtt, type TipoMarcador,
} from "../_dominio/marcadores";
import {
  carregarPosicoesMarcadores, chavePosicoesMarcadores, limitarAoPalco, LIMIAR_ARRASTE_PX, salvarPosicoesMarcadores, ZONA_FAIXA_PX,
  type PosicaoMarcador,
} from "./marcadoresPosicao";

export function IconeTipoMarcador({ tipo, tamanho }: { tipo: TipoMarcador; tamanho: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
      {tipo === "progresso"
        ? <path d="M5 6l6 6-6 6M12 6l6 6-6 6" />
        : <path d="M7 3h10M7 21h10M8 3l8 9-8 9M16 3l-8 9 8 9" />}
    </svg>
  );
}

interface GestoArraste {
  id: string;
  inicioX: number;
  inicioY: number;
  /** Ponto do item onde o ponteiro pegou. */
  pegaX: number;
  pegaY: number;
  palco: DOMRect;
  item: { width: number; height: number };
  moveu: boolean;
}

export function FaixaMarcadores({
  campaignId, usuarioId, marcadores, ehNarrador, emCombate, onAjustar, onRemover, removido, onDesfazerRemocao,
}: {
  campaignId: string;
  usuarioId: string | null;
  marcadores: MarcadorVtt[];
  ehNarrador: boolean;
  emCombate: boolean;
  onAjustar: (id: string, delta: number) => void;
  onRemover: (id: string) => void;
  /** Último marcador removido, enquanto o "Desfazer" está na tela. */
  removido: MarcadorVtt | null;
  onDesfazerRemocao: () => void;
}) {
  const chave = chavePosicoesMarcadores(usuarioId, campaignId);
  const [posicoes, setPosicoes] = useState<Record<string, PosicaoMarcador>>({});
  useEffect(() => { setPosicoes(carregarPosicoesMarcadores(chave)); }, [chave]);

  const [arrastando, setArrastando] = useState<{ id: string; x: number; y: number } | null>(null);
  const gestoRef = useRef<GestoArraste | null>(null);
  /** O `click` que o navegador dispara ao soltar um ARRASTE não é clique. */
  const suprimirCliqueRef = useRef(false);

  const aoMover = useCallback((e: globalThis.PointerEvent) => {
    const g = gestoRef.current;
    if (!g) return;
    if (!g.moveu && Math.hypot(e.clientX - g.inicioX, e.clientY - g.inicioY) < LIMIAR_ARRASTE_PX) return;
    g.moveu = true;
    const p = limitarAoPalco(
      { x: e.clientX - g.palco.left - g.pegaX, y: e.clientY - g.palco.top - g.pegaY },
      g.palco, g.item,
    );
    setArrastando({ id: g.id, ...p });
  }, []);

  const aoSoltar = useCallback((e: globalThis.PointerEvent) => {
    window.removeEventListener("pointermove", aoMover);
    window.removeEventListener("pointerup", aoSoltar);
    window.removeEventListener("pointercancel", aoSoltar);
    const g = gestoRef.current;
    gestoRef.current = null;
    if (!g || !g.moveu) return;
    suprimirCliqueRef.current = true;
    setTimeout(() => { suprimirCliqueRef.current = false; }, 0);
    const p = limitarAoPalco(
      { x: e.clientX - g.palco.left - g.pegaX, y: e.clientY - g.palco.top - g.pegaY },
      g.palco, g.item,
    );
    setPosicoes((atual) => {
      const novo = { ...atual };
      if (p.y < ZONA_FAIXA_PX) delete novo[g.id];
      else novo[g.id] = p;
      salvarPosicoesMarcadores(chave, novo);
      return novo;
    });
    setArrastando(null);
  }, [aoMover, chave]);

  useEffect(() => () => {
    window.removeEventListener("pointermove", aoMover);
    window.removeEventListener("pointerup", aoSoltar);
    window.removeEventListener("pointercancel", aoSoltar);
  }, [aoMover, aoSoltar]);

  const aoPressionar = (id: string) => (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".rv-mk-remover")) return;
    const palco = e.currentTarget.closest(".rv-palco")?.getBoundingClientRect();
    if (!palco) return;
    const caixa = e.currentTarget.getBoundingClientRect();
    gestoRef.current = {
      id, inicioX: e.clientX, inicioY: e.clientY,
      pegaX: e.clientX - caixa.left, pegaY: e.clientY - caixa.top,
      palco, item: { width: caixa.width, height: caixa.height }, moveu: false,
    };
    window.addEventListener("pointermove", aoMover);
    window.addEventListener("pointerup", aoSoltar);
    window.addEventListener("pointercancel", aoSoltar);
  };

  if (marcadores.length === 0 && !removido) return null;

  const posicaoDe = (id: string): PosicaoMarcador | null =>
    arrastando?.id === id ? arrastando : posicoes[id] ?? null;

  const item = (m: MarcadorVtt, solto: PosicaoMarcador | null) => {
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
      <div
        key={m.id}
        className="rv-mk-item"
        data-tipo={m.tipo}
        data-completo={completo || undefined}
        data-solto={solto ? "true" : undefined}
        data-arrastando={arrastando?.id === m.id || undefined}
        style={solto ? { left: solto.x, top: solto.y } : undefined}
        onPointerDown={aoPressionar(m.id)}
      >
        <button
          type="button"
          className={`rv-mk-anel ${flash}`}
          aria-label={rotuloAcessivel(m)}
          aria-disabled={!ehNarrador || undefined}
          onClick={() => { if (ehNarrador && !suprimirCliqueRef.current) onAjustar(m.id, 1); }}
          onContextMenu={recuar}
        >
          <span className="rv-mk-anel-segmentos" style={{ "--mk-anel": gradienteAnel(m.total, m.preenchidos) } as CSSProperties} />
          <span className="rv-mk-anel-miolo"><IconeTipoMarcador tipo={m.tipo} tamanho={20} /></span>
        </button>
        {/* Remover: só o narrador, aparece no hover. Sem confirmação —
            o "Desfazer" cobre o clique errado. */}
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
          <span className="rv-mk-dica-ajuda">ARRASTE PARA MOVER</span>
        </span>
      </div>
    );
  };

  const naFaixa = marcadores.filter((m) => !posicaoDe(m.id));
  const soltos = marcadores.filter((m) => posicaoDe(m.id));

  return (
    <>
      <div className="rv-mk-faixa" data-combate={emCombate || undefined} data-alvo={arrastando ? "true" : undefined} aria-label="Marcadores">
        {naFaixa.map((m) => item(m, null))}
        {removido && ehNarrador && (
          <div className="rv-mk-aviso" role="status">
            <span>Marcador removido</span>
            <button type="button" className="rv-mk-aviso-desfazer" onClick={onDesfazerRemocao}>Desfazer</button>
          </div>
        )}
      </div>
      {soltos.length > 0 && (
        <div className="rv-mk-soltos">
          {soltos.map((m) => item(m, posicaoDe(m.id)))}
        </div>
      )}
    </>
  );
}
