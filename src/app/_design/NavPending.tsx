"use client";

/**
 * Feedback de NAVEGAÇÃO EM VOO — o único pedaço de JS da fase de motion,
 * e agora também a base do painel de carregamento com duração mínima
 * (`BootMinDurationOverlay`, em `_boundaries/`).
 *
 * Problema real que ele resolve: as duas cascas (trilho da campanha e
 * sidebar global) marcam a rota ativa com `aria-current`, que só vira
 * depois que `usePathname` já mudou — ou seja, DEPOIS que a rota
 * resolveu. Entre o clique e a resposta do servidor (Server Components
 * + consultas de campanha) não havia sinal nenhum: nem o item clicado
 * mudava. Em rota lenta isso lê como clique perdido, e a reação natural
 * do usuário é clicar de novo.
 *
 * `useLinkStatus` é API do próprio Next (App Router, ≥15.3) e só é
 * legível de dentro de um `<Link>` — daí `LinkPending` ser um FILHO do
 * link, e não uma prop dele. Zero dependência nova, zero interferência
 * no roteamento: ele não decide navegação nenhuma, só observa a que já
 * está acontecendo.
 *
 * O que `LinkPending` monta é um MARCADOR que não pinta nada
 * (`.mo-linkflag`, `display: none`). Quem desenha o estado é cada
 * casca, com o vocabulário dela, via `:has(.mo-linkflag)` — hoje o glow
 * ciano respirando do HUD, em `mesa.css` e `app.css`, incluindo o
 * atraso anti-flash: numa navegação pré-carregada, que resolve em
 * poucos frames, nada chega a aparecer.
 *
 * Foi assim que a primeira versão foi corrigida. Ela desenhava aqui uma
 * barrinha de progresso, e um componente compartilhado desenhando por
 * conta própria não tem como saber que naquele botão ela cairia em cima
 * da borda — que foi exatamente o que aconteceu. Marcador aqui, desenho
 * em quem conhece o componente.
 *
 * ── `NavPendingProvider` / `useNavPending` ────────────────────────────
 * Agregam o mesmo sinal (`pending`, por link) numa CONTAGEM única —
 * "existe AO MENOS UMA navegação em voo neste momento" — que
 * `BootMinDurationOverlay` usa pra decidir se mostra o painel de
 * carregamento sobre a área de conteúdo. É o mesmo sinal do glow do
 * trilho, só que somado entre todos os links, porque o painel de
 * carregamento não pertence a um botão específico — pertence à área de
 * conteúdo inteira. Ver a explicação de por que esta é a base certa
 * (ao contrário de coordenar via `loading.tsx`) em `bootTiming.ts`.
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLinkStatus } from "next/link";

const NavPendingApiContext = createContext<{ inc: () => void; dec: () => void } | null>(null);
const NavPendingCountContext = createContext(0);

export function NavPendingProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  // `useRef` pra API estável (`inc`/`dec` nunca mudam de identidade) —
  // evita recriar o Context value (e re-renderizar todo consumidor) a
  // cada contagem, já que só o NÚMERO muda, nunca as FUNÇÕES em si.
  const apiRef = useRef({
    inc: () => setCount((c) => c + 1),
    dec: () => setCount((c) => Math.max(0, c - 1)),
  });

  return (
    <NavPendingApiContext.Provider value={apiRef.current}>
      <NavPendingCountContext.Provider value={count}>{children}</NavPendingCountContext.Provider>
    </NavPendingApiContext.Provider>
  );
}

/** `true` enquanto existir PELO MENOS UMA navegação em voo em qualquer link rastreado. */
export function useNavPending(): boolean {
  return useContext(NavPendingCountContext) > 0;
}

export function LinkPending() {
  const { pending } = useLinkStatus();
  const api = useContext(NavPendingApiContext);
  // Guarda se ESTE link já contou pro agregador, pra `inc`/`dec` andarem
  // em par — sem isto, um `pending` que oscila (raro, mas possível numa
  // navegação abortada e reiniciada) poderia incrementar duas vezes sem
  // decrementar, deixando a contagem presa acima de zero pra sempre.
  const contadoRef = useRef(false);

  useEffect(() => {
    if (!api) return;
    if (pending && !contadoRef.current) {
      contadoRef.current = true;
      api.inc();
    } else if (!pending && contadoRef.current) {
      contadoRef.current = false;
      api.dec();
    }
    // Cleanup cobre o link sumir da árvore (navegação pra outro lugar)
    // enquanto ainda contava — sem isto, a contagem vazaria.
    return () => {
      if (contadoRef.current) {
        contadoRef.current = false;
        api.dec();
      }
    };
  }, [pending, api]);

  if (!pending) return null;

  return (
    <>
      {/*
        Marcador puro — não pinta nada, só existe pro `:has()` da casca.
        `aria-hidden` porque não há o que anunciar nele; o estado em si
        não pode ser exclusivamente visual, e é o `role="status"` abaixo
        que o entrega ao leitor de tela. `aria-live` implícito de
        `status` é "polite": não interrompe leitura em andamento.
      */}
      <span className="mo-linkflag" aria-hidden="true" />
      <span className="mo-sr-only" role="status">
        Carregando…
      </span>
    </>
  );
}
