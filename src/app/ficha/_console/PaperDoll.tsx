"use client";

/**
 * Paper doll de Equipamentos — Tempo 1 (somente leitura).
 *
 * Consome `projectBodySlots` (lib/character/equipmentSlots.ts), que
 * PROJETA os slots corporais a partir do que o modelo já tem
 * (`estado`, `equipadoDefensivo`, `equipamentoSlot`). Nenhum campo novo
 * é gravado no payload nesta fase.
 *
 * Simplificado para seguir o wireframe literalmente: caixas de texto
 * simples (sem ícone por região) e uma linha reta ligando cada slot ao
 * boneco palito — sem ponto luminoso, sem gradiente de preenchimento.
 *
 * Cabeça, membro superior e membro inferior aparecem esmaecidos e
 * tracejados porque o modelo ainda não tem fonte para eles
 * (`supported: false`) — diferente de "vazio porque nada foi
 * equipado".
 */

import { projectBodySlots, type BodySlot, type BodySlotId, type Character } from "../../../lib/character";

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

/** Boneco palito simples, como no wireframe. */
function StickFigure() {
  return (
    <svg viewBox="0 0 100 200" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <circle cx="50" cy="22" r="15" />
      <path d="M50 37v72" />
      <path d="M50 52 L12 74 M50 52 L88 74" />
      <path d="M50 109 L26 178 M50 109 L74 178" />
      <path d="M18 182 L34 178 M66 178 L82 182" />
    </svg>
  );
}

export function PaperDoll({ character }: { character: Character }) {
  const { slots, semSlot } = projectBodySlots(character);
  const porId = new Map(slots.map((s) => [s.id, s]));
  const pegar = (id: BodySlotId) => porId.get(id)!;

  return (
    <div className="rc-panel">
      <span className="rc-caption">Equipamentos</span>
      <div className="rc-doll">
        <div className="rc-doll-side">
          <Slot slot={pegar("membro_superior")} />
          <Slot slot={pegar("membro_inferior")} />
          <Slot slot={pegar("escudo")} />
        </div>

        <div className="rc-doll-figure" aria-hidden="true">
          <StickFigure />
        </div>

        <div className="rc-doll-side">
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
          <div key={id} className="rc-quick-card" data-filled={slot.instance != null} data-testid={`console-slot-${id}`}>
            <span className="rc-quick-label">Acesso rápido #{i + 1}</span>
            {slot.instance && <span className="rc-quick-value">{slot.instance.itemNome}</span>}
          </div>
        );
      })}
    </div>
  );
}
