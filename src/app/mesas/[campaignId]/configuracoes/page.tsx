/**
 * Configurações (aditivo §5.2) — área EXCLUSIVA do narrador. Nesta
 * rodada, mínima e real (não um placeholder): renomear a campanha.
 * Outras configurações (permissões de criação de personagem,
 * configuração de convites) permanecem como decisões de produto
 * pendentes — registradas no checkpoint da Fase 3, não inventadas
 * aqui.
 */
import { requireNarratorAccess } from "../../../../lib/campaign/access";
import { NarratorOnlyDenied } from "../_shell/NarratorOnlyDenied";
import ConfiguracoesClient from "./ConfiguracoesClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function ConfiguracoesPage({ params }: PageProps) {
  const { campaignId } = await params;
  const access = await requireNarratorAccess(campaignId);
  if (!access) return <NarratorOnlyDenied campaignId={campaignId} />;

  return <ConfiguracoesClient campaign={access.campaign} />;
}
