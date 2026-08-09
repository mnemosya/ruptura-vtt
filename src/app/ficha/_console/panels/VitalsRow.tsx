"use client";

/**
 * Colapso + Recursos v2 (spec Figma) — Colapso é um card único
 * (label + pips losangulares + badge de morte/coma + botão
 * Estabilizar); Recursos segue o mesmo padrão em 3 camadas de
 * Perícias (Card externo → Box título → Card interno), com uma linha
 * por recurso (badge do ícone, trilha de 3 segmentos com as diagonais
 * EXATAS do prompt, e valor editável com botões −/+).
 *
 * A edição do valor usa `ResourceValueCard` (compartilhado com o
 * console minimizado — `MinimizedDockContent`) para não duplicar a
 * lógica de parsing/gravação; os botões −/+ do prompt são um atalho
 * de ±1 em cima da mesma ação (`editarRecurso` grava valor absoluto).
 */

import { HeartPulse, Zap, Sparkles } from "lucide-react";
import { MAX_COLLAPSE_SEGMENTS } from "../../../../lib/character";
import { useClickGuard } from "../useClickGuard";
import { ResourceValueCard } from "./ResourceValueCard";
import type { ConsoleApi, RecursoEditavel } from "../types";

const RECURSOS: { id: RecursoEditavel; rotulo: string; corTexto: string; corBarra: string; corVazado: string; bgBadge: string; Icone: typeof Zap }[] = [
  { id: "pv", rotulo: "PV", corTexto: "#FF5F74", corBarra: "rgba(228, 57, 76, 0.70)", corVazado: "228, 57, 76", bgBadge: "transparent", Icone: HeartPulse },
  { id: "pe", rotulo: "PE", corTexto: "#8B5CF6", corBarra: "rgba(139, 92, 246, 0.70)", corVazado: "139, 92, 246", bgBadge: "rgba(139, 92, 246, 0.10)", Icone: Zap },
  { id: "mana", rotulo: "Mana", corTexto: "#00D4FF", corBarra: "rgba(0, 212, 255, 0.70)", corVazado: "0, 212, 255", bgBadge: "rgba(0, 212, 255, 0.10)", Icone: Sparkles },
];

/**
 * Célula da trilha de recurso — SEMPRE a peça "Meio" do prompt (as
 * diagonais dos dois lados são simétricas), repetida para todas as
 * células. Usar peças diferentes por posição (Primeiro/Meio/Último,
 * cada uma com um recorte de largura distinta) fazia o "entalhe"
 * entre as células crescer da esquerda pra direita — a peça do meio
 * tem o mesmo entalhe nos dois lados, então repetí-la dá o gap
 * uniforme correto em qualquer célula.
 *
 * Cada célula tem DUAS camadas empilhadas (vazado embaixo, cheio em
 * cima) — a de cima é recortada com `clip-path: inset()` na fração
 * LOCAL que essa célula deve mostrar, nunca encolhida via `width`.
 * `inset()` corta relativo à própria caixa (o SVG continua no tamanho
 * real), então o efeito é um recorte gradual (some devagar) e não uma
 * distorção da forma nem um "pulo" a cada 1/4 da trilha.
 */
const BAR_D =
  "M0.284709 1.69673C-0.331128 1.06268 0.118147 0 1.00204 0H35.6937C35.964 0 36.2228 0.109398 36.4111 0.303271L42.2387 6.30327C42.8546 6.93732 42.4053 8 41.5214 8H6.8297C6.55943 8 6.30067 7.8906 6.11236 7.69673L0.284709 1.69673Z";

