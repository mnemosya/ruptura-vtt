"use client";

import type { DuracaoCanonica, TipoDuracao } from "../../../../../lib/contentSchema/types";
import { inputStyle, labelStyle } from "./formStyles";

const TIPOS_DURACAO: { value: TipoDuracao; label: string }[] = [
  { value: "instantaneo", label: "Instantâneo" },
  { value: "rodadas", label: "Rodadas" },
  { value: "turno", label: "Até fim do turno" },
  { value: "cena", label: "Cena" },
  { value: "combate", label: "Combate" },
  { value: "manual", label: "Encerramento manual" },
];

/** Editor compartilhado de duração — usado por todos os 6 tipos de efeito (nenhuma duplicação). */
export function DuracaoEditor({ duracao, onChange }: { duracao?: DuracaoCanonica; onChange: (duracao: DuracaoCanonica | undefined) => void }) {
  const tipo = duracao?.tipo ?? "instantaneo";

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
      <label style={labelStyle}>
        Duração
        <select
          value={tipo}
          onChange={(e) => {
            const novoTipo = e.target.value as TipoDuracao;
            onChange(novoTipo === "instantaneo" ? { tipo: novoTipo } : { ...duracao, tipo: novoTipo });
          }}
          style={inputStyle}
        >
          {TIPOS_DURACAO.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      {tipo === "rodadas" && (
        <label style={labelStyle}>
          Valor
          <input
            type="number"
            min={1}
            value={duracao?.valor ?? ""}
            onChange={(e) => onChange({ ...duracao, tipo, valor: e.target.value ? Number(e.target.value) : undefined })}
            style={{ ...inputStyle, width: 80 }}
          />
        </label>
      )}
    </div>
  );
}
