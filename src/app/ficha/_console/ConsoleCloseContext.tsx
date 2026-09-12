"use client";

/**
 * Sobrescreve o que "fechar o Console" significa, sem prop-drilling
 * através de FichaPageContent → CharacterSheetView → CharacterSheetClient
 * → CharacterConsole → ConsoleWindow (nenhum desses componentes
 * intermediários precisa saber que existe).
 *
 * Rota normal /ficha (navegação direta/link compartilhado): sem
 * provider — o Console só esconde a janela (`setConsoleAberto(false)`),
 * como sempre foi.
 *
 * Rota interceptada `app/mesas/@modal/(...)ficha` (clique num
 * personagem a partir de Personagens): o wrapper da rota fornece
 * `router.back()` aqui — fechar o Console literalmente volta para a
 * página de Personagens, sem recarregar nada.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";

interface Hospedeiro {
  onClose: () => void;
  /**
   * O Console está ANCORADO dentro de outra tela viva (hoje: o VTT).
   *
   * Muda o que a janela é: sem véu por cima do que está embaixo, sem
   * `aria-modal`, sem armadilha de Tab. Uma ficha aberta não pode
   * congelar o mapa — a pessoa consulta a ficha PARA agir na mesa, e
   * ter que fechar a janela antes de mover um token transforma
   * consulta em interrupção.
   */
  ancorado: boolean;
  /**
   * Ação "Ver no mapa" — leva a câmera até o token deste personagem e
   * fecha a ficha. `null` quando não há mapa (Personagens, Mesa) ou
   * quando o personagem não está na cena: a ficha não oferece um botão
   * que não vai a lugar nenhum.
   */
  verNoMapa: (() => void) | null;
}

const ConsoleCloseContext = createContext<Hospedeiro | null>(null);

export function ConsoleCloseProvider({
  onClose, ancorado = false, verNoMapa = null, children,
}: { onClose: () => void; ancorado?: boolean; verNoMapa?: (() => void) | null; children: ReactNode }) {
  const valor = useMemo(() => ({ onClose, ancorado, verNoMapa }), [onClose, ancorado, verNoMapa]);
  return <ConsoleCloseContext.Provider value={valor}>{children}</ConsoleCloseContext.Provider>;
}

/** `null` quando não há override — quem chama cai no comportamento padrão. */
export function useConsoleCloseOverride(): (() => void) | null {
  return useContext(ConsoleCloseContext)?.onClose ?? null;
}

/** `false` na rota /ficha, onde o Console É a página e não há nada vivo embaixo. */
export function useConsoleAncorado(): boolean {
  return useContext(ConsoleCloseContext)?.ancorado ?? false;
}

/** `null` quando não há mapa pra focar — a ação não deve nem aparecer. */
export function useVerNoMapa(): (() => void) | null {
  return useContext(ConsoleCloseContext)?.verNoMapa ?? null;
}
