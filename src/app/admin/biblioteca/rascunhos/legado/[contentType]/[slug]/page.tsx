/**
 * Diagnóstico de conversão de conteúdo legado (Etapa 6). Só é alcançada
 * quando o conteúdo publicado NÃO tem `content_editor_metadata` para a
 * versão atual — `DraftActionsBar` já filtrou isso antes de navegar
 * aqui. Gate de admin no layout pai; o diagnóstico em si também
 * reverifica admin no servidor (`diagnosticarConversaoLegado`).
 */

import { notFound } from "next/navigation";
import { isDraftContentType } from "../../../../../../../lib/contentSchema/draftTypes";
import { diagnosticarConversaoLegado } from "../../../../../../../lib/contentSchema/legacyConversionServerActions";
import { LegadoConversaoClient } from "./LegadoConversaoClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ contentType: string; slug: string }>;
}

export default async function LegadoConversaoPage({ params }: PageProps) {
  const { contentType, slug } = await params;
  if (!isDraftContentType(contentType)) notFound();

  const diagnostico = await diagnosticarConversaoLegado(contentType, slug);
  if (!diagnostico.ok) {
    return (
      <div style={{ maxWidth: 700 }}>
        <p style={{ color: "#e08a8a" }}>{diagnostico.erro ?? "Falha ao diagnosticar conversão."}</p>
      </div>
    );
  }

  if (diagnostico.temMetadataEditorial) {
    // Já tem metadata — não deveria ter chegado aqui, mas evita expor uma tela sem sentido.
    return (
      <div style={{ maxWidth: 700 }}>
        <p style={{ color: "#7d7d8a" }}>Este conteúdo já tem metadata editorial — use "Criar rascunho de edição" na página do conteúdo.</p>
      </div>
    );
  }

  return <LegadoConversaoClient contentType={contentType} slug={slug} relatorio={diagnostico.relatorio!} pendentes={diagnostico.pendentesDeConfirmacao ?? []} />;
}
