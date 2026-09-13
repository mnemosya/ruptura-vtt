"use client";

/**
 * UM CAMPO NUMÉRICO QUE SE DEIXA DIGITAR.
 *
 * Parece supérfluo e não é. Um `<input type="number">` controlado que
 * valida a cada tecla é HOSTIL, e de um jeito que só aparece ao usar:
 * cada tecla é um valor completo, então "2000" passa por "2", "20" e
 * "200" — e se o componente prende cada um deles na faixa válida, ou
 * converte para outra unidade e volta, o que aparece na tela é o
 * resultado dessa conta intermediária, não o que se está digitando.
 *
 * No campo de pixels da grade isso era visível: digitar 2000 terminava
 * em 2030, porque cada tecla virava células (2 px = 0 células = 1) e
 * voltava a pixels antes da tecla seguinte.
 *
 * A regra aqui é: enquanto o campo tem foco, quem manda é o que foi
 * digitado — inclusive vazio, inclusive fora da faixa. A conversão e o
 * limite só acontecem quando a edição TERMINA (sair do campo, ou
 * Enter). Escape desiste e devolve o valor de antes.
 *
 * O valor exibido depois de confirmar pode não ser o digitado: 2000 px
 * com células de 70 não existe, e o campo mostra 2030 porque é isso que
 * a cena passou a ter. Mentir aqui seria pior — o número na tela
 * deixaria de ser o número da cena.
 */

import { useState } from "react";

export interface PropsCampoNumero {
  /** O valor canônico, já na unidade deste campo. */
  valor: number;
  /** Chamado só ao confirmar, com o número cru que foi digitado. */
  onConfirmar: (valor: number) => void;
  min: number;
  max: number;
  className?: string;
  "aria-label": string;
  "data-testid"?: string;
}

export function CampoNumero({ valor, onConfirmar, min, max, className, ...resto }: PropsCampoNumero) {
  /** `null` = ninguém está digitando; o canônico manda. */
  const [rascunho, setRascunho] = useState<string | null>(null);

  function confirmar() {
    const bruto = rascunho;
    setRascunho(null);
    if (bruto === null) return;
    const n = Number.parseInt(bruto, 10);
    // Campo vazio ou lixo não é um pedido: é uma edição abandonada, e
    // abandonar devolve o que estava lá. Prender em `min` transformaria
    // um apagão acidental numa alteração.
    if (Number.isNaN(n)) return;
    const preso = Math.max(min, Math.min(max, n));
    if (preso !== valor) onConfirmar(preso);
  }

  return (
    <input
      {...resto}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      className={className}
      value={rascunho ?? String(valor)}
      onChange={(e) => setRascunho(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === "Escape") { e.preventDefault(); setRascunho(null); }
      }}
    />
  );
}
