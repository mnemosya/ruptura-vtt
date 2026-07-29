/**
 * Rota REAL da ficha: /ficha?campaignId&characterId. É para onde o
 * fluxo de convite real (/join/[token]), o assistente de criação e a
 * página Personagens levam.
 *
 * Fase 1: caminho mínimo — resolve por campaignId+characterId,
 * autorizado inteiramente pela RLS de `characters` (ver
 * src/lib/character/storage.ts `getCharacterForCampaign`).
 *
 * Fase 5 (aditivo §9.4/§10/§16.7): acrescenta só o CABEÇALHO ao redor
 * da ficha — campanha/papel identificáveis, retorno fácil para
 * Personagens, seletor de personagem persistente (narrador troca entre
 * qualquer ficha da campanha; jogador troca entre os que controla).
 * `CharacterSheetView`/`CharacterSheetClient` seguem intocados — a
 * ficha continua "uma interface operacional própria", não encaixada no
 * menu da campanha (por isso o cabeçalho é próprio desta rota, não o
 * CampaignShell inteiro).
 */

import { resolveCampaignAccess } from "../../lib/campaign/access";
import { listCharactersForNarratorCampaign, listControlledCharacters } from "../../lib/character/storage";
import type { CharacterRecord } from "../../lib/character";
import { CharacterSheetView } from "../CharacterSheetView";
import { FichaHeader } from "./FichaHeader";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ campaignId?: string; characterId?: string; tab?: string }>;
}

export default async function FichaPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const campaignId = params.campaignId ?? null;
  const characterId = params.characterId ?? null;

  let header: React.ReactNode = null;
  if (campaignId) {
    const access = await resolveCampaignAccess(campaignId);
    if (access.kind === "ok") {
      let personagens: CharacterRecord[] = [];
      try {
        personagens =
          access.role === "narrator"
            ? (await listCharactersForNarratorCampaign(campaignId)).filter((c) => !c.archived_at)
            : await listControlledCharacters(campaignId);
      } catch {
        personagens = [];
      }
      header = (
        <FichaHeader
          campaignId={campaignId}
          campaignName={access.campaign.name}
          role={access.role}
          currentCharacterId={characterId}
          personagens={personagens}
        />
      );
    }
  }

  return (
    <div>
      {header}
      <CharacterSheetView campaignId={campaignId} characterId={characterId} mode="product" initialTab={params.tab ?? null} />
    </div>
  );
}
