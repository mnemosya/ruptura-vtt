"use client";

/**
 * Boundary de erro compartilhado por `error.tsx` de rota (checkpoint
 * fechamento de produção) — mesmo padrão do `error.tsx` raiz
 * (`src/app/error.tsx`), parametrizado por escopo/mensagem/link de
 * volta e usando o logger central em vez de `console.error` direto.
 * `role="alert"` (novidade — nenhum lugar do projeto usava ARIA antes
 * desta fase) para leitores de tela anunciarem o erro.
 */

import { useEffect } from "react";
import Link from "next/link";
import { logError } from "../../lib/logger";

export function SectionError({
  scope,
  title = "Algo deu errado",
  message = "Um erro inesperado interrompeu esta página. Tente novamente — se persistir, recarregue.",
  backHref,
  backLabel,
  error,
  reset,
}: {
  scope: string;
  title?: string;
  message?: string;
  backHref: string;
  backLabel: string;
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError(scope, error);
  }, [scope, error]);

  return (
    <main style={{ maxWidth: 560, margin: "80px auto", padding: "0 20px", textAlign: "center" }} role="alert">
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>{title}</h1>
      <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 20 }}>{message}</p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", alignItems: "center" }}>
        <button
          onClick={reset}
          style={{ background: "#1d1e24", color: "inherit", border: "1px solid #333", borderRadius: 6, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}
        >
          Tentar de novo
        </button>
        <Link href={backHref} style={{ color: "#5ec8ff", fontSize: 13 }}>← {backLabel}</Link>
      </div>
    </main>
  );
}
