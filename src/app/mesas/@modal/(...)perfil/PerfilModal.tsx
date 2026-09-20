"use client";

/**
 * Casca do modal de perfil. É "use client" só pelo que precisa de
 * navegador — fechar com Esc, clique no véu e devolução de foco —, e
 * por isso fica separada da `page.tsx`, que é Server Component para
 * poder renderizar o conteúdo async por dentro.
 *
 * Fechar é `router.back()`: a rota interceptada empilhou uma entrada de
 * histórico de verdade, então voltar é o gesto que o usuário já espera
 * do navegador.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "../../../_design/icons";

export function PerfilModal({ children }: { children: ReactNode }) {
  const router = useRouter();
  const caixaRef = useRef<HTMLDivElement>(null);
  const anterior = useRef<Element | null>(null);

  useEffect(() => {
    anterior.current = document.activeElement;
    caixaRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") router.back(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // Devolve o foco a quem abriu — sem isso ele volta para o <body>
      // e quem navega por teclado perde o lugar na lista.
      (anterior.current as HTMLElement | null)?.focus?.();
    };
  }, [router]);

  return (
    <div className="rv-perfil-veu" onClick={() => router.back()} data-testid="perfil-modal">
      <div className="rv-perfil-caixa" role="dialog" aria-modal="true" aria-label="Perfil"
        tabIndex={-1} ref={caixaRef} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rv-perfil-fechar" onClick={() => router.back()} aria-label="Fechar perfil">
          <X size={16} />
        </button>
        {children}
      </div>
    </div>
  );
}
