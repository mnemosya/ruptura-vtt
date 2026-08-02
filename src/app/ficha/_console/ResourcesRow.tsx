"use client";

/**
 * Colapso + Recursos — refeito do zero.
 *
 * Um ÚNICO container abriga os dois: o painel de Colapso à esquerda
 * (vermelho, com as três barras de segmento dentro e um fundo de
 * varredura) e as três barras de recurso à direita, todas dentro da
 * mesma moldura. A adjacência é mecânica: o Colapso dispara quando PV
 * ou PE chega a 0 (`collapse.ts`).
 *
 * Cada barra é um retângulo de cantos cortados; a angulação vive só
 * nos segmentos internos. O contador ("11/11") fica numa CÉLULA dentro
 * da própria barra, separada por um divisor — não solto ao lado.
 *
 * A camada TEMPORÁRIA (`pv_temporario`, `mana_temporaria`) aparece como
 * segmentos hachurados depois dos cheios: o motor já mantém esses
 * valores e escondê-los perderia informação real.
 *
 * Apresentação pura: nada é recalculado aqui.
 */

import type { ReactNode } from "react";
import { MAX_COLLAPSE_SEGMENTS, type Character, type DerivedStats } from "../../../lib/character";

type Tone = "pv" | "pe" | "mana";

/** Teto de segmentos desenhados — acima disso a barra vira ruído. */
const MAX_SEGMENTS = 18;

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

/** Varredura técnica de fundo do painel de Colapso. */
function CollapseScan() {
  return (
    <span className="rc-cls-scan" aria-hidden="true">
      <svg viewBox="0 0 104 150" preserveAspectRatio="xMidYMid slice">
        <g stroke="#ff5f74" strokeOpacity="0.5" fill="none" strokeWidth="1">
          <ellipse cx="52" cy="30" rx="13" ry="16" />
          <path d="M52 46c-11 0-19 6-21 15l-3 26c-1 6-1 11 0 16l3 21h42l3-21c1-5 1-10 0-16l-3-26c-2-9-10-15-21-15z" />
          <path d="M31 62 20 96M73 62l11 34" />
          <path d="M44 124l-3 26M60 124l3 26" />
        </g>
        <g stroke="#ff5f74" strokeOpacity="0.22" strokeWidth="1">
          {Array.from({ length: 15 }, (_, i) => (
            <path key={i} d={`M0 ${i * 10} H104`} />
          ))}
        </g>
      </svg>
    </span>
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
  icon: ReactNode;
}) {
  const maxSeguro = Number.isFinite(max) && max > 0 ? max : 0;
  const segCount = maxSeguro > 0 ? Math.min(Math.round(maxSeguro), MAX_SEGMENTS) : 1;
  const porSeg = maxSeguro > 0 ? maxSeguro / segCount : 0;

  const cheios = porSeg > 0 ? Math.min(segCount, Math.round(atual / porSeg)) : 0;
  // Segmentos temporários entram DEPOIS dos cheios e nunca estouram a barra.
  const temps = porSeg > 0 ? Math.min(segCount - cheios, Math.round(temporario / porSeg)) : 0;

  return (
    <div className="rc-res-row" data-tone={tone} data-critical={maxSeguro > 0 && atual <= 0}>
      <span className="rc-res-ico" aria-hidden="true">
        {icon}
      </span>
      <span className="rc-res-bar">
        <span className="rc-res-segs">
          {Array.from({ length: segCount }, (_, i) => (
            <span
              key={i}
              className="rc-res-seg"
              data-on={i < cheios}
              data-temp={i >= cheios && i < cheios + temps ? "true" : undefined}
            />
          ))}
        </span>
        <span className="rc-res-num">
          {atual}
          {temporario > 0 ? `+${temporario}` : ""}/{maxSeguro}
        </span>
      </span>
      <span className="rc-res-tag">{label}</span>
    </div>
  );
}

export function ResourcesRow({ character, derivados }: { character: Character; derivados: DerivedStats }) {
  const recursos = character.recursos_atuais ?? {};
  const colapso = character.colapso;
  const colapsoAtivo = colapso?.ativo === true;

  return (
    <div className="rc-vit">
      <div className="rc-vit-head">
        <span className="rc-vit-head-cls">Colapso</span>
        <span className="rc-vit-head-res">Recursos</span>
      </div>

      <div className="rc-vit-body">
        <div className="rc-cls-col">
          <div className="rc-cls" data-active={colapsoAtivo} data-testid="console-colapso">
            <CollapseScan />
            {Array.from({ length: MAX_COLLAPSE_SEGMENTS }, (_, i) => (
              <span key={i} className="rc-cls-seg" data-on={i < (colapso?.segmentos ?? 0)} />
            ))}
          </div>
          <span className="rc-cls-state">
            {colapsoAtivo
              ? `${colapso?.tipo === "pe" ? "mental" : "físico"}${colapso?.estabilizado ? " · estável" : ""}`
              : "inativo"}
          </span>
        </div>

        <div className="rc-res">
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
