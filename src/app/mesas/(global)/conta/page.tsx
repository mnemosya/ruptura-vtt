/**
 * "Conta e preferências" (aditivo §4.3) — nome de exibição e demais
 * preferências pessoais da conta. Fora de qualquer campanha (menu
 * geral, não menu de campanha).
 *
 * O avatar fica no bucket privado `account-avatars`, com o caminho em
 * `user_metadata.avatar_path` (mesmo lugar do nome de exibição).
 */
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../../lib/auth/session";
import ContaClient from "./ContaClient";

export const dynamic = "force-dynamic";

export default async function ContaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <ContaClient email={user.email ?? "(sem email)"} displayNameInicial={user.displayName} avatarPathInicial={user.avatarPath} />
  );
}
