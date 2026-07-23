"use server";

/**
 * Reivindicação de perfil de campanha por usuário autenticado (Etapa 12,
 * correção 3 — migration 0028). Separado de
 * `campaignContentServerActions.ts` porque é sobre `campaign_profiles`,
 * não sobre conteúdo de campanha — mesmo domínio (Etapa 12), escopo
 * diferente.
 *
 * Toda função aqui reforça `auth.uid()` no PRÓPRIO servidor
 * (`getCurrentUser`) e a escrita passa pela RPC `SECURITY DEFINER`
 * (migration 0028), que revalida tudo de novo no banco — nunca confia
 * no client.
 */

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth/session";
import { getScopedTableClient } from "../auth/scopedClient";

export interface ReivindicarPerfilResultado {
  ok: boolean;
  erro?: string;
  profileId?: string;
  campaignId?: string;
}

/** Reivindica um perfil EXISTENTE ainda não reivindicado (ou já reivindicado pelo próprio usuário — idempotente). */
export async function claimCampaignProfile(profileId: string): Promise<ReivindicarPerfilResultado> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, erro: "É necessário estar autenticado para reivindicar um perfil." };

    const client = await getScopedTableClient();
    const { data, error } = await client.rpc("claim_campaign_profile", { p_profile_id: profileId });
    if (error) return { ok: false, erro: error.message };

    const resultado = data as { profileId: string; campaignId: string };
    revalidatePath(`/join`);
    return { ok: true, profileId: resultado.profileId, campaignId: resultado.campaignId };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}

/** Cria um perfil NOVO já reivindicado pelo usuário autenticado. */
export async function createAndClaimCampaignProfile(campaignId: string, nickname: string): Promise<ReivindicarPerfilResultado> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, erro: "É necessário estar autenticado para criar um perfil." };
    if (!nickname || nickname.trim() === "") return { ok: false, erro: "Nome do perfil é obrigatório." };

    const client = await getScopedTableClient();
    const { data, error } = await client.rpc("create_and_claim_campaign_profile", { p_campaign_id: campaignId, p_nickname: nickname.trim() });
    if (error) return { ok: false, erro: error.message };

    const resultado = data as { profileId: string; campaignId: string };
    revalidatePath(`/join`);
    return { ok: true, profileId: resultado.profileId, campaignId: resultado.campaignId };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}
