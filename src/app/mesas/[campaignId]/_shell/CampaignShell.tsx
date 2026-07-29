/**
 * Casca de navegação da campanha (Fase 3) — cabeçalho com nome da
 * campanha + papel atual (aditivo §5.3 "campanha e função atual devem
 * permanecer identificáveis na interface") e a nav lateral
 * (CampaignNav). Server Component: só recebe dados já resolvidos pelo
 * layout, não faz nenhuma checagem de autorização por conta própria.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { CampaignRole } from "../../../../lib/campaign/access";
import { CampaignNav } from "./CampaignNav";
import { badge, color, text } from "./theme";

export function CampaignShell({
  campaignId,
  campaignName,
  role,
  children,
}: {
  campaignId: string;
  campaignName: string;
  role: CampaignRole;
  children: ReactNode;
}) {
  return (
    <div style={{ minHeight: "100vh" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "14px 24px",
          borderBottom: `1px solid ${color.borderSubtle}`,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Link href="/mesas" className="rv-focusable" style={{ color: color.textFaint, fontSize: 12, textDecoration: "none", whiteSpace: "nowrap" }}>
            Ruptura VTT
          </Link>
          <span style={{ opacity: 0.3 }}>/</span>
          <h1
            data-testid="campshell-nome-campanha"
            style={{ ...text.h1, fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 320 }}
            title={campaignName}
          >
            {campaignName}
          </h1>
          <span data-testid="campshell-papel" style={badge(role)}>
            {role === "narrator" ? "Narrador" : "Jogador"}
          </span>
        </div>
      </header>

      <div style={{ display: "flex", gap: 28, maxWidth: 1240, margin: "0 auto", padding: "24px 24px 80px", alignItems: "flex-start" }}>
        <CampaignNav campaignId={campaignId} role={role} />
        <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
      </div>
    </div>
  );
}
