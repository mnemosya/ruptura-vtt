"use client";

/**
 * Coluna esquerda do Console: retrato, identidade (nome + ranking
 * cobalto), atributos e — cada um em SEU PRÓPRIO CARD, como no
 * wireframe — Integridade, Sobrecarga, Deslocamento, PA e Reações.
 *
 * Apresentação pura: recebe `character` e os derivados já calculados
 * (`computeDerivedStats`) e não recalcula nenhuma regra.
 */

import { MAX_OVERLOAD_SURGES_PER_DAY, type Character, type DerivedStats } from "../../../lib/character";

function Dots({ className }: { className?: string }) {
  return (
    <span className={`rc-dots ${className ?? ""}`} aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} />
      ))}
    </span>
  );
}

function DiamondBlock({ disponivel, total }: { disponivel: number; total: number }) {
  const max = Math.max(0, Math.round(total));
  return (
    <div className="rc-diamonds">
      <div className="rc-diamond-row">
        {max === 0 ? (
          <span style={{ fontSize: 11, opacity: 0.4 }}>—</span>
        ) : (
          Array.from({ length: max }, (_, i) => <span key={i} className="rc-diamond" data-on={i < disponivel} />)
        )}
      </div>
      <span className="rc-diamond-tag">
        {disponivel}/{max}
      </span>
    </div>
  );
}

export function VitalsColumn({ character, derivados }: { character: Character; derivados: DerivedStats }) {
  const integridade = character.recursos_atuais?.integridade ?? derivados.integridade_max;
  const integridadeCritica = derivados.integridade_max > 0 && integridade <= derivados.integridade_max / 4;
  const paDisponivel = Math.max(0, derivados.pa_max - (character.estado_jogo?.pa_gastos ?? 0));
  const reacoesDisponiveis = Math.max(0, derivados.reacoes_por_rodada - (character.estado_jogo?.reacoes_usadas ?? 0));
  const sobrecarga = character.sobrecarga_usada_dia ?? 0;

  return (
    <div className="rc-col">
      <div className="rc-portrait" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
        </svg>
      </div>

      <div className="rc-identity">
        <span className="rc-identity-name" title={character.nome || "Sem nome"}>
          {character.nome || "Sem nome"}
        </span>
        {/* Ranking cobalto — campo ainda não existe no modelo (pendência
            no checkpoint). Mostra "—", nunca um valor inventado. */}
        <span className="rc-rank" data-empty="true" title="Ranking cobalto — ainda não definido no modelo">
          —
        </span>
      </div>

      <div className="rc-attrs">
        {(
          [
            ["Corpo", character.atributos.corpo],
            ["Mente", character.atributos.mente],
            ["Ânimo", character.atributos.animo],
          ] as const
        ).map(([label, valor]) => (
          <div key={label} className="rc-attr">
            <span className="rc-attr-label">{label}</span>
            <span className="rc-attr-value">{valor}</span>
          </div>
        ))}
      </div>

      {/* Integridade — card próprio. */}
      <div className="rc-panel rc-brackets">
        <div className="rc-block-head">
          <span className="rc-block-label">Integridade</span>
          <span className="rc-block-value">
            {integridade}/{derivados.integridade_max}
          </span>
        </div>
        <div className="rc-pips">
          {Array.from({ length: Math.max(0, Math.round(derivados.integridade_max)) }, (_, i) => (
            <span
              key={i}
              className="rc-pip"
              data-on={i < integridade}
              data-danger={integridadeCritica && i < integridade ? "true" : undefined}
            />
          ))}
        </div>
      </div>

      {/* Sobrecarga — card próprio, separado de Integridade. */}
      <div className="rc-panel">
        <div className="rc-block-head">
          <span className="rc-block-label rc-block-label--am">Sobrecarga</span>
          <span className="rc-block-value">
            {sobrecarga}/{MAX_OVERLOAD_SURGES_PER_DAY}
          </span>
        </div>
        <div className="rc-segments">
          {Array.from({ length: MAX_OVERLOAD_SURGES_PER_DAY }, (_, i) => (
            <span key={i} className="rc-segment" data-on={i < sobrecarga} />
          ))}
        </div>
      </div>

      {/* Deslocamento — card próprio. */}
      <div className="rc-panel rc-panel--accent">
        <div className="rc-readout">
          <span className="rc-block-label">Deslocamento</span>
          <span className="rc-readout-value">
            {derivados.andar_m}m <small>/ {derivados.correr_m}m</small>
          </span>
        </div>
      </div>

      {/* PA — card próprio. */}
      <div className="rc-panel rc-brackets">
        <Dots />
        <div className="rc-block-label" style={{ marginBottom: 8 }}>
          PA
        </div>
        <DiamondBlock disponivel={paDisponivel} total={derivados.pa_max} />
      </div>

      {/* Reações — card próprio. */}
      <div className="rc-panel">
        <div className="rc-block-label" style={{ marginBottom: 8 }}>
          Reações
        </div>
        <DiamondBlock disponivel={reacoesDisponiveis} total={derivados.reacoes_por_rodada} />
      </div>
    </div>
  );
}
