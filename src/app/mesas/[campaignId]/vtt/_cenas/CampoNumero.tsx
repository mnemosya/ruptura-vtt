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

/**
 * O texto que o campo mostra para um número.
 *
 * Vírgula porque a mesa é em português, e sem casas sobrando: 70 é
 * "70", nunca "70,0000". O zero à direita não informa nada e faz um
 * campo de tamanho parecer um campo de precisão.
 */
export function formatarNumero(n: number, decimais: number): string {
  if (decimais <= 0) return String(Math.round(n));
  const texto = n.toFixed(decimais).replace(/\.?0+$/, "");
  return texto.replace(".", ",");
}

/** Aceita os dois separadores: teclado numérico brasileiro dá vírgula. */
export function lerNumero(bruto: string): number {
  return Number.parseFloat(bruto.replace(",", "."));
}

export interface PropsCampoNumero {
  /** O valor canônico, já na unidade deste campo. */
  valor: number;
  /** Chamado só ao confirmar, com o número cru que foi digitado. */
  onConfirmar: (valor: number) => void;
  min: number;
  max: number;
  className?: string;
  /**
   * Casas decimais aceitas. Acima de zero o campo deixa de ser
   * `type="number"`: em locale pt-BR o navegador RECUSA a vírgula num
   * campo numérico (ele só aceita o separador do locale do SO, que
   * varia), e o valor chega vazio ao `onChange`. Texto com
   * `inputMode="decimal"` abre o teclado certo no celular e aceita os
   * dois separadores.
   */
  decimais?: number;
  "aria-label": string;
  "data-testid"?: string;
}

export function CampoNumero({ valor, onConfirmar, min, max, className, decimais = 0, ...resto }: PropsCampoNumero) {
  /** `null` = ninguém está digitando; o canônico manda. */
  const [rascunho, setRascunho] = useState<string | null>(null);

  function confirmar() {
    const bruto = rascunho;
    setRascunho(null);
    if (bruto === null) return;
    const n = lerNumero(bruto);
    // Campo vazio ou lixo não é um pedido: é uma edição abandonada, e
    // abandonar devolve o que estava lá. Prender em `min` transformaria
    // um apagão acidental numa alteração.
    if (Number.isNaN(n)) return;
    const fator = 10 ** decimais;
    const preso = Math.max(min, Math.min(max, Math.round(n * fator) / fator));
    if (preso !== valor) onConfirmar(preso);
  }

  return (
    <input
      {...resto}
      type={decimais > 0 ? "text" : "number"}
      inputMode={decimais > 0 ? "decimal" : "numeric"}
      {...(decimais > 0 ? {} : { min, max })}
      className={className}
      value={rascunho ?? formatarNumero(valor, decimais)}
      onChange={(e) => setRascunho(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === "Escape") { e.preventDefault(); setRascunho(null); }
      }}
    />
  );
}
