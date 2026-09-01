/**
 * Estado de carregamento compartilhado por `loading.tsx` de rota
 * (/admin, /ficha, /join, /login e o que mais não tiver o seu).
 * Server Component (sem `"use client"` — não precisa de hooks).
 *
 * Virou uma casca fina em volta de `BootPanel`: o desenho é um só no
 * projeto inteiro, e a explicação de por que ele deixou de ser um
 * esqueleto de blocos está lá.
 *
 * `--mo-boot-stage-min: 100dvh`, não `100%` (o padrão de `.mo-boot-stage`):
 * nenhuma destas rotas tem casca persistente ao redor — não existe
 * `.rm-shell-main`/`.ra2-content` aqui para herdar altura de um
 * ancestral, então a base de centralização precisa ser a viewport em
 * si. É o caso oposto de `(global)/loading.tsx` e
 * `[campaignId]/loading.tsx`, que TÊM esse ancestral e usam o padrão.
 */
import { BootPanel } from "./BootPanel";

export function SectionLoading({ label }: { label: string }) {
  return (
    <main
      className="mo-boot-stage mo-scope"
      aria-busy="true"
      style={{ "--mo-boot-stage-min": "100dvh" } as React.CSSProperties}
    >
      <BootPanel label={label} />
    </main>
  );
}
