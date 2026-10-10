"use server";

import { getScopedTableClient } from "../auth/scopedClient";

export interface UserProfileCampaign {
  campaign_id: string;
  campaign_name: string;
  role: "narrator" | "player";
  characters: { id: string; name: string }[];
}

export interface UserProfile {
  user_id: string;
  display_name: string;
  /** Caminho no bucket `account-avatars`; a imagem sai por /api/usuarios/<id>/avatar. */
  avatar_path?: string | null;
  is_self: boolean;
  online: boolean;
  campaigns: UserProfileCampaign[];
}

/**
 * Perfil de uma pessoa com quem se compartilha campanha (NET-01).
 *
 * A regra de quem pode ver quem mora na RPC `read_user_profile` (0141),
 * não aqui: esconder a chamada não seria autorização. Recusa vira
 * `error`, e o chamador mostra recusa — nunca um perfil vazio, que
 * pareceria "essa pessoa não tem nada".
 */
export async function readUserProfile(userId: string): Promise<{ profile: UserProfile | null; error?: string }> {
  try {
    const client = await getScopedTableClient();
    const { data, error } = await client.rpc("read_user_profile", { p_user_id: userId });
    if (error) throw error;
    return { profile: data as UserProfile };
  } catch {
    return { profile: null, error: "Não foi possível abrir este perfil." };
  }
}

/**
 * Presença de todas as pessoas com quem se compartilha campanha, numa
 * consulta só — o painel Rede precisa do status de uma lista inteira, e
 * não de um perfil por linha.
 *
 * Em falha devolve mapa vazio com `error`: sem leitura, a Rede não
 * afirma que todo mundo está offline.
 */
export async function readNetworkPresence(): Promise<{ presence: Record<string, boolean>; error?: string }> {
  try {
    const client = await getScopedTableClient();
    const { data, error } = await client.rpc("read_network_presence");
    if (error) throw error;
    return { presence: (data ?? {}) as Record<string, boolean> };
  } catch {
    return { presence: {}, error: "Não foi possível ler a presença da rede." };
  }
}
