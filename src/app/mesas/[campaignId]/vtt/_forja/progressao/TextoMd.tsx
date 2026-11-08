import type { ReactNode } from "react";

/**
 * Texto de regra vindo do Notion, renderizado SEM mexer no conteúdo: só o
 * visual é da Forja (`.pg-md` em `progressao.css`). Entende o que o texto
 * publicado traz — parágrafos (linha em branco), listas (`- `, `* `, `› `),
 * citações (`> `), subtítulos (`#### `) — e, dentro da linha, `**negrito**`,
 * `*itálico*`, `` `atributo` `` e `==realce==` (o realce cinza do Notion), aninháveis.
 */
export function TextoMd({ texto, className = "" }: { texto: string; className?: string }) {
  const blocos: ReactNode[] = [];
  let itens: string[] = [];
  const fecharLista = () => {
    if (!itens.length) return;
    blocos.push(<ul key={blocos.length}>{itens.map((t, i) => <li key={i}>{inline(t)}</li>)}</ul>);
    itens = [];
  };
  for (const paragrafo of texto.split(/\n\s*\n/)) {
    let corrido: string[] = [];
    const fecharParagrafo = () => {
      if (!corrido.length) return;
      blocos.push(<p key={blocos.length}>{inline(corrido.join(" "))}</p>);
      corrido = [];
    };
    for (const bruta of paragrafo.split("\n")) {
      const linha = bruta.trim();
      if (!linha || /^-{3,}$/.test(linha)) continue;
      const item = linha.match(/^(?:[-*›•])\s+(.*)$/);
      if (item) { fecharParagrafo(); itens.push(item[1]); continue; }
      fecharLista();
      const titulo = linha.match(/^#{1,6}\s+(.*)$/);
      if (titulo) { fecharParagrafo(); blocos.push(<h4 key={blocos.length}>{inline(titulo[1])}</h4>); continue; }
      const citacao = linha.match(/^>\s*(.*)$/);
      if (citacao) { fecharParagrafo(); if (citacao[1]) blocos.push(<blockquote key={blocos.length}>{inline(citacao[1])}</blockquote>); continue; }
      corrido.push(linha);
    }
    fecharParagrafo();
  }
  fecharLista();
  return <div className={`pg-md ${className}`}>{blocos}</div>;
}

const MARCAS = /(\*\*[^*]+?\*\*|(?<![*\w])\*(?![\s*])[^*]+?(?<!\s)\*(?![*\w])|`[^`]+?`|==[^=]+?==)/;

function inline(texto: string): ReactNode[] {
  return texto.split(MARCAS).filter(Boolean).map((t, i) => {
    if (t.startsWith("**") && t.endsWith("**") && t.length > 4) return <strong key={i}>{inline(t.slice(2, -2))}</strong>;
    if (t.startsWith("*") && t.endsWith("*") && !t.startsWith("**") && t.length > 2) return <em key={i}>{inline(t.slice(1, -1))}</em>;
    if (t.startsWith("`") && t.endsWith("`") && t.length > 2) return <code key={i}>{t.slice(1, -1)}</code>;
    if (t.startsWith("==") && t.endsWith("==") && t.length > 4) return <mark key={i}>{inline(t.slice(2, -2))}</mark>;
    return t;
  });
}
