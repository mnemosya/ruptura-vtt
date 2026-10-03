/**
 * "Compêndio" no menu geral da conta: o livro de RUPTURA v1.2 sincronizado
 * do Notion, o mesmo que abre dentro da mesa, aqui fora de qualquer campanha
 * (PLANO_COMPENDIO_NOTION). Substituiu o catálogo da Biblioteca do Sistema
 * por tipo (magias, talentos, itens…), decisão de 03/10/2026; o editor
 * administrativo continua em /admin/biblioteca.
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../../lib/auth/session";
import { PageHead } from "../../_global/parts";
import { LivroPagina } from "../../[campaignId]/vtt/_compendio/LivroCodex";

export const dynamic = "force-dynamic";

export default async function CompendioPage() {
  if (!(await getCurrentUser())) redirect("/login");
  return (
    <div className="ra2-page ra2-view-enter">
      <PageHead eyebrow="SYS.RUPTURA // LIVRO DE REGRAS" title="Compêndio" />
      <LivroPagina />
    </div>
  );
}
