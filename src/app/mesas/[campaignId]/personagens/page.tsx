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
 *
 * Fase 5 (aditivo §10.1): jogador com exatamente 1 personagem
 * controlado abre direto a ficha — "a interface deve evitar uma tela
 * de seleção desnecessária". Mesmo padrão já usado em Mercado (Fase 3).
 */
import { redirect } from "next/navigation";
import { resolveCampaignAccess } from "../../../../lib/campaign/access";
import {
  listCharactersForNarratorCampaign,
  listCharacterControllers,
  listControlledCharacters,
} from "../../../../lib/character/storage";
import { listCampaignMembers, getCampaignParticipantInfo } from "../../../../lib/table/storage";
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
    const [personagens, controles, membros, participantInfo] = await Promise.all([
      listCharactersForNarratorCampaign(campaignId).catch(() => []),
      listCharacterControllers(campaignId).catch(() => []),
      listCampaignMembers(campaignId).catch(() => []),
      getCampaignParticipantInfo(campaignId).catch(() => new Map()),
    ]);
    const jogadoresAtivos = membros.filter((m) => m.role !== "owner" && m.status === "active");

    return (
      <PersonagensNarradorClient
        campaignId={campaignId}
        personagensIniciais={personagens}
        controlesIniciais={controles}
        jogadoresAtivos={jogadoresAtivos}
        participantInfoIniciais={Object.fromEntries(participantInfo)}
      />
    );
  }

  const personagens = (await listControlledCharacters(campaignId).catch(() => [])).filter((c) => !c.archived_at);
  if (personagens.length === 1) {
    redirect(`/ficha?campaignId=${campaignId}&characterId=${personagens[0].id}`);
  }
  return <PersonagensJogadorClient campaignId={campaignId} personagens={personagens} />;
}
