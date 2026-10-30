/**
 * "Minhas Campanhas" (aditivo §4.2) — página após o login, área de
 * PRODUTO, exige sessão. Mostra TODAS as campanhas associadas à conta
 * autenticada — narradora em algumas, jogadora em outras (aditivo
 * §3.1 "uma mesma conta pode ser narradora em uma campanha, jogadora
 * em outra").
 *
 * Fase 3: antes desta mudança, o filtro `owner_id === user.id` era
 * aplicado aqui no cliente/servidor da página, descartando as
 * campanhas onde a conta é só participante — mesmo a RLS
 * (`campaigns_owner_select` OR `campaigns_member_select`, migration
 * 0043) já devolvendo exatamente as linhas certas. `listCampaigns()`
 * já é a lista certa; o papel de cada uma é derivado localmente
 * (`owner_id === user.id` → Narrador; caso contrário, só chegou aqui
 * porque a RLS permitiu — logo é Jogador).
 *
 * Redesign da área autenticada: além do papel, a página passa a
 * carregar o que a home nova exibe de verdade — participantes (que só
 * o narrador consegue ler, por RLS) e quantidade de personagens. O que
 * a RLS não devolve aparece como desconhecido, nunca como zero.
 */

import { redirect } from "next/navigation";
import { readOnlineSession } from "../../../lib/campaign/onlineSessionActions";
import { readNetworkPresence } from "../../../lib/campaign/userProfileActions";
import { heartbeatAccountPresence } from "../../../lib/campaign/accountPresenceActions";
import { getCurrentUser } from "../../../lib/auth/session";
import {
  getCampaignParticipantInfo,
  listCampaignMembers,
  listCampaigns,
} from "../../../lib/table/storage";
import {
  listCharacterControllers,
  listCharactersForNarratorCampaign,
  listControlledCharacters,
} from "../../../lib/character/storage";
import type { CharacterRecord } from "../../../lib/character";
import { assinarDownloadUrls } from "../../../lib/vtt/imageService";
import type { Campaign } from "../../../lib/table";
import MesasDashboardClient, { type CampaignCardData, type MembroElenco } from "../MesasDashboardClient";

export const dynamic = "force-dynamic";

/** Até quantos retratos o destaque mostra; o resto vira "+N". */
const RETRATOS_NO_DESTAQUE = 6;

/** Classe lida da ficha v1.2 (`progressao.classe_id`). */
function classeDe(c: CharacterRecord): string | null {
  return (c.payload as { progressao?: { classe_id?: string } } | null)?.progressao?.classe_id ?? null;
}

/** Personagem de jogador (PN fica de fora do elenco do destaque). */
function ehPersonagemDeJogador(c: CharacterRecord): boolean {
  return (c.payload as { metadados?: { tipo_personagem?: string } } | null)?.metadados?.tipo_personagem !== "pn";
}

/** Elenco cru (antes de assinar os retratos): o avatar ainda é o id da imagem. */
type ElencoCru = (Omit<MembroElenco, "avatarUrl"> & { avatarId: string | null })[];

async function loadNarratorExtras(
  campaignId: string,
  userId: string,
): Promise<Pick<CampaignCardData, "memberCount" | "people" | "characterCount"> & { elencoCru: ElencoCru }> {
  const [members, characters, info, controles] = await Promise.all([
    listCampaignMembers(campaignId).catch(() => []),
    listCharactersForNarratorCampaign(campaignId).catch(() => []),
    getCampaignParticipantInfo(campaignId).catch(() => new Map()),
    listCharacterControllers(campaignId).catch(() => []),
  ]);
  const active = members.filter((m) => m.status === "active");
  const vivos = characters.filter((c) => !c.archived_at);
  const donoDe = new Map<string, string>();
  controles.forEach((ct) => { if (!donoDe.has(ct.character_id)) donoDe.set(ct.character_id, ct.user_id); });
  const elencoCru: ElencoCru = vivos.filter(ehPersonagemDeJogador).map((c) => {
    const dono = donoDe.get(c.id) ?? null;
    return {
      id: c.id,
      nome: c.name,
      classe: classeDe(c),
      jogador: dono ? (info.get(dono)?.display_name ?? null) : null,
      eu: dono === userId,
      avatarId: c.avatar_image_id ?? null,
    };
  });
  return {
    memberCount: active.length,
    characterCount: vivos.length,
    people: active.map((m) => ({
      userId: m.user_id,
      name: info.get(m.user_id)?.display_name ?? "Participante",
    })),
    elencoCru,
  };
}

