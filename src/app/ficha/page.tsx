/**
 * Rota REAL da ficha (checkpoint v0.22): /ficha?campaignId&profileId.
 * Reusa a view compartilhada. É para onde o fluxo de convite real
 * (/join/[token]) leva ao "Abrir ficha".
 */

import { CharacterSheetView } from "../CharacterSheetView";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ campaignId?: string; profileId?: string }>;
}

export default async function FichaPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return <CharacterSheetView campaignId={params.campaignId ?? null} profileId={params.profileId ?? null} />;
}
