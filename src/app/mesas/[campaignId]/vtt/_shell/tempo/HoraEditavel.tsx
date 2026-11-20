"use client";

/**
 * O horário "HH:MM" editável no lugar — sem o seletor nativo de hora.
 *
 * Cada metade é um campo próprio:
 * - clicar seleciona; digitar 2 algarismos confirma (das horas pula pros minutos);
 * - ↑/↓ ou a roda do mouse somam/subtraem 1 (com Shift, 10);
 * - Enter confirma, Esc desfaz, sair do campo confirma.
 * Horas giram em 0–23 e minutos em 0–59, sem mudar o dia.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";

type Parte = "h" | "m";
const LIMITE: Record<Parte, number> = { h: 24, m: 60 };
const dois = (n: number) => String(n).padStart(2, "0");

export function HoraEditavel({ hora, editavel, aoMudar, estilo, rotulo = "Horário" }: {
  hora: string | null;
  editavel: boolean;
  aoMudar: (hora: string) => void;
  /** Fonte/tamanho do texto (herdado pelos dois campos). */
  estilo?: CSSProperties;
  rotulo?: string;
}) {
  const [h, m] = hora && /^\d{2}:\d{2}$/.test(hora) ? hora.split(":").map(Number) : [null, null];
  if (!editavel || h === null || m === null) return <span style={estilo}>{hora ?? "––:––"}</span>;
  const mudar = (parte: Parte, valor: number) => {
    const v = ((valor % LIMITE[parte]) + LIMITE[parte]) % LIMITE[parte];
    aoMudar(parte === "h" ? `${dois(v)}:${dois(m)}` : `${dois(h)}:${dois(v)}`);
  };
  return (
    <span className="hora-ed" role="group" aria-label={rotulo} style={estilo}>
      <Segmento parte="h" valor={h} aoMudar={(v) => mudar("h", v)} rotulo="Horas" />
      <span aria-hidden="true">:</span>
      <Segmento parte="m" valor={m} aoMudar={(v) => mudar("m", v)} rotulo="Minutos" />
    </span>
  );
}

function Segmento({ parte, valor, aoMudar, rotulo }: { parte: Parte; valor: number; aoMudar: (v: number) => void; rotulo: string }) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [digitado, setDigitadoEstado] = useState<string | null>(null);
  // Espelho síncrono: o blur que vem logo depois de confirmar não pode reconfirmar o valor parcial.
  const digRef = useRef<string | null>(null);
  const setDigitado = (v: string | null) => { digRef.current = v; setDigitadoEstado(v); };
  const atual = useRef({ valor, aoMudar });
  atual.current = { valor, aoMudar };

  // A roda precisa de `preventDefault`, que o React só permite em ouvinte não passivo.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const aoRodar = (e: WheelEvent) => {
      e.preventDefault();
      const passo = e.shiftKey ? 10 : 1;
      atual.current.aoMudar(atual.current.valor + (e.deltaY < 0 || e.deltaX < 0 ? passo : -passo));
    };
    el.addEventListener("wheel", aoRodar, { passive: false });
    return () => el.removeEventListener("wheel", aoRodar);
  }, []);

  const confirmar = (texto: string | null) => {
    setDigitado(null);
    if (texto === null || texto === "") return;
    const n = Number(texto);
    if (Number.isInteger(n) && n >= 0 && n < LIMITE[parte]) aoMudar(n);
  };

  return (
    <input ref={ref} className="hora-seg" inputMode="numeric" aria-label={rotulo} maxLength={2}
      aria-valuenow={valor} aria-valuemin={0} aria-valuemax={LIMITE[parte] - 1} role="spinbutton"
      value={digitado ?? dois(valor)}
      onFocus={(e) => e.currentTarget.select()}
      onMouseUp={(e) => e.preventDefault()}
      onChange={(e) => {
        const so = e.target.value.replace(/\D/g, "").slice(0, 2);
        if (so.length === 2) {
          confirmar(so);
          if (parte === "h") (ref.current?.parentElement?.querySelectorAll<HTMLInputElement>(".hora-seg")[1])?.focus();
          else ref.current?.select();
        } else setDigitado(so);
      }}
      onBlur={() => confirmar(digRef.current)}
      onKeyDown={(e) => {
        const passo = e.shiftKey ? 10 : 1;
        if (e.key === "ArrowUp") { e.preventDefault(); setDigitado(null); aoMudar(valor + passo); }
        else if (e.key === "ArrowDown") { e.preventDefault(); setDigitado(null); aoMudar(valor - passo); }
        else if (e.key === "Enter") { e.preventDefault(); confirmar(digRef.current); e.currentTarget.blur(); }
        else if (e.key === "Escape") { e.stopPropagation(); setDigitado(null); e.currentTarget.blur(); }
      }} />
  );
}
