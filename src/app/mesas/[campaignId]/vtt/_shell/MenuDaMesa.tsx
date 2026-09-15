"use client";

/**
 * O MENU DA MESA — tudo que não é o mapa, sem sair da mesa.
 *
 * Ele NÃO é um menu de navegação. A primeira versão listava as rotas
 * da campanha (`/personagens`, `/bando`, `/biblioteca`…) e estava
 * errada na raiz: aquelas páginas não são destinos que a mesa oferece,
 * são telas que a mesa substitui. Clicar num link ali fechava a
 * sessão, o mapa, o chat e as janelas abertas pra mostrar em outra
 * página algo que já existe aqui dentro.
 *
 * Então cada item ABRE UMA JANELA (`JanelasDaMesa`), e o que ainda não
 * tem janela aparece desabilitado, dizendo que está por vir — porque
 * some-lo seria fingir que aquilo não existe, e linkar seria mandar
 * embora.
 *
 * `fixed` e posicionado por medição: o menu nasce colado no botão, que
 * fica no alto de um trilho que flutua sobre o mapa.
 */

import { useEffect, useRef } from "react";
import {
  Backpack,
  BookText,
  Library,
  LogOut,
  ScrollText,
  Settings,
  Store,
  Ticket,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";
import { useCampaignSession } from "../../_shell/CampaignRealtimeProvider";
import { useJanelasDaMesa, type JanelaDaMesa } from "./JanelasDaMesa";

/** Medidas usadas pra manter o menu inteiro dentro da janela. */
const LARGURA_MENU = 244;

export interface PosicaoMenuMesa { left: number; top: number }

/** Onde o menu cabe, a partir do botão que o abriu — à direita dele. */
export function posicaoAoLadoDe(el: HTMLElement | null): PosicaoMenuMesa {
  if (!el) return { left: 8, top: 8 };
  const b = el.getBoundingClientRect();
  return {
    left: Math.min(b.right + 8, window.innerWidth - LARGURA_MENU - 8),
    // Alinhado pelo TOPO do botão, não centralizado: o menu é muito
    // mais alto que ele, e centralizar jogaria metade pra fora.
    top: Math.max(8, Math.min(b.top, window.innerHeight - 8)),
  };
}

interface ItemMenu {
  janela: JanelaDaMesa | null;
  rotulo: string;
  Icone: typeof Users;
  /** Só o narrador vê. */
  soNarrador?: boolean;
  /** Ainda não tem janela nesta mesa — aparece, mas não leva a lugar nenhum. */
  porVir?: boolean;
}

const ITENS: readonly ItemMenu[] = [
  { janela: "personagens", rotulo: "Personagens", Icone: Users },
  // A criação COMPLETA (o assistente), distinta do "+ Personagem" da
  // aba, que só pede um nome: aquilo é atalho de quem monta a cena.
  { janela: "novo-personagem", rotulo: "Novo personagem", Icone: UserPlus },
  { janela: "bando", rotulo: "Bando", Icone: Backpack },
  { janela: "compendio", rotulo: "Compêndio", Icone: Library },
  { janela: "participantes", rotulo: "Participantes", Icone: UsersRound },
  // O Mercado é o caso mais curioso: a LOJA já vive dentro da ficha
  // (aba Inventário), e a página só servia pra escolher de quem é a
  // carteira. A janela é esse seletor, e ela abre o Console na aba
  // certa — não é uma tela nova, é a porta que a página era.
  { janela: "mercado", rotulo: "Mercado", Icone: Store },
  { janela: "livro", rotulo: "Livro", Icone: BookText },
  { janela: "convites", rotulo: "Jogadores e convites", Icone: Ticket, soNarrador: true },
  { janela: "conteudo", rotulo: "Conteúdo da campanha", Icone: ScrollText, soNarrador: true },
  { janela: "configuracoes", rotulo: "Configurações da mesa", Icone: Settings, soNarrador: true },
];

export function MenuDaMesa({
  posicao,
  onFechar,
  disparadorRef,
}: {
  posicao: PosicaoMenuMesa;
  onFechar: () => void;
  /**
   * O botão que abriu o menu. O `mousedown` dele conta como "clique
   * fora" e fecharia o menu ANTES de o clique chegar ao `onClick` que o
   * alterna — ignorando o disparador, alternar volta a ser alternar.
   */
  disparadorRef?: React.RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  /* Nome e papel vêm do MESMO contexto que alimenta Chat e
     Participantes — não de props do VTT, que não os tem. */
  const { role, campaign } = useCampaignSession();
  const janelas = useJanelasDaMesa();
  const ehNarrador = role === "narrator";

  /* As duas saídas que quem abre menu espera: clique fora e Escape. */
  useEffect(() => {
    const foraDaqui = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (ref.current?.contains(alvo)) return;
      if (disparadorRef?.current?.contains(alvo)) return;
      onFechar();
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onFechar();
    };
    window.addEventListener("mousedown", foraDaqui);
    window.addEventListener("keydown", aoTeclar, true);
    return () => {
      window.removeEventListener("mousedown", foraDaqui);
      window.removeEventListener("keydown", aoTeclar, true);
    };
  }, [onFechar, disparadorRef]);

  const visiveis = ITENS.filter((i) => !i.soNarrador || ehNarrador);

  return (
    <div
      ref={ref}
      className="rv-menu-mesa"
      role="menu"
      aria-label="Menu da mesa"
      data-testid="vtt-menu-mesa"
      style={{ left: posicao.left, top: posicao.top, width: LARGURA_MENU }}
    >
      {/* Nome da mesa e papel. Eles moravam no cabeçalho da casca, que
          não é mais desenhado aqui — e são a única resposta pra "em que
          mesa eu estou, e como?". */}
      <div className="rv-menu-mesa-cab">
        <span className="rv-menu-mesa-nome" title={campaign.name}>{campaign.name}</span>
        <span className="rv-menu-mesa-papel" data-papel={role}>
          {ehNarrador ? "Narrador" : "Jogador"}
        </span>
      </div>

      <div className="rv-menu-mesa-grupo">
        {visiveis.map(({ janela, rotulo, Icone, porVir }) => (
          <button
            key={rotulo}
            type="button"
            role="menuitem"
            className="rv-menu-mesa-item"
            disabled={porVir}
            data-por-vir={porVir || undefined}
            data-testid={`vtt-menu-${rotulo.toLowerCase().replace(/[^a-z]+/g, "-")}`}
            onClick={() => {
              if (!janela) return;
              janelas.abrir(janela);
              onFechar();
            }}
          >
            <Icone size={15} strokeWidth={1.7} />
            {rotulo}
            {porVir && <span className="rv-menu-mesa-selo">em breve</span>}
          </button>
        ))}
      </div>

      <span className="rv-menu-mesa-sep" aria-hidden="true" />

      {/* A ÚNICA saída de verdade. Não é "outra página da campanha": é
          deixar a mesa — e por isso está separada de tudo, embaixo. */}
      <div className="rv-menu-mesa-grupo">
        <a href="/mesas" role="menuitem" className="rv-menu-mesa-item" data-testid="vtt-menu-sair">
          <LogOut size={15} strokeWidth={1.7} />
          Sair da mesa
        </a>
      </div>
    </div>
  );
}
