/**
 * Lista administrativa da Biblioteca (Etapa 2). Read-only — sem criar,
 * editar, duplicar, publicar ou arquivar. Gate de autorização acontece
 * no layout pai (`../layout.tsx`); esta página só assume que já passou.
 */

import type { ContentType } from "../../../lib/content";
import { getManifestDiagnostics, listContentDocumentsForAdmin } from "../../../lib/contentSchema";
import { ContentTable } from "./ContentTable";
import { ListFilters } from "./ListFilters";
import { ManifestPanel } from "./ManifestPanel";
import { Pagination } from "./Pagination";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

interface PageProps {
  searchParams: Promise<{ contentType?: string; q?: string; categoria?: string; page?: string }>;
}

export default async function BibliotecaAdminPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const contentType = params.contentType ? (params.contentType as ContentType) : undefined;

  const [resultado, diagnosticoManifesto] = await Promise.all([
    listContentDocumentsForAdmin({ contentType, categoria: params.categoria, search: params.q, page, pageSize: PAGE_SIZE }),
    getManifestDiagnostics(),
  ]);

  return (
    <div>
      <ManifestPanel diagnostico={diagnosticoManifesto} />
      <ListFilters contentType={params.contentType} search={params.q} categoria={params.categoria} />
      <ContentTable items={resultado.items} />
      <Pagination page={resultado.page} pageSize={resultado.pageSize} total={resultado.total} contentType={params.contentType} search={params.q} categoria={params.categoria} />
    </div>
  );
}
