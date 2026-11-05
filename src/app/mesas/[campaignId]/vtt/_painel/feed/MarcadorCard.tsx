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
 * O anel usa o mesmo `conic-gradient` e a mesma máscara radial do
 * protótipo do Chat Log.
 *
 * Concluir é o único momento que pede atenção: selo sólido e brilho na
 * borda. Avanço comum é ritmo, não alarme.
 */

import { CartaoBase } from "../ui/CartaoBase";
import { CircleDot } from "lucide-react";
import type { CartaoMarcador } from "./contratos";
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

function AnelSvg({ cartao }: { cartao: CartaoMarcador }) {
  const estados = segmentos(cartao);
  const passo = 360 / Math.max(estados.length, 1);
  const cor = cartao.tipoMarcador === "pressao" ? "#ff6b7d" : "#00d4ff";
  const fatias = estados.flatMap((estado, i) => {
    const inicio = i * passo;
    const fim = (i + 1) * passo;
    const preenchimento = estado === "vazio" || estado === "saiu" ? "rgba(127,149,179,.3)" : cor;
    return [`transparent ${inicio}deg ${inicio + 5}deg`, `${preenchimento} ${inicio + 5}deg ${fim - 5}deg`, `transparent ${fim - 5}deg ${fim}deg`];
  }).join(", ");
  return (
    <span className="pn-mk-anel" aria-hidden="true" style={{ background: `conic-gradient(${fatias})` }} />
  );
}

export function MarcadorCard({ cartao, hora, visibilidade }: {
  cartao: CartaoMarcador;
  hora: string;
  visibilidade?: React.ReactNode;
}) {
  const acento = cartao.tipoMarcador === "pressao" ? "perigo" : "cy";
  const delta = cartao.depois - cartao.antes;
  const concluido = cartao.evento === "concluido";
  const tipo = ROTULO_TIPO[cartao.tipoMarcador];
  const acao = `${cartao.antes} → ${cartao.depois} de ${cartao.total}`;

  return (
    <CartaoBase
      tipo={`Marcador de ${tipo.toLowerCase()}`}
      icone={<CircleDot />}
      nome={undefined}
      acento={acento}
      autor={cartao.evento === "concluido" ? tipo.toLowerCase() : `${tipo.toLowerCase()} ${cartao.evento === "avancou" ? "avançou" : "recuou"}`}
      hora={hora}
      horaISO={cartao.criadoEm}
      visibilidade={visibilidade}
      testId="painel-feed-marcador"
      atributos={{ "data-kind": "marcador", ...(concluido ? { "data-concluido": "true" } : {}) }}
    >
      <div className="pn-mk">
        <AnelSvg cartao={cartao} />
        <div className="pn-mk-info">
          <span className="pn-mk-nome">{cartao.nome ?? tipo}</span>
          <div className="pn-mk-linha">
            {concluido
              ? <span className="pn-mk-selo">{SELO_CONCLUSAO[cartao.tipoMarcador]}</span>
              : <span className="pn-mk-acao" data-sentido={delta > 0 ? "mais" : "menos"}>{acao}</span>}
            <span className="pn-mk-conta" aria-label={`de ${cartao.antes} para ${cartao.depois} de ${cartao.total}`} />
          </div>
          <div className="pn-mk-trilha" aria-hidden="true">
            {segmentos(cartao).map((e, i) => <span key={i} className="pn-mk-seg" data-estado={e} />)}
          </div>
        </div>
      </div>
    </CartaoBase>
  );
}
