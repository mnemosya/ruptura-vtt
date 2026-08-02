"use client";

/**
 * Colapso (trilha inclinada, à esquerda) + Recursos (PV/PE/Mana), na
 * posição do wireframe.
 *
 * O card de valor abre edição inline aceitando absoluto ("8"),
 * adição ("+2") e subtração ("-3") — a interpretação vive em
 * `parseResourceEdit`, função única e testada. Gravar passa por
 * `api.editarRecurso`, que é o `updateRecursoAtual` da ficha (cura
 * automática de condição e detecção de Colapso continuam valendo).
 */

import { useEffect, useRef, useState } from "react";
import { HeartPulse, Zap, Sparkles, ShieldCheck } from "lucide-react";
import { MAX_COLLAPSE_SEGMENTS } from "../../../../lib/character";
import { parseResourceEdit } from "../resourceMath";
import type { ConsoleApi, RecursoEditavel } from "../types";

const RECURSOS: { id: RecursoEditavel; rotulo: string; cor: string; Icone: typeof Zap }[] = [
  { id: "pv", rotulo: "PV", cor: "#e0455e", Icone: HeartPulse },
  { id: "pe", rotulo: "PE", cor: "#9a6cff", Icone: Zap },
  { id: "mana", rotulo: "Mana", cor: "#3aa6f0", Icone: Sparkles },
];

function CardValor({
  atual,
  max,
  rotulo,
  onGravar,
}: {
  atual: number;
  max: number;
  rotulo: string;
  onGravar: (valor: number) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [invalido, setInvalido] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editando) inputRef.current?.select();
  }, [editando]);

  function abrir() {
    setTexto(String(atual));
    setInvalido(false);
    setEditando(true);
  }

  function confirmar(): boolean {
    const r = parseResourceEdit(texto, atual, max);
    if (!r.ok) {
      setInvalido(true);
      return false;
    }
    if (r.value !== atual) onGravar(r.value);
    setEditando(false);
    setInvalido(false);
    return true;
  }

  if (editando) {
    return (
      <span className="rc-res-val" data-invalido={invalido} data-no-drag>
        <input
          ref={inputRef}
          className="rc-res-input"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setInvalido(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              confirmar();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditando(false);
              setInvalido(false);
            }
          }}
          // Perder o foco confirma SOMENTE se a entrada for válida.
          onBlur={() => {
            if (!confirmar()) setEditando(false);
          }}
          aria-label={`${rotulo}: valor absoluto, +N ou -N`}
          aria-invalid={invalido}
        />
      </span>
    );
  }

  return (
    <button
      type="button"
      className="rc-res-val"
      onClick={abrir}
      data-testid={`console-res-${rotulo.toLowerCase()}`}
      aria-label={`${rotulo} ${atual} de ${max}. Editar`}
    >
      {atual}/{max}
    </button>
  );
}

export function VitalsRow({ api, onEstabilizar }: { api: ConsoleApi; onEstabilizar: () => void }) {
  const { character, derivados } = api;
  const colapso = character.colapso;
  const segmentos = colapso?.segmentos ?? 0;

  const maximos: Record<RecursoEditavel, number> = {
    pv: derivados.pv_max,
    pe: derivados.pe_max,
    mana: derivados.mana_max,
  };

  return (
    <div className="rc-panel rc-vitals">
      <div className="rc-vitals-row">
        <div className="rc-collapse">
          <div className="rc-collapse-head">
            <span className="rc-label rc-label--danger">Colapso</span>
            <button
              type="button"
              className="rc-winbtn"
              onClick={onEstabilizar}
              disabled={!colapso?.ativo}
              title="Estabilizar Colapso — interrompe o avanço, não cura"
              aria-label="Estabilizar Colapso"
              data-testid="console-estabilizar"
              style={{ width: 22, height: 20 }}
            >
              <ShieldCheck size={12} />
            </button>
          </div>
          <div className="rc-collapse-track">
            {Array.from({ length: MAX_COLLAPSE_SEGMENTS }, (_, i) => {
              const preenchido = i < segmentos;
              return (
                <button
                  key={i}
                  type="button"
                  className="rc-collapse-seg"
                  data-on={preenchido}
                  data-atual={i === segmentos - 1}
                  onClick={api.avancarColapso}
                  disabled={preenchido}
                  aria-label={`Colapso segmento ${i + 1} de ${MAX_COLLAPSE_SEGMENTS}${preenchido ? " (atingido)" : ""}`}
                />
              );
            })}
          </div>
          <span className="rc-collapse-state">
            {colapso?.ativo
              ? `${colapso.tipo === "pe" ? "mental" : "físico"}${colapso.estabilizado ? " · estável" : ""}`
              : "inativo"}
          </span>
        </div>

        <div className="rc-res">
          <span className="rc-label">Recursos</span>
          {RECURSOS.map(({ id, rotulo, cor, Icone }) => {
            const max = maximos[id];
            const atual = character.recursos_atuais?.[id] ?? max;
            const pct = max > 0 ? Math.max(0, Math.min(100, (atual / max) * 100)) : 0;
            return (
              <div className="rc-res-row" key={id}>
                <span className="rc-res-ico" style={{ color: cor }} aria-hidden="true">
                  <Icone size={14} />
                </span>
                <span className="rc-res-bar" role="img" aria-label={`${rotulo} ${atual} de ${max}`}>
                  <span className="rc-res-fill" style={{ width: `${pct}%`, ["--rc-res-cor" as string]: cor }} />
                </span>
                <CardValor atual={atual} max={max} rotulo={rotulo} onGravar={(v) => api.editarRecurso(id, v)} />
                <span className="rc-res-tag">{rotulo}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
