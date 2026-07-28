"use client";

/**
 * Boundary de erro raiz do App Router (checkpoint pós-v0.94, fase 12/13) —
 * antes desta sessão não existia NENHUM error.tsx/loading.tsx em
 * `src/app`, então uma exceção não tratada numa Server Component
 * derrubava a página inteira sem nenhuma UI de recuperação. Loga via
 * `logError` (checkpoint fechamento de produção) — nunca stack/dados
 * sensíveis, sem serviço externo (fora de escopo, PRD "observabilidade
 * mínima"). Boundaries por rota (`_boundaries/SectionError.tsx`) usam
 * o mesmo logger; este continua sendo o fallback de último recurso.
 */

import { useEffect } from "react";
import { logError } from "../lib/logger";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logError("root", error);
  }, [error]);

  return (
    <main style={{ maxWidth: 560, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>Algo deu errado</h1>
      <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 20 }}>
        Um erro inesperado interrompeu esta página. Tente novamente — se persistir, recarregue.
      </p>
      <button
        onClick={reset}
        style={{ background: "#1d1e24", color: "inherit", border: "1px solid #333", borderRadius: 6, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}
      >
        Tentar de novo
      </button>
    </main>
  );
}
