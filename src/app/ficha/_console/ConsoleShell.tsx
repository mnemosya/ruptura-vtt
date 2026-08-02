"use client";

/**
 * Moldura do Console do Personagem.
 *
 * Estrutura fiel ao wireframe:
 * - coluna esquerda: retrato, identidade, atributos e um card por bloco
 *   de vitais (Integridade, Sobrecarga, Deslocamento, PA, Reações);
 * - coluna central: Colapso + Recursos no topo, Equipamentos, e abaixo
 *   dele os Fixados e as Condições;
 * - coluna direita: as SEIS abas do wireframe e o painel de conteúdo.
 *
 * Decisão de arquitetura: o motor da ficha (`CharacterSheetClient`)
 * não é reescrito — este shell envolve o mesmo estado e recebe o
 * conteúdo da aba como `children`.
 *
 * Identidade visual: `_design/console.css`.
 */

import type { ReactNode } from "react";
import type { ActiveCondition, Character, DerivedStats } from "../../../lib/character";
import { VitalsColumn } from "./VitalsColumn";
import { ResourcesRow } from "./ResourcesRow";
import { PaperDoll, QuickAccessCards } from "./PaperDoll";
import "../../_design/console.css";

export interface ConsoleTab {
  id: string;
  label: string;
}

function ConditionsPanel({ condicoes }: { condicoes: ActiveCondition[] }) {
  const ativas = condicoes.filter((c) => c.ativa !== false);
  return (
    <div className="rc-panel rc-brackets">
      <div className="rc-block-label" style={{ marginBottom: 9 }}>
        Condições
      </div>
      {ativas.length === 0 ? (
        <p className="rc-conditions-empty">Nenhuma condição ativa.</p>
      ) : (
        <div className="rc-conditions">
          {ativas.map((c) => (
            <span key={c.id} className="rc-condition-chip" data-tone="debuff" title={c.nome}>
              {c.nome}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ConsoleShell({
  character,
  derivados,
  tabs,
  activeTab,
  onTabChange,
  titlebarExtra,
  banners,
  children,
}: {
  character: Character;
  derivados: DerivedStats;
  tabs: readonly ConsoleTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  /** Controles que o wireframe põe na barra de título (salvar, status). */
  titlebarExtra?: ReactNode;
  /** Avisos de sessão/sync/erro herdados da ficha antiga. */
  banners?: ReactNode;
  /** Conteúdo da aba ativa. */
  children: ReactNode;
}) {
  return (
    <div className="rc-root">
      <div className="rc-window">
        <span className="rc-rail rc-rail--left" aria-hidden="true">
          <span>sys.ruptura // console</span>
        </span>
        <span className="rc-rail rc-rail--right" aria-hidden="true">
          <span>ficha operacional</span>
        </span>
        <div className="rc-titlebar">
          <span className="rc-titlebar-name rc-mono">Console do Personagem</span>
          <span className="rc-titlebar-right">{titlebarExtra}</span>
        </div>

        {banners ? <div className="rc-banners">{banners}</div> : null}

        <div className="rc-grid">
          <VitalsColumn character={character} derivados={derivados} />

          <div className="rc-col rc-col-center">
            <ResourcesRow character={character} derivados={derivados} />
            <PaperDoll character={character} />

            {/* Acesso Rápido: dois cards próprios, fora do paper doll. */}
            <QuickAccessCards character={character} />

            {/* Fixados ficam abaixo de Equipamentos; Condições foi para
                a coluna da direita, sob o painel de Perícias. */}
            <div className="rc-pinned">
              {/* `pinned` ainda não existe no payload — pendência no
                  checkpoint. Slots visíveis e vazios, sem simular conteúdo. */}
              {[1, 2, 3].map((n) => (
                <div key={n} className="rc-pinned-slot" data-testid={`console-pinned-${n}`}>
                  <span className="rc-pinned-mark" aria-hidden="true" />
                  <span className="rc-pinned-label">Fixado #{n}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rc-col rc-col-tabs">
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

            <ConditionsPanel condicoes={character.condicoes_ativas ?? []} />
          </div>
        </div>
      </div>
    </div>
  );
}
