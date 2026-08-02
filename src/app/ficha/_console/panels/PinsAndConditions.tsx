"use client";

/**
 * Pins (3 slots, abaixo das Perícias) e Condições (rodapé direito).
 *
 * O pin guarda apenas uma REFERÊNCIA tipada (`tipo` + `ref`), nunca uma
 * cópia dos dados da entidade — abrir o pin delega ao fluxo do objeto
 * referenciado. O limite de 3 é estrutural: são exatamente 3 posições.
 */

import { Pin, X, Plus } from "lucide-react";
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
            <Pin size={14} aria-hidden="true" style={{ opacity: 0.45 }} />
            <span className="rc-pin-sub">slot livre</span>
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
    <section className="rc-panel" aria-label="Condições">
      <div className="rc-cond-head">
        <span className="rc-label">Condições</span>
        <button type="button" className="rc-ghost" onClick={onAdicionar} data-testid="console-add-condicao">
          <Plus size={11} aria-hidden="true" /> Adicionar
        </button>
      </div>

      {ativas.length === 0 ? (
        <p className="rc-vazio">Nenhuma condição ativa.</p>
      ) : (
        <div className="rc-cond-list">
          {ativas.map((c) => (
            <span key={c.id} className="rc-cond">
              <button type="button" className="rc-cond-abrir" onClick={() => onDetalhes(c.id)} title={c.descricao ?? c.nome}>
                {c.nome}
              </button>
              <button
                type="button"
                className="rc-cond-x"
                onClick={() => api.removerCondicao(c.id)}
                aria-label={`Remover condição ${c.nome}`}
                title="Remover"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
