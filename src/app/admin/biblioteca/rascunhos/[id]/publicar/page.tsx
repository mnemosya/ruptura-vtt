/**
 * Tela de REVISÃO antes de publicar (Etapa 5). Gate de admin no layout
 * pai; a leitura do rascunho é reforçada pela RLS (0021). Monta a
 * revisão no servidor (validação, serialização, diff, impacto, versões)
 * e entrega ao cliente só o necessário para exibir + confirmar. O corpo
 * serializado NÃO é enviado ao cliente — a ação de publicar re-serializa
 * no servidor (nunca confia em corpo vindo do client).
 */

import { notFound } from "next/navigation";
import { getDraftById } from "../../../../../../lib/contentSchema/draftQueries";
import { montarRevisaoPublicacao } from "../../../../../../lib/contentSchema/publishReview";
import { PublicarClient } from "./PublicarClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PublicarPage({ params }: PageProps) {
  const { id } = await params;
  const draft = await getDraftById(id);
  if (!draft) notFound();

  const revisao = await montarRevisaoPublicacao(draft);
  // Não envia `corpo`/`metadataEfeitos` ao cliente — a publicação re-serializa
  // e remonta a metadata editorial no servidor (nunca confia no client).
  const { corpo, metadataEfeitos, ...revisaoParaCliente } = revisao;
  void corpo;
  void metadataEfeitos;

  return <PublicarClient revisao={revisaoParaCliente} />;
}
