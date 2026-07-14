import type { CSSProperties } from "react";
import { CONTENT_TYPE_REGISTRY } from "../../../lib/contentSchema/contentTypeRegistry";

const inputStyle: CSSProperties = {
  background: "#1b1c22",
  border: "1px solid #34343e",
  borderRadius: 6,
  color: "#e8e8ec",
  padding: "8px 10px",
  fontSize: 14,
};

/** Formulário GET simples — sem JS, sem "use client". Cada submit navega para /admin/biblioteca?... */
export function ListFilters({ contentType, search, categoria }: { contentType?: string; search?: string; categoria?: string }) {
  return (
    <form method="GET" action="/admin/biblioteca" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 20 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#a8a8b3" }}>
        Tipo de conteúdo
        <select name="contentType" defaultValue={contentType ?? ""} style={inputStyle}>
          <option value="">Todos os 12 tipos</option>
          {Object.values(CONTENT_TYPE_REGISTRY).map((def) => (
            <option key={def.id} value={def.id}>
              {def.label} ({def.statusAdapter === "implementado" ? "adapter dedicado" : "adapter genérico"})
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#a8a8b3" }}>
        Buscar por nome, slug, categoria ou subtipo
        <input type="text" name="q" defaultValue={search ?? ""} placeholder="ex.: fogo, atordoado, artifice..." style={{ ...inputStyle, minWidth: 260 }} />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#a8a8b3" }}>
        Categoria (exata)
        <input type="text" name="categoria" defaultValue={categoria ?? ""} placeholder="ex.: farmacia" style={inputStyle} />
      </label>

      <button
        type="submit"
        style={{ background: "#22301f", border: "1px solid #3a5231", color: "#e8e8ec", borderRadius: 6, padding: "9px 16px", cursor: "pointer" }}
      >
        Filtrar
      </button>
      {(contentType || search || categoria) && (
        <a href="/admin/biblioteca" style={{ fontSize: 13, color: "#a8a8b3", marginLeft: 4 }}>
          Limpar filtros
        </a>
      )}
    </form>
  );
}
