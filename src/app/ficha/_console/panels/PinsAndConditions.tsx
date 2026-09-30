"use client";

/**
 * Pins (6 slots, abaixo das Perícias) e Condições (rodapé direito).
 *
 * O pin guarda apenas uma REFERÊNCIA tipada (`tipo` + `ref`), nunca uma
 * cópia dos dados da entidade — abrir o pin delega ao fluxo do objeto
 * referenciado. O limite é estrutural: são exatamente 6 posições, duas
 * fileiras de 3.
 */

import { X } from "lucide-react";
import { Plus } from "../../../_design/icons";
import type { ConsoleApi, ConsolePin } from "../types";
import { CabecalhoModulo } from "./CabecalhoModulo";

const LIMITE_PINS = 6;

export function PinsRow({ api, onAbrirPin }: { api: ConsoleApi; onAbrirPin: (pin: ConsolePin) => void }) {
  // Só leitura: só os fixados que existem — "Espaço livre +" e o ×
  // são edição. Sem nenhum fixado, a faixa inteira sai.
  const slots = api.somenteLeitura
    ? api.pins.slice(0, LIMITE_PINS)
    : Array.from({ length: LIMITE_PINS }, (_, i) => api.pins[i] ?? null);
  if (slots.length === 0) return null;

  return (
    <div className="rc-pins" role="list" aria-label="Fixados">
      {slots.map((pin, i) =>
        pin ? (
          <div key={pin.id} className="rc-pin" data-preenchido="true" role="listitem">
            {!api.somenteLeitura && <button
              type="button"
              className="rc-pin-x"
              onClick={() => api.removerPin(pin.id)}
              aria-label={`Remover ${pin.nome} dos fixados`}
              title="Remover"
            >
              <X size={12} />
            </button>}
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
          <div key={`vazio-${i}`} className="rc-pin" role="listitem" data-cursor-action="true">
            <Plus className="rc-pin-empty-icon" size={14} strokeWidth={1.6} aria-hidden="true" />
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
    <ConditionsControls
      conditions={ativas}
      // Só leitura: sem Adicionar e sem remover — os detalhes seguem.
      onAdd={api.somenteLeitura ? undefined : onAdicionar}
      onDetails={onDetalhes}
      onRemove={api.somenteLeitura ? undefined : api.removerCondicao}
    />
  );
}

export interface SharedCondition {
  id: string;
  nome: string;
  descricao?: string;
}

/** Mesma lista/chips/teclado usada pela ficha e pelo HUD. */
export function ConditionsControls({
  conditions,
  onAdd,
  onDetails,
  onRemove,
  readOnly = false,
  busy = false,
  variant = "console",
}: {
  conditions: SharedCondition[];
  onAdd?: () => void;
  onDetails?: (id: string) => void;
  onRemove?: (id: string) => void;
  readOnly?: boolean;
  busy?: boolean;
  variant?: "console" | "hud";
}) {
  const editable = !readOnly && !!onRemove;

  return (
    <div className="rc-ncond-wrap" data-variant={variant} aria-busy={busy || undefined}>
      <section className="rc-ncond-card" aria-label="Condições">
        {/* O cabeçalho canônico substitui o título solto: ele já diz
            que módulo é este, e no mesmo lugar de todos os outros. */}
        {variant === "console"
          ? <CabecalhoModulo id="ID://ESTADOS" mod="MOD.STATUS // 02" />
          : <span className="rc-ncond-titulo">Condições</span>}
        {conditions.length === 0 && <p className="rc-ncond-vazio">Nenhuma condição ativa.</p>}
        {conditions.map((c) => (
          <span key={c.id} className="rc-ncond-tag">
            {onDetails && !readOnly ? (
              <button type="button" className="rc-ncond-abrir" onClick={() => onDetails(c.id)} title={c.descricao ?? c.nome}>
                {c.nome}
              </button>
            ) : <span className="rc-ncond-abrir" title={c.descricao ?? c.nome}>{c.nome}</span>}
            {editable && (
              <button
                type="button"
                className="rc-ncond-x"
                onClick={() => onRemove?.(c.id)}
                disabled={busy}
                aria-label={`Remover condição ${c.nome}`}
                title="Remover"
              >
                <X size={10} strokeWidth={1.6} />
              </button>
            )}
          </span>
        ))}
        {!readOnly && onAdd && (
          <button type="button" className="rc-ncond-add" onClick={onAdd} disabled={busy} data-testid="console-add-condicao">
            <Plus size={12} aria-hidden="true" /> Adicionar
          </button>
        )}
      </section>
    </div>
  );
}
