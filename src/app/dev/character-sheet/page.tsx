/**
 * Rota DEV da ficha — /dev/character-sheet. Reusa a view compartilhada
 * (checkpoint v0.22). A rota real é /ficha; esta fica como acesso de
 * diagnóstico/dev.
 */

import { CharacterSheetView } from "../../CharacterSheetView";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ campaignId?: string; profileId?: string }>;
}

export default async function DevCharacterSheetPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return (
    <CharacterSheetView campaignId={params.campaignId ?? null} profileId={params.profileId ?? null} mode="dev" />
  );
}
