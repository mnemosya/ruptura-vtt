/**
 * Layout da campanha (Fase 3 do plano de contas/campanhas/convites/
 * personagens — aditivo §5). Ponto único de:
 *   - exigir sessão (redirect /login);
 *   - resolver campanha + papel (narrador/jogador) via
 *     `resolveCampaignAccess` (src/lib/campaign/access.ts);
 *   - renderizar a casca de navegação (CampaignShell/CampaignNav) com
 *     a estrutura certa para o papel.
 *
 * Envolve TODAS as rotas aninhadas (Mesa, Personagens, Bando, Mercado,
 * Biblioteca, Livro, criação de personagem, Jogadores e convites,
 * Configurações) — cada uma dessas ainda faz sua própria checagem de
 * papel quando for exclusiva do narrador (defesa em profundidade: o
 * menu escondido não é a autorização real, aditivo §5.3).
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveCampaignAccess } from "../../../lib/campaign/access";
import { CampaignShell } from "./_shell/CampaignShell";
import { text } from "./_shell/theme";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ campaignId: string }>;
}

export default async function CampaignLayout({ children, params }: LayoutProps) {
  const { campaignId } = await params;
  const access = await resolveCampaignAccess(campaignId);

  if (access.kind === "no_session") {
    redirect("/login");
  }

  if (access.kind === "not_found") {
    return (
      <main style={{ maxWidth: 560, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
        <h1 style={{ ...text.h1, marginBottom: 12 }}>Campanha não encontrada</h1>
        <p style={{ ...text.muted, marginBottom: 20 }}>Esta campanha não existe ou foi removida.</p>
        <Link href="/mesas" style={{ color: "#5ec8ff", fontSize: 13 }}>← Minhas Campanhas</Link>
      </main>
    );
  }

  if (access.kind === "no_access") {
    return (
      <main style={{ maxWidth: 560, margin: "80px auto", padding: "0 20px", textAlign: "center" }} role="alert">
        <h1 style={{ ...text.h1, marginBottom: 12 }}>Sem acesso a esta campanha</h1>
        <p style={{ ...text.muted, marginBottom: 20 }}>
          Sua conta não participa desta campanha. Peça um convite ao narrador ou volte para as suas campanhas.
        </p>
        <Link href="/mesas" style={{ color: "#5ec8ff", fontSize: 13 }}>← Minhas Campanhas</Link>
      </main>
    );
  }

  return (
    <CampaignShell campaignId={access.campaign.id} campaignName={access.campaign.name} role={access.role}>
      {children}
    </CampaignShell>
  );
}
