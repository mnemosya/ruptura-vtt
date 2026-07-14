import type { CSSProperties } from "react";
import type { ContentDocument } from "../../../lib/content";
import { adaptarParaAdmin, CONTENT_TYPE_REGISTRY } from "../../../lib/contentSchema";
import { CLASSIFICACAO_LEGADO_LABEL, MODO_AUTOMACAO_COR, MODO_AUTOMACAO_SIMBOLO } from "./labels";

const cellStyle: CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #26262e", verticalAlign: "top" };

function AutomationSummary({ porModo }: { porModo: Record<string, number> }) {
  const entradas = Object.entries(porModo).filter(([, n]) => n > 0);
  if (entradas.length === 0) return <span style={{ color: "#7d7d8a" }}>sem efeitos</span>;
  return (
    <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {entradas.map(([modo, n]) => (
        <span key={modo} title={modo} style={{ color: MODO_AUTOMACAO_COR[modo as keyof typeof MODO_AUTOMACAO_COR] }}>
          {MODO_AUTOMACAO_SIMBOLO[modo as keyof typeof MODO_AUTOMACAO_SIMBOLO]} {n}
        </span>
      ))}
    </span>
  );
}

export function ContentTable({ items }: { items: ContentDocument[] }) {
  if (items.length === 0) {
    return <p style={{ color: "#a8a8b3" }}>Nenhum conteúdo encontrado com esses filtros.</p>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#a8a8b3", fontSize: 12, textTransform: "uppercase" }}>
            <th style={cellStyle}>Nome</th>
            <th style={cellStyle}>Tipo</th>
            <th style={cellStyle}>Status / versão</th>
            <th style={cellStyle}>Legado</th>
            <th style={cellStyle}>Automação dos efeitos</th>
            <th style={cellStyle}>Campos desconhecidos</th>
          </tr>
        </thead>
        <tbody>
          {items.map((doc) => {
            const admin = adaptarParaAdmin(doc.content_type, doc.slug, (doc.payload as Record<string, unknown>) ?? {});
            const href = `/admin/biblioteca/${doc.content_type}/${doc.slug}`;
            return (
              <tr key={doc.id}>
                <td style={cellStyle}>
                  <a href={href} style={{ color: "#8fd6a0", fontWeight: 600 }}>
                    {doc.nome ?? doc.slug}
                  </a>
                  <div style={{ color: "#7d7d8a" }}>{doc.slug}</div>
                </td>
                <td style={cellStyle}>
                  {CONTENT_TYPE_REGISTRY[doc.content_type].label}
                  {doc.categoria ? <div style={{ color: "#7d7d8a" }}>{doc.categoria}</div> : null}
                </td>
                <td style={cellStyle}>
                  {doc.status}
                  <div style={{ color: "#7d7d8a" }}>{doc.version ?? "—"}</div>
                </td>
                <td style={cellStyle}>{CLASSIFICACAO_LEGADO_LABEL[admin.resultados[0]?.adaptacao.classificacaoLegado ?? "somente_leitura"]}</td>
                <td style={cellStyle}>
                  <AutomationSummary porModo={admin.resumoAutomacao.porModo} />
                </td>
                <td style={cellStyle}>{admin.totalCamposDesconhecidos > 0 ? `${admin.totalCamposDesconhecidos}` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
