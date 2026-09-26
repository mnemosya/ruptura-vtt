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
  min = 0,
  mostrarMax = true,
  maxClassName,
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
  /** Piso do valor — negativo no PE. */
  min?: number;
  /** `false` mostra SÓ o valor atual — para quem já desenha o máximo
      por fora. O rótulo acessível continua dizendo "X de Y" nos dois
      casos. */
  mostrarMax?: boolean;
  /** Classe do "/máximo". Com ela, o máximo entra DENTRO do card (num
      span próprio, com desenho próprio) em vez de ficar do lado de
      fora — é o que faz o bloco inteiro do número ser um alvo só de
      clique, sem cantos mortos. */
  maxClassName?: string;
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
    const r = parseResourceEdit(texto, atual, max, min);
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

  const conteudo = !mostrarMax ? (
    atual
  ) : maxClassName ? (
    <>
      {atual}
      <span className={maxClassName}>/{max}</span>
    </>
  ) : (
    `${atual}/${max}`
  );

  if (readOnly) {
    return (
      <span className={className} aria-label={`${rotulo} ${atual} de ${max}`}>
        {conteudo}
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
      {conteudo}
    </button>
  );
}
