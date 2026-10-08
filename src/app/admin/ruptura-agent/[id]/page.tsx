import { notFound } from "next/navigation";
import { lerFindingAdmin } from "../../../../lib/ruptura-agent/admin";
import { alterarStatusFinding } from "../actions";

export const dynamic = "force-dynamic";

interface Evidence { sourceId?: string; blockId?: string; excerpt?: string; targetSourceId?: string }

export default async function FindingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const result = await lerFindingAdmin(id);
  if (!result) notFound();
  const { finding, source, relatedSources } = result;
  const evidence = Array.isArray(finding.evidence) ? finding.evidence as Evidence[] : [];
  const date = (value: string) => new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
  const actions: { status: string; label: string }[] = [
    { status: "acknowledged", label: "Reconhecer" },
    { status: "resolved", label: "Resolver" },
    { status: "ignored", label: "Ignorar" },
    { status: "open", label: "Reabrir" },
  ];
  const currentEvidence = source?.snapshot_hash === finding.source_revision && finding.status !== "stale";

  return <main style={{ maxWidth: 900 }}>
    <a href={`/admin/ruptura-agent?status=${finding.status}`} style={{ fontSize: 13 }}>← Voltar aos achados</a>
    <header style={{ margin: "20px 0" }}>
      <h2 style={{ fontSize: 24, margin: "0 0 8px" }}>{finding.title}</h2>
      <div style={{ color: "#a8a8b3", fontSize: 13 }}>
        {finding.severity} · {finding.category} · {finding.status} · confiança {Math.round(finding.confidence * 100)}%
      </div>
    </header>
    <section style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 16 }}>Fonte</h3>
      <p style={{ margin: "4px 0", color: "#d4d4dc" }}>{source?.path.join(" › ") ?? "Fonte indisponível"}</p>
      <p style={{ margin: "4px 0", fontSize: 13, color: "#a8a8b3" }}>
        {source?.role ?? "sem role"} · revisão {finding.source_revision.slice(0, 12)} · {source?.active ? "ativa" : "inativa"}
      </p>
      {source && <a href={`https://www.notion.so/${source.notion_id}`} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>Abrir fonte no Notion ↗</a>}
      {relatedSources.length > 0 && <div style={{ marginTop: 10, fontSize: 13 }}>
        <strong>Fontes relacionadas</strong>
        <ul>{relatedSources.map((related) => <li key={related.id}>
          <a href={`https://www.notion.so/${related.notion_id}`} target="_blank" rel="noreferrer">{related.path.join(" › ")}</a>
          <span style={{ color: "#a8a8b3" }}> · {related.role}</span>
        </li>)}</ul>
      </div>}
    </section>
    <section style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 16 }}>Análise</h3>
      <p>{finding.description}</p>
      <p style={{ color: "#c9c9d1" }}>{finding.rationale}</p>
      {finding.suggested_action && <p><strong>Ação sugerida:</strong> {finding.suggested_action}</p>}
    </section>
    <section style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 16 }}>Evidências</h3>
      {evidence.length === 0 ? <p>Sem evidências registradas.</p> : evidence.map((item, index) =>
        <div key={`${item.blockId ?? "bloco"}-${index}`} style={{ borderLeft: "3px solid #5d7756", padding: "8px 14px", marginBottom: 12, background: "#1b1b22" }}>
          <div style={{ fontSize: 12, color: "#a8a8b3" }}>Fonte {item.sourceId ?? "?"} · bloco {item.blockId ?? "?"}</div>
          <blockquote style={{ margin: "8px 0", whiteSpace: "pre-wrap" }}>{item.excerpt ?? ""}</blockquote>
          {item.targetSourceId && <div style={{ fontSize: 12, color: "#a8a8b3" }}>Destino: {item.targetSourceId}</div>}
        </div>)}
    </section>
    <section style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 16 }}>Revisão</h3>
      <p style={{ fontSize: 13, color: "#a8a8b3" }}>
        Detector {finding.detector} · primeira vez {date(finding.first_seen_at)} · última vez {date(finding.last_seen_at)} · {finding.occurrences} ocorrência{finding.occurrences === 1 ? "" : "s"}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {actions.filter((action) => action.status !== finding.status &&
          (currentEvidence || !["open", "acknowledged"].includes(action.status))).map((action) =>
          <form key={action.status} action={alterarStatusFinding}>
            <input type="hidden" name="id" value={finding.id} />
            <input type="hidden" name="status" value={action.status} />
            <button type="submit" style={{ padding: "7px 12px", border: "1px solid #474752", borderRadius: 6,
              background: "#292933", color: "#ededf0", cursor: "pointer" }}>{action.label}</button>
          </form>)}
      </div>
    </section>
  </main>;
}
