/**
 * Comparação de três vias (Etapa 12, correção) — oficial-base, oficial
 * atual, campanha atual. Guard de acesso: login + narrador dono
 * (mesmo critério de `/mesas/[campaignId]`).
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { requireNarratorAccess } from "../../../../../../lib/campaign/access";
import { getContentDocument } from "../../../../../../lib/content/queries";
import type { ContentType } from "../../../../../../lib/content/types";
import { getCampaignContentDocumentById, compararTresVias } from "../../../../../../lib/campaignContent";
import { NarratorOnlyDenied } from "../../../_shell/NarratorOnlyDenied";
import { ComparacaoTresViasClient } from "./ComparacaoTresViasClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ campaignId: string; docId: string }>;
}

export default async function ComparacaoTresViasPage({ params }: PageProps) {
  const { campaignId, docId } = await params;
  const access = await requireNarratorAccess(campaignId);
  if (!access) return <NarratorOnlyDenied campaignId={campaignId} />;

  const doc = await getCampaignContentDocumentById(docId);
  if (!doc || doc.campaign_id !== campaignId || doc.origin_type !== "override") notFound();

  // SEM `.catch(() => null)` (auditoria da Fase 5): `getContentDocument`
  // já distingue os dois casos — devolve `null` quando o oficial de fato
  // não existe mais publicado, e LANÇA quando a leitura falha. O catch
  // colapsava os dois no mesmo `null`, e isso não era só um rótulo
  // errado ("ausente/arquivado" para uma falha de rede): o diff de três
  // vias era então calculado contra `{}`, produzindo uma comparação que
  // mostrava o oficial tendo removido TUDO — informação errada numa tela
  // cuja função é embasar a decisão de manter ou descartar o override.
  // Falha de leitura agora sobe para o `error.tsx` da campanha.
  const oficialAtual = await getContentDocument(doc.content_type as ContentType, doc.slug);
  const oficialBase = doc.official_snapshot ?? {};
  const oficialAtualPayload = (oficialAtual?.payload as Record<string, unknown>) ?? {};

  const comparacao = compararTresVias(oficialBase, oficialAtualPayload, doc.payload);

  return (
    <main className="rm-page">
      {/* Sub-rota de "Conteúdo da campanha": o trilho leva à lista, não a
          este detalhe — aqui o link de volta continua sendo o caminho certo
          (diferente das telas de topo, onde ele duplicava a navegação). */}
      <p style={{ marginBottom: 16 }}>
        <Link href={`/mesas/${campaignId}/biblioteca`} className="rv-focusable" style={{ color: "var(--cy)", fontSize: 12.5 }}>
          ← Conteúdo da campanha
        </Link>
      </p>
      <h1 className="rm-page-title" style={{ marginBottom: 8 }}>
        Comparação de três vias — {doc.nome ?? doc.slug}
      </h1>
      <div className="rm-faint" style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 20 }}>
        <span>oficial-base: {doc.official_version_base ?? "—"}</span>
        <span>oficial atual: {oficialAtual?.version ?? "ausente/arquivado"}</span>
        <span>versão local: {doc.local_version}</span>
        <span>hash-base: {(doc.official_hash_base ?? "—").slice(0, 12)}</span>
      </div>

      <ComparacaoTresViasClient campaignId={campaignId} doc={doc} comparacao={comparacao} oficialExiste={Boolean(oficialAtual)} />
    </main>
  );
}
