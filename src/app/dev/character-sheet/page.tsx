/**
 * Rota DEV da ficha — /dev/character-sheet. Reusa a view compartilhada.
 * A rota real é /ficha; esta fica como acesso de diagnóstico/dev.
 */

import { CharacterSheetView } from "../../CharacterSheetView";
import { assertDevRouteAllowed } from "../../../lib/dev/guard";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ campaignId?: string; characterId?: string }>;
}

export default async function DevCharacterSheetPage({ searchParams }: PageProps) {
  assertDevRouteAllowed();
  const params = await searchParams;
  return (
    <CharacterSheetView campaignId={params.campaignId ?? null} characterId={params.characterId ?? null} mode="dev" />
  );
}
