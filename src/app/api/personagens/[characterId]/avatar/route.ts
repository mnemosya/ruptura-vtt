import { baixarAvatarPessoal } from "../../../../../lib/character/avatarPessoal";

/**
 * Avatar de personagem sem campanha (`characters.avatar_path`). Quem
 * autoriza é a RLS de `characters`, lida como o usuário logado; sem
 * acesso, 404 sem dizer se existe. A URL leva a versão (`?v=`), então o
 * cache pode ser longo.
 */
export async function GET(_request: Request, context: { params: Promise<{ characterId: string }> }) {
  const { characterId } = await context.params;
  const blob = await baixarAvatarPessoal(characterId).catch(() => null);
  if (!blob) return new Response(null, { status: 404 });
  return new Response(blob.stream(), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=86400, immutable" } });
}
