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
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import { listCampaigns } from "../../lib/table/storage";
import { listControlledCharacters } from "../../lib/character/storage";
import type { Campaign } from "../../lib/table";
import MesasDashboardClient, { type CampaignCardData } from "./MesasDashboardClient";

export const dynamic = "force-dynamic";

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
          return { campaign, role: "narrator", controlledCharacterCount: null };
        }
        let controlledCharacterCount = 0;
        try {
          controlledCharacterCount = (await listControlledCharacters(campaign.id)).length;
        } catch {
          controlledCharacterCount = 0;
        }
        return { campaign, role: "player", controlledCharacterCount };
      }),
    );
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Erro desconhecido ao carregar campanhas.";
  }

  return (
    <MesasDashboardClient
      userEmail={user.email ?? "(sem email)"}
      campanhasIniciais={minhasCampanhas}
      errorInicial={errorMessage}
    />
  );
}
