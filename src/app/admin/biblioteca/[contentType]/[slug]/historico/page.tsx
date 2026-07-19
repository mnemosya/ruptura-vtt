/**
 * Histórico de versões de um conteúdo publicado (Etapa 5). Lê
 * `content_changelog` via client scoped (policy admin-only, migration
 * 0022). Permite abrir uma versão e comparar duas. Não permite editar
 * versões históricas — só leitura.
 */

import { notFound } from "next/navigation";
import { CONTENT_TYPE_REGISTRY } from "../../../../../../lib/contentSchema/contentTypeRegistry";
import { listarHistorico } from "../../../../../../lib/contentSchema/changelogQueries";
import { HistoricoClient } from "./HistoricoClient";

export const dynamic = "force-dynamic";

const CONTENT_TYPES_VALIDOS = new Set(Object.keys(CONTENT_TYPE_REGISTRY));

interface PageProps {
  params: Promise<{ contentType: string; slug: string }>;
}

export default async function HistoricoPage({ params }: PageProps) {
  const { contentType, slug } = await params;
  if (!CONTENT_TYPES_VALIDOS.has(contentType)) notFound();

  const documentId = `${contentType}:${slug}`;
  const historico = await listarHistorico(documentId);

  return <HistoricoClient contentType={contentType} slug={slug} documentId={documentId} historico={historico} />;
}
