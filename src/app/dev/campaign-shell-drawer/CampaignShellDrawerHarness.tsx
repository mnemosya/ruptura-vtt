"use client";

/**
 * Monta `CampaignShell` real com um `painelSessao` de teste — três
 * elementos focáveis (para o teste de foco NÃO-preso ter mais de um
 * item pra Tab percorrer antes de sair do painel — `PainelSessao` é um
 * diálogo não-modal de propósito, não prende foco) e um id de montagem
 * estável (`useRef` com inicializador de função, gerado uma vez por
 * instância React, nunca recalculado em re-render). Se esse id mudar
 * entre duas leituras do DOM, o componente remontou — é a prova de
 * "instância única" que a auditoria da Fase 1 pediu, aplicada aqui ao
 * painel de sessão.
 */

import { useRef, type ReactNode } from "react";
import { CampaignShell } from "../../mesas/[campaignId]/_shell/CampaignShell";

let contador = 0;

export function CampaignShellDrawerHarness({ children }: { children: ReactNode }) {
  const mountId = useRef<number | null>(null);
  if (mountId.current === null) {
    contador += 1;
    mountId.current = contador;
  }

  return (
    <CampaignShell
      campaignId="dev-harness"
      campaignName="Harness de teste do drawer"
      role="narrator"
      painelSessao={
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <span data-testid="drawer-mount-id" data-mount-id={mountId.current} style={{ fontSize: 11, opacity: 0.6 }}>
            mount #{mountId.current}
          </span>
          <button type="button" data-testid="drawer-item-1">
            Item focável 1
          </button>
          <a href="#" data-testid="drawer-item-2">
            Item focável 2
          </a>
          <button type="button" data-testid="drawer-item-3">
            Item focável 3
          </button>
        </div>
      }
    >
      {children}
    </CampaignShell>
  );
}
