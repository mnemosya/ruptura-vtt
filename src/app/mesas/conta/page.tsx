/**
 * "Conta e preferências" (aditivo §4.3) — nome de exibição e demais
 * preferências pessoais da conta. Fora de qualquer campanha (menu
 * geral, não menu de campanha).
 *
 * Avatar e demais preferências pessoais (além do nome de exibição)
 * ainda não têm um lugar de armazenamento definido — pendência
 * registrada no checkpoint da Fase 3, não bloqueia esta página.
 */
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth/session";
import ContaClient from "./ContaClient";

export const dynamic = "force-dynamic";

export default async function ContaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <ContaClient email={user.email ?? "(sem email)"} displayNameInicial={user.displayName} />;
}
