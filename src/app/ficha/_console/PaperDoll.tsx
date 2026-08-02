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
 */

import { projectBodySlots, type BodySlot, type Character } from "../../../lib/character";

function SlotIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3 4 7v6c0 4.4 3.4 7.4 8 8 4.6-.6 8-3.6 8-8V7l-8-4z" />
    </svg>
  );
}

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
        <SlotIcon />
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

export function PaperDoll({ character }: { character: Character }) {
  const { slots, semSlot } = projectBodySlots(character);
  const porId = new Map(slots.map((s) => [s.id, s]));
  const pegar = (id: BodySlot["id"]) => porId.get(id)!;

  return (
    <div className="rc-panel rc-brackets">
      <div className="rc-caption">Equipamentos</div>
      <div className="rc-doll">
        <div className="rc-doll-side rc-doll-side--left">
          <Slot slot={pegar("membro_superior")} />
          <Slot slot={pegar("membro_inferior")} />
          <Slot slot={pegar("escudo")} />
        </div>

        <div className="rc-doll-figure" aria-hidden="true">
          <svg viewBox="0 0 100 230" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <ellipse cx="50" cy="24" rx="15" ry="18" />
            <path d="M50 42c-9 3-14 9-14 18v42c0 6 2 10 4 14h20c2-4 4-8 4-14V60c0-9-5-15-14-18z" />
            <path d="M37 62 18 78c-3 3-4 6-4 10v22M63 62l19 16c3 3 4 6 4 10v22" />
            <path d="M14 112v14M86 112v14" />
            <path d="M42 116v62c0 6-1 10-2 16M58 116v62c0 6 1 10 2 16" />
            <path d="M36 198h10M54 198h10" />
            <path d="M50 60v52" strokeWidth="1" opacity="0.5" />
          </svg>
        </div>

        <div className="rc-doll-side rc-doll-side--right">
          <Slot slot={pegar("cabeca")} />
          <Slot slot={pegar("tronco")} />
          <Slot slot={pegar("arma_primaria")} />
          <Slot slot={pegar("arma_secundaria")} />
        </div>

        <div className="rc-doll-quick">
          <Slot slot={pegar("acesso_rapido_1")} />
          <Slot slot={pegar("acesso_rapido_2")} />
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
