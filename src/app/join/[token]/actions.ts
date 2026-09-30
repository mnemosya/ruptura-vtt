"use server";

import { redirect } from "next/navigation";
import { acceptCampaignInvite } from "../../../lib/campaignContent/campaignContentServerActions";

export interface EstadoAceite {
  erro: string | null;
}

/**
 * Aceita o convite só depois do clique explícito em "Entrar na
 * campanha" — abrir o link nunca muda nada sozinho. Com sucesso, a
 * pessoa sempre cai na mesa (`/mesas/<id>`), qualquer que seja o número
 * de personagens que controla: a mesa é quem oferece criar/escolher.
 */
export async function aceitarConviteAction(token: string, _anterior: EstadoAceite): Promise<EstadoAceite> {
  const aceite = await acceptCampaignInvite(token);
  if (!aceite.ok || !aceite.campaignId) {
    return { erro: aceite.erro ?? "Não foi possível entrar nesta campanha." };
  }
  redirect(`/mesas/${aceite.campaignId}`);
}
