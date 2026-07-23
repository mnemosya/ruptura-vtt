/**
 * Comparação de três vias (Etapa 12, correção) — oficial-base, oficial
 * atual, campanha atual. Guard de acesso: login + narrador dono
 * (mesmo critério de `/mesas/[campaignId]`).
 */

import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../../../../../lib/auth/session";
import { getCampaign } from "../../../../../../lib/table/storage";
import { getContentDocument } from "../../../../../../lib/content/queries";
import type { ContentType } from "../../../../../../lib/content/types";
import { getCampaignContentDocumentById, compararTresVias } from "../../../../../../lib/campaignContent";
import { ComparacaoTresViasClient } from "./ComparacaoTresViasClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ campaignId: string; docId: string }>;
}

export default async function ComparacaoTresViasPage({ params }: PageProps) {
  const { campaignId, docId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const campaign = await getCampaign(campaignId).catch(() => null);
  if (!campaign || campaign.owner_id !== user.id) notFound();

  const doc = await getCampaignContentDocumentById(docId);
  if (!doc || doc.campaign_id !== campaignId || doc.origin_type !== "override") notFound();

  const oficialAtual = await getContentDocument(doc.content_type as ContentType, doc.slug).catch(() => null);
  const oficialBase = doc.official_snapshot ?? {};
  const oficialAtualPayload = (oficialAtual?.payload as Record<string, unknown>) ?? {};

  const comparacao = compararTresVias(oficialBase, oficialAtualPayload, doc.payload);

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 20px 64px" }}>
      <p style={{ marginBottom: 16 }}>
        <a href={`/mesas/${campaignId}/biblioteca`} style={{ color: "#5ec8ff", fontSize: 13 }}>
          ← voltar para a Biblioteca da campanha
        </a>
      </p>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>
        Comparação de três vias — {doc.nome ?? doc.slug}
      </h1>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, color: "#a8a8b3", marginBottom: 20 }}>
        <span>oficial-base: {doc.official_version_base ?? "—"}</span>
        <span>oficial atual: {oficialAtual?.version ?? "ausente/arquivado"}</span>
        <span>versão local: {doc.local_version}</span>
        <span>hash-base: {(doc.official_hash_base ?? "—").slice(0, 12)}</span>
      </div>

      <ComparacaoTresViasClient campaignId={campaignId} doc={doc} comparacao={comparacao} oficialExiste={Boolean(oficialAtual)} />
    </main>
  );
}
