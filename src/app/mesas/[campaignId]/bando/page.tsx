/**
 * Bando (aditivo §5.1) — inventário compartilhado do grupo. Fase 3:
 * área própria da campanha para o que já funcionava só embutido na
 * aba "Mesa" da ficha (`MesaTab.tsx`, `crewInventory.ts`) — nenhuma
 * regra reimplementada, só uma apresentação dedicada reaproveitando as
 * mesmas funções.
 *
 * Autorização (já existente, migrations 0019/0038): narrador dono lê,
 * deposita e retira; jogador participante ativo lê e deposita — nunca
 * retira (RLS não concede DELETE/UPDATE a jogador, decisão de produto
 * já registrada na migration 0038).
 */
import { resolveCampaignAccess } from "../../../../lib/campaign/access";
import { listCrewInventory } from "../../../../lib/table/crewInventory";
import BandoClient from "./BandoClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function BandoPage({ params }: PageProps) {
  const { campaignId } = await params;
  const access = await resolveCampaignAccess(campaignId);
  if (access.kind !== "ok") return null; // layout já mostra o estado certo

  // Sem `.catch(() => [])`: uma falha de leitura viraria "o bando não
  // tem nada", indistinguível de um inventário genuinamente vazio.
  const itens = await listCrewInventory(campaignId);

  return <BandoClient campaignId={campaignId} isNarrator={access.role === "narrator"} itensIniciais={itens} />;
}
