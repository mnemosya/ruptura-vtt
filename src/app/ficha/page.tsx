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
 * qualquer ficha da campanha; jogador troca entre os que controla.
 * `CharacterSheetView`/`CharacterSheetClient` seguem intocados — a
 * ficha continua "uma interface operacional própria", não encaixada no
 * menu da campanha (por isso o cabeçalho é próprio desta rota, não o
 * CampaignShell inteiro).
 *
 * O conteúdo em si vive em `FichaPageContent.tsx` — reusado também
 * pela rota interceptada em `app/mesas/@modal/(...)ficha/page.tsx`
 * (modal do Console sobre a página de Personagens), para as duas
 * entradas nunca duplicarem a lógica de carregamento.
 */

import { FichaPageContent, type FichaPageContentParams } from "./FichaPageContent";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<FichaPageContentParams>;
}

export default function FichaPage({ searchParams }: PageProps) {
  return <FichaPageContent searchParams={searchParams} />;
}
