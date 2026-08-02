"use client";

/**
 * Card de valor editável de recurso (PV/PE/Mana) — usado na janela
 * principal (`VitalsRow`) E no console minimizado (`MinimizedDockContent`),
 * para não duplicar a lógica de parsing/edição em dois lugares.
 *
 * O card tem largura e altura FIXAS (`className` controla isso via
 * `box-sizing:border-box`); o input, ao abrir, ocupa exatamente o
 * mesmo espaço do texto — não pode causar reflow do card nem das
 * trilhas vizinhas.
 */

import { useEffect, useRef, useState } from "react";
import { parseResourceEdit } from "../resourceMath";

export function ResourceValueCard({
  atual,
  max,
  rotulo,
  className,
  inputClassName,
  onGravar,
  testIdPrefix = "console-res",
}: {
  atual: number;
  max: number;
  rotulo: string;
  /** Classe do card (dimensiona o botão/span — ex.: "rc-res-val" ou "rc-dock-val"). */
  className: string;
  /** Classe do input, do mesmo conjunto de tokens (ex.: "rc-res-input"). */
  inputClassName: string;
  onGravar: (valor: number) => void;
  /** A janela principal continua montada (inert) enquanto minimizada —
      o dock precisa de um testid distinto para não colidir com o card
      equivalente lá embaixo. */
  testIdPrefix?: string;
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
      <span className={className} data-invalido={invalido} data-no-drag>
        <input
          ref={inputRef}
          className={inputClassName}
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
      className={className}
      onClick={abrir}
      data-testid={`${testIdPrefix}-${rotulo.toLowerCase()}`}
      aria-label={`${rotulo} ${atual} de ${max}. Editar`}
    >
      {atual}/{max}
    </button>
  );
}
