/**
 * Personagens — placeholder HONESTO da Fase 3.
 *
 * Esta rota existe desde já porque "Personagens" é um item permanente
 * do menu da campanha (aditivo §5.1/§5.2) e precisa estar presente e
 * navegável já na Fase 3 — mas a página em si (lista, filtros,
 * atribuição de controle) é entrega da Fase 4, na ordem definida pelo
 * pedido ("conclua a Fase 3 antes de iniciar a Fase 4"). Este estado é
 * deliberado e temporário: será substituído pela página real na
 * própria Fase 4, não é um link morto nem uma simulação enganosa de
 * funcionalidade.
 */
import { resolveCampaignAccess } from "../../../../lib/campaign/access";
import { emptyState, pageContainer, text } from "../_shell/theme";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function PersonagensPlaceholderPage({ params }: PageProps) {
  const { campaignId } = await params;
  const access = await resolveCampaignAccess(campaignId);
  if (access.kind !== "ok") return null;

  return (
    <main style={pageContainer(640)}>
      <h1 style={{ ...text.h1, marginBottom: 16 }}>Personagens</h1>
      <div style={emptyState} data-testid="personagens-placeholder-fase3">
        <p style={{ margin: 0 }}>Esta área ainda está sendo construída nesta etapa.</p>
        <p style={{ margin: "6px 0 0", fontSize: 12, opacity: 0.7 }}>
          A lista de personagens desta campanha chega na próxima parte desta implementação.
        </p>
      </div>
    </main>
  );
}
