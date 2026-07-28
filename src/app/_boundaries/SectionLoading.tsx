/**
 * Esqueleto de carregamento compartilhado por `loading.tsx` de rota
 * (checkpoint fechamento de produção) — mesmo estilo minimalista do
 * `loading.tsx` raiz (`src/app/loading.tsx`), só parametrizado pelo
 * rótulo da seção. Server Component (sem `"use client"` — não precisa
 * de hooks).
 */
export function SectionLoading({ label }: { label: string }) {
  return (
    <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
      <p style={{ fontSize: 13, opacity: 0.6 }}>{label}</p>
    </main>
  );
}
