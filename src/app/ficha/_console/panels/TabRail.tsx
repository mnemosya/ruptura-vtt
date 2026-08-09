"use client";

/**
 * Trilho vertical de abas — colado à borda direita da área principal.
 * Só ícones; o nome completo aparece como hint ao lado esquerdo do
 * ícone, no hover ou no foco por teclado, com um pequeno atraso (evita
 * flicker ao passar o mouse de raspão).
 *
 * Reorganizado em GRUPOS separados por dividers (spec "modos Painel e
 * Foco" — estrutura no DOM, não margens simuladas):
 *   Painel: [navegação] —divider— [modos de visualização]
 *   Foco:   [personagem] —divider— [navegação] —divider— [modos de visualização]
 *
 * Os botões de modo (Painel/Foco) e a aba Personagem usam a MESMA
 * base (`.rc-tabrail-btn`) das abas de navegação, com modificadores
 * pro estado ativo (`--modo`: só borda esquerda + fundo, sem o brilho
 * cheio das abas; `--personagem`: paleta âmbar própria).
 */

import { PanelsTopLeft, AppWindow } from "lucide-react";
import { ABAS, type AbaId } from "../tabs";
import type { ViewMode } from "../viewMode";

/** Ícone customizado da aba Personagem — pessoa dentro de um quadro,
    sempre `currentColor` (a cor vem do estado do botão via CSS, igual
    aos ícones lucide das outras abas). */
function PersonagemIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M13.5 15.75C13.5 14.5565 13.0259 13.4119 12.182 12.568C11.3381 11.7241 10.1935 11.25 9 11.25M9 11.25C7.80653 11.25 6.66193 11.7241 5.81802 12.568C4.97411 13.4119 4.5 14.5565 4.5 15.75M9 11.25C10.6569 11.25 12 9.90685 12 8.25C12 6.59315 10.6569 5.25 9 5.25C7.34315 5.25 6 6.59315 6 8.25C6 9.90685 7.34315 11.25 9 11.25ZM3.75 2.25H14.25C15.0784 2.25 15.75 2.92157 15.75 3.75V14.25C15.75 15.0784 15.0784 15.75 14.25 15.75H3.75C2.92157 15.75 2.25 15.0784 2.25 14.25V3.75C2.25 2.92157 2.92157 2.25 3.75 2.25Z"
        stroke="currentColor"
        strokeWidth="1.16667"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TabBotao({
  selecionada,
  label,
  onClick,
  testId,
  className = "",
  Icon,
}: {
  selecionada: boolean;
  label: string;
  onClick: () => void;
  testId: string;
  className?: string;
  Icon: () => React.ReactElement;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selecionada}
      aria-label={label}
      className={`rc-tabrail-btn ${className}`.trim()}
      onClick={onClick}
      data-testid={testId}
    >
      <Icon />
      <span className="rc-tabrail-hint" aria-hidden="true">
        {label}
      </span>
    </button>
  );
}

export function TabRail({
  aba,
  onChangeAba,
  viewMode,
  onChangeViewMode,
}: {
  aba: AbaId;
  onChangeAba: (id: AbaId) => void;
  viewMode: ViewMode;
  onChangeViewMode: (m: ViewMode) => void;
}) {
  return (
    <nav className="rc-tabrail" role="tablist" aria-label="Seções do console" aria-orientation="vertical">
      {viewMode === "foco" && (
        <>
          <div className="rc-tabrail-group">
            <TabBotao
              selecionada={aba === "personagem"}
              label="Personagem"
              onClick={() => onChangeAba("personagem")}
              testId="console-tab-personagem"
              className="rc-tabrail-btn--personagem"
              Icon={PersonagemIcon}
            />
          </div>
          <div className="rc-tabrail-divider" aria-hidden="true" />
        </>
      )}

      <div className="rc-tabrail-group">
        {ABAS.map(({ id, label, Icon }) => (
          <TabBotao
            key={id}
            selecionada={aba === id}
            label={label}
            onClick={() => onChangeAba(id)}
            testId={`console-tab-${id}`}
            Icon={() => <Icon size={18} aria-hidden="true" />}
          />
        ))}
      </div>

      <div className="rc-tabrail-divider" aria-hidden="true" />

      <div className="rc-tabrail-group">
        <TabBotao
          selecionada={viewMode === "painel"}
          label="Modo Painel"
          onClick={() => onChangeViewMode("painel")}
          testId="console-modo-painel"
          className="rc-tabrail-btn--modo"
          Icon={() => <PanelsTopLeft size={18} aria-hidden="true" />}
        />
        <TabBotao
          selecionada={viewMode === "foco"}
          label="Modo Foco"
          onClick={() => onChangeViewMode("foco")}
          testId="console-modo-foco"
          className="rc-tabrail-btn--modo"
          Icon={() => <AppWindow size={18} aria-hidden="true" />}
        />
      </div>
    </nav>
  );
}
