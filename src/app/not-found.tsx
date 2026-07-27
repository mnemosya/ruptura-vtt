import Link from "next/link";

/**
 * 404 raiz do App Router (checkpoint pós-v0.94, fase 12) — antes desta
 * sessão o Next mostrava a página padrão genérica sem link de volta.
 */
export default function NotFound() {
  return (
    <main style={{ maxWidth: 560, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>Página não encontrada</h1>
      <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 20 }}>
        O endereço acessado não existe ou o conteúdo foi removido.
      </p>
      <Link href="/mesas" style={{ color: "#5ec8ff", fontSize: 13 }}>← Minhas mesas</Link>
    </main>
  );
}
