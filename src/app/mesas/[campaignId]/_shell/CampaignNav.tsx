"use client";

/**
 * Navegação da campanha (Fase 3, aditivo §5.1/§5.2/§5.3). Estrutura-base
 * compartilhada por jogador e narrador (Mesa/Personagens/Bando/Mercado/
 * Biblioteca); o narrador recebe a seção adicional "Gerenciar". A
 * restrição de "Gerenciar" aqui é só ausência de link — a autorização
 * real é sempre revalidada no servidor por cada página (ver
 * `requireNarratorAccess`, src/lib/campaign/access.ts).
 *
 * Client Component só por causa de `usePathname` (link ativo) — o
 * papel/campanha vêm prontos do servidor (CampaignShell), nunca
 * recalculados aqui.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CampaignRole } from "../../../../lib/campaign/access";
import { color } from "./theme";

interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
}

function buildJogoItems(campaignId: string): NavItem[] {
  return [
    { href: `/mesas/${campaignId}`, label: "Mesa", exact: true },
    { href: `/mesas/${campaignId}/personagens`, label: "Personagens" },
    { href: `/mesas/${campaignId}/bando`, label: "Bando" },
    { href: `/mesas/${campaignId}/mercado`, label: "Mercado" },
    // "Biblioteca" (aditivo §5.1: "regras e conteúdo publicado disponível
    // nesta campanha") aponta para a leitura (/livro, já acessível a
    // ambos os papéis) — não para /biblioteca, que é a tela
    // administrativa de homebrew/overrides exclusiva do narrador
    // (permanece acessível a partir de /livro só para quem narra, ver
    // livro/page.tsx).
    { href: `/mesas/${campaignId}/livro`, label: "Biblioteca" },
  ];
}

function buildGerenciarItems(campaignId: string): NavItem[] {
  return [
    { href: `/mesas/${campaignId}/jogadores-e-convites`, label: "Jogadores e convites" },
    { href: `/mesas/${campaignId}/configuracoes`, label: "Configurações" },
  ];
}

function NavGroup({ title, items, pathname }: { title: string; items: NavItem[]; pathname: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, opacity: 0.45, padding: "0 10px", marginBottom: 2 }}>
        {title}
      </span>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 1 }}>
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                data-testid={`campnav-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className="rv-nav-link rv-focusable"
                aria-current={active ? "page" : undefined}
                style={{ display: "block" }}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CampaignNav({ campaignId, role }: { campaignId: string; role: CampaignRole }) {
  const pathname = usePathname();
  const jogoItems = buildJogoItems(campaignId);
  const gerenciarItems = role === "narrator" ? buildGerenciarItems(campaignId) : [];

  return (
    <nav aria-label="Navegação da campanha" style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 190 }}>
      <NavGroup title="Jogo" items={jogoItems} pathname={pathname} />
      {gerenciarItems.length > 0 && (
        <NavGroup title="Gerenciar" items={gerenciarItems} pathname={pathname} />
      )}
      <div style={{ borderTop: `1px solid ${color.borderSubtle}`, paddingTop: 10, marginTop: 4 }}>
        <Link href="/mesas" data-testid="campnav-minhas-campanhas" className="rv-nav-link rv-focusable" style={{ display: "block" }}>
          ← Minhas Campanhas
        </Link>
      </div>
    </nav>
  );
}
