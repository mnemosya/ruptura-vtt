import type { ReactNode } from "react";

/**
 * Ícone chato (SVG) de dado poliédrico — porte literal de
 * `chat % dice tray/src/lib/dice-shapes.tsx`. Estados: normal, `active`
 * (acento + brilho), `dim` (pool ainda não rolado) e `landed` (animação
 * de pouso, escalonada por `rollIndex`).
 */

type Shape = {
  outer: ReactNode; facets: ReactNode; ty: number;
  /** Topo e altura da silhueta no sistema original de cada forma. */
  by: number; bh: number;
};

/**
 * Faixa vertical canônica.
 *
 * As silhuetas foram portadas uma a uma e cada uma nasceu com a sua
 * própria altura (o d6 ocupava 58 unidades; o d20, 90). Lado a lado na
 * paleta isso lia como desalinhamento, não como formas diferentes. Aqui
 * todas são reescaladas pra MESMA faixa — o que varia entre elas passa
 * a ser só a silhueta. */
const FAIXA_TOPO = 8;
const FAIXA_ALTURA = 84;

function shapeFor(sides: number): Shape {
  switch (sides) {
    case 4:
      return {
        outer: <polygon points="50,10 91,84 9,84" />,
        facets: <polygon points="31,49 69,49 50,84" fill="none" />,
        ty: 66,
        by: 10, bh: 74,
      };
    case 6:
      return {
        outer: <rect x="21" y="21" width="58" height="58" rx="7" />,
        facets: <rect x="34" y="34" width="32" height="32" rx="3" fill="none" />,
        ty: 52,
        by: 21, bh: 58,
      };
    case 8:
      return {
        outer: <polygon points="50,6 86,50 50,94 14,50" />,
        facets: <path d="M14 50 H86 M50 6 L36 50 L50 94 M50 6 L64 50 L50 94" fill="none" />,
        ty: 51,
        by: 6, bh: 88,
      };
    case 10:
      return {
        outer: <polygon points="50,6 86,42 50,94 14,42" />,
        facets: <path d="M14 42 H86 M50 6 L34 42 L50 58 L66 42 M50 58 L50 94" fill="none" />,
        ty: 40,
        by: 6, bh: 88,
      };
    case 12:
      return {
        outer: <polygon points="50,6 90,37 73,89 27,89 10,37" />,
        facets: (
          <>
            <polygon points="50,30 70,44 63,70 37,70 30,44" fill="none" />
            <path d="M50 6 L50 30 M90 37 L70 44 M73 89 L63 70 M27 89 L37 70 M10 37 L30 44" fill="none" />
          </>
        ),
        ty: 55,
        by: 6, bh: 83,
      };
    /**
     * PERCENTIL — DUAS pipas espelhadas, muito sobrepostas.
     *
     * Um d10 com um traço a mais era um d10: lado a lado na paleta os
     * dois liam como o mesmo dado, que é justamente o erro que a
     * silhueta existe pra evitar. O par também é o que a mesa faz —
     * percentil se rola com duas peças, dezena e unidade.
     *
     * A sobreposição é o que torna o par viável neste tamanho. Duas
     * pipas inteiras lado a lado exigiriam afinar cada uma (0,59 de
     * largura por altura, contra os 0,82 do d10) e as duas saíam
     * esguias; empilhadas na diagonal, viravam uma peça em cima da
     * outra. Espelhadas em torno do eixo, cada uma fica com 60×88 e o
     * par ocupa 94×88 — pouco mais largo que o d10 sozinho (72×88),
     * simétrico, e ainda na mesma faixa de altura das outras.
     *
     * As facetas ficam só na cintura e no eixo de cada metade: com o
     * desenho interno completo do d10 duplicado, a 46px o glifo virava
     * rabisco.
     */
    case 100:
      return {
        outer: (
          <>
            <polygon points="33,6 63,42 33,94 3,42" />
            <polygon points="67,6 97,42 67,94 37,42" />
          </>
        ),
        facets: <path d="M3 42 H63 M37 42 H97 M33 6 V94 M67 6 V94" fill="none" />,
        ty: 40,
        by: 6, bh: 88,
      };
    case 20:
    default:
      return {
        outer: <polygon points="50,5 88,27 88,73 50,95 12,73 12,27" />,
        facets: (
          <>
            <polygon points="50,30 76,70 24,70" fill="none" />
            <path d="M50 30 L50 5 M76 70 L88 73 M24 70 L12 73 M50 95 L76 70 M50 95 L24 70 M88 27 L50 30 M12 27 L50 30" fill="none" />
          </>
        ),
        ty: 57,
        by: 5, bh: 90,
      };
  }
}

