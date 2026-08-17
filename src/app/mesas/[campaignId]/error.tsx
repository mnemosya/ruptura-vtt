"use client";

/**
 * Boundary de erro da campanha. Fase 5: deixou de usar o `SectionError`
 * global (que segue servindo /admin, /ficha, /join e o dashboard — ver
 * nota em `loading.tsx`) para adotar a linguagem `rm-*`, mas mantém o
 * que importava dele: `logError` no logger central (nunca
 * `console.error` solto) e `role="alert"`.
 *
 * Renderiza DENTRO da casca da campanha — só erros dos FILHOS do
 * layout chegam aqui; se o próprio layout falhar, quem trata é o
 * `error.tsx` de `/mesas`, um nível acima, fora da casca.
 */

import { useEffect } from "react";
import Link from "next/link";
import { logError } from "../../../lib/logger";

export default function CampaignError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logError("mesas.campaignId", error);
  }, [error]);

  return (
    <main className="rm-boundary" role="alert">
      <h1 className="rm-page-title">Algo deu errado</h1>
      <p className="rm-boundary-msg">
        Não foi possível carregar esta parte da campanha. Tente novamente — se persistir, recarregue a página.
      </p>
      <div className="rm-boundary-acoes">
        <button type="button" onClick={reset} className="rm-btn rm-btn-primary rv-focusable">
          Tentar de novo
        </button>
        <Link href="/mesas" className="rm-btn rm-btn-ghost rv-focusable">Minhas Campanhas</Link>
      </div>
    </main>
  );
}
