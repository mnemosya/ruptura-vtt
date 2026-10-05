/**
 * "Personagens" no menu GERAL DA CONTA (área autenticada global) — a
 * visão de todos os personagens que esta conta alcança, atravessando
 * campanhas. Não substitui a tela "Personagens" DE UMA CAMPANHA
 * (/mesas/[campaignId]/personagens), que continua sendo o lugar
 * administrativo do narrador; esta aqui é o índice pessoal: "onde
 * estão minhas fichas".
 *
 * A autorização é a mesma de sempre, por campanha:
 *   - narradora da campanha → todos os personagens ativos dela
 *     (`listCharactersForNarratorCampaign`);
 *   - jogadora → só os que a conta controla (`listControlledCharacters`).
 * Nenhuma consulta nova, nenhuma tabela nova, nenhuma rota de leitura
 * mais permissiva do que as que já existiam.
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../../lib/auth/session";
import { listCampaigns } from "../../../../lib/table/storage";
import {
  listCharactersForNarratorCampaign,
  listControlledCharacters,
  listMyLooseCharacters,
} from "../../../../lib/character/storage";
import PersonagensGlobaisClient, { type CampanhaDestino, type PersonagemGlobal, type PersonagemSolto } from "./PersonagensGlobaisClient";

export const dynamic = "force-dynamic";

export default async function PersonagensGlobaisPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let personagens: PersonagemGlobal[] = [];
  let soltos: PersonagemSolto[] = [];
  let destinos: CampanhaDestino[] = [];
  let errorMessage: string | null = null;

  try {
    const [campanhas, registrosSoltos] = await Promise.all([listCampaigns(), listMyLooseCharacters()]);
    destinos = campanhas.map((c) => ({ id: c.id, nome: c.name, narra: c.owner_id === user.id }));
    // Personagens sem campanha (criados na página Personagens ou devolvidos ao sair de uma).
    soltos = registrosSoltos.map((c) => ({
      id: c.id,
      name: c.name,
      updatedAt: c.updated_at,
      pendente: c.pending_campaign_id
        ? { campaignId: c.pending_campaign_id, campaignName: campanhas.find((x) => x.id === c.pending_campaign_id)?.name ?? "campanha" }
        : null,
    }));
    const listas = await Promise.all(
      campanhas.map(async (campaign): Promise<PersonagemGlobal[]> => {
        const role = campaign.owner_id === user.id ? "narrator" : "player";
        try {
          const registros = role === "narrator"
            ? (await listCharactersForNarratorCampaign(campaign.id)).filter((c) => !c.archived_at)
            : await listControlledCharacters(campaign.id);
          return registros.map((c) => ({
            id: c.id,
            name: c.name,
            campaignId: campaign.id,
            campaignName: campaign.name,
            role,
            ownerLabel: c.owner_label,
            updatedAt: c.updated_at,
          }));
        } catch {
          return [];
        }
      }),
    );
    personagens = listas.flat().sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Erro desconhecido ao carregar personagens.";
  }

  return (
    <PersonagensGlobaisClient personagens={personagens} soltos={soltos} destinos={destinos} errorInicial={errorMessage} />
  );
}