export function PolyDie({
  sides,
  value,
  active = false,
  dim = false,
  landed = false,
  rollIndex = 0,
  accent = "#45b8c9",
  soft = "rgba(69,184,201,0.14)",
  size = 40,
  label,
  semValor = false,
}: {
  sides: number;
  value?: number | string;
  active?: boolean;
  dim?: boolean;
  landed?: boolean;
  rollIndex?: number;
  accent?: string;
  soft?: string;
  size?: number;
  label?: string;
  /**
   * Silhueta limpa, sem número dentro.
   *
   * Na PALETA o número não é resultado, é o nome do dado — e nome não
   * mora dentro da peça, mora embaixo dela, onde não disputa espaço
   * com a silhueta nem muda de tamanho conforme o dado tem um ou três
   * dígitos (d100). Quando há valor rolado, ele continua dentro: aí
   * sim é a face que saiu.
   */
  semValor?: boolean;
}) {
  const s = shapeFor(sides);
  const stroke = active ? accent : dim ? "#2a3b58" : "#43597c";
  const fill = active ? soft : "transparent";
  const textColor = active ? accent : dim ? "#42597c" : "#a9b9d4";
  const landAnim = landed ? { animationDelay: `${Math.min(rollIndex, 6) * 0.04}s` } : undefined;
  /* face padrão = valor máximo do dado */
  const displayValue = value ?? sides;

  // Reescala a silhueta pra faixa canônica. O traço é dividido pelo
  // mesmo fator, senão o d6 (que cresce 1,45×) sairia com a borda
  // visivelmente mais grossa que a do d20.
  const k = FAIXA_ALTURA / s.bh;
  const transform = `translate(${(50 - 50 * k).toFixed(3)} ${(FAIXA_TOPO - s.by * k).toFixed(3)}) scale(${k.toFixed(4)})`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={landed ? "rup-land" : undefined}
      style={{
        ...landAnim,
        filter: active ? `drop-shadow(0 0 5px ${accent}aa)` : undefined,
        display: "block",
      }}
      aria-hidden="true"
    >
      <g transform={transform}>
        {/* `fillOpacity` MULTIPLICA o alfa do `soft` em vez de trocar a
            cor por outra: o mesmo `soft` pinta o fundo da faixa de
            resultado, e mexer nele lá fora escureceria as duas coisas.
            Aqui o miolo pede menos peso — com o alfa cheio, uma fileira
            inteira de dados acesos virava uma mancha de cor. */}
        <g fill={fill} fillOpacity={active ? 0.6 : 1} stroke={stroke} strokeWidth={4.5 / k} strokeLinejoin="round">{s.outer}</g>
        <g fill="none" stroke={stroke} strokeWidth={2.5 / k} strokeLinejoin="round" strokeLinecap="round" opacity={0.45}>{s.facets}</g>
        {!semValor && (
          <text x="50" y={s.ty} textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-mono), 'JetBrains Mono', monospace" fontSize={30 / k} fontWeight="700" fill={textColor}>
            {displayValue}
          </text>
        )}
      </g>
      {label && (
        <text x="50" y="99" textAnchor="middle" fontFamily="var(--font-mono), 'JetBrains Mono', monospace" fontSize="14" fontWeight="700" fill={stroke} opacity="0.9">
          {label}
        </text>
      )}
    </svg>
  );
}
