/**
 * Conteúdo da rota real da ficha (/ficha?campaignId&characterId) —
 * extraído de `page.tsx` para ser reutilizado por DOIS pontos de
 * entrada:
 *
 *   1. `app/ficha/page.tsx` — navegação direta/link compartilhado,
 *      página cheia, como sempre foi.
 *   2. `app/mesas/@modal/(...)ficha/page.tsx` — rota INTERCEPTADA: ao
 *      clicar num personagem a partir de Personagens (`/mesas/
 *      personagens` ou `/mesas/[campaignId]/personagens`), o Next
 *      renderiza este MESMO conteúdo num slot `@modal` sobre a página
 *      de Personagens, que continua montada por baixo — a navegação
 *      por link direto (e o botão "voltar" do navegador) seguem
 *      funcionando normalmente porque a URL muda de verdade para
 *      /ficha?..., só que sem descartar a página de origem.
 *
 * Nenhuma lógica de carregamento é duplicada entre os dois pontos de
 * entrada — os dois chamam esta mesma função.
 */

import { resolveCampaignAccess } from "../../lib/campaign/access";
import { listCharactersForNarratorCampaign, listControlledCharacters } from "../../lib/character/storage";
import type { CharacterRecord } from "../../lib/character";
import { CharacterSheetView } from "../CharacterSheetView";
import { FichaHeader } from "./FichaHeader";

export interface FichaPageContentParams {
  campaignId?: string;
  characterId?: string;
  tab?: string;
}

export async function FichaPageContent({ searchParams }: { searchParams: Promise<FichaPageContentParams> }) {
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
