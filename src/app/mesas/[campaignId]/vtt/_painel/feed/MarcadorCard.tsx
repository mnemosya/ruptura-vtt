"use client";

/**
 * Card de MARCADOR no feed — avançou, recuou ou concluiu.
 *
 * Leitura em três tempos, do mais rápido ao mais detalhado:
 *   1. Espinha e cor dizem o TIPO (ciano Progresso, âmbar Pressão).
 *   2. O selo diz o que ACONTECEU (+2, −1, CONCLUÍDO/DISPARADO).
 *   3. A trilha mostra ONDE: os segmentos que entraram acendem, os que
 *      saíram ficam tracejados — o "antes → depois" sem texto.
 *
 * Concluir é o único momento que pede atenção: o card ganha brilho na
 * borda. Avanço comum é ritmo, não alarme.
 */

import type { CSSProperties } from "react";
import { CartaoBase } from "../ui/CartaoBase";
import type { CartaoMarcador } from "./contratos";
import { IconeTipoMarcador } from "../../_shell/FaixaMarcadores";
import { gradienteAnel, ROTULO_TIPO, SELO_CONCLUSAO } from "../../_dominio/marcadores";

type EstadoSegmento = "cheio" | "novo" | "saiu" | "vazio";

function segmentos(c: CartaoMarcador): EstadoSegmento[] {
  return Array.from({ length: c.total }, (_, i) => {
    if (i < Math.min(c.antes, c.depois)) return "cheio";
    if (i < c.depois) return "novo";
    if (i < c.antes) return "saiu";
    return "vazio";
  });
}

export function MarcadorCard({ cartao, hora, visibilidade }: {
  cartao: CartaoMarcador;
  hora: string;
  visibilidade?: React.ReactNode;
}) {
  const acento = cartao.tipoMarcador === "pressao" ? "am" : "cy";
  const delta = cartao.depois - cartao.antes;
  const concluido = cartao.evento === "concluido";
  const selo = concluido
    ? SELO_CONCLUSAO[cartao.tipoMarcador]
    : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} ${Math.abs(delta) === 1 ? "segmento" : "segmentos"}`;
  const verbo = concluido
    ? (cartao.tipoMarcador === "pressao" ? "A ameaça se cumpriu" : "O objetivo foi alcançado")
    : delta > 0 ? "Avançou" : "Recuou";

  return (
    <CartaoBase
      tipo={ROTULO_TIPO[cartao.tipoMarcador].toUpperCase()}
      nome={cartao.nome ?? <span className="pn-mk-sem-nome">Sem nome</span>}
      icone={<IconeTipoMarcador tipo={cartao.tipoMarcador} tamanho={14} />}
      acento={acento}
      autor={cartao.autoria.nome}
      hora={hora}
      horaISO={cartao.criadoEm}
      visibilidade={visibilidade}
      estado={<span className="pn-mk-selo" data-concluido={concluido || undefined}>{selo}</span>}
      testId="painel-feed-marcador"
      atributos={{ "data-kind": "marcador", ...(concluido ? { "data-concluido": "true" } : {}) }}
    >
      <div className="pn-mk">
        <span className="pn-mk-anel" aria-hidden="true">
          <span className="pn-mk-anel-seg" style={{ "--mk-anel": gradienteAnel(cartao.total, cartao.depois, "var(--pn-a)", "var(--pn-mk-vazio)") } as CSSProperties} />
          <span className="pn-mk-anel-miolo"><IconeTipoMarcador tipo={cartao.tipoMarcador} tamanho={13} /></span>
        </span>
        <div className="pn-mk-info">
          <div className="pn-mk-linha">
            <span className="pn-mk-verbo">{verbo}</span>
            <span className="pn-mk-conta" aria-label={`de ${cartao.antes} para ${cartao.depois} de ${cartao.total}`}>
              <span className="pn-mk-conta-antes">{cartao.antes}</span>
              <span className="pn-mk-conta-seta" aria-hidden="true">→</span>
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