export default async function MesasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let minhasCampanhas: CampaignCardData[] = [];
  let errorMessage: string | null = null;
  const brutos = new Map<string, ElencoCru>();
  try {
    const todas: Campaign[] = await listCampaigns();
    minhasCampanhas = await Promise.all(
      todas.map(async (campaign): Promise<CampaignCardData> => {
        const sessionResult = await readOnlineSession(campaign.id);
        const sessionFields = {
          latestSession: sessionResult.session,
          sessionError: sessionResult.error,
          narratorOnline: sessionResult.narratorOnline,
          playerCount: sessionResult.playerCount,
        };
        if (campaign.owner_id === user.id) {
          const { elencoCru, ...extras } = await loadNarratorExtras(campaign.id, user.id);
          brutos.set(campaign.id, elencoCru);
          return { campaign, role: "narrator", controlledCharacterCount: null, ...extras, ...sessionFields, elenco: [] };
        }
        let controlledCharacterCount = 0;
        try {
          const meus = await listControlledCharacters(campaign.id);
          controlledCharacterCount = meus.length;
          brutos.set(campaign.id, meus.filter(ehPersonagemDeJogador).map((c) => ({
            id: c.id, nome: c.name, classe: classeDe(c), jogador: null, eu: true, avatarId: c.avatar_image_id ?? null,
          })));
        } catch {
          controlledCharacterCount = 0;
        }
        return {
          campaign,
          ...sessionFields,
          role: "player",
          controlledCharacterCount,
          // RLS: quem é só jogador enxerga apenas a própria linha em
          // `campaign_members` — não dá para contar a mesa inteira aqui,
          // e inventar um número seria pior do que não mostrar.
          memberCount: null,
          characterCount: controlledCharacterCount,
          people: [],
          elenco: [],
        };
      }),
    );

    // Retratos do elenco assinados em lote — a mesma via de Personagens.
    // Falhar aqui só tira o rosto do retrato (fica a reserva de iniciais).
    const idsAvatar = [...brutos.values()].flatMap((lista) => lista.slice(0, RETRATOS_NO_DESTAQUE).map((m) => m.avatarId))
      .filter((id): id is string => !!id);
    const urls = await assinarDownloadUrls(idsAvatar, user.id).catch(() => new Map<string, string>());
    minhasCampanhas = minhasCampanhas.map((c) => ({
      ...c,
      elenco: (brutos.get(c.campaign.id) ?? []).slice(0, RETRATOS_NO_DESTAQUE).map(({ avatarId, ...m }) => ({
        ...m,
        avatarUrl: (avatarId && urls.get(avatarId)) || null,
      })),
    }));
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Erro desconhecido ao carregar campanhas.";
  }

  // Presença de toda a Rede numa consulta só — antes o painel mostrava
  // "Online" fixo para a própria conta e "offline" fixo para o resto.
  await heartbeatAccountPresence();
  const rede = await readNetworkPresence();

  return (
    <MesasDashboardClient
      campanhasIniciais={minhasCampanhas}
      errorInicial={errorMessage}
      currentUserId={user.id}
      currentUserName={user.displayName ?? (user.email ?? "Você").split("@")[0]}
      presencaDaRede={rede.presence}
      presencaIndisponivel={!!rede.error}
    />
  );
}
