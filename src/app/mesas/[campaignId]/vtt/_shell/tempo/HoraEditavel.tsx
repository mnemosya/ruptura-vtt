"use client";

/**
 * O horário "HH:MM" editável no lugar — sem o seletor nativo de hora.
 *
 * Cada metade é um campo próprio:
 * - clicar seleciona; digitar 2 algarismos confirma (das horas pula pros minutos);
 * - as setas visíveis acima/abaixo (segurar repete), ↑/↓ do teclado ou a
 *   roda do mouse somam/subtraem 1 (com Shift, 10);
 * - Enter confirma, Esc desfaz, sair do campo confirma.
 * Horas giram em 0–23 e minutos em 0–59, sem mudar o dia.
 */

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ehEnter } from "../../../../../_design/teclado";

type Parte = "h" | "m";
const LIMITE: Record<Parte, number> = { h: 24, m: 60 };
const dois = (n: number) => String(n).padStart(2, "0");

export function HoraEditavel({ hora, editavel, aoMudar, estilo, rotulo = "Horário", setas = true }: {
  hora: string | null;
  editavel: boolean;
  aoMudar: (hora: string) => void;
  /** Fonte/tamanho do texto (herdado pelos dois campos). */
  estilo?: CSSProperties;
  rotulo?: string;
  /** Setas visíveis acima e abaixo de cada metade (o relógio grande). */
  setas?: boolean;
}) {
  const [h, m] = hora && /^\d{2}:\d{2}$/.test(hora) ? hora.split(":").map(Number) : [null, null];
  if (!editavel || h === null || m === null) return <span style={estilo}>{hora ?? "––:––"}</span>;
  const mudar = (parte: Parte, valor: number) => {
    const v = ((valor % LIMITE[parte]) + LIMITE[parte]) % LIMITE[parte];
    aoMudar(parte === "h" ? `${dois(v)}:${dois(m)}` : `${dois(h)}:${dois(v)}`);
  };
  return (
    <span className={`hora-ed ${setas ? "com-setas" : ""}`} role="group" aria-label={rotulo} style={estilo}>
      <Segmento parte="h" valor={h} aoMudar={(v) => mudar("h", v)} rotulo="Horas" setas={setas} />
      <span aria-hidden="true">:</span>
      <Segmento parte="m" valor={m} aoMudar={(v) => mudar("m", v)} rotulo="Minutos" setas={setas} />
    </span>
  );
}

function Segmento({ parte, valor, aoMudar, rotulo, setas }: { parte: Parte; valor: number; aoMudar: (v: number) => void; rotulo: string; setas: boolean }) {
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

  // Segurar a seta repete: espera curta, depois passos rápidos.
  const repetir = useRef<{ espera?: number; passo?: number }>({});
  const parar = () => { window.clearTimeout(repetir.current.espera); window.clearInterval(repetir.current.passo); repetir.current = {}; };
  useEffect(() => parar, []);
  const apertar = (e: ReactPointerEvent<HTMLButtonElement>, sentido: 1 | -1) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const passo = (e.shiftKey ? 10 : 1) * sentido;
    setDigitado(null); parar();
    atual.current.aoMudar(atual.current.valor + passo);
    repetir.current.espera = window.setTimeout(() => {
      repetir.current.passo = window.setInterval(() => atual.current.aoMudar(atual.current.valor + passo), 70);
    }, 380);
  };
  const seta = (sentido: 1 | -1) => (
    <button type="button" tabIndex={-1} className="hora-seta"
      aria-label={`${sentido > 0 ? "Mais" : "Menos"} 1 ${parte === "h" ? "hora" : "minuto"}`}
      onPointerDown={(e) => apertar(e, sentido)} onPointerUp={parar} onPointerLeave={parar} onPointerCancel={parar}>
      {sentido > 0 ? <ChevronUp size={13} strokeWidth={2.6} aria-hidden="true" /> : <ChevronDown size={13} strokeWidth={2.6} aria-hidden="true" />}
    </button>
  );

  const campo = (
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
        else if (ehEnter(e)) { e.preventDefault(); confirmar(digRef.current); e.currentTarget.blur(); }
        else if (e.key === "Escape") { e.stopPropagation(); setDigitado(null); e.currentTarget.blur(); }
      }} />
  );
  if (!setas) return campo;
  return <span className="hora-col">{seta(1)}{campo}{seta(-1)}</span>;
}
