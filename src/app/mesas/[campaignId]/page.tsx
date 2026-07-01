/**
 * Detalhe de mesa no dashboard do narrador (checkpoint v0.21). Exige
 * login E que o narrador seja o dono da mesa. Reúne perfis, convites,
 * personagens (checkpoint v0.23) e log (visão de narrador = tudo) da mesa.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "../../../lib/auth/session";
import {
  getCampaign,
  listCampaignProfiles,
  listCampaignInvites,
  listProfileSessions,
  listLogsForViewer,
  expireStaleProfileSessions,
} from "../../../lib/table/storage";
import { listCharacters, listCharactersForCampaign } from "../../../lib/character/storage";
import type { Campaign, CampaignProfile, CampaignInvite, ProfileSession, TableLogEntry } from "../../../lib/table";
import type { CharacterRecord } from "../../../lib/character";
import MesaDetailClient from "./MesaDetailClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function MesaDetailPage({ params }: PageProps) {
  const { campaignId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let campaign: Campaign | null = null;
  try {
    campaign = await getCampaign(campaignId);
  } catch {
    campaign = null;
  }

  if (!campaign) {
    return (
      <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20 }}>Mesa não encontrada</h1>
        <Link href="/mesas" style={{ color: "#5ec8ff", fontSize: 13 }}>← Minhas mesas</Link>
      </main>
    );
  }

  // Área de produto: só o dono acessa. Mesas legadas (owner_id null) não
  // pertencem a ninguém no dashboard — bloqueadas aqui (use /dev/table).
  if (campaign.owner_id !== user.id) {
    return (
      <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20 }}>Acesso negado</h1>
        <p style={{ fontSize: 13, opacity: 0.8 }}>Esta mesa não pertence à sua conta.</p>
        <Link href="/mesas" style={{ color: "#5ec8ff", fontSize: 13 }}>← Minhas mesas</Link>
      </main>
    );
  }

  let perfis: CampaignProfile[] = [];
  let convites: CampaignInvite[] = [];
  let sessoes: ProfileSession[] = [];
  let logs: TableLogEntry[] = [];
  let personagensDaMesa: CharacterRecord[] = [];
  let personagensDisponiveis: CharacterRecord[] = [];
  try {
    // v0.26: expira sessões velhas desta mesa antes de listar perfis/sessões — ver expireStaleProfileSessions.
    await expireStaleProfileSessions(campaignId).catch(() => {});
    perfis = await listCampaignProfiles(campaignId);
    convites = await listCampaignInvites(campaignId);
    sessoes = await listProfileSessions(campaignId);
    logs = await listLogsForViewer(campaignId, {}); // narrador dono → vê tudo
    personagensDaMesa = await listCharactersForCampaign(campaignId);
    // "Disponíveis para vincular": personagens legados/globais, sem mesa
    // ainda (checkpoint v0.23 — não trata characters como lista global
    // solta; só oferece linkar os que ainda não têm campaign_id).
    const todos = await listCharacters();
    personagensDisponiveis = todos.filter((c) => c.campaign_id == null);
  } catch {
    // parcial: a UI lida com listas vazias
  }

  return (
    <MesaDetailClient
      campaign={campaign}
      perfisIniciais={perfis}
      convitesIniciais={convites}
      sessoesIniciais={sessoes}
      logsIniciais={logs}
      personagensDaMesaIniciais={personagensDaMesa}
      personagensDisponiveisIniciais={personagensDisponiveis}
    />
  );
}
