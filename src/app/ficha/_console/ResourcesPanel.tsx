"use client";

/**
 * Recursos (PV / PE / Mana) + Colapso.
 *
 * O Colapso fica encostado nos recursos de propósito: a regra dispara
 * quando PV ou PE chega a 0 (`collapse.ts`), então a adjacência
 * espacial comunica a mecânica — é assim no wireframe do Console.
 *
 * As barras exibem a camada TEMPORÁRIA (`pv_temporario`,
 * `mana_temporaria`) sobreposta ao preenchimento normal. Sem ela o
 * Console esconderia um valor que o motor já mantém e que o descanso
 * longo zera.
 *
 * Apresentação pura: nenhum recurso é recalculado aqui.
 */

import { MAX_COLLAPSE_SEGMENTS, type Character, type DerivedStats } from "../../../lib/character";

type Tone = "pv" | "pe" | "mana";

function pct(valor: number, max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(100, (valor / max) * 100));
}

function ResourceBar({
  label,
  atual,
  max,
  temporario = 0,
  tone,
}: {
  label: string;
  atual: number;
  max: number;
  temporario?: number;
  tone: Tone;
}) {
  const base = pct(atual, max);
  // A camada temporária começa onde o preenchimento normal termina e
  // nunca ultrapassa a barra (temp pode exceder o máximo por regra).
  const temp = Math.min(pct(temporario, max), 100 - base);
  const critico = max > 0 && atual <= 0;

  return (
    <div className="rc-resource-row">
      <span className="rc-resource-label">{label}</span>
      <div className="rc-resource-bar" data-tone={tone} data-critical={critico}>
        <span className="rc-resource-fill" style={{ width: `${base}%` }} />
        {temp > 0 && <span className="rc-resource-temp" style={{ left: `${base}%`, width: `${temp}%` }} />}
        <span className="rc-resource-value">
          {atual}
          {temporario > 0 ? ` (+${temporario})` : ""}/{max}
        </span>
      </div>
    </div>
  );
}

export function ResourcesPanel({ character, derivados }: { character: Character; derivados: DerivedStats }) {
  const recursos = character.recursos_atuais ?? {};
  const colapso = character.colapso;
  const colapsoAtivo = colapso?.ativo === true;

  return (
    <div className="rc-col">
      <div
        className="rc-collapse"
        data-active={colapsoAtivo}
        data-testid="console-colapso"
        title={colapsoAtivo ? "Colapso ativo" : "Sem colapso"}
      >
        <span className="rc-collapse-label">Colapso</span>
        {colapsoAtivo ? (
          <span className="rc-collapse-note">
            {colapso?.tipo === "pe" ? "mental" : "físico"}
            {colapso?.estabilizado ? " · estabilizado" : ""}
            {colapso?.desfecho ? ` · ${colapso.desfecho}` : ""}
          </span>
        ) : (
          <span className="rc-collapse-note" style={{ color: "rgba(184,216,232,0.45)" }}>
            inativo
          </span>
        )}
        <span className="rc-collapse-segments">
          {Array.from({ length: MAX_COLLAPSE_SEGMENTS }, (_, i) => (
            <span key={i} className="rc-collapse-seg" data-on={i < (colapso?.segmentos ?? 0)} />
          ))}
        </span>
      </div>

      <div className="rc-panel">
        <div className="rc-panel-title">Recursos</div>
        <div className="rc-resources">
          <ResourceBar
            label="PV"
            tone="pv"
            atual={recursos.pv ?? derivados.pv_max}
            max={derivados.pv_max}
            temporario={recursos.pv_temporario ?? 0}
          />
          <ResourceBar label="PE" tone="pe" atual={recursos.pe ?? derivados.pe_max} max={derivados.pe_max} />
          <ResourceBar
            label="Mana"
            tone="mana"
            atual={recursos.mana ?? derivados.mana_max}
            max={derivados.mana_max}
            temporario={recursos.mana_temporaria ?? 0}
          />
        </div>
      </div>
    </div>
  );
}
