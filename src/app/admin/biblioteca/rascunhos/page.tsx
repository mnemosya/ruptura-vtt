/**
 * Lista de rascunhos (Etapa 3) — "reabrir um rascunho salvo". Não
 * aparece para jogadores em nenhuma hipótese: só é alcançável sob
 * /admin (gate no layout pai) e a leitura em si passa pela RLS
 * admin-only de `content_drafts`.
 */

import { CONTENT_TYPE_REGISTRY } from "../../../../lib/contentSchema";
import { listDrafts } from "../../../../lib/contentSchema/draftQueries";

export const dynamic = "force-dynamic";

export default async function RascunhosPage() {
  const rascunhos = await listDrafts();

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <p style={{ marginBottom: 4 }}>
            <a href="/admin/biblioteca" style={{ color: "#8fd6a0", fontSize: 13 }}>
              ← voltar para a Biblioteca
            </a>
          </p>
          <h2 style={{ fontSize: 22, margin: 0 }}>Rascunhos</h2>
        </div>
        <a
          href="/admin/biblioteca/rascunhos/novo"
          style={{ background: "#22301f", border: "1px solid #3a5231", color: "#e8e8ec", borderRadius: 6, padding: "9px 16px", textDecoration: "none" }}
        >
          + Adicionar conteúdo
        </a>
      </div>

      {rascunhos.length === 0 ? (
        <p style={{ color: "#a8a8b3" }}>Nenhum rascunho ainda.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#a8a8b3", fontSize: 12, textTransform: "uppercase" }}>
              <th style={{ padding: "8px 10px" }}>Nome</th>
              <th style={{ padding: "8px 10px" }}>Tipo</th>
              <th style={{ padding: "8px 10px" }}>Origem</th>
              <th style={{ padding: "8px 10px" }}>Atualizado</th>
            </tr>
          </thead>
          <tbody>
            {rascunhos.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid #26262e" }}>
                <td style={{ padding: "8px 10px" }}>
                  <a href={`/admin/biblioteca/rascunhos/${r.id}`} style={{ color: "#8fd6a0", fontWeight: 600 }}>
                    {r.payload.camposEditaveis.campos.nome || r.slug}
                  </a>
                  <div style={{ color: "#7d7d8a" }}>{r.slug}</div>
                </td>
                <td style={{ padding: "8px 10px" }}>{CONTENT_TYPE_REGISTRY[r.content_type].label}</td>
                <td style={{ padding: "8px 10px" }}>
                  {r.base_document_id ? `edição de ${r.base_document_id}` : r.duplicated_from ? `duplicado de ${r.duplicated_from}` : "novo"}
                </td>
                <td style={{ padding: "8px 10px" }}>{new Date(r.updated_at).toLocaleString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
