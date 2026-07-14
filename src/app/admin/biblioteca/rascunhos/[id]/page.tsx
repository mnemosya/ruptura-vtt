/**
 * Editor de rascunho (Etapa 3). O gate de admin já roda no layout pai
 * (`src/app/admin/layout.tsx`); a leitura de `content_drafts` aqui
 * também é reforçada pela RLS (`is_content_admin()`, migration 0021) —
 * dupla camada, nunca uma sozinha.
 */

import { notFound } from "next/navigation";
import { getOpcoesDeRegras } from "../../../../../lib/contentSchema/characterRuleOptions";
import { getDraftById } from "../../../../../lib/contentSchema/draftQueries";
import { construirDraftViewModel } from "../../../../../lib/contentSchema/draftView";
import { listConditions } from "../../../../../lib/content/queries";
import { DraftEditorClient } from "./DraftEditorClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DraftEditorPage({ params }: PageProps) {
  const { id } = await params;
  const draft = await getDraftById(id);
  if (!draft) notFound();

  const [viewModel, opcoes, condicoes] = await Promise.all([construirDraftViewModel(draft), getOpcoesDeRegras(), listConditions()]);
  const condicoesDisponiveis = condicoes.map((c) => ({ slug: c.slug, nome: c.nome ?? c.slug }));

  return (
    <DraftEditorClient
      draft={draft}
      efeitosPreservados={viewModel.efeitosPreservados}
      baseDocumentoStatus={viewModel.baseDocumentoStatus}
      opcoes={opcoes}
      condicoesDisponiveis={condicoesDisponiveis}
    />
  );
}
