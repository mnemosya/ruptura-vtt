/**
 * Editor de rascunho de campanha (Etapa 12). Reaproveita o mesmo
 * viewModel (`construirDraftViewModel`) e as mesmas seções de campo do
 * Editor Universal (Etapa 3/4) — só a persistência/publicação são
 * escopadas à campanha.
 *
 * Fase 5: o gate próprio (`getCurrentUser` + `getCampaign` +
 * `.catch(() => null)` → `notFound()`) virou `requireNarratorAccess` +
 * `NarratorOnlyDenied`, como nas rotas administrativas irmãs. Além de
 * remover a consulta duplicada (o layout já resolveu o acesso, e
 * `resolveCampaignAccess` é memoizada por request), isso fecha um caso
 * da auditoria da Fase 5 que não estava na lista mas é o mesmo defeito
 * e o mais grave da família: uma FALHA DE LEITURA da campanha virava
 * `null` e caía num `notFound()` — um 404 afirmando que o rascunho não
 * existe, sobre um rascunho que provavelmente existe.
 */

import { notFound } from "next/navigation";
import { requireNarratorAccess } from "../../../../../../lib/campaign/access";
import { getOpcoesDeRegras } from "../../../../../../lib/contentSchema/characterRuleOptions";
import { construirDraftViewModel } from "../../../../../../lib/contentSchema/draftView";
import type { ContentDraftRow } from "../../../../../../lib/contentSchema/draftTypes";
import { listConditions } from "../../../../../../lib/content/queries";
import { getCampaignDraftById } from "../../../../../../lib/campaignContent";
import { NarratorOnlyDenied } from "../../../_shell/NarratorOnlyDenied";
import { CampaignDraftEditorClient } from "./CampaignDraftEditorClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ campaignId: string; draftId: string }>;
}

export default async function CampaignDraftEditorPage({ params }: PageProps) {
  const { campaignId, draftId } = await params;
  const access = await requireNarratorAccess(campaignId);
  if (!access) return <NarratorOnlyDenied campaignId={campaignId} />;

  // `notFound()` só para ausência REAL: `getCampaignDraftById` lança se
  // a leitura falhar, e esse erro sobe para o `error.tsx` da campanha.
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
