"use client";

/**
 * Coluna esquerda do Console: retrato, identidade (nome + ranking
 * cobalto), atributos com ícone, e os blocos de vitais.
 *
 * Integridade e Sobrecarga são FAIXAS de um painel contínuo, separadas
 * pelo rótulo (ciano x vermelho) — não dois cards com borda própria.
 * Deslocamento, PA e Reações têm cada um o seu card, como no design.
 *
 * Apresentação pura: recebe `character` e os derivados já calculados
 * (`computeDerivedStats`) e não recalcula nenhuma regra.
 */

import { MAX_OVERLOAD_SURGES_PER_DAY, type Character, type DerivedStats } from "../../../lib/character";

function IconCorpo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M6 11V7.5a1.5 1.5 0 0 1 3 0V11m0 0V6.5a1.5 1.5 0 0 1 3 0V11m0 0V7.5a1.5 1.5 0 0 1 3 0V11m0 0V9a1.5 1.5 0 0 1 3 0v5a6 6 0 0 1-6 6h-1a7 7 0 0 1-7-7v-1a1.5 1.5 0 0 1 3 0" />
    </svg>
  );
}
function IconMente() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 4a4 4 0 0 0-4 4 3 3 0 0 0-1 5.8V16a3 3 0 0 0 5 2.2 3 3 0 0 0 5-2.2v-2.2A3 3 0 0 0 16 8a4 4 0 0 0-4-4z" />
      <path d="M12 4v15" />
    </svg>
  );
}
function IconAnimo() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 20s-7-4.6-7-9.3A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7 3.7C19 15.4 12 20 12 20z" />
    </svg>
  );
}

const ATRIBUTOS = [
  { label: "Corpo", chave: "corpo", Icone: IconCorpo },
  { label: "Mente", chave: "mente", Icone: IconMente },
  { label: "Ânimo", chave: "animo", Icone: IconAnimo },
] as const;

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
        <span className="rc-portrait-glow" />
        <svg viewBox="0 0 120 150" className="rc-portrait-figure">
          <defs>
            <linearGradient id="rcBust" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6fe0ff" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#0d5e78" stopOpacity="0.15" />
            </linearGradient>
          </defs>
          <g fill="url(#rcBust)" stroke="#8ceaff" strokeOpacity="0.55" strokeWidth="1.2">
            <ellipse cx="60" cy="52" rx="25" ry="30" />
            <path d="M60 84c-20 0-36 13-40 32-1 6-2 12-2 18h84c0-6-1-12-2-18-4-19-20-32-40-32z" />
          </g>
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
        {ATRIBUTOS.map(({ label, chave, Icone }) => (
          <div key={chave} className="rc-attr">
            <span className="rc-attr-icon" aria-hidden="true">
              <Icone />
            </span>
            <span className="rc-attr-label">{label}</span>
            <span className="rc-attr-value">{character.atributos[chave]}</span>
          </div>
        ))}
      </div>

      {/* Integridade e Sobrecarga: faixas de um painel contínuo. */}
      <div className="rc-stack">
        <div className="rc-band">
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

        <div className="rc-band">
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
      </div>

      <div className="rc-panel rc-panel--accent">
        <div className="rc-readout">
          <span className="rc-block-label">Deslocamento</span>
          <span className="rc-readout-value">{derivados.andar_m}m</span>
        </div>
      </div>

      <div className="rc-panel">
        <span className="rc-dots" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} />
          ))}
        </span>
        <div className="rc-block-label" style={{ marginBottom: 8 }}>
          PA
        </div>
        <DiamondBlock disponivel={paDisponivel} total={derivados.pa_max} />
      </div>

      <div className="rc-panel">
        <div className="rc-block-label" style={{ marginBottom: 8 }}>
          Reações
        </div>
        <DiamondBlock disponivel={reacoesDisponiveis} total={derivados.reacoes_por_rodada} />
      </div>
    </div>
  );
}
