import { listarFindingsAdmin, type FindingStatus } from "../../../lib/ruptura-agent/admin";

export const dynamic = "force-dynamic";

const STATUSES: { id: FindingStatus; label: string }[] = [
  { id: "open", label: "Novos" }, { id: "acknowledged", label: "Reconhecidos" },
  { id: "stale", label: "Stale" }, { id: "resolved", label: "Resolvidos" },
  { id: "ignored", label: "Ignorados" },
];

export default async function RupturaAgentPage({ searchParams }: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const status = STATUSES.find((item) => item.id === params.status)?.id ?? "open";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  let loaded;
  try {
    loaded = await listarFindingsAdmin(status, page);
  } catch {
    return <main>
      <h2 style={{ fontSize: 22 }}>Achados do RUPTURA Agent</h2>
      <p>Não foi possível carregar os achados. Confira as migrations e a conexão com o Supabase.</p>
    </main>;
  }
  const { findings, sources, total } = loaded;
  const pages = Math.max(1, Math.ceil(total / 20));

  return (
    <main>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 22, margin: "0 0 6px" }}>Achados do RUPTURA Agent</h2>
        <p style={{ color: "#a8a8b3", margin: 0, fontSize: 14 }}>Evidências do corpus do Notion e revisões pendentes.</p>
      </div>
      <nav aria-label="Status dos achados" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {STATUSES.map((item) => <a key={item.id} href={`/admin/ruptura-agent?status=${item.id}`}
          aria-current={item.id === status ? "page" : undefined}
          style={{ padding: "7px 12px", borderRadius: 6, border: "1px solid #3b3b45",
            background: item.id === status ? "#243720" : "transparent", color: "#e8e8ec", fontSize: 13,
            textDecoration: "none" }}>{item.label}</a>)}
      </nav>
      <p style={{ fontSize: 13, color: "#a8a8b3" }}>{total} achado{total === 1 ? "" : "s"} · página {page} de {pages}</p>
      {findings.length === 0 ? <p style={{ color: "#a8a8b3" }}>Nenhum achado neste status.</p> :
        <div style={{ display: "grid", gap: 10 }}>
          {findings.map((finding) => {
            const source = sources.get(finding.source_id);
            return <a key={finding.id} href={`/admin/ruptura-agent/${finding.id}`}
              style={{ display: "block", padding: 16, border: "1px solid #393943", borderRadius: 8,
                color: "#ededf0", textDecoration: "none", background: "#1b1b22" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <strong>{finding.title}</strong>
                <span style={{ fontSize: 12, color: finding.severity === "high" ? "#f39b91" : "#d5c79a" }}>
                  {finding.severity} · {finding.category}
                </span>
              </div>
              <div style={{ color: "#a8a8b3", fontSize: 12, marginTop: 6 }}>
                {source?.path.join(" › ") ?? "Fonte indisponível"} · {finding.detector} · {finding.occurrences} ocorrência{finding.occurrences === 1 ? "" : "s"}
              </div>
              <p style={{ color: "#c9c9d1", fontSize: 13, margin: "8px 0 0" }}>{finding.description}</p>
            </a>;
          })}
        </div>}
      <nav aria-label="Páginas" style={{ display: "flex", gap: 16, marginTop: 22, fontSize: 13 }}>
        {page > 1 && <a href={`?status=${status}&page=${page - 1}`}>← Anterior</a>}
        {page < pages && <a href={`?status=${status}&page=${page + 1}`}>Próxima →</a>}
      </nav>
    </main>
  );
}
