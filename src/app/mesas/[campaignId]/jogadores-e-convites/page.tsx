/**
 * Jogadores e convites (aditivo §8) — área EXCLUSIVA do narrador.
 * Consolida o que na Fase 1/2 ainda vivia como duas seções soltas
 * ("Participantes" e "Convites") dentro da tela monolítica de mesa.
 *
 * Guarda de servidor própria (`requireNarratorAccess`) além do menu já
 * não mostrar o link para jogador — aditivo §5.3 "a restrição deve
 * existir no servidor, não apenas pela ausência do link".
 *
 * ERRO POR RECURSO, não `.catch(() => [])` (auditoria da Fase 5):
 * são QUATRO leituras independentes, então deixar qualquer uma subir
 * derrubaria a tela inteira por causa de uma só — mas degradá-las para
 * lista vazia era pior, porque "nenhum participante"/"nenhum convite" é
 * uma afirmação de domínio que o narrador pode acreditar e agir em
 * cima (reconvidar alguém que já está lá, achar que um convite não foi
 * criado). Mesma estrutura já usada em `layout.tsx` desde a Fase 3:
 * `Promise.allSettled` + um mapa de erro por recurso que o cliente
 * mostra com "Tentar de novo", preservando o que carregou.
 *
 * `participantInfo` é a exceção deliberada: é só apresentação (nome e
 * e-mail no lugar do UUID), o próprio cliente já degrada para "Conta
 * sem nome", e a lista de participantes continua correta sem ela.
 */
import { requireNarratorAccess } from "../../../../lib/campaign/access";
import { listCampaignMembers, listCampaignInvites, getCampaignParticipantInfo, type CampaignParticipantInfo } from "../../../../lib/table/storage";
import { listCharacterControllers, type CharacterController } from "../../../../lib/character/storage";
import type { CampaignMember, CampaignInvite } from "../../../../lib/table";
import { comFalhaInjetavel } from "../../../../lib/dev/faultInjection";
import { NarratorOnlyDenied } from "../_shell/NarratorOnlyDenied";
import JogadoresConvitesClient, { type ErrosIniciais } from "./JogadoresConvitesClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

function mensagemDe(motivo: unknown, padrao: string): string {
  return motivo instanceof Error ? motivo.message : padrao;
}

export default async function JogadoresConvitesPage({ params }: PageProps) {
  const { campaignId } = await params;
  const access = await requireNarratorAccess(campaignId);
  if (!access) return <NarratorOnlyDenied campaignId={campaignId} />;

  const [membrosR, convitesR, controlesR, participantInfoR] = await Promise.allSettled([
    listCampaignMembers(campaignId),
    comFalhaInjetavel("convites", () => listCampaignInvites(campaignId)),
    listCharacterControllers(campaignId),
    getCampaignParticipantInfo(campaignId),
  ]);

  const erros: ErrosIniciais = {};
  let membros: CampaignMember[] = [];
  let convites: CampaignInvite[] = [];
  let controles: CharacterController[] = [];
  let participantInfo = new Map<string, CampaignParticipantInfo>();

  if (membrosR.status === "fulfilled") membros = membrosR.value;
  else erros.membros = mensagemDe(membrosR.reason, "Erro ao carregar os participantes.");

  if (convitesR.status === "fulfilled") convites = convitesR.value;
  else erros.convites = mensagemDe(convitesR.reason, "Erro ao carregar os convites.");

  if (controlesR.status === "fulfilled") controles = controlesR.value;
  else erros.controles = mensagemDe(controlesR.reason, "Erro ao carregar os controles de personagem.");

  // Sem entrada em `erros`: ver nota no docblock — degradação segura e
  // já visível na própria UI ("Conta sem nome").
  if (participantInfoR.status === "fulfilled") participantInfo = participantInfoR.value;

  return (
    <JogadoresConvitesClient
      campaignId={campaignId}
      membrosIniciais={membros}
      convitesIniciais={convites}
      controlesIniciais={controles}
      participantInfoIniciais={Object.fromEntries(participantInfo)}
      errosIniciais={erros}
    />
  );
}
