"use client";

/**
 * Pins (3 slots, abaixo das Perícias) e Condições (rodapé direito).
 *
 * O pin guarda apenas uma REFERÊNCIA tipada (`tipo` + `ref`), nunca uma
 * cópia dos dados da entidade — abrir o pin delega ao fluxo do objeto
 * referenciado. O limite de 3 é estrutural: são exatamente 3 posições.
 */

import { Plus, X } from "lucide-react";
import type { ConsoleApi, ConsolePin } from "../types";

const LIMITE_PINS = 3;

export function PinsRow({ api, onAbrirPin }: { api: ConsoleApi; onAbrirPin: (pin: ConsolePin) => void }) {
  const slots = Array.from({ length: LIMITE_PINS }, (_, i) => api.pins[i] ?? null);

  return (
    <div className="rc-pins" role="list" aria-label="Fixados">
      {slots.map((pin, i) =>
        pin ? (
          <div key={pin.id} className="rc-pin" data-preenchido="true" role="listitem">
            <button
              type="button"
              className="rc-pin-x"
              onClick={() => api.removerPin(pin.id)}
              aria-label={`Remover ${pin.nome} dos fixados`}
              title="Remover"
            >
              <X size={12} />
            </button>
            <button
              type="button"
              onClick={() => onAbrirPin(pin)}
              style={{ background: "none", border: "none", color: "inherit", display: "grid", gap: 3, justifyItems: "center" }}
            >
              <span className="rc-pin-nome">{pin.nome}</span>
              <span className="rc-pin-sub">{pin.info ?? pin.tipo}</span>
            </button>
          </div>
        ) : (
          <div key={`vazio-${i}`} className="rc-pin" role="listitem">
            <Plus size={14} strokeWidth={1.6} aria-hidden="true" style={{ color: "rgba(184, 216, 232, 0.7)" }} />
            <span className="rc-pin-empty-txt">Espaço livre</span>
          </div>
        ),
      )}
    </div>
  );
}

export function ConditionsPanel({
  api,
  onAdicionar,
  onDetalhes,
}: {
  api: ConsoleApi;
  onAdicionar: () => void;
  onDetalhes: (id: string) => void;
}) {
  const ativas = (api.character.condicoes_ativas ?? []).filter((c) => c.ativa !== false);

  return (
    <div className="rc-ncond-wrap">
      <span className="rc-ncond-caption">Condições</span>
      <section className="rc-ncond-card" aria-label="Condições">
        {ativas.length === 0 && <p className="rc-ncond-vazio">Nenhuma condição ativa.</p>}
        {ativas.map((c) => (
          <span key={c.id} className="rc-ncond-tag">
            <button type="button" className="rc-ncond-abrir" onClick={() => onDetalhes(c.id)} title={c.descricao ?? c.nome}>
              {c.nome}
            </button>
            <button
              type="button"
              className="rc-ncond-x"
              onClick={() => api.removerCondicao(c.id)}
              aria-label={`Remover condição ${c.nome}`}
              title="Remover"
            >
              <X size={10} strokeWidth={1.6} />
            </button>
          </span>
        ))}
        <button type="button" className="rc-ncond-add" onClick={onAdicionar} data-testid="console-add-condicao">
          <Plus size={12} aria-hidden="true" /> Adicionar
        </button>
      </section>
    </div>
  );
}
