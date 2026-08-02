"use client";

/**
 * Topo da coluna central: COLAPSO (barra vertical angulada) à ESQUERDA
 * dos RECURSOS (três barras anguladas e segmentadas), exatamente como
 * no wireframe — as barras não ficam empilhadas dentro de um card.
 *
 * A adjacência é intencional e mecânica: o Colapso dispara quando PV ou
 * PE chega a 0 (`collapse.ts`).
 *
 * As barras exibem a camada TEMPORÁRIA (`pv_temporario`,
 * `mana_temporaria`) como segmentos hachurados — o motor já mantém
 * esses valores, e escondê-los perderia informação real.
 *
 * Apresentação pura: nada é recalculado aqui.
 */

import { MAX_COLLAPSE_SEGMENTS, type Character, type DerivedStats } from "../../../lib/character";

type Tone = "pv" | "pe" | "mana";

/** Teto de segmentos desenhados — acima disso a barra vira ruído visual. */
const MAX_SEGMENTS = 16;

function IconPv() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconPe() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}
function IconMana() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

function ResourceBar({
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
  const segCount = maxSeguro > 0 ? Math.min(Math.round(maxSeguro), MAX_SEGMENTS) : 1;
  const porSeg = maxSeguro > 0 ? maxSeguro / segCount : 0;

  const cheios = porSeg > 0 ? Math.min(segCount, Math.round(atual / porSeg)) : 0;
  // Segmentos temporários entram DEPOIS dos cheios e nunca estouram a barra.
  const temps = porSeg > 0 ? Math.min(segCount - cheios, Math.round(temporario / porSeg)) : 0;

  return (
    <div className="rc-res-row" data-tone={tone}>
      <span className="rc-res-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="rc-res-track">
        {Array.from({ length: segCount }, (_, i) => (
          <span
            key={i}
            className="rc-res-seg"
            data-on={i < cheios}
            data-temp={i >= cheios && i < cheios + temps ? "true" : undefined}
          />
        ))}
      </span>
      <span className="rc-res-value">
        {atual}
        {temporario > 0 ? `+${temporario}` : ""}/{maxSeguro}
      </span>
      <span className="rc-res-label">{label}</span>
    </div>
  );
}

export function ResourcesRow({ character, derivados }: { character: Character; derivados: DerivedStats }) {
  const recursos = character.recursos_atuais ?? {};
  const colapso = character.colapso;
  const colapsoAtivo = colapso?.ativo === true;

  return (
    <div className="rc-vitals-row">
      <div className="rc-collapse-col">
        <span className="rc-axis-label rc-axis-label--collapse">Colapso</span>
        <div className="rc-collapse-bar" data-testid="console-colapso" data-active={colapsoAtivo}>
          {Array.from({ length: MAX_COLLAPSE_SEGMENTS }, (_, i) => (
            <span key={i} className="rc-collapse-seg" data-on={i < (colapso?.segmentos ?? 0)} />
          ))}
        </div>
        <span className="rc-collapse-state">
          {colapsoAtivo
            ? `${colapso?.tipo === "pe" ? "mental" : "físico"}${colapso?.estabilizado ? " · estável" : ""}`
            : "inativo"}
        </span>
      </div>

      <div className="rc-res-col">
        <span className="rc-axis-label rc-axis-label--res">Recursos</span>
        <div className="rc-res-list">
          <ResourceBar
            label="PV"
            tone="pv"
            icon={<IconPv />}
            atual={recursos.pv ?? derivados.pv_max}
            max={derivados.pv_max}
            temporario={recursos.pv_temporario ?? 0}
          />
          <ResourceBar
            label="PE"
            tone="pe"
            icon={<IconPe />}
            atual={recursos.pe ?? derivados.pe_max}
            max={derivados.pe_max}
          />
          <ResourceBar
            label="Mana"
            tone="mana"
            icon={<IconMana />}
            atual={recursos.mana ?? derivados.mana_max}
            max={derivados.mana_max}
            temporario={recursos.mana_temporaria ?? 0}
          />
        </div>
      </div>
    </div>
  );
}
