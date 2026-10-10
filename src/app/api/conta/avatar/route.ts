import { getCurrentUser } from "../../../../lib/auth/session";
import { getAdminSupabaseClient } from "../../../../lib/supabase/adminClient";
import { AVATAR_BUCKET } from "../../../../lib/account/avatarService";

/** Avatar do usuário logado. O caminho muda a cada troca, então a URL leva `?v=<caminho>` e pode ser cacheada. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.avatarPath) return new Response(null, { status: 404 });
  const admin = getAdminSupabaseClient();
  if (!admin) return new Response(null, { status: 503 });
  const { data, error } = await admin.storage.from(AVATAR_BUCKET).download(user.avatarPath);
  if (error || !data) return new Response(null, { status: 404 });
  return new Response(data.stream(), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=86400" } });
}
