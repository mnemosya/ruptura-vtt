"use client";

/**
 * Conteúdo do console minimizado: avatar, nome e as TRÊS trilhas reais
 * de PV/PE/Mana (proporção real, editáveis sem expandir a janela).
 *
 * Reusa `ResourceValueCard` — mesma função de parsing/gravação da
 * janela principal (`VitalsRow`) — para editar aqui refletir
 * imediatamente lá (os dois leem/escrevem o mesmo `api.character` via
 * `CharacterSheetClient`).
 */

import { User } from "lucide-react";
import type { ConsoleApi, RecursoEditavel } from "../types";
import { ResourceValueCard } from "./ResourceValueCard";

const RECURSOS: { id: RecursoEditavel; tag: string; cor: string }[] = [
  { id: "pv", tag: "PV", cor: "#e0455e" },
  { id: "pe", tag: "PE", cor: "#9a6cff" },
  { id: "mana", tag: "MANA", cor: "#3aa6f0" },
];

export function MinimizedDockContent({ api, avatarUrl }: { api: ConsoleApi; avatarUrl: string | null }) {
  const { character, derivados } = api;
  const maximos: Record<RecursoEditavel, number> = {
    pv: derivados.pv_max,
    pe: derivados.pe_max,
    mana: derivados.mana_max,
  };

  return (
    <>
      <span className="rc-dock-av" aria-hidden="true">
        {avatarUrl ? <img src={avatarUrl} alt="" /> : <User size={18} strokeWidth={1.4} />}
      </span>
      <div className="rc-dock-info">
        <span className="rc-dock-nome">{character.nome || "Sem nome"}</span>
        <div className="rc-dock-res">
          {RECURSOS.map(({ id, tag, cor }) => {
            const max = maximos[id];
            const atual = character.recursos_atuais?.[id] ?? max;
            const pct = max > 0 ? Math.max(0, Math.min(100, (atual / max) * 100)) : 0;
            return (
              <div className="rc-dock-row" key={id}>
                <span className="rc-dock-tag" style={{ color: cor }}>
                  {tag}
                </span>
                <span className="rc-dock-bar" role="img" aria-label={`${tag} ${atual} de ${max}`}>
                  <span style={{ width: `${pct}%`, ["--rc-dock-cor" as string]: cor }} />
                </span>
                <ResourceValueCard
                  atual={atual}
                  max={max}
                  rotulo={tag}
                  className="rc-dock-val"
                  inputClassName="rc-dock-input"
                  testIdPrefix="console-dock-res"
                  onGravar={(v) => api.editarRecurso(id, v)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
