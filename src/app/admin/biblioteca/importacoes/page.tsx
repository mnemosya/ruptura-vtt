import { listImportSessions } from "../../../../lib/contentSchema/importSessionQueries";

export const dynamic = "force-dynamic";

export default async function ImportacoesPage() {
  const sessoes = await listImportSessions();

  return (
    <div>
      <p style={{ marginBottom: 16 }}>
        <a href="/admin/biblioteca/importar" style={{ color: "#8fd6a0", fontSize: 13 }}>
          ← voltar para importar
        </a>
      </p>
      <h2 style={{ fontSize: 22, marginBottom: 16 }}>Histórico de importações</h2>

      {sessoes.length === 0 ? (
        <p style={{ color: "#a8a8b3", fontSize: 13 }}>Nenhuma importação registrada ainda.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#7d7d8a", borderBottom: "1px solid #26262e" }}>
              <th style={{ padding: "6px 8px" }}>Arquivo</th>
              <th style={{ padding: "6px 8px" }}>Status</th>
              <th style={{ padding: "6px 8px" }}>Documentos</th>
              <th style={{ padding: "6px 8px" }}>Rascunhos criados</th>
              <th style={{ padding: "6px 8px" }}>Data</th>
            </tr>
          </thead>
          <tbody>
            {sessoes.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #1c1c22" }}>
                <td style={{ padding: "6px 8px" }}>
                  <a href={`/admin/biblioteca/importacoes/${s.id}`} style={{ color: "#8fd6a0" }}>
                    {s.nome_arquivo}
                  </a>
                </td>
                <td style={{ padding: "6px 8px" }}>{s.status}</td>
                <td style={{ padding: "6px 8px" }}>{s.resumo_documentos.length}</td>
                <td style={{ padding: "6px 8px" }}>{s.rascunhos_criados.length}</td>
                <td style={{ padding: "6px 8px", color: "#a8a8b3" }}>{new Date(s.created_at).toLocaleString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
