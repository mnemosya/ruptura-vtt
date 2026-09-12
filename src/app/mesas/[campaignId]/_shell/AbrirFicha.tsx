"use client";

/**
 * "Abrir ficha", em qualquer lugar da campanha.
 *
 * Dentro da casca (`ProvedorConsoleDaMesa`), abre o Console por cima
 * da página atual — sem navegar, sem trocar a URL, sem a barra própria
 * da rota `/ficha`. Fora dela (fluxos que não passam pela mesa, como o
 * convite), continua sendo um link normal para `/ficha`, que segue
 * existindo para link direto.
 *
 * Um componente só, e não `useConsoleDaMesa()` repetido em cada tela,
 * porque são cinco pontos de entrada com o MESMO comportamento — e
 * porque o aquecimento no hover/foco (que é o que faz a abertura ser
 * instantânea) precisa estar em todos eles, não só em quem lembrar.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { useConsoleDaMesa } from "./ConsoleDaMesa";

export function AbrirFicha({
  campaignId,
  characterId,
  className,
  testId,
  title,
  tab,
  children,
}: {
  campaignId: string;
  characterId: string;
  className?: string;
  testId?: string;
  title?: string;
  /** Aba inicial — só usada no fallback por link. */
  tab?: string | null;
  children: ReactNode;
}) {
  const consoleDaMesa = useConsoleDaMesa();

  if (!consoleDaMesa) {
    return (
      <Link
        href={`/ficha?campaignId=${campaignId}&characterId=${characterId}${tab ? `&tab=${tab}` : ""}`}
        className={className}
        data-testid={testId}
        title={title}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      data-testid={testId}
      title={title}
      onMouseEnter={consoleDaMesa.aquecer}
      onFocus={consoleDaMesa.aquecer}
      onClick={() => consoleDaMesa.abrir(characterId)}
    >
      {children}
    </button>
  );
}
