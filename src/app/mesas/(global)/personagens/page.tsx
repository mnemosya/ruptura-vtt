/**
 * "Personagens" no menu GERAL DA CONTA (área autenticada global) — a
 * visão de todos os personagens que esta conta alcança, atravessando
 * campanhas, mais os personagens SEM CAMPANHA da própria conta. Não
 * substitui o diretório de Personagens da campanha (aba do VTT), que
 * continua sendo o lugar administrativo do narrador; esta aqui é o
 * índice pessoal: "onde estão minhas fichas".
 *
 * A autorização é a mesma de sempre, por campanha:
 *   - narradora da campanha → todos os personagens ativos dela
 *     (`listCharactersForNarratorCampaign`);
 *   - jogadora → só os que a conta controla (`listControlledCharacters`);
 *   - sem campanha → só os que a conta é dona (`listMyLooseCharacters`).
 *
 * Tudo vira UMA lista (`PersonagemLinha`): o estado — em campanha, sem
 * campanha ou aguardando o narrador — é um campo da linha, não uma seção.
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../../lib/auth/session";
import { listCampaigns } from "../../../../lib/table/storage";
import {
  listCharactersForNarratorCampaign,
  listControlledCharacters,
  listMyLooseCharacters,
} from "../../../../lib/character/storage";
import type { CharacterRecord } from "../../../../lib/character";
import { assinarDownloadUrls } from "../../../../lib/vtt/imageService";
import PersonagensGlobaisClient, { type CampanhaDestino, type PersonagemLinha } from "./PersonagensGlobaisClient";

export const dynamic = "force-dynamic";

/** Classe e Ranking lidos da ficha v1.2 (`progressao`). */
function progressaoDe(c: CharacterRecord): { classe: string | null; ranking: string | null } {
  const p = (c.payload as { progressao?: { classe_id?: string; ranking?: string } } | null)?.progressao;
  return { classe: p?.classe_id ?? null, ranking: p?.ranking ?? null };
}

export default async function PersonagensGlobaisPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let personagens: PersonagemLinha[] = [];
  let destinos: CampanhaDestino[] = [];
  let errorMessage: string | null = null;

  try {
    const [campanhas, soltos] = await Promise.all([listCampaigns(), listMyLooseCharacters()]);
    destinos = campanhas.map((c) => ({ id: c.id, nome: c.name, narra: c.owner_id === user.id }));

    const porCampanha = await Promise.all(
      campanhas.map(async (campaign) => {
        const role = campaign.owner_id === user.id ? ("narrator" as const) : ("player" as const);
        try {
          const registros = role === "narrator"
            ? (await listCharactersForNarratorCampaign(campaign.id)).filter((c) => !c.archived_at)
            : await listControlledCharacters(campaign.id);
          return registros.map((c) => ({ c, campaign, role }));
        } catch {
          return [];
        }
      }),
    );

    const todos = [
      ...porCampanha.flat(),
      ...soltos.map((c) => ({ c, campaign: null, role: null })),
    ];

    // Retratos assinados em lote — a mesma via do diretório da mesa.
    // Falhar aqui só tira o rosto da linha, nunca a lista.
    const idsAvatar = todos.map(({ c }) => c.avatar_image_id ?? null).filter((id): id is string => !!id);
    const avatares = await assinarDownloadUrls(idsAvatar, user.id).catch(() => new Map<string, string>());

    personagens = todos
      .map(({ c, campaign, role }): PersonagemLinha => {
        const pendente = !campaign && c.pending_campaign_id
          ? { campaignId: c.pending_campaign_id, campaignName: campanhas.find((x) => x.id === c.pending_campaign_id)?.name ?? "campanha" }
          : null;
        return {
          id: c.id,
          name: c.name,
          ...progressaoDe(c),
          avatarUrl: (c.avatar_image_id && avatares.get(c.avatar_image_id)) || null,
          campanha: campaign ? { id: campaign.id, nome: campaign.name, role: role! } : null,
          pendente,
          updatedAt: c.updated_at,
        };
      })
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Erro desconhecido ao carregar personagens.";
  }

  return <PersonagensGlobaisClient personagens={personagens} destinos={destinos} errorInicial={errorMessage} />;
}
