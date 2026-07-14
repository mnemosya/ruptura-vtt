"use client";

import { useState } from "react";
import type { ContentTypeId } from "../../../../../lib/contentSchema/types";
import type { RequisitoSimples } from "../../../../../lib/contentSchema/draftTypes";
import { buttonStyle, inputStyle } from "./formStyles";

const TIPOS_REFERENCIA: (ContentTypeId | "desconhecido")[] = [
  "spell",
  "talent",
  "item",
  "condition",
  "rune",
  "escalpo",
  "property",
  "combat_action",
  "desconhecido",
];

/** Editor de requisitos simples — aditivo §8.4 pede "referência estruturada"; MVP desta etapa cobre o caso básico "tipo + slug". */
export function RequisitosEditor({ requisitos, onChange }: { requisitos: RequisitoSimples[]; onChange: (req: RequisitoSimples[]) => void }) {
  const [tipo, setTipo] = useState<ContentTypeId | "desconhecido">("talent");
  const [slug, setSlug] = useState("");

  function adicionar() {
    if (!slug.trim()) return;
    onChange([...requisitos, { tipoConteudo: tipo, slug: slug.trim() }]);
    setSlug("");
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: "#a8a8b3", marginBottom: 6 }}>Pré-requisitos simples</div>
      {requisitos.length === 0 && <div style={{ fontSize: 12, color: "#7d7d8a", marginBottom: 6 }}>nenhum</div>}
      {requisitos.map((r, i) => (
        <div key={i} style={{ fontSize: 13, color: "#c9c9d1", marginBottom: 4, display: "flex", gap: 8, alignItems: "center" }}>
          <span>
            {r.tipoConteudo}:{r.slug}
            {r.descricao ? ` (${r.descricao})` : ""}
          </span>
          <button
            type="button"
            onClick={() => onChange(requisitos.filter((_, idx) => idx !== i))}
            style={{ background: "none", border: "none", color: "#e08a8a", cursor: "pointer" }}
          >
            remover
          </button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as ContentTypeId | "desconhecido")} style={{ ...inputStyle, maxWidth: 160 }}>
          {TIPOS_REFERENCIA.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug do conteúdo requerido" style={{ ...inputStyle, maxWidth: 240 }} />
        <button type="button" onClick={adicionar} style={buttonStyle}>
          Adicionar
        </button>
      </div>
    </div>
  );
}
