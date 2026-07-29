/**
 * Resolução de papel (Narrador/Jogador) de uma conta numa campanha —
 * base da navegação da campanha (Fase 3 do plano de contas/campanhas/
 * convites/personagens, aditivo §5.3: "a restrição deve existir no
 * servidor, não apenas pela ausência do link").
 *
 * Narrador = `campaigns.owner_id === user.id` (único narrador por
 * campanha nesta versão — auditoria §12.1). Jogador = participação
 * ATIVA em `campaign_members` que não seja o dono (checada via
 * `is_campaign_member`, que já cobre owner OU membro ativo — aqui só
 * precisamos decidir QUAL dos dois, já sabendo que pelo menos um é
 * verdade). Nenhum dos dois: conta sem relação com a campanha.
 *
 * Usado tanto pelo layout de navegação (para montar o menu certo)
 * quanto, de novo, por cada página exclusiva do narrador (Jogadores e
 * convites, Configurações, Personagens administrativo) — defesa em
 * profundidade: o menu escondido não é a autorização real.
 */

import { cache } from "react";
import { getCurrentUser, type AuthUser } from "../auth/session";
import { getCampaign, isCampaignMember } from "../table/storage";
import type { Campaign } from "../table";

export type CampaignRole = "narrator" | "player";

export type CampaignAccess =
  | { kind: "no_session" }
  | { kind: "not_found" }
  | { kind: "no_access"; user: AuthUser; campaign: Campaign }
  | { kind: "ok"; user: AuthUser; campaign: Campaign; role: CampaignRole };

/**
 * Resolve o acesso da conta logada a uma campanha. Nunca lança — o
 * chamador (layout/página) decide o que renderizar para cada `kind`.
 *
 * Envolvida em `cache()` (memoização por request do React/Next.js App
 * Router): o layout da campanha e cada página aninhada chamam isto de
 * novo para sua própria checagem de defesa em profundidade — sem
 * `cache()`, isso duplicaria as consultas a cada navegação.
 */
export const resolveCampaignAccess = cache(async function resolveCampaignAccess(
  campaignId: string,
): Promise<CampaignAccess> {
  const user = await getCurrentUser();
  if (!user) return { kind: "no_session" };

  let campaign: Campaign | null = null;
  try {
    campaign = await getCampaign(campaignId);
  } catch {
    campaign = null;
  }
  if (!campaign) return { kind: "not_found" };

  if (campaign.owner_id === user.id) {
    return { kind: "ok", user, campaign, role: "narrator" };
  }

  const isMember = await isCampaignMember(campaignId);
  if (isMember) {
    return { kind: "ok", user, campaign, role: "player" };
  }

  return { kind: "no_access", user, campaign };
});

/**
 * Variante estrita para páginas exclusivas do NARRADOR (Jogadores e
 * convites, Configurações, ações administrativas de Personagens) —
 * devolve `null` para qualquer coisa que não seja "narrador com
 * acesso", inclusive jogador ativo. A página chamadora decide a UI de
 * recusa; isto aqui é só a checagem.
 */
export async function requireNarratorAccess(
  campaignId: string,
): Promise<{ user: AuthUser; campaign: Campaign } | null> {
  const access = await resolveCampaignAccess(campaignId);
  if (access.kind !== "ok" || access.role !== "narrator") return null;
  return { user: access.user, campaign: access.campaign };
}
