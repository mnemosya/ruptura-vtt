/**
 * "Minhas Campanhas" (aditivo §4.2) — página após o login, área de
 * PRODUTO, exige sessão. Mostra TODAS as campanhas associadas à conta
 * autenticada — narradora em algumas, jogadora em outras (aditivo
 * §3.1 "uma mesma conta pode ser narradora em uma campanha, jogadora
 * em outra").
 *
 * Fase 3: antes desta mudança, o filtro `owner_id === user.id` era
 * aplicado aqui no cliente/servidor da página, descartando as
 * campanhas onde a conta é só participante — mesmo a RLS
 * (`campaigns_owner_select` OR `campaigns_member_select`, migration
 * 0043) já devolvendo exatamente as linhas certas. `listCampaigns()`
 * já é a lista certa; o papel de cada uma é derivado localmente
 * (`owner_id === user.id` → Narrador; caso contrário, só chegou aqui
 * porque a RLS permitiu — logo é Jogador).
 *
 * Redesign da área autenticada: além do papel, a página passa a
 * carregar o que a home nova exibe de verdade — participantes (que só
 * o narrador consegue ler, por RLS) e quantidade de personagens. O que
 * a RLS não devolve aparece como desconhecido, nunca como zero.
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth/session";
import {
  getCampaignParticipantInfo,
  listCampaignMembers,
  listCampaigns,
} from "../../../lib/table/storage";
import {
  listCharactersForNarratorCampaign,
  listControlledCharacters,
} from "../../../lib/character/storage";
import type { Campaign } from "../../../lib/table";
import MesasDashboardClient, { type CampaignCardData } from "../MesasDashboardClient";

export const dynamic = "force-dynamic";

async function loadNarratorExtras(
  campaignId: string,
): Promise<Pick<CampaignCardData, "memberCount" | "people" | "characterCount">> {
  const [members, characters, info] = await Promise.all([
    listCampaignMembers(campaignId).catch(() => []),
    listCharactersForNarratorCampaign(campaignId).catch(() => []),
    getCampaignParticipantInfo(campaignId).catch(() => new Map()),
  ]);
  const active = members.filter((m) => m.status === "active");
  return {
    memberCount: active.length,
    characterCount: characters.filter((c) => !c.archived_at).length,
    people: active.map((m) => ({
      userId: m.user_id,
      name: info.get(m.user_id)?.display_name ?? "Participante",
    })),
  };
}

export default async function MesasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let minhasCampanhas: CampaignCardData[] = [];
  let errorMessage: string | null = null;
  try {
    const todas: Campaign[] = await listCampaigns();
    minhasCampanhas = await Promise.all(
      todas.map(async (campaign): Promise<CampaignCardData> => {
        if (campaign.owner_id === user.id) {
          const extras = await loadNarratorExtras(campaign.id);
          return { campaign, role: "narrator", controlledCharacterCount: null, ...extras };
        }
        let controlledCharacterCount = 0;
        try {
          controlledCharacterCount = (await listControlledCharacters(campaign.id)).length;
        } catch {
          controlledCharacterCount = 0;
        }
        return {
          campaign,
          role: "player",
          controlledCharacterCount,
          // RLS: quem é só jogador enxerga apenas a própria linha em
          // `campaign_members` — não dá para contar a mesa inteira aqui,
          // e inventar um número seria pior do que não mostrar.
          memberCount: null,
          characterCount: controlledCharacterCount,
          people: [],
        };
      }),
    );
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Erro desconhecido ao carregar campanhas.";
  }

  return (
    <MesasDashboardClient
      campanhasIniciais={minhasCampanhas}
      errorInicial={errorMessage}
      currentUserName={user.displayName ?? (user.email ?? "Você").split("@")[0]}
    />
  );
}
