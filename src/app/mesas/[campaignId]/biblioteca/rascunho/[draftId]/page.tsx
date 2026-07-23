/**
 * Editor de rascunho de campanha (Etapa 12). Reaproveita o mesmo
 * viewModel (`construirDraftViewModel`) e as mesmas seções de campo do
 * Editor Universal (Etapa 3/4) — só a persistência/publicação são
 * escopadas à campanha. O gate de acesso (login + narrador dono) roda
 * aqui, já que esta rota não está sob `/admin`.
 */

import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../../../../../lib/auth/session";
import { getOpcoesDeRegras } from "../../../../../../lib/contentSchema/characterRuleOptions";
import { construirDraftViewModel } from "../../../../../../lib/contentSchema/draftView";
import type { ContentDraftRow } from "../../../../../../lib/contentSchema/draftTypes";
import { listConditions } from "../../../../../../lib/content/queries";
import { getCampaignDraftById } from "../../../../../../lib/campaignContent";
import { getCampaign } from "../../../../../../lib/table/storage";
import { CampaignDraftEditorClient } from "./CampaignDraftEditorClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ campaignId: string; draftId: string }>;
}

export default async function CampaignDraftEditorPage({ params }: PageProps) {
  const { campaignId, draftId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const campaign = await getCampaign(campaignId).catch(() => null);
  if (!campaign || campaign.owner_id !== user.id) notFound();

  const draft = await getCampaignDraftById(draftId);
  if (!draft || draft.campaign_id !== campaignId) notFound();

  const draftParaViewModel = {
    ...draft,
    base_document_id: draft.base_official_document_id,
  } as unknown as ContentDraftRow;

  const [viewModel, opcoes, condicoes] = await Promise.all([
    construirDraftViewModel(draftParaViewModel),
    getOpcoesDeRegras(),
    listConditions(),
  ]);
  const condicoesDisponiveis = condicoes.map((c) => ({ slug: c.slug, nome: c.nome ?? c.slug }));

  return (
    <CampaignDraftEditorClient
      campaignId={campaignId}
      draft={draft}
      efeitosPreservados={viewModel.efeitosPreservados}
      baseDocumentoStatus={viewModel.baseDocumentoStatus}
      opcoes={opcoes}
      condicoesDisponiveis={condicoesDisponiveis}
    />
  );
}
