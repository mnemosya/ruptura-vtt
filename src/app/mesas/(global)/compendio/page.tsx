/**
 * "Compêndio" no menu geral da conta: o livro de RUPTURA v1.2 sincronizado
 * do Notion, o mesmo modal que abre dentro da mesa, aqui fora de qualquer campanha
 * (PLANO_COMPENDIO_NOTION). Substituiu o catálogo da Biblioteca do Sistema
 * por tipo (magias, talentos, itens…), decisão de 03/10/2026; o editor
 * administrativo continua em /admin/biblioteca.
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../../lib/auth/session";
import { CompendioModal } from "./CompendioModal";

export const dynamic = "force-dynamic";

export default async function CompendioPage() {
  if (!(await getCurrentUser())) redirect("/login");
  // O livro abre no modal do Códex, com a tela toda (mais espaço que a área de conteúdo).
  return <CompendioModal />;
}
