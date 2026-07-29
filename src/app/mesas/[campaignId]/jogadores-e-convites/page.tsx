/**
 * Jogadores e convites (aditivo §8) — área EXCLUSIVA do narrador.
 * Consolida o que na Fase 1/2 ainda vivia como duas seções soltas
 * ("Participantes" e "Convites") dentro da tela monolítica de mesa.
 *
 * Guarda de servidor própria (`requireNarratorAccess`) além do menu já
 * não mostrar o link para jogador — aditivo §5.3 "a restrição deve
 * existir no servidor, não apenas pela ausência do link".
 */
import { requireNarratorAccess } from "../../../../lib/campaign/access";
import { listCampaignMembers, listCampaignInvites } from "../../../../lib/table/storage";
import { listCharacterControllers } from "../../../../lib/character/storage";
import { NarratorOnlyDenied } from "../_shell/NarratorOnlyDenied";
import JogadoresConvitesClient from "./JogadoresConvitesClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function JogadoresConvitesPage({ params }: PageProps) {
  const { campaignId } = await params;
  const access = await requireNarratorAccess(campaignId);
  if (!access) return <NarratorOnlyDenied campaignId={campaignId} />;

  const [membros, convites, controles] = await Promise.all([
    listCampaignMembers(campaignId).catch(() => []),
    listCampaignInvites(campaignId).catch(() => []),
    listCharacterControllers(campaignId).catch(() => []),
  ]);

  return (
    <JogadoresConvitesClient
      campaignId={campaignId}
      membrosIniciais={membros}
      convitesIniciais={convites}
      controlesIniciais={controles}
    />
  );
}
