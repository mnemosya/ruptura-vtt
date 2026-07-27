/**
 * Fallback de carregamento raiz do App Router (checkpoint pós-v0.94,
 * fase 12) — mostrado enquanto uma Server Component assíncrona
 * resolve, para rotas que ainda não têm um loading.tsx próprio.
 */
export default function GlobalLoading() {
  return (
    <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
      <p style={{ fontSize: 13, opacity: 0.6 }}>Carregando…</p>
    </main>
  );
}
