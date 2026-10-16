"use client";

/**
 * Criação de marcador — o popover que a ferramenta Marcadores (K) abre.
 *
 * Três decisões, nenhuma obrigatória além de clicar em Criar: tipo,
 * segmentos (atalhos 4/6/8 do capítulo ou qualquer valor de 2 a 12 no
 * −/+) e um nome opcional. Sem nome, o marcador fica sem nome.
 *
 * Enter cria, Esc fecha. Quem grava é o `VttClient`.
 */

import { useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  gradienteAnel, limitarTotal, NOME_MAX, SEGMENTOS_REFERENCIA, type TipoMarcador,
} from "../_dominio/marcadores";
import { IconeTipoMarcador } from "./FaixaMarcadores";

export function PainelMarcadores({ emCombate, onCriar, onFechar }: {
  emCombate: boolean;
  onCriar: (dados: { tipo: TipoMarcador; nome: string; total: number }) => Promise<{ ok: boolean }>;
  onFechar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoMarcador>("progresso");
  const [total, setTotal] = useState(4);
  const [nome, setNome] = useState("");
  const [enviando, setEnviando] = useState(false);

  const criar = async () => {
    if (enviando) return;
    setEnviando(true);
    const r = await onCriar({ tipo, nome, total });
    setEnviando(false);
    if (r.ok) onFechar();
  };

  const teclado = (e: KeyboardEvent) => {
    // Enter num botão é o próprio botão (escolher tipo, segmentos); fora dele, cria.
    if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); void criar(); }
    else if (e.key === "Escape") { e.preventDefault(); onFechar(); }
  };

  return (
    <div className="rv-mk-pop" data-tipo={tipo} data-combate={emCombate || undefined}
      role="dialog" aria-label="Novo marcador" onKeyDown={teclado}>
      <div className="rv-mk-pop-cab">
        <span className="rv-mk-pop-titulo">NOVO MARCADOR</span>
        <span className="rv-mk-pop-atalhos">ENTER CRIA · ESC FECHA</span>
      </div>

      <div className="rv-mk-tipos">
        {(["progresso", "pressao"] as const).map((t) => (
          <button key={t} type="button" className="rv-mk-tipo" data-tipo={t} aria-pressed={tipo === t} onClick={() => setTipo(t)}>
            <IconeTipoMarcador tipo={t} tamanho={16} />
            <span className="rv-mk-caps">{t === "progresso" ? "PROGRESSO" : "PRESSÃO"}</span>
          </button>
        ))}
      </div>

      <div className="rv-mk-segmentos">
        <span className="rv-mk-previa">
          <span className="rv-mk-anel-segmentos" style={{ "--mk-anel": gradienteAnel(total, 0, "var(--mk-cor)", "var(--mk-previa)") } as CSSProperties} />
          <span className="rv-mk-previa-num">{total}</span>
        </span>
        <div className="rv-mk-segmentos-ctrl">
          <span className="rv-mk-rotulo">SEGMENTOS</span>
          <div className="rv-mk-linha">
            {SEGMENTOS_REFERENCIA.map((n) => (
              <button key={n} type="button" className="rv-mk-chip" aria-pressed={total === n} onClick={() => setTotal(n)}>{n}</button>
            ))}
            <span className="rv-mk-divisor" aria-hidden="true" />
            <div className="rv-mk-passos">
              <button type="button" className="rv-mk-passo" aria-label="Menos um segmento" onClick={() => setTotal((v) => limitarTotal(v - 1))}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} aria-hidden="true"><path d="M5 12h14" /></svg>
              </button>
              <span className="rv-mk-passos-fio" aria-hidden="true" />
              <button type="button" className="rv-mk-passo" aria-label="Mais um segmento" onClick={() => setTotal((v) => limitarTotal(v + 1))}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              </button>
            </div>
          </div>
          <span className="rv-mk-referencia">4 breve · 6 prolongado · 8 extenso</span>
        </div>
      </div>

      <label className="rv-mk-campo">
        <span className="rv-mk-rotulo">NOME <span className="rv-mk-opcional">(opcional)</span></span>
        <input className="rv-mk-input" value={nome} maxLength={NOME_MAX} placeholder="Sem nome" onChange={(e) => setNome(e.target.value)} autoFocus />
      </label>

      <button type="button" className="rv-mk-criar" onClick={() => void criar()} disabled={enviando}>
        <span className="rv-mk-caps">CRIAR MARCADOR</span>
      </button>
    </div>
  );
}
