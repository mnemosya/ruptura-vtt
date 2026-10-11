"use client";

/**
 * Trilho vertical de abas — colado à borda direita da área principal.
 * Só ícones; o nome completo aparece como hint ao lado esquerdo do
 * ícone, no hover ou no foco por teclado, com um pequeno atraso (evita
 * flicker ao passar o mouse de raspão).
 *
 * Grupos separados por divider: [personagem] —divider— [navegação].
 * O modo Painel saiu — o Console é sempre "Foco" (uma aba por vez,
 * com Personagem como aba própria), então não há mais grupo de modos.
 *
 * Todas as abas, Personagem inclusive, usam a mesma peça
 * (`.rc-tabrail-btn`) — um tema só de selecionada.
 */

import { ABAS, type AbaId } from "../tabs";

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
}: {
  aba: AbaId;
  onChangeAba: (id: AbaId) => void;
}) {
  return (
    <nav className="rc-tabrail" role="tablist" aria-label="Seções do console" aria-orientation="vertical">
      <div className="rc-tabrail-group">
        <TabBotao
          selecionada={aba === "personagem"}
          label="Personagem"
          onClick={() => onChangeAba("personagem")}
          testId="console-tab-personagem"
          Icon={PersonagemIcon}
        />
      </div>
      <div className="rc-tabrail-divider" aria-hidden="true" />

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

    </nav>
  );
}
