/**
 * Rota REAL da ficha: /ficha?campaignId&characterId. É para onde o
 * fluxo de convite real (/join/[token]) e o assistente de criação levam.
 *
 * Fase 1 do plano de contas/campanhas/convites/personagens (revisão 4):
 * caminho mínimo — resolve por campaignId+characterId, autorizado
 * inteiramente pela RLS de `characters` (dono da campanha OU
 * controlador com participação ativa, ver src/lib/character/storage.ts
 * `getCharacterForCampaign`). Não depende mais de token/sessão de
 * perfil em localStorage. UX completa (seletor de personagem, retorno à
 * campanha, entrada pela lista) é Fase 5.
 */

import { CharacterSheetView } from "../CharacterSheetView";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ campaignId?: string; characterId?: string }>;
}

export default async function FichaPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return (
    <CharacterSheetView campaignId={params.campaignId ?? null} characterId={params.characterId ?? null} mode="product" />
  );
}
