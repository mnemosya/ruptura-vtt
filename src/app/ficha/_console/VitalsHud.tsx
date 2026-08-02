"use client";

/**
 * Colapso + Recursos — barras anguladas com hachura diagonal, como no
 * wireframe. Cada barra de recurso é UMA peça só (não segmentos
 * discretos), preenchida proporcionalmente com uma textura de hachura;
 * o Colapso tem 3 segmentos anguladas separados, também hachurados
 * quando ativos.
 *
 * A camada TEMPORÁRIA (`pv_temporario`, `mana_temporaria`) aparece como
 * uma faixa extra hachurada em branco depois da faixa cheia — o motor
 * já mantém esses valores.
 *
 * Apresentação pura: nada é recalculado aqui.
 */

import { MAX_COLLAPSE_SEGMENTS, type Character, type DerivedStats } from "../../../lib/character";

type Tone = "pv" | "pe" | "mana";

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconBolt() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}
function IconRing() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

function ResourceRow({
  label,
  atual,
  max,
  temporario = 0,
  tone,
  icon,
}: {
  label: string;
  atual: number;
  max: number;
  temporario?: number;
  tone: Tone;
  icon: React.ReactNode;
}) {
  const maxSeguro = Number.isFinite(max) && max > 0 ? max : 0;
  const pctCheio = maxSeguro > 0 ? Math.max(0, Math.min(100, (atual / maxSeguro) * 100)) : 0;
  const pctTemp = maxSeguro > 0 ? Math.max(0, Math.min(100 - pctCheio, (temporario / maxSeguro) * 100)) : 0;

  return (
    <div className="rc-hud-row" data-tone={tone} data-critical={maxSeguro > 0 && atual <= 0}>
      <span className="rc-hud-ico" aria-hidden="true">
        {icon}
      </span>
      <span className="rc-hud-bar">
        <span className="rc-hud-fill" style={{ width: `${pctCheio}%` }} />
        {pctTemp > 0 && (
          <span className="rc-hud-fill" data-temp="true" style={{ left: `${pctCheio}%`, width: `${pctTemp}%` }} />
        )}
      </span>
      <span className="rc-hud-val">
        {atual}
        {temporario > 0 ? `+${temporario}` : ""}/{maxSeguro}
        <small>{label}</small>
      </span>
    </div>
  );
}

export function VitalsHud({ character, derivados }: { character: Character; derivados: DerivedStats }) {
  const recursos = character.recursos_atuais ?? {};
  const colapso = character.colapso;
  const colapsoAtivo = colapso?.ativo === true;

  return (
    <div className="rc-hud">
      <div className="rc-hud-cls-wrap">
        <span className="rc-hud-cls-label">Colapso</span>
        <div className="rc-hud-cls" data-testid="console-colapso">
          {Array.from({ length: MAX_COLLAPSE_SEGMENTS }, (_, i) => (
            <span key={i} className="rc-hud-cls-seg" data-on={i < (colapso?.segmentos ?? 0)} />
          ))}
        </div>
        <span className="rc-hud-cls-state">
          {colapsoAtivo
            ? `${colapso?.tipo === "pe" ? "mental" : "físico"}${colapso?.estabilizado ? " · estável" : ""}`
            : "inativo"}
        </span>
      </div>

      <div className="rc-hud-res">
        <span className="rc-hud-res-label">Recursos</span>
        <ResourceRow
          label="PV"
          tone="pv"
          icon={<IconPlus />}
          atual={recursos.pv ?? derivados.pv_max}
          max={derivados.pv_max}
          temporario={recursos.pv_temporario ?? 0}
        />
        <ResourceRow
          label="PE"
          tone="pe"
          icon={<IconBolt />}
          atual={recursos.pe ?? derivados.pe_max}
          max={derivados.pe_max}
        />
        <ResourceRow
          label="Mana"
          tone="mana"
          icon={<IconRing />}
          atual={recursos.mana ?? derivados.mana_max}
          max={derivados.mana_max}
          temporario={recursos.mana_temporaria ?? 0}
        />
      </div>
    </div>
  );
}
