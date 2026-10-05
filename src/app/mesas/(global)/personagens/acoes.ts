"use server";

/**
 * Personagem sem campanha, do lado do jogador: enviar para uma campanha
 * (fica pendente até o narrador aceitar) e cancelar o pedido.
 *
 * Quem narra a campanha de destino não precisa pedir a si mesmo: o
 * personagem entra direto.
 */

import "server-only";
import { revalidatePath } from "next/cache";
import { resolveCampaignAccess } from "../../../../lib/campaign/access";
import { acceptCharacterJoin, cancelCharacterJoin, requestCharacterJoin } from "../../../../lib/character/storage";

type Resultado = { ok: true; entrouDireto?: boolean } | { ok: false; erro: string };

const mensagem = (e: unknown, padrao: string) => (e instanceof Error ? e.message.replace(/^[^:]+: /, "") : padrao);

export async function enviarParaCampanhaAction(characterId: string, campaignId: string): Promise<Resultado> {
  const acesso = await resolveCampaignAccess(campaignId);
  if (acesso.kind !== "ok") return { ok: false, erro: acesso.kind === "no_session" ? "Sessão expirada." : "Você não participa desta campanha." };
  try {
    await requestCharacterJoin(characterId, campaignId);
    const narra = acesso.role === "narrator";
    if (narra) await acceptCharacterJoin(characterId);
    revalidatePath("/mesas/personagens");
    return { ok: true, entrouDireto: narra };
  } catch (e) {
    return { ok: false, erro: mensagem(e, "Falha ao enviar o personagem.") };
  }
}

export async function cancelarPedidoAction(characterId: string): Promise<Resultado> {
  try {
    await cancelCharacterJoin(characterId);
    revalidatePath("/mesas/personagens");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagem(e, "Falha ao cancelar o pedido.") };
  }
}
