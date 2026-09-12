/**
 * `/mesas/[campaignId]` — a antiga "Mesa" (rodada/cena, Resolver
 * Ataque e "Seus personagens") deixou de existir: o VTT é a mesa, e
 * nenhum link do app apontava mais pra cá (o dashboard e o item "Mesa"
 * do trilho já vão direto em `/vtt`).
 *
 * A rota sobrevive só como redirecionamento, e não como 404, porque
 * URLs antigas ainda circulam em favoritos e no histórico — mandar
 * quem chega pra mesa de verdade é mais útil do que a página de "não
 * encontrada", que sugeriria que a CAMPANHA sumiu.
 */
import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function CampaignRootPage({ params }: PageProps) {
  const { campaignId } = await params;
  redirect(`/mesas/${campaignId}/vtt`);
}
