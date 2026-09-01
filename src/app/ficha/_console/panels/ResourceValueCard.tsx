"use client";

/**
 * Card de valor editável de recurso (PV/PE/Mana) — usado pela base
 * compartilhada da janela principal, console minimizado e HUD do VTT,
 * para não duplicar parsing/edição entre superfícies.
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
  readOnly = false,
  disabled = false,
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
  /** Observadores do VTT recebem o mesmo card sem transformar o valor em controle focavel. */
  readOnly?: boolean;
  /** Bloqueio pontual durante uma gravacao; nao bloqueia o restante do HUD. */
  disabled?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [invalido, setInvalido] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editando) inputRef.current?.select();
  }, [editando]);

  function abrir() {
    if (readOnly || disabled) return;
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

  if (editando && !readOnly) {
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

  if (readOnly) {
    return (
      <span className={className} aria-label={`${rotulo} ${atual} de ${max}`}>
        {atual}/{max}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={abrir}
      disabled={disabled}
      data-testid={`${testIdPrefix}-${rotulo.toLowerCase()}`}
      aria-label={`${rotulo} ${atual} de ${max}. Editar`}
    >
      {atual}/{max}
    </button>
  );
}