function BarCell({ localPct, cheioColor, vazadoRgb }: { localPct: number; cheioColor: string; vazadoRgb: string }) {
  return (
    <div className="rc-nres-cell">
      <svg viewBox="0 0 44 8" preserveAspectRatio="none" aria-hidden="true">
        <path d={BAR_D} fill={`rgba(${vazadoRgb}, 0.08)`} stroke={`rgba(${vazadoRgb}, 0.20)`} strokeWidth="0.5" />
      </svg>
      <svg
        viewBox="0 0 44 8"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ clipPath: `inset(0 ${100 - localPct}% 0 0)` }}
      >
        <path d={BAR_D} fill={cheioColor} />
      </svg>
    </div>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 11 11" fill="none" aria-hidden="true">
      <path d="M2.2915 5.5H8.70817" stroke="#418292" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 11 11" fill="none" aria-hidden="true">
      <path d="M2.2915 5.49984H8.70817M5.49984 2.2915V8.70817" stroke="#418292" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Losango de Colapso — mesma geometria de PA/Reações, paleta vermelha. */
function ColapsoPip({ cheio }: { cheio: boolean }) {
  return (
    <svg viewBox="0 0 19 18" aria-hidden="true">
      <path d="M9.5 0L19 9L9.5 18L0 9L9.5 0Z" fill="#FF5F74" fillOpacity={cheio ? "0.5" : "0.08"} />
      <path d="M18.2725 9L9.5 17.3105L0.726562 9L9.5 0.688477L18.2725 9Z" fill="none" stroke="#FF5F74" strokeOpacity="0.5" />
    </svg>
  );
}

function SkullIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <g stroke="#FF3C50" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 6.50006C4.77614 6.50006 5 6.2762 5 6.00006C5 5.72392 4.77614 5.50006 4.5 5.50006C4.22386 5.50006 4 5.72392 4 6.00006C4 6.2762 4.22386 6.50006 4.5 6.50006Z" />
        <path d="M7.5 6.50006C7.77614 6.50006 8 6.2762 8 6.00006C8 5.72392 7.77614 5.50006 7.5 5.50006C7.22386 5.50006 7 5.72392 7 6.00006C7 6.2762 7.22386 6.50006 7.5 6.50006Z" />
        <path d="M4 10.0001V11.0001H8V10.0001" />
        <path d="M6.25 8.50006L6 8.00006L5.75 8.50006H6.25Z" />
        <path d="M8 10.0001C8.18835 9.99994 8.37283 9.94664 8.53221 9.84628C8.6916 9.74592 8.8194 9.60259 8.9009 9.43279C8.9824 9.263 9.0143 9.07363 8.99291 8.8865C8.97152 8.69937 8.89772 8.52209 8.78 8.37506C9.35299 7.82121 9.74748 7.10883 9.91289 6.32928C10.0783 5.54972 10.0071 4.73853 9.70838 3.99972C9.40968 3.26091 8.8971 2.62816 8.23638 2.18261C7.57566 1.73706 6.79691 1.49902 6 1.49902C5.20309 1.49902 4.42435 1.73706 3.76362 2.18261C3.1029 2.62816 2.59033 3.26091 2.29162 3.99972C1.99292 4.73853 1.92171 5.54972 2.08712 6.32928C2.25252 7.10883 2.64702 7.82121 3.22 8.37506C3.10228 8.52209 3.02848 8.69937 3.00709 8.8865C2.98571 9.07363 3.0176 9.263 3.0991 9.43279C3.18061 9.60259 3.30841 9.74592 3.46779 9.84628C3.62717 9.94664 3.81165 9.99994 4 10.0001" />
      </g>
    </svg>
  );
}

