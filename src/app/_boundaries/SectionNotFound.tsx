import Link from "next/link";

/**
 * "Não encontrado" compartilhado por `not-found.tsx` de rota
 * (checkpoint fechamento de produção) — mesmo estilo do `not-found.tsx`
 * raiz (`src/app/not-found.tsx`), parametrizado por título/mensagem e
 * o link de volta certo para a seção (em vez do genérico "Minhas
 * mesas" da raiz). Server Component.
 */
export function SectionNotFound({
  title = "Página não encontrada",
  message,
  backHref,
  backLabel,
}: {
  title?: string;
  message: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <main style={{ maxWidth: 560, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>{title}</h1>
      <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 20 }}>{message}</p>
      <Link href={backHref} style={{ color: "#5ec8ff", fontSize: 13 }}>← {backLabel}</Link>
    </main>
  );
}
