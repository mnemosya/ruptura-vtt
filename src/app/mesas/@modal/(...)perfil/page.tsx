/**
 * Rota INTERCEPTADA do perfil, mesmo mecanismo já usado pela ficha:
 * navegações client-side para /perfil a partir de qualquer página sob
 * /mesas trocam só o slot `@modal`, então a página de baixo (o
 * dashboard, por exemplo) continua montada, a URL muda de verdade e o
 * botão "voltar" fecha o modal.
 *
 * Navegação DIRETA para /perfil não passa por aqui: cai em
 * `app/perfil/page.tsx`, página cheia. As duas entradas renderizam o
 * MESMO `PerfilPageContent` — nada de carregamento duplicado.
 */

import { PerfilPageContent, type PerfilPageContentParams } from "../../../perfil/PerfilPageContent";
import { PerfilModal } from "./PerfilModal";

export default function PerfilInterceptado({ searchParams }: { searchParams: Promise<PerfilPageContentParams> }) {
  return (
    <PerfilModal>
      <PerfilPageContent searchParams={searchParams} />
    </PerfilModal>
  );
}
