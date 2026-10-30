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
import { contagensDoMenu } from "../../_global/contagens";

export const dynamic = "force-dynamic";

export default async function ContaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const contagens = await contagensDoMenu(user.id);
  return (
    <ContaClient email={user.email ?? "(sem email)"} displayNameInicial={user.displayName} avatarPathInicial={user.avatarPath}
      contagens={contagens} />
  );
}
