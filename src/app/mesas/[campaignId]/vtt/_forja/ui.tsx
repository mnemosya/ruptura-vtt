"use client";

import type { ReactNode } from "react";

/** Painel com aba de título à direita e borda chanfrada. `ambar` = estado confirmado. */
export function Panel({ title, right, children, className = "", ambar }: { title?: string; right?: ReactNode; children: ReactNode; className?: string; ambar?: boolean }) {
  return (
    <div className={`fj-painel ${title ? "fj-painel--com-titulo" : ""} ${className}`}>
      {title && (
        <div className="fj-painel__topo">
          <div className={`fj-painel__aba fj-ch-l ${ambar ? "fj-painel__aba--ambar" : ""}`}>
            <span className="fj-painel__titulo">{title}</span>
            {right}
          </div>
        </div>
      )}
      <div className={`${ambar ? "fj-borda-ambar" : "fj-borda"} fj-ch`}>
        <div className="fj-ch fj-vidro fj-painel__corpo">{children}</div>
      </div>
    </div>
  );
}

type Tom = "cy" | "am" | "gelo" | "escuro";

/** Rótulo técnico em mono, caixa alta. Nunca abaixo de 10px. */
export function Mono({ children, tom, pequeno, className = "" }: { children: ReactNode; tom?: Tom; pequeno?: boolean; className?: string }) {
  return <span className={`fj-mono ${tom ? `fj-mono--${tom}` : ""} ${pequeno ? "fj-mono--pequeno" : ""} ${className}`}>{children}</span>;
}

/** Tecla de atalho exibida ao lado de uma ação. */
export function Key({ k }: { k: string }) {
  return <span className="fj-tecla" aria-hidden="true">{k}</span>;
}

/** Barra segmentada (atributos). */
export function Seg({ value, max }: { value: number; max: number }) {
  return (
    <div className="fj-seg" aria-hidden="true">
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={`fj-seg__parte ${i < value ? "fj-seg__parte--cheia" : ""}`} />
      ))}
    </div>
  );
}

/** Texto de regra com **destaques** em âmbar. */
export function Rich({ text, className = "" }: { text: string; className?: string }) {
  return (
    <p className={className}>
      {text.split(/(\*\*[^*]+\*\*)/).map((t, i) => (t.startsWith("**") ? <strong key={i} className="fj-destaque">{t.slice(2, -2)}</strong> : t))}
    </p>
  );
}
