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
      <span className="rc-slot-label">{slot.label}</span>
      <span className="rc-slot-value" data-empty={!preenchido}>
        {slot.instance ? slot.instance.itemNome : slot.supported ? "vazio" : "indisponível"}
      </span>
    </div>
  );
}

export function PaperDoll({ character }: { character: Character }) {
  const { slots, semSlot } = projectBodySlots(character);
  const porId = new Map(slots.map((s) => [s.id, s]));
  const pegar = (id: BodySlot["id"]) => porId.get(id)!;

  return (
    <div className="rc-panel">
      <div className="rc-panel-title">Equipamentos</div>
      <div className="rc-doll">
        <div className="rc-doll-side">
          <Slot slot={pegar("membro_superior")} />
          <Slot slot={pegar("membro_inferior")} />
          <Slot slot={pegar("escudo")} />
        </div>

        <div className="rc-doll-figure" aria-hidden="true">
          <svg viewBox="0 0 90 200" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <circle cx="45" cy="22" r="15" />
            <path d="M45 37v72" />
            <path d="M45 52 L12 74 M45 52 L78 74" />
            <path d="M45 109 L26 178 M45 109 L64 178" />
            <path d="M20 182 L32 178 M58 178 L70 182" />
          </svg>
        </div>

        <div className="rc-doll-side">
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
            {semSlot.map((i) => i.itemNome).join(", ")}. O modelo ainda não tem slot para eles — veja a aba Inventário.
          </p>
        )}
      </div>
    </div>
  );
}
