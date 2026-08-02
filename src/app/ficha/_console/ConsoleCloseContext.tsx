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

import { createContext, useContext, type ReactNode } from "react";

const ConsoleCloseContext = createContext<(() => void) | null>(null);

export function ConsoleCloseProvider({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return <ConsoleCloseContext.Provider value={onClose}>{children}</ConsoleCloseContext.Provider>;
}

/** `null` quando não há override — quem chama cai no comportamento padrão. */
export function useConsoleCloseOverride(): (() => void) | null {
  return useContext(ConsoleCloseContext);
}
