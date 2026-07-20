function buildHref(params: Record<string, string | undefined>, page: number): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  search.set("page", String(page));
  return `/admin/biblioteca?${search.toString()}`;
}

export function Pagination({
  page,
  pageSize,
  total,
  contentType,
  search,
  categoria,
  status,
  metadata,
}: {
  page: number;
  pageSize: number;
  total: number;
  contentType?: string;
  search?: string;
  categoria?: string;
  status?: string;
  metadata?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const params = { contentType, q: search, categoria, status, metadata };

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, fontSize: 13, color: "#a8a8b3" }}>
      <span>
        {total} conteúdo(s) encontrado(s) — página {page} de {totalPages}
      </span>
      <div style={{ display: "flex", gap: 12 }}>
        {page > 1 ? (
          <a href={buildHref(params, page - 1)} style={{ color: "#8fd6a0" }}>
            ← Anterior
          </a>
        ) : (
          <span style={{ opacity: 0.4 }}>← Anterior</span>
        )}
        {page < totalPages ? (
          <a href={buildHref(params, page + 1)} style={{ color: "#8fd6a0" }}>
            Próxima →
          </a>
        ) : (
          <span style={{ opacity: 0.4 }}>Próxima →</span>
        )}
      </div>
    </div>
  );
}
