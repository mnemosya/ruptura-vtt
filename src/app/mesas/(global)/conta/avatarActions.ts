"use server";

import { getCurrentUser } from "../../../../lib/auth/session";
import { getScopedTableClient } from "../../../../lib/auth/scopedClient";
import { removeAccountAvatar, uploadAccountAvatar } from "../../../../lib/account/avatarService";

export type AvatarActionResult = { ok: true; avatarPath: string | null } | { ok: false; error: string };

/** Troca o avatar: sobe o novo, aponta o metadata para ele e só então apaga o antigo. */
export async function enviarAvatarConta(form: FormData): Promise<AvatarActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Sessão expirada. Entre de novo." };
    const arquivo = form.get("avatar");
    if (!(arquivo instanceof File)) return { ok: false, error: "Nenhuma imagem recebida." };

    const path = await uploadAccountAvatar(user.id, arquivo);
    const client = await getScopedTableClient();
    const { error } = await client.auth.updateUser({ data: { avatar_path: path } });
    if (error) {
      await removeAccountAvatar(path).catch(() => {});
      return { ok: false, error: error.message };
    }
    if (user.avatarPath) await removeAccountAvatar(user.avatarPath).catch(() => {});
    return { ok: true, avatarPath: path };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro desconhecido ao enviar o avatar." };
  }
}

export async function removerAvatarConta(): Promise<AvatarActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Sessão expirada. Entre de novo." };
    const client = await getScopedTableClient();
    const { error } = await client.auth.updateUser({ data: { avatar_path: null } });
    if (error) return { ok: false, error: error.message };
    if (user.avatarPath) await removeAccountAvatar(user.avatarPath).catch(() => {});
    return { ok: true, avatarPath: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro desconhecido ao remover o avatar." };
  }
}
