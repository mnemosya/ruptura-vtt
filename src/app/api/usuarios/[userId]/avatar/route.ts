import { getScopedTableClient } from "../../../../../lib/auth/scopedClient";
import { getAdminSupabaseClient } from "../../../../../lib/supabase/adminClient";
import { AVATAR_BUCKET } from "../../../../../lib/account/avatarService";

/**
 * Avatar de qualquer pessoa que divide campanha com quem pede.
 *
 * Quem autoriza é `read_user_profile` (0141), chamada como o usuário
 * logado: se ela recusa, a rota responde 404 sem dizer se o avatar
 * existe. Só depois disso o service role baixa o arquivo.
 *
 * Sem versão na URL (a lista de participantes não carrega o caminho),
 * então o cache é curto: uma troca aparece para os outros em minutos.
 */
export async function GET(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const { userId } = await context.params;
  let avatarPath: unknown = null;
  try {
    const client = await getScopedTableClient();
    const { data, error } = await client.rpc("read_user_profile", { p_user_id: userId });
    if (error) return new Response(null, { status: 404 });
    avatarPath = (data as { avatar_path?: unknown } | null)?.avatar_path;
  } catch {
    return new Response(null, { status: 404 });
  }
  // `user_metadata` é editável pelo dono: só vale caminho na pasta dele.
  if (typeof avatarPath !== "string" || !avatarPath.startsWith(`${userId}/`)) return new Response(null, { status: 404 });
  const admin = getAdminSupabaseClient();
  if (!admin) return new Response(null, { status: 503 });
  const { data, error } = await admin.storage.from(AVATAR_BUCKET).download(avatarPath);
  if (error || !data) return new Response(null, { status: 404 });
  return new Response(data.stream(), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=300" } });
}
