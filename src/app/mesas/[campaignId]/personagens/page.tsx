/**
 * Personagens (Fase 4 — aditivo §9). Página real, substituindo o
 * placeholder da Fase 3. Usa exclusivamente o modelo já concluído nas
 * Fases 1/2: `character_controllers` (controle), `campaign_members`
 * (participação ativa) — nenhuma tabela ou RPC nova.
 *
 * Narrador: todos os personagens da campanha (busca/filtros/ordenação,
 * criar, atribuir/remover controle, duplicar, arquivar, restaurar,
 * abrir qualquer ficha). Jogador: só os personagens que controla,
 * apenas "Abrir ficha".
 */
import { resolveCampaignAccess } from "../../../../lib/campaign/access";
import {
  listCharactersForNarratorCampaign,
  listCharacterControllers,
  listControlledCharacters,
} from "../../../../lib/character/storage";
import { listCampaignMembers } from "../../../../lib/table/storage";
import PersonagensNarradorClient from "./PersonagensNarradorClient";
import PersonagensJogadorClient from "./PersonagensJogadorClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function PersonagensPage({ params }: PageProps) {
  const { campaignId } = await params;
  const access = await resolveCampaignAccess(campaignId);
  if (access.kind !== "ok") return null; // layout já mostra o estado certo

  if (access.role === "narrator") {
    const [personagens, controles, membros] = await Promise.all([
      listCharactersForNarratorCampaign(campaignId).catch(() => []),
      listCharacterControllers(campaignId).catch(() => []),
      listCampaignMembers(campaignId).catch(() => []),
    ]);
    const jogadoresAtivos = membros.filter((m) => m.role !== "owner" && m.status === "active");

    return (
      <PersonagensNarradorClient
        campaignId={campaignId}
        personagensIniciais={personagens}
        controlesIniciais={controles}
        jogadoresAtivos={jogadoresAtivos}
      />
    );
  }

  const personagens = (await listControlledCharacters(campaignId).catch(() => [])).filter((c) => !c.archived_at);
  return <PersonagensJogadorClient campaignId={campaignId} personagens={personagens} />;
}
