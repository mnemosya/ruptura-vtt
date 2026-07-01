/**
 * Rota REAL da ficha (checkpoint v0.22, produto real desde v0.24):
 * /ficha?campaignId&profileId. É para onde o fluxo de convite real
 * (/join/[token]) leva ao "Abrir ficha".
 *
 * mode="product" (v0.24): a ficha só abre se o sessionId salvo no
 * localStorage deste navegador for o dono do bloqueio do perfil
 * informado (validado no client via validateProductSession) — nunca
 * mostra lista global de personagens nem permite carregar um
 * personagem arbitrário, só o personagem ativo do perfil da sessão.
 */

import { CharacterSheetView } from "../CharacterSheetView";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ campaignId?: string; profileId?: string }>;
}

export default async function FichaPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return (
    <CharacterSheetView campaignId={params.campaignId ?? null} profileId={params.profileId ?? null} mode="product" />
  );
}
