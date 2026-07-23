/**
 * Biblioteca da campanha (Etapa 12) — lista o conteúdo EFETIVO (oficial
 * + override + homebrew) dos 4 tipos editáveis para o narrador dono da
 * mesa. Mesmo guard de acesso de `/mesas/[campaignId]` (login + dono).
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "../../../../lib/auth/session";
import { getCampaign } from "../../../../lib/table/storage";
import type { Campaign } from "../../../../lib/table";
import { listCampaignDrafts, resolveEffectiveList } from "../../../../lib/campaignContent";
import type { DraftContentType } from "../../../../lib/contentSchema";
import { BibliotecaCampanhaClient } from "./BibliotecaCampanhaClient";

export const dynamic = "force-dynamic";

const TIPOS: { id: DraftContentType; label: string }[] = [
  { id: "spell", label: "Magia" },
  { id: "talent", label: "Talento" },
  { id: "item", label: "Item / Equipamento" },
  { id: "rune", label: "Runa" },
];

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function BibliotecaCampanhaPage({ params }: PageProps) {
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

  if (campaign.owner_id !== user.id) {
    return (
      <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20 }}>Acesso negado</h1>
        <p>Só o narrador dono desta mesa acessa a Biblioteca da campanha.</p>
        <Link href="/mesas" style={{ color: "#5ec8ff", fontSize: 13 }}>← Minhas mesas</Link>
      </main>
    );
  }

  const listasPorTipo = await Promise.all(TIPOS.map((t) => resolveEffectiveList(campaignId, t.id)));
  const efetivos = TIPOS.flatMap((t, i) => listasPorTipo[i]);

  const rascunhos = await listCampaignDrafts(campaignId).catch(() => []);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px 64px" }}>
      <p style={{ marginBottom: 16 }}>
        <Link href={`/mesas/${campaignId}`} style={{ color: "#5ec8ff", fontSize: 13 }}>← Voltar para a mesa</Link>
      </p>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Biblioteca da campanha — {campaign.name}</h1>
      <p style={{ fontSize: 13, color: "#a8a8b3", marginBottom: 20 }}>
        Conteúdo efetivo desta mesa: oficial, modificado (override) ou homebrew. Alterar aqui nunca modifica o catálogo oficial nem
        outras mesas.
      </p>
      <BibliotecaCampanhaClient campaignId={campaignId} tipos={TIPOS} efetivos={efetivos} rascunhos={rascunhos} />
    </main>
  );
}
