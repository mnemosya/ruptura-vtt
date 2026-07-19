/**
 * Lista administrativa da Biblioteca (Etapa 2). Read-only — sem criar,
 * editar, duplicar, publicar ou arquivar. Gate de autorização acontece
 * no layout pai (`../layout.tsx`); esta página só assume que já passou.
 */

import type { ContentType } from "../../../lib/content";
import { getManifestDiagnostics, listContentDocumentsForAdmin, type AdminStatusFiltro } from "../../../lib/contentSchema";
import { ContentTable } from "./ContentTable";
import { ListFilters } from "./ListFilters";
import { ManifestPanel } from "./ManifestPanel";
import { Pagination } from "./Pagination";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

interface PageProps {
  searchParams: Promise<{ contentType?: string; q?: string; categoria?: string; page?: string; status?: string }>;
}

export default async function BibliotecaAdminPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const contentType = params.contentType ? (params.contentType as ContentType) : undefined;
  const status: AdminStatusFiltro = params.status === "archived" ? "archived" : "published";

  const qs = (s: AdminStatusFiltro) => {
    const p = new URLSearchParams();
    if (params.contentType) p.set("contentType", params.contentType);
    if (params.q) p.set("q", params.q);
    if (params.categoria) p.set("categoria", params.categoria);
    if (s === "archived") p.set("status", "archived");
    const qsStr = p.toString();
    return qsStr ? `?${qsStr}` : "";
  };

  const [resultado, diagnosticoManifesto] = await Promise.all([
    listContentDocumentsForAdmin({ contentType, categoria: params.categoria, search: params.q, status, page, pageSize: PAGE_SIZE }),
    getManifestDiagnostics(),
  ]);

  const abaStyle = (ativo: boolean) => ({
    fontSize: 13,
    padding: "5px 12px",
    borderRadius: 6,
    border: "1px solid #34343e",
    color: ativo ? "#e8e8ec" : "#7d7d8a",
    background: ativo ? "#22301f" : "transparent",
    textDecoration: "none",
  });

  return (
    <div>
      <ManifestPanel diagnostico={diagnosticoManifesto} />
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <a href={`/admin/biblioteca${qs("published")}`} style={abaStyle(status === "published")}>Publicados</a>
        <a href={`/admin/biblioteca${qs("archived")}`} style={abaStyle(status === "archived")}>Arquivados</a>
      </div>
      <ListFilters contentType={params.contentType} search={params.q} categoria={params.categoria} />
      <ContentTable items={resultado.items} />
      <Pagination page={resultado.page} pageSize={resultado.pageSize} total={resultado.total} contentType={params.contentType} search={params.q} categoria={params.categoria} />
    </div>
  );
}
