"use client";

/**
 * Moldura do Console do Personagem — a casca visual que substitui o
 * layout antigo da ficha (`<main style={{maxWidth:720}}>` +
 * `CharacterSheetTabs`) sem tocar na lógica das abas.
 *
 * Decisão de arquitetura (Tempo 1): o motor da ficha
 * (`CharacterSheetClient`, ~5.7k linhas) NÃO é reescrito. Este shell
 * envolve o mesmo estado e recebe o conteúdo das abas como `children`,
 * então cada aba continua exatamente como estava. Trocar motor e
 * carroceria ao mesmo tempo seria o jeito caro e arriscado de fazer
 * isso.
 *
 * Identidade visual: `_design/console.css`, terceira folha da mesma
 * linguagem HUD de `auth.css` e `app.css` (mesmos tokens, mesma
 * tipografia, mesmo canto cortado).
 */

import type { ReactNode } from "react";
import type { Character, DerivedStats } from "../../../lib/character";
import { VitalsColumn } from "./VitalsColumn";
import { ResourcesPanel } from "./ResourcesPanel";
import { PaperDoll } from "./PaperDoll";
import "../../_design/console.css";

export interface ConsoleTab {
  id: string;
  label: string;
}

export function ConsoleShell({
  character,
  derivados,
  tabs,
  activeTab,
  onTabChange,
  conditions,
  banners,
  children,
}: {
  character: Character;
  derivados: DerivedStats;
  tabs: readonly ConsoleTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  /** Faixa de estados ativos (ActiveStateStrip) — entra no painel Condições. */
  conditions?: ReactNode;
  /** Avisos de sessão/sync/erro herdados da ficha antiga. */
  banners?: ReactNode;
  /** Conteúdo da aba ativa. */
  children: ReactNode;
}) {
  return (
    <div className="rc-root">
      <div className="rc-window">
        <div className="rc-titlebar">
          <span className="rc-titlebar-name rc-mono">Console do Personagem</span>
          <span className="rc-titlebar-actions rc-mono" aria-hidden="true">
            <span style={{ fontSize: 10, letterSpacing: "0.16em" }}>{character.nome || "sem nome"}</span>
          </span>
        </div>

        {banners ? <div className="rc-banners">{banners}</div> : null}

        <div className="rc-grid">
          <VitalsColumn character={character} derivados={derivados} />

          <div className="rc-col rc-col-center">
            <ResourcesPanel character={character} derivados={derivados} />
            <PaperDoll character={character} />
          </div>

          <div className="rc-col rc-col-tabs">
            <div>
              <div className="rc-tabs" role="tablist">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    data-testid={`tab-${tab.id}`}
                    className={`rc-tab${activeTab === tab.id ? " rc-tab--active" : ""}`}
                    onClick={() => onTabChange(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="rc-tabpanel" role="tabpanel">
                {children}
              </div>
            </div>

            <div className="rc-pinned">
              {/* `pinned` ainda não existe no payload — pendência registrada
                  no checkpoint. Slots ficam visíveis e vazios, sem simular
                  conteúdo. */}
              {[1, 2, 3].map((n) => (
                <div key={n} className="rc-pinned-slot" data-testid={`console-pinned-${n}`}>
                  pinned #{n}
                </div>
              ))}
            </div>

            <div className="rc-panel">
              <div className="rc-panel-title">Condições</div>
              {conditions ?? <p className="rc-conditions-empty">Nenhuma condição ativa.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
