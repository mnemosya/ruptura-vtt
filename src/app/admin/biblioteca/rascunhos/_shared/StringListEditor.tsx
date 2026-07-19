"use client";

import { useState } from "react";
import { buttonStyle, inputStyle } from "./formStyles";

export function StringListEditor({
  label,
  valores,
  onChange,
  placeholder,
  testId,
}: {
  label: string;
  valores: string[];
  onChange: (valores: string[]) => void;
  placeholder?: string;
  /** Prefixo estável para o input/botão de adicionar (ex.: "modificar-teste-tags"). */
  testId?: string;
}) {
  const [novo, setNovo] = useState("");

  function adicionar() {
    const v = novo.trim();
    if (!v || valores.includes(v)) return;
    onChange([...valores, v]);
    setNovo("");
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: "#a8a8b3", marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {valores.map((v, i) => (
          <span key={`${v}-${i}`} style={{ fontSize: 12, background: "#22232b", borderRadius: 12, padding: "3px 6px 3px 10px", color: "#c9c9d1" }}>
            {v}{" "}
            <button
              type="button"
              onClick={() => onChange(valores.filter((_, idx) => idx !== i))}
              style={{ background: "none", border: "none", color: "#e08a8a", cursor: "pointer", padding: "0 4px" }}
              aria-label={`Remover ${v}`}
            >
              ×
            </button>
          </span>
        ))}
        {valores.length === 0 && <span style={{ fontSize: 12, color: "#7d7d8a" }}>nenhum</span>}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          data-testid={testId ? `${testId}-input` : undefined}
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              adicionar();
            }
          }}
          placeholder={placeholder}
          style={{ ...inputStyle, maxWidth: 240 }}
        />
        <button type="button" data-testid={testId ? `${testId}-adicionar` : undefined} onClick={adicionar} style={buttonStyle}>
          Adicionar
        </button>
      </div>
    </div>
  );
}
