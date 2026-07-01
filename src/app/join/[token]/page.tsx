/**
 * Rota REAL de entrada por convite (checkpoint v0.18): /join/[token].
 *
 * O token é validado server-side (resolveCampaignInvite → hash SHA-256
 * comparado com token_hash). Convite revogado/inativo/expirado/inexistente
 * mostra uma mensagem clara sem vazar a mesa. Convite válido reusa o
 * fluxo de entrada existente (JoinClient, variante "invite").
 *
 * Diferente de /dev/join/[campaignId] (legado dev, id cru), aqui o id da
 * mesa nunca aparece na URL — só o token opaco.
 */

import { resolveCampaignInvite, listCampaignProfiles } from "../../../lib/table/storage";
import { listCharacters } from "../../../lib/character/storage";
import type { CampaignProfile } from "../../../lib/table";
import type { CharacterRecord } from "../../../lib/character";
import JoinClient from "../../dev/join/[campaignId]/JoinClient";

export const dynamic = "force-dynamic";

const REASON_LABELS: Record<string, string> = {
  not_found: "Convite não encontrado.",
  revoked: "Este convite foi revogado.",
  inactive: "Este convite está inativo.",
  expired: "Este convite expirou.",
};

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function InviteJoinPage({ params }: PageProps) {
  const { token } = await params;

  let resolved;
  let errorMessage: string | null = null;
  try {
    resolved = await resolveCampaignInvite(token);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Erro desconhecido ao resolver o convite.";
  }

  if (errorMessage) {
    return (
      <main style={{ maxWidth: 560, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20 }}>Erro ao abrir o convite</h1>
        <p style={{ color: "#ff6b6b", fontSize: 13 }}>{errorMessage}</p>
      </main>
    );
  }

  if (!resolved || !resolved.ok || !resolved.campaign) {
    const label = resolved?.reason ? REASON_LABELS[resolved.reason] ?? "Convite inválido." : "Convite inválido.";
    return (
      <main style={{ maxWidth: 560, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Convite indisponível</h1>
        <p data-testid="invite-invalido" style={{ fontSize: 13, opacity: 0.8 }}>{label}</p>
        <p style={{ fontSize: 12, opacity: 0.5, marginTop: 12 }}>
          Peça um novo link ao narrador da mesa.
        </p>
      </main>
    );
  }

  const campaign = resolved.campaign;
  let perfisIniciais: CampaignProfile[] = [];
  let personagens: CharacterRecord[] = [];
  try {
    perfisIniciais = await listCampaignProfiles(campaign.id);
    personagens = await listCharacters();
  } catch {
    // Se perfis/personagens falharem, a página ainda mostra a mesa; o
    // JoinClient lida com lista vazia.
  }

  return <JoinClient campaign={campaign} perfisIniciais={perfisIniciais} personagens={personagens} variant="invite" />;
}
