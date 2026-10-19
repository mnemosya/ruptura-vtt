"use client";

import type { MouseEventHandler, ReactNode } from "react";

/** Card compacto compartilhado pelo grimório e pelos implantes. */
export function CartaoListaHud({ nome, subtitulo, cor, metricas, onClick, onContextMenu, opacidade = 1, className = "", ariaLabel, icone, nota, disabled }: {
  nome: ReactNode;
  subtitulo: ReactNode;
  cor: string;
  metricas: { valor: ReactNode; unidade: string; cor: string; tamanho?: number }[];
  onClick: () => void;
  onContextMenu?: MouseEventHandler<HTMLButtonElement>;
  opacidade?: number;
  className?: string;
  ariaLabel?: string;
  /** Quadro à esquerda do nome (ícone de categoria, como no inventário). */
  icone?: ReactNode;
  /** Linha extra sob o subtítulo (bloqueio, aviso). */
  nota?: ReactNode;
  disabled?: boolean;
}) {
  return <button type="button" onClick={onClick} disabled={disabled} onContextMenu={onContextMenu} aria-label={ariaLabel}
    className={`hx-ch hx-cartao-magia ${className}`} style={{ display: "block", width: "100%", padding: 1, opacity: opacidade, cursor: disabled ? "not-allowed" : undefined }}>
    <span className="hx-ch" style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 16px", background: "#081925", textAlign: "left" }}>
      <span style={{ width: 3, flexShrink: 0, alignSelf: "stretch", background: cor }} />
      {icone}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="hx-display" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", overflowWrap: "anywhere" }}>{nome}</span>
        <span className="hx-mono hx-dim" style={{ display: "block", marginTop: 4, fontSize: 10, textTransform: "uppercase", letterSpacing: ".14em" }}><span style={{ color: cor }}>{subtitulo}</span></span>
        {nota}
      </span>
      {metricas.map((m, i) => <span key={i} style={{ textAlign: "right", flexShrink: 0 }}>
        <span className="hx-display" style={{ fontSize: m.tamanho ?? 18, fontWeight: 900, lineHeight: 1, color: m.cor }}>{m.valor}</span>
        <span className="hx-tag hx-dim" style={{ display: "block", fontSize: 10 }}>{m.unidade}</span>
      </span>)}
    </span>
  </button>;
}
