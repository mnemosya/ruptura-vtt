"use client";

import type { CamposRuna } from "../../../../../lib/contentSchema/draftTypes";
import { fieldGridStyle, inputStyle, labelStyle } from "./formStyles";

const RARIDADES = ["comum", "incomum", "muito_comum", "raro", "muito_raro"];
const SLOTS_POSSIVEIS = ["arma", "armadura", "escudo"];
const RESTRICOES_SUBTIPO = ["", "corpo_a_corpo", "arremesso_disparo", "fogo"];

function numeroOuIndefinido(valor: string): number | undefined {
  if (valor.trim() === "") return undefined;
  const n = Number(valor);
  return Number.isNaN(n) ? undefined : n;
}

function alternarSlot(slots: string[], slot: string): string[] {
  return slots.includes(slot) ? slots.filter((s) => s !== slot) : [...slots, slot];
}

/** Campos específicos de runa (Etapa 9) — categoria/categoria_label/custo_integridade são fixados na serialização (nunca editáveis aqui, ver publishSerialization.ts::serializarRuna). */
export function CamposRunaSection({ campos, onChange }: { campos: CamposRuna; onChange: (novos: Partial<CamposRuna>) => void }) {
  return (
    <div>
      <div style={fieldGridStyle}>
        <label style={labelStyle}>
          Raridade
          <select data-testid="runa-raridade" value={campos.raridade ?? ""} onChange={(e) => onChange({ raridade: e.target.value || undefined })} style={inputStyle}>
            <option value="">—</option>
            {RARIDADES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Preço
          <input data-testid="runa-preco" type="number" min={0} value={campos.preco ?? ""} onChange={(e) => onChange({ preco: numeroOuIndefinido(e.target.value) })} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Perícia exigida
          <input data-testid="runa-requisito-pericia" value={campos.requisitoPericia ?? ""} onChange={(e) => onChange({ requisitoPericia: e.target.value || undefined })} style={inputStyle} />
        </label>
      </div>

      <fieldset style={{ border: "1px solid #2a2b33", borderRadius: 8, padding: 10, marginTop: 10 }}>
        <legend style={{ fontSize: 13, color: "#a8a8b3" }}>Slots possíveis (onde a runa pode ser instalada)</legend>
        {SLOTS_POSSIVEIS.map((slot) => (
          <label key={slot} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 16, fontSize: 13 }}>
            <input
              type="checkbox"
              data-testid={`runa-slot-${slot}`}
              checked={campos.slotsPossiveis.includes(slot)}
              onChange={() => onChange({ slotsPossiveis: alternarSlot(campos.slotsPossiveis, slot) })}
            />
            {slot}
          </label>
        ))}
      </fieldset>

      {campos.slotsPossiveis.includes("arma") && (
        <label style={{ ...labelStyle, marginTop: 10 }}>
          Restrição de subtipo de arma
          <select
            data-testid="runa-restricao-subtipo"
            value={campos.restricaoSubtipo ?? ""}
            onChange={(e) => onChange({ restricaoSubtipo: e.target.value || undefined })}
            style={inputStyle}
          >
            {RESTRICOES_SUBTIPO.map((r) => (
              <option key={r} value={r}>
                {r || "— (qualquer arma)"}
              </option>
            ))}
          </select>
        </label>
      )}

      <p style={{ fontSize: 12, color: "#7d7d8a", marginTop: 10 }}>
        Categoria (sempre "runa") e custo de Integridade (sempre 0 — exclusivo de escalpo) são fixados automaticamente na publicação, nunca editáveis aqui.
      </p>
    </div>
  );
}
