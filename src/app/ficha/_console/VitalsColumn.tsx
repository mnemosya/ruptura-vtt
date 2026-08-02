"use client";

/**
 * Coluna esquerda do Console do Personagem: retrato, identidade,
 * atributos, Integridade, Sobrecarga, Deslocamento, PA e Reações.
 *
 * Componente PURAMENTE de apresentação — recebe `character` e os
 * derivados já calculados (`computeDerivedStats`) e não recalcula
 * nenhuma regra. Todos os valores exibidos já existiam no modelo antes
 * do Console; nada aqui inventa número.
 */

import { MAX_OVERLOAD_SURGES_PER_DAY, type Character, type DerivedStats } from "../../../lib/character";

function PipTrack({ atual, max, danger }: { atual: number; max: number; danger?: boolean }) {
  // `max` vem de derivado e pode ser 0 se as regras não carregarem —
  // nesse caso não desenha trilha nenhuma em vez de um array vazio.
  const total = Math.max(0, Math.round(max));
  return (
    <div className="rc-pips">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className="rc-pip" data-on={i < atual} data-danger={danger && i < atual ? "true" : undefined} />
      ))}
    </div>
  );
}

function DiamondTrack({ disponivel, total }: { disponivel: number; total: number }) {
  const max = Math.max(0, Math.round(total));
  return (
    <div className="rc-diamonds">
      <div className="rc-diamond-row">
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className="rc-diamond" data-on={i < disponivel} />
        ))}
      </div>
      <span className="rc-diamond-count">
        {disponivel}/{max}
      </span>
    </div>
  );
}

export function VitalsColumn({ character, derivados }: { character: Character; derivados: DerivedStats }) {
  const integridade = character.recursos_atuais?.integridade ?? derivados.integridade_max;
  const integridadeCritica = derivados.integridade_max > 0 && integridade <= derivados.integridade_max / 4;

  const paMax = derivados.pa_max;
  const paDisponivel = Math.max(0, paMax - (character.estado_jogo?.pa_gastos ?? 0));
  const reacoesMax = derivados.reacoes_por_rodada;
  const reacoesDisponiveis = Math.max(0, reacoesMax - (character.estado_jogo?.reacoes_usadas ?? 0));

  const sobrecarga = character.sobrecarga_usada_dia ?? 0;

  return (
    <div className="rc-col">
      <div className="rc-portrait" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
        </svg>
      </div>

      <div className="rc-panel">
        <div className="rc-identity">
          <span className="rc-identity-name" title={character.nome || "Sem nome"}>
            {character.nome || "Sem nome"}
          </span>
          {/* Ranking cobalto — campo ainda não existe no modelo (pendência
              registrada no checkpoint). Mostra "—", nunca um valor inventado. */}
          <span className="rc-rank" data-empty="true" title="Ranking cobalto — ainda não definido no modelo">
            —
          </span>
        </div>

        <div className="rc-attrs" style={{ marginTop: 12 }}>
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
      </div>

      <div className="rc-panel">
        <div className="rc-track-head">
          <span className="rc-panel-title" style={{ marginBottom: 0 }}>
            Integridade
          </span>
          <span className="rc-track-value">
            {integridade}/{derivados.integridade_max}
          </span>
        </div>
        <PipTrack atual={integridade} max={derivados.integridade_max} danger={integridadeCritica} />

        <div className="rc-track-head" style={{ marginTop: 14 }}>
          <span className="rc-panel-title" style={{ marginBottom: 0 }}>
            Sobrecarga
          </span>
          <span className="rc-track-value">
            {sobrecarga}/{MAX_OVERLOAD_SURGES_PER_DAY}
          </span>
        </div>
        <div className="rc-segments">
          {Array.from({ length: MAX_OVERLOAD_SURGES_PER_DAY }, (_, i) => (
            <span key={i} className="rc-segment" data-on={i < sobrecarga} />
          ))}
        </div>
      </div>

      <div className="rc-readout">
        <span className="rc-readout-label">Deslocamento</span>
        <span className="rc-readout-value">
          {derivados.andar_m}m <span style={{ opacity: 0.5, fontSize: 11 }}>/ {derivados.correr_m}m</span>
        </span>
      </div>

      <div className="rc-panel">
        <div className="rc-panel-title">PA</div>
        <DiamondTrack disponivel={paDisponivel} total={paMax} />
        <div className="rc-panel-title" style={{ marginTop: 12 }}>
          Reações
        </div>
        <DiamondTrack disponivel={reacoesDisponiveis} total={reacoesMax} />
      </div>
    </div>
  );
}
