/**
 * Mesa persistida do Ruptura. A autorização da campanha é resolvida no
 * servidor; cena e tokens são projetados pelas leituras restritas do
 * VTT, feitas pelo cliente.
 *
 * Esta página já buscou regras do Console, fluxo de combate, condições
 * e talentos — quatro consultas por carga da mesa, todas só pro HUD de
 * token selecionado. O HUD saiu (virou o cartão de hover, que lê o que
 * precisa por token e sob demanda), e elas saíram com ele.
 */

import { resolveCampaignAccess } from "../../../../lib/campaign/access";
import { VttClient } from "./VttClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function VttPage({ params }: PageProps) {
  const { campaignId } = await params;
  const acesso = await resolveCampaignAccess(campaignId);
  if (acesso.kind !== "ok") return null; // o layout da campanha já resolve login/não encontrada/sem acesso

  return <VttClient campaignId={campaignId} papel={acesso.role} />;
}
