/**
 * Autorização administrativa da Biblioteca (Etapa 2 do aditivo do
 * Editor Universal). A auditoria da Etapa 0 confirmou que não existia
 * nenhum papel administrativo no projeto — esta é a primeira camada.
 *
 * A checagem SEMPRE acontece no servidor, nunca só por ocultar botão/
 * rota na UI: `getContentAdminStatus()` lê a sessão do cookie httpOnly
 * (mesma sessão de /login, ver `session.ts`) e chama a função Postgres
 * `is_content_admin()` (migration 0020_content_admin_roles.sql,
 * SECURITY DEFINER) através do client "scoped" já existente
 * (`getScopedTableClient`, que anexa o access token da sessão). Um
 * usuário anônimo, ou autenticado mas sem linha em `admin_users`,
 * recebe `isAdmin: false` — nunca lança e nunca deixa a rota passar por
 * omissão em caso de erro de rede/RPC.
 */

import { getScopedTableClient } from "./scopedClient";
import { getCurrentUser, type AuthUser } from "./session";

export interface ContentAdminStatus {
  user: AuthUser | null;
  isAdmin: boolean;
}

export async function getContentAdminStatus(): Promise<ContentAdminStatus> {
  const user = await getCurrentUser();
  if (!user) return { user: null, isAdmin: false };

  try {
    const client = await getScopedTableClient();
    const { data, error } = await client.rpc("is_content_admin");
    if (error) return { user, isAdmin: false };
    return { user, isAdmin: data === true };
  } catch {
    // Qualquer falha de rede/RPC é tratada como "não autorizado" — nunca
    // como "autorizado por padrão".
    return { user, isAdmin: false };
  }
}
