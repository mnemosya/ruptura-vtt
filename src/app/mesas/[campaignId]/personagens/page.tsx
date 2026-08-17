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
 * SEM auto-redirect de servidor pro caso de 1 personagem só (correção
 * #13 do plano da Fase 4 — decisão revista): a versão anterior desta
 * página tinha `redirect()` quando `personagens.length === 1`, saindo
 * da campanha sem o usuário ter clicado em nada. Trocar por um
 * `useEffect` client-side com `router.push()` preservaria o modal, mas
 * manteria o problema real — flash de conteúdo, navegação que ninguém
 * pediu. A correção é remover a navegação automática por completo:
 * `PersonagensJogadorClient` já renderiza a lista normalmente mesmo com
 * 1 item só (nunca teve um branch especial pra isso — o redirect
 * simplesmente nunca deixava esse caminho rodar), e uma lista de 1 item
 * com "Abrir ficha" já É "o personagem mostrado com uma ação explícita".
 */
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
    // A lista de personagens é o conteúdo da tela: falhar nela sobe para
    // o `error.tsx` da campanha em vez de virar "nenhum personagem"
    // (mesmo princípio aplicado no Livro e no Mercado na auditoria da
    // Fase 5). Os três secundários continuam tolerantes — são
    // enriquecimento da linha (quem controla, nome do jogador) e a
    // degradação deles já é visível na própria UI.
    const [personagens, controles, membros, participantInfo] = await Promise.all([
      listCharactersForNarratorCampaign(campaignId),
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

  // Mesma regra do branch do narrador: sem `.catch(() => [])`, senão uma
  // falha de leitura diria ao jogador "você ainda não tem personagens"
  // (com botão de criar outro) sobre personagens que provavelmente
  // existem — o caso que a Fase 4 já tinha corrigido na Mesa.
  const personagens = (await listControlledCharacters(campaignId)).filter((c) => !c.archived_at);
  return <PersonagensJogadorClient campaignId={campaignId} personagens={personagens} />;
}
