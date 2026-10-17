"use client";

/**
 * Card de MARCADOR no feed — avançou, recuou ou concluiu.
 *
 * Uma linha de leitura, no padrão dos cards do chat:
 *   · título: o nome do marcador (sem nome, o próprio tipo — nunca um
 *     "Sem nome" gritando em caixa alta);
 *   · corpo: anel com o estado novo, o que aconteceu (+2 / −1) na cor do
 *     tipo, a contagem em destaque e a trilha antes → depois.
 *
 * O anel é SVG (arcos por `stroke-dasharray`), não `conic-gradient` com
 * máscara: dentro do chat a máscara não se aplica e o anel virava um
 * quadrado sólido.
 *
 * Concluir é o único momento que pede atenção: selo sólido e brilho na
 * borda. Avanço comum é ritmo, não alarme.
 */

import { CartaoBase } from "../ui/CartaoBase";
import type { CartaoMarcador } from "./contratos";
import { IconeTipoMarcador } from "../../_shell/FaixaMarcadores";
import { ROTULO_TIPO, SELO_CONCLUSAO } from "../../_dominio/marcadores";

type EstadoSegmento = "cheio" | "novo" | "saiu" | "vazio";

function segmentos(c: CartaoMarcador): EstadoSegmento[] {
  return Array.from({ length: c.total }, (_, i) => {
    if (i < Math.min(c.antes, c.depois)) return "cheio";
    if (i < c.depois) return "novo";
    if (i < c.antes) return "saiu";
    return "vazio";
  });
}

const RAIO = 17;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

function AnelSvg({ cartao }: { cartao: CartaoMarcador }) {
  const passo = CIRCUNFERENCIA / cartao.total;
  const vao = cartao.total > 8 ? 2 : 3;
  return (
    <span className="pn-mk-anel" aria-hidden="true">
      <svg viewBox="0 0 44 44" width="44" height="44">
        <g transform="rotate(-90 22 22)">
          {segmentos(cartao).map((estado, i) => (
            <circle
              key={i}
              className="pn-mk-arco"
              data-estado={estado}
              cx="22" cy="22" r={RAIO}
              fill="none" strokeWidth="5"
              strokeDasharray={`${passo - vao} ${CIRCUNFERENCIA - passo + vao}`}
              strokeDashoffset={-(i * passo + vao / 2)}
            />
          ))}
        </g>
      </svg>
      <span className="pn-mk-anel-ico"><IconeTipoMarcador tipo={cartao.tipoMarcador} tamanho={12} /></span>
    </span>
  );
}

export function MarcadorCard({ cartao, hora, visibilidade }: {
  cartao: CartaoMarcador;
  hora: string;
  visibilidade?: React.ReactNode;
}) {
  const acento = cartao.tipoMarcador === "pressao" ? "am" : "cy";
  const delta = cartao.depois - cartao.antes;
  const concluido = cartao.evento === "concluido";
  const tipo = ROTULO_TIPO[cartao.tipoMarcador];
  const acao = delta > 0 ? `Avançou +${delta}` : `Recuou −${Math.abs(delta)}`;

  return (
    <CartaoBase
      tipo={`Marcador de ${tipo.toLowerCase()}`}
      nome={cartao.nome ?? tipo}
      acento={acento}
      autor={cartao.autoria.nome}
      hora={hora}
      horaISO={cartao.criadoEm}
      visibilidade={visibilidade}
      testId="painel-feed-marcador"
      atributos={{ "data-kind": "marcador", ...(concluido ? { "data-concluido": "true" } : {}) }}
    >
      <div className="pn-mk">
        <AnelSvg cartao={cartao} />
        <div className="pn-mk-info">
          <div className="pn-mk-linha">
            {concluido
              ? <span className="pn-mk-selo">{SELO_CONCLUSAO[cartao.tipoMarcador]}</span>
              : <span className="pn-mk-acao" data-sentido={delta > 0 ? "mais" : "menos"}>{acao}</span>}
            <span className="pn-mk-conta" aria-label={`de ${cartao.antes} para ${cartao.depois} de ${cartao.total}`}>
              <span className="pn-mk-conta-depois">{cartao.depois}</span>
              <span className="pn-mk-conta-total">/{cartao.total}</span>
            </span>
          </div>
          <div className="pn-mk-trilha" aria-hidden="true">
            {segmentos(cartao).map((e, i) => <span key={i} className="pn-mk-seg" data-estado={e} />)}
          </div>
        </div>
      </div>
    </CartaoBase>
  );
}
