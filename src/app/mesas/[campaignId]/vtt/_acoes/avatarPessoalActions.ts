"use server";

/** Avatar do personagem sem campanha: envio e remoção (ver `lib/character/avatarPessoal`). */

import { getCurrentUser } from "../../../../../lib/auth/session";
import { enviarAvatarPessoal, lerCaminhoAvatarPessoal, removerAvatarPessoal, urlAvatarPessoal } from "../../../../../lib/character/avatarPessoal";

export async function enviarAvatarPessoalAction(characterId: string, dados: FormData): Promise<{ ok: boolean; erro?: string; url?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, erro: "Sessão expirada." };
  const arquivo = dados.get("arquivo");
  if (!(arquivo instanceof File)) return { ok: false, erro: "Nenhuma imagem recebida." };
  try {
    const caminho = await enviarAvatarPessoal(user.id, characterId, arquivo);
    return { ok: true, url: urlAvatarPessoal(characterId, caminho) ?? undefined };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não foi possível enviar o avatar." };
  }
}

export async function removerAvatarPessoalAction(characterId: string): Promise<{ ok: boolean; erro?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, erro: "Sessão expirada." };
  try {
    await removerAvatarPessoal(user.id, characterId);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não foi possível remover o avatar." };
  }
}

/** URL do avatar pessoal atual (versionada), ou nada. */
export async function lerAvatarPessoalAction(characterId: string): Promise<{ url: string | null }> {
  const caminho = await lerCaminhoAvatarPessoal(characterId).catch(() => null);
  return { url: urlAvatarPessoal(characterId, caminho) };
}
