"use client";

/**
 * Paper doll de Equipamentos — Tempo 1 (somente leitura).
 *
 * Consome `projectBodySlots` (lib/character/equipmentSlots.ts), que
 * PROJETA os slots corporais a partir do que o modelo já tem
 * (`estado`, `equipadoDefensivo`, `equipamentoSlot`). Nenhum campo novo
 * é gravado no payload nesta fase.
 *
 * Cabeça, membro superior e membro inferior aparecem esmaecidos e
 * tracejados porque o modelo ainda não tem fonte para eles
 * (`supported: false`) — é diferente de "vazio porque nada foi
 * equipado", e o Console precisa dizer a verdade sobre isso.
 *
 * Acesso rápido NÃO fica aqui: são dois cards próprios fora deste
 * painel (ver ConsoleShell), como no design.
 */

import type { ReactNode } from "react";
import { projectBodySlots, type BodySlot, type BodySlotId, type Character } from "../../../lib/character";

/* Ícone por REGIÃO — antes era o mesmo escudo genérico nos nove slots. */
const ICONES: Record<BodySlotId, ReactNode> = {
  cabeca: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M5 13a7 7 0 0 1 14 0v5a2 2 0 0 1-2 2h-1v-4H8v4H7a2 2 0 0 1-2-2v-5z" />
    </svg>
  ),
  tronco: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M9 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-4-3-3 2-3-2z" />
    </svg>
  ),
  membro_superior: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M14 3h4v7a5 5 0 0 1-5 5h-1v6H8v-8a4 4 0 0 1 4-4h2V3z" />
    </svg>
  ),
  membro_inferior: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M8 3h8v7l-2 5v6h-4v-6L8 10V3z" />
      <path d="M6 21h6" />
    </svg>
  ),
  arma_primaria: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M2 10h16l4 2-4 2h-3l-2 3-2-3H8l-2 4H3l1-4H2v-4z" />
    </svg>
  ),
  arma_secundaria: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 8h12l4 3h-5l-2 3H9l-2 5H4l1-5H3l1-6z" />
    </svg>
  ),
  escudo: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 3 4 6v6c0 4.4 3.4 7.4 8 9 4.6-1.6 8-4.6 8-9V6l-8-3z" />
    </svg>
  ),
  acesso_rapido_1: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4v4M12 16v4M4 12h4M16 12h4" />
    </svg>
  ),
  acesso_rapido_2: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="6" width="16" height="12" rx="1" />
      <path d="M7 10h10M7 14h6" />
    </svg>
  ),
};

function Slot({ slot }: { slot: BodySlot }) {
  const preenchido = slot.instance != null;
  return (
    <div
      className="rc-slot"
      data-filled={preenchido}
      data-supported={slot.supported}
      data-testid={`console-slot-${slot.id}`}
      title={slot.supported ? undefined : "Este slot ainda não existe no modelo de dados"}
    >
      <span className="rc-slot-icon" aria-hidden="true">
        {ICONES[slot.id]}
      </span>
      <span className="rc-slot-text">
        <span className="rc-slot-label">{slot.label}</span>
        <span className="rc-slot-value" data-empty={!preenchido}>
          {slot.instance ? slot.instance.itemNome : slot.supported ? "vazio" : "indisponível"}
        </span>
      </span>
    </div>
  );
}

/** Silhueta humana preenchida — a versão anterior era um boneco de traço. */
function BodyFigure() {
  return (
    <svg viewBox="0 0 140 320" className="rc-body" aria-hidden="true">
      <defs>
        <linearGradient id="rcBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7ee6ff" stopOpacity="0.42" />
          <stop offset="55%" stopColor="#2b9dc4" stopOpacity="0.26" />
          <stop offset="100%" stopColor="#0d5e78" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <g fill="url(#rcBody)" stroke="#8ceaff" strokeOpacity="0.6" strokeWidth="1.3" strokeLinejoin="round">
        {/* cabeça + pescoço */}
        <ellipse cx="70" cy="30" rx="17" ry="21" />
        <path d="M62 48h16v11H62z" />
        {/* tronco */}
        <path d="M70 56c-13 0-23 5-27 13l-5 34c-1 8-1 15 1 22l5 26c1 6 2 11 2 17h48c0-6 1-11 2-17l5-26c2-7 2-14 1-22l-5-34c-4-8-14-13-27-13z" />
        {/* braços */}
        <path d="M43 70c-7 4-11 10-13 18l-8 47c-1 6-1 11 0 17l4 26 11-2-3-25c-1-5-1-9 0-14l9-44z" />
        <path d="M97 70c7 4 11 10 13 18l8 47c1 6 1 11 0 17l-4 26-11-2 3-25c1-5 1-9 0-14l-9-44z" />
        {/* pernas */}
        <path d="M46 168l-4 62c-1 9-2 17-4 26l-5 32h16l4-32c2-9 3-17 4-26l6-44 6 44c1 9 2 17 4 26l4 32h16l-5-32c-2-9-3-17-4-26l-4-62z" />
        {/* pés */}
        <path d="M31 292h18v9H29zM91 292h18v9H91z" />
      </g>
      {/* linha central de varredura */}
      <path d="M70 56v112" stroke="#8ceaff" strokeOpacity="0.28" strokeWidth="1" />
    </svg>
  );
}

export function PaperDoll({ character }: { character: Character }) {
  const { slots, semSlot } = projectBodySlots(character);
  const porId = new Map(slots.map((s) => [s.id, s]));
  const pegar = (id: BodySlotId) => porId.get(id)!;

  return (
    <div className="rc-panel rc-brackets">
      <div className="rc-caption">Equipamentos</div>
      <div className="rc-doll">
        <div className="rc-doll-side rc-doll-side--left">
          <Slot slot={pegar("membro_superior")} />
          <Slot slot={pegar("membro_inferior")} />
          <Slot slot={pegar("escudo")} />
        </div>

        <div className="rc-doll-figure">
          <BodyFigure />
        </div>

        <div className="rc-doll-side rc-doll-side--right">
          <Slot slot={pegar("cabeca")} />
          <Slot slot={pegar("tronco")} />
          <Slot slot={pegar("arma_primaria")} />
          <Slot slot={pegar("arma_secundaria")} />
        </div>

        {semSlot.length > 0 && (
          <p className="rc-doll-note" data-testid="console-slots-sem-regiao">
            {semSlot.length} {semSlot.length === 1 ? "item equipado sem" : "itens equipados sem"} região corporal:{" "}
            {semSlot.map((i) => i.itemNome).join(", ")}. O modelo ainda não tem slot para eles — veja a Mochila.
          </p>
        )}
      </div>
    </div>
  );
}

/** Os dois cards de Acesso Rápido, renderizados FORA do paper doll. */
export function QuickAccessCards({ character }: { character: Character }) {
  const { slots } = projectBodySlots(character);
  const porId = new Map(slots.map((s) => [s.id, s]));

  return (
    <div className="rc-quick">
      {(["acesso_rapido_1", "acesso_rapido_2"] as const).map((id, i) => {
        const slot = porId.get(id)!;
        return (
          <div
            key={id}
            className="rc-quick-card"
            data-filled={slot.instance != null}
            data-testid={`console-slot-${id}`}
          >
            <span className="rc-quick-icon" aria-hidden="true">
              {ICONES[id]}
            </span>
            <span className="rc-quick-label">
              Acesso
              <br />
              rápido #{i + 1}
            </span>
            {slot.instance && <span className="rc-quick-value">{slot.instance.itemNome}</span>}
          </div>
        );
      })}
    </div>
  );
}
