"use client";

/**
 * Colapso (trilha inclinada, à esquerda) + Recursos (PV/PE/Mana), na
 * posição do wireframe.
 *
 * Inclinações (clip-path, nunca transform): Colapso e os cards de
 * ícone/trilha de recurso inclinam no MESMO sentido (topo à esquerda,
 * base à direita); o card de VALOR usa a inclinação OPOSTA, fechando
 * a composição como um par de chanfros que se encaixam.
 *
 * A edição do valor usa `ResourceValueCard` (compartilhado com o
 * console minimizado — `MinimizedDockContent`) para não duplicar a
 * lógica de parsing/gravação.
 */

import { HeartPulse, Zap, Sparkles, ShieldCheck } from "lucide-react";
import { MAX_COLLAPSE_SEGMENTS } from "../../../../lib/character";
import { useClickGuard } from "../useClickGuard";
import { ResourceValueCard } from "./ResourceValueCard";
import type { ConsoleApi, RecursoEditavel } from "../types";

const RECURSOS: { id: RecursoEditavel; rotulo: string; cor: string; Icone: typeof Zap }[] = [
  { id: "pv", rotulo: "PV", cor: "#e0455e", Icone: HeartPulse },
  { id: "pe", rotulo: "PE", cor: "#9a6cff", Icone: Zap },
  { id: "mana", rotulo: "Mana", cor: "#3aa6f0", Icone: Sparkles },
];

export function VitalsRow({ api, onEstabilizar }: { api: ConsoleApi; onEstabilizar: () => void }) {
  const { character, derivados } = api;
  const colapso = character.colapso;
  const segmentos = colapso?.segmentos ?? 0;
  const guard = useClickGuard();

  const maximos: Record<RecursoEditavel, number> = {
    pv: derivados.pv_max,
    pe: derivados.pe_max,
    mana: derivados.mana_max,
  };

  return (
    <div className="rc-panel rc-vitals">
      <div className="rc-vitals-row">
        <div className="rc-collapse">
          <div className="rc-collapse-head">
            <span className="rc-label rc-label--danger">Colapso</span>
            <button
              type="button"
              className="rc-winbtn"
              onClick={onEstabilizar}
              disabled={!colapso?.ativo}
              title="Estabilizar Colapso — interrompe o avanço, não cura"
              aria-label="Estabilizar Colapso"
              data-testid="console-estabilizar"
              style={{ width: 22, height: 20 }}
            >
              <ShieldCheck size={12} />
            </button>
          </div>
          <div className="rc-collapse-track">
            {Array.from({ length: MAX_COLLAPSE_SEGMENTS }, (_, i) => {
              const preenchido = i < segmentos;
              return (
                <button
                  key={i}
                  type="button"
                  className="rc-collapse-seg"
                  data-on={preenchido}
                  data-atual={i === segmentos - 1}
                  onClick={() => guard(api.avancarColapso)}
                  disabled={preenchido}
                  aria-label={`Colapso segmento ${i + 1} de ${MAX_COLLAPSE_SEGMENTS}${preenchido ? " (atingido)" : ""}`}
                />
              );
            })}
          </div>
          <span className="rc-collapse-state">
            {colapso?.ativo
              ? `${colapso.tipo === "pe" ? "mental" : "físico"}${colapso.estabilizado ? " · estável" : ""}`
              : "inativo"}
          </span>
        </div>

        <div className="rc-res">
          <span className="rc-label">Recursos</span>
          {RECURSOS.map(({ id, rotulo, cor, Icone }) => {
            const max = maximos[id];
            const atual = character.recursos_atuais?.[id] ?? max;
            const pct = max > 0 ? Math.max(0, Math.min(100, (atual / max) * 100)) : 0;
            return (
              <div className="rc-res-row" key={id}>
                <span className="rc-res-ico" style={{ color: cor }} aria-hidden="true">
                  <Icone size={13} />
                </span>
                <span className="rc-res-bar" role="img" aria-label={`${rotulo} ${atual} de ${max}`}>
                  <span className="rc-res-fill" style={{ width: `${pct}%`, ["--rc-res-cor" as string]: cor }} />
                </span>
                <ResourceValueCard
                  atual={atual}
                  max={max}
                  rotulo={rotulo}
                  className="rc-res-val"
                  inputClassName="rc-res-input"
                  onGravar={(v) => api.editarRecurso(id, v)}
                />
                <span className="rc-res-tag">{rotulo}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
