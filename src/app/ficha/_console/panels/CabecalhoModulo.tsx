/**
 * CABEÇALHO DE MÓDULO — a faixa que abre todo card do Console.
 *
 * Nasceu no módulo biométrico (`ID://BIOMÉTRICO` + situação do RPI) e
 * virou canônica: se um card é um módulo do aparelho, ele se apresenta
 * do mesmo jeito. À esquerda o que o módulo É, no formato `ID://NOME`;
 * à direita a inscrição de catálogo (`MOD.VITAL // 01`) ou, quando o
 * módulo tem um estado próprio para dizer, esse estado — é o caso do
 * biométrico, onde o lado direito é o selo do registro.
 *
 * Tamanho de fonte: 9px, abaixo do mínimo de 10px de `console.css`.
 * Deliberado e restrito a esta faixa: nada aqui é texto FUNCIONAL —
 * são as inscrições do aparelho, e o mínimo existe para o que a pessoa
 * precisa LER para jogar.
 *
 * A faixa sangra até a borda do card por margem negativa, e o valor
 * dela é o padding do card. Cards com padding diferente de 16px
 * declaram `--rc-cab-pad` (ver `.rc-ncol-card` em console.css).
 */

import type { ReactNode } from "react";

export function CabecalhoModulo({
  id,
  mod,
  children,
}: {
  /** Lado esquerdo, no formato `ID://NOME`. */
  id: string;
  /** Lado direito: a inscrição de catálogo do módulo. */
  mod?: string;
  /** Lado direito alternativo — um estado do próprio módulo (ex.: o selo do RPI). */
  children?: ReactNode;
}) {
  return (
    <div className="rc-modcab" aria-hidden="true">
      <span className="rc-modcab-id">{id}</span>
      {children ?? (mod ? <span className="rc-modcab-mod">{mod}</span> : null)}
    </div>
  );
}
