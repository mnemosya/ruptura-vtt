"use client";

/**
 * Trilho vertical de abas — colado à borda direita da área principal.
 * Só ícones; o nome completo aparece como hint ao lado esquerdo do
 * ícone, no hover ou no foco por teclado, com um pequeno atraso (evita
 * flicker ao passar o mouse de raspão).
 */

import { ABAS, type AbaId } from "../tabs";

export function TabRail({ aba, onChange }: { aba: AbaId; onChange: (id: AbaId) => void }) {
  return (
    <nav className="rc-tabrail" role="tablist" aria-label="Seções do console" aria-orientation="vertical">
      {ABAS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={aba === id}
          aria-label={label}
          className="rc-tabrail-btn"
          onClick={() => onChange(id)}
          data-testid={`console-tab-${id}`}
        >
          <Icon size={17} aria-hidden="true" />
          <span className="rc-tabrail-hint" aria-hidden="true">
            {label}
          </span>
        </button>
      ))}
    </nav>
  );
}
