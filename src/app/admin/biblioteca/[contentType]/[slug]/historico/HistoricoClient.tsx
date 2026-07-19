"use client";

import { useMemo, useState } from "react";
import type { ContentChangelogRow } from "../../../../../../lib/contentSchema/changelogQueries";
import { compararPublicado } from "../../../../../../lib/contentSchema/publishDiff";
import { buttonStyle, sectionStyle } from "../../../rascunhos/_shared/formStyles";
import { DiffView } from "../../../rascunhos/_shared/DiffView";

const CHANGE_LABEL: Record<ContentChangelogRow["change_type"], string> = {
  created: "Criado",
  updated: "Atualizado",
  deleted: "Removido",
  archived: "Arquivado",
};

const CHANGE_COR: Record<ContentChangelogRow["change_type"], string> = {
  created: "#8fd6a0",
  updated: "#e0c56b",
  deleted: "#e08a8a",
  archived: "#a88fd6",
};

export function HistoricoClient({
  contentType,
  slug,
  documentId,
  historico,
}: {
  contentType: string;
  slug: string;
  documentId: string;
  historico: ContentChangelogRow[];
}) {
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [compA, setCompA] = useState<string>("");
  const [compB, setCompB] = useState<string>("");

  const porId = useMemo(() => new Map(historico.map((h) => [h.id, h])), [historico]);

  const diffComparacao = useMemo(() => {
    if (!compA || !compB || compA === compB) return null;
    const a = porId.get(compA);
    const b = porId.get(compB);
    if (!a || !b) return null;
    // Compara os snapshots publicados (payload_after) das duas versões.
    return compararPublicado(a.payload_after, b.payload_after ?? {});
  }, [compA, compB, porId]);

  return (
    <div style={{ maxWidth: 900 }}>
      <p style={{ marginBottom: 16 }}>
        <a href={`/admin/biblioteca/${contentType}/${slug}`} style={{ color: "#8fd6a0", fontSize: 13 }}>
          ← voltar ao conteúdo atual
        </a>
      </p>

      <header style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "#7d7d8a", textTransform: "uppercase" }}>Histórico de versões</div>
        <h2 style={{ fontSize: 22, margin: "4px 0" }}>{documentId}</h2>
        <p style={{ fontSize: 13, color: "#7d7d8a" }}>{historico.length} registro(s). Somente leitura — versões históricas não são editáveis.</p>
      </header>

      {historico.length >= 2 && (
        <div style={sectionStyle}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Comparar duas versões</h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <select value={compA} onChange={(e) => setCompA(e.target.value)} style={selectStyle}>
              <option value="">— versão A —</option>
              {historico.map((h) => (
                <option key={h.id} value={h.id}>
                  {rotuloEntrada(h)}
                </option>
              ))}
            </select>
            <span style={{ color: "#7d7d8a" }}>→</span>
            <select value={compB} onChange={(e) => setCompB(e.target.value)} style={selectStyle}>
              <option value="">— versão B —</option>
              {historico.map((h) => (
                <option key={h.id} value={h.id}>
                  {rotuloEntrada(h)}
                </option>
              ))}
            </select>
          </div>
          {diffComparacao ? <DiffView diff={diffComparacao} /> : <p style={{ fontSize: 13, color: "#7d7d8a" }}>Escolha duas versões diferentes.</p>}
        </div>
      )}

      {historico.length === 0 ? (
        <p style={{ fontSize: 13, color: "#7d7d8a" }}>Sem histórico registrado para este conteúdo (foi importado antes do editor, ou nunca republicado).</p>
      ) : (
        historico.map((h) => {
          const aberto = abertos[h.id];
          const diffEntrada = aberto ? compararPublicado(h.payload_before, h.payload_after ?? {}) : null;
          return (
            <div key={h.id} style={{ ...sectionStyle, marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ color: CHANGE_COR[h.change_type], fontWeight: 600 }}>{CHANGE_LABEL[h.change_type]}</span>
                <span style={{ fontSize: 14 }}>
                  {h.version_before ? `${h.version_before} → ` : ""}
                  <strong>{h.version_after ?? "—"}</strong>
                </span>
                <span style={{ fontSize: 12, color: "#7d7d8a" }}>{new Date(h.created_at).toLocaleString("pt-BR")}</span>
                <span style={{ fontSize: 12, color: "#7d7d8a" }}>{h.author_email ?? "autor desconhecido"}</span>
                <button onClick={() => setAbertos((p) => ({ ...p, [h.id]: !p[h.id] }))} style={{ ...buttonStyle, marginLeft: "auto", padding: "4px 10px" }}>
                  {aberto ? "ocultar mudanças" : "ver mudanças"}
                </button>
              </div>
              {h.summary && <p style={{ fontSize: 13, color: "#c9c9d1", margin: "8px 0 0" }}>{h.summary}</p>}
              {typeof h.impact === "object" && h.impact !== null && "categoria" in (h.impact as Record<string, unknown>) && (
                <p style={{ fontSize: 12, color: "#7d7d8a", margin: "4px 0 0" }}>
                  impacto: {String((h.impact as Record<string, unknown>).categoria)}
                </p>
              )}
              {aberto && diffEntrada && (
                <div style={{ marginTop: 10, borderTop: "1px solid #22232b", paddingTop: 10 }}>
                  <DiffView diff={diffEntrada} />
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function rotuloEntrada(h: ContentChangelogRow): string {
  const data = new Date(h.created_at).toLocaleDateString("pt-BR");
  return `${h.version_after ?? "—"} · ${CHANGE_LABEL[h.change_type]} · ${data}`;
}

const selectStyle = {
  background: "#1b1c22",
  border: "1px solid #34343e",
  borderRadius: 6,
  color: "#e8e8ec",
  padding: "6px 10px",
  fontSize: 13,
};
