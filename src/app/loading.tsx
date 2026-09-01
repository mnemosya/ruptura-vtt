/**
 * Fallback de carregamento raiz do App Router (checkpoint pós-v0.94,
 * fase 12) — mostrado enquanto uma Server Component assíncrona
 * resolve, para rotas que ainda não têm um loading.tsx próprio.
 *
 * Passou a reusar `SectionLoading` na fase de motion: era uma cópia
 * literal dele (mesmo `<main>`, mesmo `maxWidth`, mesma linha de
 * texto), e manter as duas garantia que só uma das duas ganhasse o
 * esqueleto e o atraso anti-flash.
 */
import { SectionLoading } from "./_boundaries/SectionLoading";

export default function GlobalLoading() {
  return <SectionLoading label="Carregando…" />;
}
