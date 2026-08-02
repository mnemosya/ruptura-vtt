"use client";

/**
 * Colapso + Recursos — terceira reconstrução deste bloco.
 *
 * Nome e classes CSS (`rc-hud-*`) exclusivos deste arquivo — nada
 * reaproveitado das duas tentativas anteriores (`ResourcesRow.tsx` e
 * o CSS `rc-vit-*`/`rc-cls-*`/`rc-res-*`, ambos apagados). Correções
 * pedidas sobre o resultado anterior, que ficou visualmente idêntico:
 *
 * 1. Espessura: os segmentos de recurso eram hairlines finas — agora
 *    são blocos grossos (~22px), cada um um paralelogramo isolado.
 * 2. Ângulo: o painel de Colapso estava reto/vertical — agora ele
 *    INTEIRO é inclinado (skew), com as 3 barras internas herdando a
 *    mesma inclinação, não só os segmentos do recurso.
 * 3. O valor ("13/13 PV") vira um selo com 3 células visíveis (corte |
 *    número | unidade), separadas por divisor interno.
 *
 * A adjacência Colapso-junto-de-Recursos é mecânica: o Colapso dispara
 * quando PV ou PE chega a 0 (`collapse.ts`). A camada TEMPORÁRIA
 * (`pv_temporario`, `mana_temporaria`) aparece como segmentos
 * hachurados depois dos cheios — o motor já mantém esses valores.
 *
 * Apresentação pura: nada é recalculado aqui.
 */

import type { ReactNode } from "react";
import { MAX_COLLAPSE_SEGMENTS, type Character, type DerivedStats } from "../../../lib/character";

type Tone = "pv" | "pe" | "mana";

/** Teto de segmentos desenhados — acima disso vira ruído visual. */
const MAX_SEGMENTS = 14;

function IconPv() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M10 2h4v6h6v4h-6v6h-4v-6H4V8h6V2z" />
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
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
  icon: ReactNode;
}) {
  const maxSeguro = Number.isFinite(max) && max > 0 ? max : 0;
  const segCount = maxSeguro > 0 ? Math.min(Math.round(maxSeguro), MAX_SEGMENTS) : 1;
  const porSeg = maxSeguro > 0 ? maxSeguro / segCount : 0;

  const cheios = porSeg > 0 ? Math.min(segCount, Math.round(atual / porSeg)) : 0;
  const temps = porSeg > 0 ? Math.min(segCount - cheios, Math.round(temporario / porSeg)) : 0;

  return (
    <div className="rc-hud-row" data-tone={tone} data-critical={maxSeguro > 0 && atual <= 0}>
      <span className="rc-hud-ico" aria-hidden="true">
        {icon}
      </span>
      <span className="rc-hud-track">
        {Array.from({ length: segCount }, (_, i) => (
          <span
            key={i}
            className="rc-hud-seg"
            data-on={i < cheios}
            data-temp={i >= cheios && i < cheios + temps ? "true" : undefined}
          />
        ))}
      </span>
      <span className="rc-hud-val">
        <span className="rc-hud-val-num">
          {atual}
          {temporario > 0 ? `+${temporario}` : ""}/{maxSeguro}
        </span>
        <span className="rc-hud-val-unit">{label}</span>
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
        <div className="rc-hud-cls" data-active={colapsoAtivo} data-testid="console-colapso">
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
          icon={<IconPv />}
          atual={recursos.pv ?? derivados.pv_max}
          max={derivados.pv_max}
          temporario={recursos.pv_temporario ?? 0}
        />
        <ResourceRow
          label="PE"
          tone="pe"
          icon={<IconPe />}
          atual={recursos.pe ?? derivados.pe_max}
          max={derivados.pe_max}
        />
        <ResourceRow
          label="Mana"
          tone="mana"
          icon={<IconMana />}
          atual={recursos.mana ?? derivados.mana_max}
          max={derivados.mana_max}
          temporario={recursos.mana_temporaria ?? 0}
        />
      </div>
    </div>
  );
}
