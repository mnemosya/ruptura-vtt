import { notFound } from "next/navigation";
import { getImportSessionById } from "../../../../../lib/contentSchema/importSessionQueries";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ImportSessaoPage({ params }: PageProps) {
  const { id } = await params;
  const sessao = await getImportSessionById(id);
  if (!sessao) notFound();

  return (
    <div>
      <p style={{ marginBottom: 16 }}>
        <a href="/admin/biblioteca/importacoes" style={{ color: "#8fd6a0", fontSize: 13 }}>
          ← voltar para o histórico
        </a>
      </p>
      <h2 style={{ fontSize: 22, marginBottom: 6 }}>{sessao.nome_arquivo}</h2>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, color: "#a8a8b3", marginBottom: 20 }}>
        <span>status: {sessao.status}</span>
        <span>versão do formato: {sessao.versao_formato}</span>
        <span>hash do pacote: {sessao.hash_pacote.slice(0, 16)}…</span>
        <span>criada em: {new Date(sessao.created_at).toLocaleString("pt-BR")}</span>
        {sessao.confirmada_em && <span>confirmada em: {new Date(sessao.confirmada_em).toLocaleString("pt-BR")}</span>}
      </div>

      {sessao.avisos.length > 0 && (
        <div style={{ marginBottom: 16, padding: "8px 12px", borderRadius: 8, background: "#2a2818", border: "1px solid #5c5426", fontSize: 13, color: "#e0c56b" }}>
          <strong>Avisos:</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {sessao.avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <section style={{ border: "1px solid #26262e", borderRadius: 10, padding: 18, marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, marginTop: 0 }}>Documentos ({sessao.resumo_documentos.length})</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#7d7d8a", borderBottom: "1px solid #26262e" }}>
              <th style={{ padding: "6px 8px" }}>Tipo</th>
              <th style={{ padding: "6px 8px" }}>Slug</th>
              <th style={{ padding: "6px 8px" }}>Classificação</th>
              <th style={{ padding: "6px 8px" }}>Decisão</th>
            </tr>
          </thead>
          <tbody>
            {sessao.resumo_documentos.map((d) => {
              const chave = `${d.contentType}:${d.slug}`;
              return (
                <tr key={chave} style={{ borderBottom: "1px solid #1c1c22" }}>
                  <td style={{ padding: "6px 8px" }}>{d.contentType}</td>
                  <td style={{ padding: "6px 8px" }}>{d.slug}</td>
                  <td style={{ padding: "6px 8px" }}>{d.classificacao}</td>
                  <td style={{ padding: "6px 8px" }}>{sessao.decisoes[chave] ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {sessao.rascunhos_criados.length > 0 && (
        <section style={{ border: "1px solid #26262e", borderRadius: 10, padding: 18, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, marginTop: 0 }}>Rascunhos criados ({sessao.rascunhos_criados.length})</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {sessao.rascunhos_criados.map((draftId) => (
              <li key={draftId}>
                <a href={`/admin/biblioteca/rascunhos/${draftId}`} style={{ color: "#8fd6a0" }}>
                  {draftId}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sessao.conflitos.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", fontSize: 12, color: "#7d7d8a" }}>Conflitos detectados no momento da importação</summary>
          <pre style={{ background: "#111116", padding: 12, borderRadius: 8, fontSize: 12, overflowX: "auto", marginTop: 8 }}>
            {JSON.stringify(sessao.conflitos, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
