"use client";

/**
 * O CONSOLE DO PERSONAGEM é uma janela DA MESA — não uma rota.
 *
 * Antes, abrir uma ficha a partir de qualquer lugar da campanha
 * navegava para `/ficha?campaignId&characterId`. Mesmo com a rota
 * interceptada (`@modal/(...)ficha`), que preservava a página de
 * origem, o resultado eram DUAS aplicações costuradas: a URL trocava,
 * uma barra própria da ficha aparecia por cima da casca da campanha
 * (com "← Personagens" e seletor de personagem, duplicando navegação
 * que a mesa já tem), e um véu escurecia e travava tudo por baixo.
 *
 * Aqui a ficha é o que já era dentro do VTT: uma janela ancorada,
 * aberta por cima da mesa viva, sem navegar. Uma coisa só.
 *
 * O provider vive na `CampaignShell`, então TODA rota sob
 * `/mesas/[campaignId]` abre a ficha do mesmo jeito — a página de
 * Personagens, a Mesa, o VTT e o seletor da casca chamam o mesmo
 * `abrir(characterId)`.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ConsoleNoVtt, precarregarConsole } from "../vtt/_painel/janelas/ConsoleNoVtt";

interface ApiConsoleDaMesa {
  /** Abre a ficha daquele personagem por cima da tela atual. */
  abrir: (characterId: string) => void;
  /** Aquecimento (hover/foco) — baixa bundle e catálogos antes do clique. */
  aquecer: () => void;
  /** Há uma ficha aberta agora. */
  aberto: boolean;
  /**
   * Contador de fechamentos — sobe 1 a cada ficha fechada.
   *
   * É o sinal de "a ficha acabou de fechar, releia o que ela pode ter
   * mudado" para quem carrega dados NO CLIENTE (a Mesa lê os
   * personagens controlados por ação, não por Server Component, então
   * `router.refresh()` não a alcança). Antes esse sinal era a URL
   * saindo de `/ficha`; sem rota, ele precisa ser explícito.
   */
  fechadaEm: number;
  /**
   * Leva a câmera até um token e fecha a ficha. `null` fora do VTT —
   * em Personagens ou na Mesa não há mapa pra focar, e a ficha não
   * pode oferecer uma ação que não vai a lugar nenhum.
   *
   * Quem sabe mover a câmera é o VTT, que fica ABAIXO deste provider;
   * por isso ele registra a função aqui em vez de o provider tentar
   * alcançá-lo.
   */
  focarNoMapa: ((tokenId: string) => void) | null;
  /** Chamado pelo VTT ao montar, com a sua própria função de foco. */
  registrarFocoNoMapa: (fn: ((tokenId: string) => void) | null) => void;
}

const Contexto = createContext<ApiConsoleDaMesa | null>(null);

/**
 * `null` fora da casca da campanha — quem chama decide o fallback
 * (hoje: continuar sendo um link para `/ficha`, que segue existindo
 * para link direto e para o fluxo de convite).
 */
export function useConsoleDaMesa(): ApiConsoleDaMesa | null {
  return useContext(Contexto);
}

export function ProvedorConsoleDaMesa({ campaignId, children }: { campaignId: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [de, setDe] = useState<string | null>(null);
  const [fechadaEm, setFechadaEm] = useState(0);
  const [focoNoMapa, setFocoNoMapa] = useState<((tokenId: string) => void) | null>(null);
  // `useState` com função exige o wrapper: `setFocoNoMapa(fn)` chamaria `fn`.
  const registrarFocoNoMapa = useCallback((fn: ((tokenId: string) => void) | null) => {
    setFocoNoMapa(() => fn);
  }, []);

  const abrir = useCallback((characterId: string) => setDe(characterId), []);

  /**
   * Fechar a ficha revalida a página de baixo.
   *
   * Enquanto o Console era uma ROTA interceptada, isso vinha de graça:
   * sair dela remontava os Server Components da origem. Sendo janela,
   * nada é remontado — e a Mesa continuaria mostrando o PV de antes de
   * a pessoa mexer na ficha. `router.refresh()` refaz só os dados de
   * servidor; o estado de cliente (mapa, câmera, seleção, filtros da
   * lista) não é tocado.
   */
  const fechar = useCallback(() => {
    setDe(null);
    setFechadaEm((n) => n + 1);
    router.refresh();
  }, [router]);
  const aquecer = useCallback(() => precarregarConsole(campaignId), [campaignId]);
  const focarNoMapa = useMemo(
    () => (focoNoMapa ? (tokenId: string) => { focoNoMapa(tokenId); fechar(); } : null),
    [focoNoMapa, fechar],
  );

  const api = useMemo(
    () => ({ abrir, aquecer, aberto: de !== null, fechadaEm, focarNoMapa, registrarFocoNoMapa }),
    [abrir, aquecer, de, fechadaEm, focarNoMapa, registrarFocoNoMapa],
  );

  /**
   * Aquece uma vez, em ocioso, assim que a mesa monta.
   *
   * O hover de uma linha já aquecia, mas só cobre quem chega por ali —
   * pelo menu de um token, por atalho ou num clique direto a abertura
   * era fria inteira. Medido em `check-console-abertura`: ~1,8 s de
   * esqueleto a frio contra ~0,2 s com bundle e catálogos prontos. Os
   * catálogos são POR CAMPANHA e iguais para todo personagem, então
   * buscá-los quando a mesa abre é estritamente melhor do que na
   * primeira ficha.
   *
   * `requestIdleCallback` pra não disputar com a primeira pintura;
   * `setTimeout` onde ele não existe (Safari).
   */
  /**
   * `?ficha=<characterId>` abre o Console daquele personagem.
   *
   * É como o wizard de criação entrega o personagem recém-criado: ele
   * navega para Personagens e a ficha abre já lá. Passar isso por
   * estado de cliente não funciona — navegar e mexer no estado do
   * provider no mesmo tick faz a transição do router ser descartada, e
   * o wizard ficava travado em "Criando…". Pela URL é uma coisa só, e
   * de quebra o endereço vira compartilhável dentro da mesa.
   *
   * O parâmetro é consumido e some do endereço (`replace`, sem entrada
   * nova no histórico): ele é um COMANDO de abertura, não um estado —
   * deixá-lo lá reabriria a ficha a cada voltar/avançar.
   */
  useEffect(() => {
    const pedido = searchParams.get("ficha");
    if (!pedido) return;
    setDe(pedido);
    const resto = new URLSearchParams(searchParams.toString());
    resto.delete("ficha");
    const query = resto.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [searchParams, pathname, router]);

  useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => aquecer(), { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(aquecer, 1200);
    return () => window.clearTimeout(id);
  }, [aquecer]);

  return (
    <Contexto.Provider value={api}>
      {children}
      <ConsoleNoVtt campaignId={campaignId} characterId={de} onFechar={fechar} />
    </Contexto.Provider>
  );
}
