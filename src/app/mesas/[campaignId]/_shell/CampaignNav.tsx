"use client";

/**
 * Trilho de navegação da campanha (aditivo §5.1/§5.2/§5.3). Estrutura-
 * base compartilhada por jogador e narrador; o narrador recebe o grupo
 * adicional "Gerenciar". A restrição aqui é só ausência de link — a
 * autorização real é sempre revalidada no servidor por cada página (ver
 * `requireNarratorAccess`, src/lib/campaign/access.ts).
 *
 * Virou um TRILHO DE ÍCONES com tooltip (antes: lista de texto com
 * títulos de grupo). A aparência é portada de `.rc-tabrail` do Console,
 * mas a SEMÂNTICA não: lá são abas de verdade (`aria-selected`, troca
 * conteúdo sem navegar); aqui cada item é uma rota real, então é
 * `<Link>` com `aria-current="page"`. Usar `aria-selected` num link de
 * navegação anunciaria "aba" para um leitor de tela onde não há
 * `tablist` nenhuma.
 *
 * Nomenclatura corrigida nesta fase: o item que se chamava "Biblioteca"
 * apontava para `/livro` (leitura, ambos os papéis), enquanto a tela
 * administrativa de homebrew/overrides em `/biblioteca` só era
 * alcançável por um link secundário dentro dela. Agora são dois
 * destinos com nomes que dizem o que são — "Livro" (leitura, grupo
 * Jogo) e "Conteúdo da campanha" (administração, grupo Gerenciar).
 *
 * Client Component por causa de `usePathname` (rota ativa) — papel e
 * campanha vêm prontos do servidor, nunca recalculados aqui.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LinkPending } from "../../../_design/NavPending";
import type { CampaignRole } from "../../../../lib/campaign/access";
import {
  Backpack,
  BookText,
  ChevronLeft,
  type IconProps,
  Monitor,
  ScrollText,
  Settings,
  Store,
  Ticket,
  Users,
} from "../../../_design/icons";

interface NavItem {
  href: string;
  label: string;
  Icone: (p: IconProps) => React.ReactElement;
  exact?: boolean;
}

function grupoJogo(campaignId: string): NavItem[] {
  return [
    { href: `/mesas/${campaignId}/vtt`, label: "Mesa", Icone: Monitor, exact: true },
    { href: `/mesas/${campaignId}/personagens`, label: "Personagens", Icone: Users },
    { href: `/mesas/${campaignId}/bando`, label: "Bando", Icone: Backpack },
    { href: `/mesas/${campaignId}/mercado`, label: "Mercado", Icone: Store },
    { href: `/mesas/${campaignId}/livro`, label: "Livro", Icone: BookText },
  ];
}

function grupoGerenciar(campaignId: string): NavItem[] {
  return [
    { href: `/mesas/${campaignId}/biblioteca`, label: "Conteúdo da campanha", Icone: ScrollText },
    { href: `/mesas/${campaignId}/jogadores-e-convites`, label: "Jogadores e convites", Icone: Ticket },
    { href: `/mesas/${campaignId}/configuracoes`, label: "Configurações", Icone: Settings },
  ];
}

/**
 * Slug do `data-testid`. Normaliza acentos ANTES de trocar o resto por
 * hífen — a versão anterior não fazia isso e produzia ids mutilados
 * ("Configurações" virava `campnav-configura-es`, porque "çõ" caía no
 * `[^a-z0-9]`). Nenhuma suíte consome esses ids hoje (eles existem para
 * uma futura), então corrigir agora é barato; depois seria quebra.
 */
function testId(label: string): string {
  const semAcento = label.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return `campnav-${semAcento.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function ItemTrilho({ item, ativo }: { item: NavItem; ativo: boolean }) {
  const { Icone } = item;
  return (
    <Link
      href={item.href}
      className="rm-navrail-btn"
      data-testid={testId(item.label)}
      aria-current={ativo ? "page" : undefined}
      // O rótulo visível é só o ícone; sem isto o link fica sem nome
      // acessível. A tooltip é decorativa (aria-hidden) para o leitor de
      // tela não anunciar o mesmo texto duas vezes.
      aria-label={item.label}
    >
      <Icone size={18} strokeWidth={1.7} />
      <span className="rm-navrail-hint" aria-hidden="true">
        {item.label}
      </span>
      {/* Marca o destino enquanto a rota está em voo — ver
          `NavPending.tsx` e `.mo-linkflag`/`:has()` em `mesa.css`. */}
      <LinkPending />
    </Link>
  );
}

export function CampaignNav({ campaignId, role }: { campaignId: string; role: CampaignRole }) {
  const pathname = usePathname();
  const jogo = grupoJogo(campaignId);
  const gerenciar = role === "narrator" ? grupoGerenciar(campaignId) : [];

  const estaAtivo = (item: NavItem) => (item.exact ? pathname === item.href : pathname.startsWith(item.href));

  return (
    <nav className="rm-navrail" aria-label="Navegação da campanha">
      <div className="rm-navrail-group">
        {jogo.map((item) => (
          <ItemTrilho key={item.href} item={item} ativo={estaAtivo(item)} />
        ))}
      </div>

      {gerenciar.length > 0 && (
        <>
          <div className="rm-navrail-divider" />
          <div className="rm-navrail-group">
            {gerenciar.map((item) => (
              <ItemTrilho key={item.href} item={item} ativo={estaAtivo(item)} />
            ))}
          </div>
        </>
      )}

      <div className="rm-navrail-spacer" />

      <div className="rm-navrail-group">
        <Link href="/mesas" className="rm-navrail-btn" data-testid="campnav-minhas-campanhas" aria-label="Minhas Campanhas">
          <ChevronLeft size={18} strokeWidth={1.7} />
          <span className="rm-navrail-hint" aria-hidden="true">
            Minhas Campanhas
          </span>
          <LinkPending />
        </Link>
      </div>
    </nav>
  );
}
