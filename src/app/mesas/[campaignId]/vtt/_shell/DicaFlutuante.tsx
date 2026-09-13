"use client";

/**
 * DICA que não é recortada por nada.
 *
 * A `.rv-dica` comum é `position: absolute` dentro do próprio controle
 * — e some quando o controle vive numa caixa que rola. Não é um caso
 * raro: o trilho de pastas do catálogo tem `overflow-y: auto`, e
 * overflow num eixo recorta nos DOIS, então a dica batia na borda da
 * coluna e era cortada. O balão nativo (`title`) resolve o recorte mas
 * traz o atraso e o desenho do sistema operacional, que não são os
 * desta mesa.
 *
 * Esta versão é `position: fixed` com a posição MEDIDA do alvo na hora
 * de abrir — a mesma receita que `BotaoDeclarar` (`_turnos`) já usava
 * pro trilho de facções, aqui separada pra ser reusada em vez de
 * copiada.
 *
 * Sem `title` em quem usa isto: o balão nativo apareceria por cima
 * deste, com outro atraso e outro estilo. O texto continua no
 * `aria-label`/`aria-describedby` de quem chama.
 */

import { useCallback, useState, type ReactNode } from "react";

export interface AlvoDaDica {
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => void;
  onMouseLeave: () => void;
  onFocus: (e: React.FocusEvent<HTMLElement>) => void;
  onBlur: () => void;
}

/**
 * Devolve os handlers pro alvo e o balão pra renderizar ao lado dele.
 *
 * `lado` decide de que lado do alvo o balão nasce: "esquerda" é o
 * padrão porque estas dicas vivem em colunas encostadas na borda
 * direita da tela, onde abrir pra direita sairia da janela.
 */
export function useDicaFlutuante(
  texto: string,
  opcoes: {
    /**
     * `"auto"` (padrão) escolhe o lado com ESPAÇO: a dica é `fixed`, e
     * por isso não é recortada por caixa nenhuma — mas ainda pode sair
     * da TELA, que foi o que aconteceu abrindo pra esquerda a partir do
     * trilho de pastas, encostado na borda esquerda da gaveta.
     */
    lado?: "esquerda" | "direita" | "auto";
    /**
     * Cor da espinha e do texto — quando a dica explica um elemento que
     * JÁ é uma cor (um selo de presença, por exemplo), repetir a cor
     * dele aqui é o que amarra os dois; com o acento padrão, a dica de
     * um selo verde e a de um âmbar sairiam idênticas e a leitura
     * dependeria de lembrar sobre qual ponto o cursor estava.
     */
    acento?: string;
  } = {},
): {
  alvo: AlvoDaDica;
  dica: ReactNode;
} {
  const { lado = "auto", acento } = opcoes;
  const [pos, setPos] = useState<{ x: number; y: number; lado: "esquerda" | "direita" } | null>(null);

  const abrir = useCallback((el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    // Largura típica de uma dica curta. Não dá pra medir antes de
    // existir, e medir depois faria o balão pular de lado na cara de
    // quem olha — o palpite decide o lado e o texto é curto por
    // construção (é uma dica, não um parágrafo).
    const FOLGA = 200;
    const resolvido: "esquerda" | "direita" = lado !== "auto"
      ? lado
      : r.left < FOLGA ? "direita" : "esquerda";
    setPos({
      x: resolvido === "esquerda" ? r.left - 10 : r.right + 10,
      y: r.top + r.height / 2,
      lado: resolvido,
    });
  }, [lado]);

  const fechar = useCallback(() => setPos(null), []);

  return {
    alvo: {
      onMouseEnter: (e) => abrir(e.currentTarget),
      onMouseLeave: fechar,
      onFocus: (e) => abrir(e.currentTarget),
      onBlur: fechar,
    },
    dica: pos ? (
      <span
        className="rv-dica rv-dica--fixa"
        // `data-lado="pn"` é o que desloca o balão pra esquerda do
        // ponto medido (translate -100%) — o mesmo atributo que o
        // trilho de facções usa, e a razão de ele existir no CSS.
        data-lado={pos.lado === "esquerda" ? "pn" : undefined}
        role="tooltip"
        style={{ left: pos.x, top: pos.y, ...(acento ? { "--jf-acento": acento, color: acento } as React.CSSProperties : {}) }}
      >
        {texto}
      </span>
    ) : null,
  };
}
