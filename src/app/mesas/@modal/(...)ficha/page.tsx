/**
 * Rota INTERCEPTADA: `(...)ficha` casa com navegações client-side para
 * /ficha disparadas a partir de qualquer página sob /mesas (Personagens
 * global, Personagens da campanha) — Next troca só o slot `@modal`
 * (declarado em `app/mesas/layout.tsx`) em vez de substituir a página
 * inteira. A página de origem continua montada por baixo; a URL muda
 * de verdade para /ficha?campaignId=...&characterId=..., então o link
 * continua compartilhável e o botão "voltar" do navegador funciona.
 *
 * Navegação DIRETA para /ficha (link compartilhado, refresh, ou vinda
 * de fora de /mesas — /join/[token], por exemplo) NÃO passa por aqui:
 * cai em `app/ficha/page.tsx` normalmente, página cheia, sem modal.
 *
 * Mesmo `FichaPageContent` dos dois pontos de entrada — nenhuma lógica
 * de carregamento duplicada. `ConsoleModalWrapper` só troca o que
 * "fechar o Console" significa (aqui, `router.back()`).
 */

import { FichaPageContent, type FichaPageContentParams } from "../../../ficha/FichaPageContent";
import { ConsoleModalWrapper } from "./ConsoleModalWrapper";

interface PageProps {
  searchParams: Promise<FichaPageContentParams>;
}

export default function InterceptedFichaModal({ searchParams }: PageProps) {
  return (
    <ConsoleModalWrapper>
      <FichaPageContent searchParams={searchParams} />
    </ConsoleModalWrapper>
  );
}