export function VitalsRow({ api, onEstabilizar }: { api: ConsoleApi; onEstabilizar: () => void }) {
  const { character, derivados } = api;
  const colapso = character.colapso;
  const segmentos = colapso?.segmentos ?? 0;
  const noFim = segmentos >= MAX_COLLAPSE_SEGMENTS;
  const guard = useClickGuard();

  const maximos: Record<RecursoEditavel, number> = {
    pv: derivados.pv_max,
    pe: derivados.pe_max,
    mana: derivados.mana_max,
  };

  return (
    <div className="rc-vitals rc-vitals-row">
      <div className="rc-nres-wrap">
        <span className="rc-nres-caption">Recursos</span>
        <div className="rc-nres-card">
          {RECURSOS.map(({ id, rotulo, corTexto, corBarra, corVazado, bgBadge, Icone }) => {
            const max = maximos[id];
            const atual = character.recursos_atuais?.[id] ?? max;
            const pct = max > 0 ? Math.max(0, Math.min(100, (atual / max) * 100)) : 0;
            return (
              <div className="rc-nres-row" key={id}>
                <span className="rc-nres-badge" style={{ background: bgBadge }} aria-hidden="true">
                  <Icone size={13} color={corTexto} />
                </span>
                <div className="rc-nres-track" style={{ background: `rgba(${corVazado}, 0.10)` }} role="img" aria-label={`${rotulo} ${atual} de ${max}`}>
                  {[0, 1, 2, 3].map((i) => {
                    const localPct = Math.max(0, Math.min(100, (pct - i * 25) * 4));
                    return <BarCell key={i} localPct={localPct} cheioColor={corBarra} vazadoRgb={corVazado} />;
                  })}
                </div>
                <div className="rc-nres-adj">
                  <span className="rc-nres-nome" style={{ color: corTexto }}>
                    {rotulo}
                  </span>
                  <div className="rc-nres-ctrls">
                    <button
                      type="button"
                      className="rc-nres-btn"
                      onClick={() => guard(() => api.editarRecurso(id, Math.max(0, atual - 1)))}
                      disabled={atual <= 0}
                      aria-label={`Reduzir ${rotulo} em 1`}
                    >
                      <MinusIcon />
                    </button>
                    <ResourceValueCard
                      atual={atual}
                      max={max}
                      rotulo={rotulo}
                      className="rc-nres-val"
                      inputClassName="rc-nres-input"
                      onGravar={(v) => api.editarRecurso(id, v)}
                    />
                    <button
                      type="button"
                      className="rc-nres-btn"
                      onClick={() => guard(() => api.editarRecurso(id, Math.min(max, atual + 1)))}
                      disabled={atual >= max}
                      aria-label={`Aumentar ${rotulo} em 1`}
                    >
                      <PlusIcon />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rc-ncol-wrap">
        <span className="rc-ncol-caption">Colapso</span>
        <div
          className="rc-ncol-card"
          aria-label={`Colapso: ${
            colapso?.ativo
              ? `${colapso.tipo === "pe" ? "mental" : "físico"}${colapso.estabilizado ? ", estável" : ""}`
              : "inativo"
          }`}
        >
          <div className="rc-ncol-mid">
            <div className="rc-ncol-pips">
              {Array.from({ length: MAX_COLLAPSE_SEGMENTS }, (_, i) => {
                const preenchido = i < segmentos;
                return (
                  <button
                    key={i}
                    type="button"
                    className="rc-ncol-pip"
                    onClick={() => guard(api.avancarColapso)}
                    disabled={preenchido}
                    aria-label={`Colapso segmento ${i + 1} de ${MAX_COLLAPSE_SEGMENTS}${preenchido ? " (atingido)" : ""}`}
                  >
                    <ColapsoPip cheio={preenchido} />
                  </button>
                );
              })}
            </div>
            {noFim && (
              <span className="rc-ncol-morte" title={colapso?.desfecho === "morte" ? "Morte" : "Coma"}>
                <SkullIcon />
              </span>
            )}
          </div>
          <button
            type="button"
            className="rc-ncol-estabilizar"
            onClick={onEstabilizar}
            disabled={!colapso?.ativo}
            title="Estabilizar Colapso — interrompe o avanço, não cura"
            aria-label="Estabilizar Colapso"
            data-testid="console-estabilizar"
          >
            Estabilizar
          </button>
        </div>
      </div>
    </div>
  );
}
