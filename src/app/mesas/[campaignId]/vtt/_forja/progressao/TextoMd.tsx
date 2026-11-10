import type { ReactNode } from "react";

/**
 * Texto de regra vindo do Notion, renderizado SEM mexer no conteúdo: só o
 * visual é da Forja (`.pg-md` em `progressao.css`). Entende o que o texto
 * publicado traz — parágrafos (linha em branco), listas (`- `, `* `, `› `),
 * citações (`> `), tabelas (`| a | b |`, com ou sem a linha `| --- |`; sem ela, a
 * primeira linha é o cabeçalho), subtítulos (`#### ` ou um parágrafo todo em negrito) — e, dentro da linha, `**negrito**`,
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
  let linhas: string[][] = [];
  let cabecalho = 1;
  const fecharTabela = () => {
    if (!linhas.length) return;
    const [topo, corpo] = [linhas.slice(0, cabecalho), linhas.slice(cabecalho)];
    blocos.push(
      <div key={blocos.length} className="pg-md-tabela">
        <table>
          {topo.length > 0 && <thead>{topo.map((l, i) => <tr key={i}>{l.map((c, j) => <th key={j}>{inline(semNegrito(c))}</th>)}</tr>)}</thead>}
          <tbody>{corpo.map((l, i) => <tr key={i}>{l.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody>
        </table>
      </div>,
    );
    linhas = [];
    cabecalho = 1;
  };
  for (const paragrafo of texto.split(/\n\s*\n/)) {
    let corrido: string[] = [];
    const fecharParagrafo = () => {
      if (!corrido.length) return;
      const texto = corrido.join(" ");
      corrido = [];
      // Parágrafo todo em negrito é subtítulo no Notion: "**MANOBRAS TÁTICAS**" (heading) e
      // "**ATAQUE ENCADEADO:**" (título de toggle; os dois-pontos são só a marca da extração).
      const sub = texto.match(/^\*\*([^*]+?)\*\*$/);
      if (sub && sub[1].trim().endsWith(":")) { blocos.push(<h5 key={blocos.length}>{sub[1].trim().replace(/:$/, "")}</h5>); return; }
      if (sub && sub[1] === sub[1].toUpperCase()) { blocos.push(<h4 key={blocos.length}>{sub[1].trim()}</h4>); return; }
      blocos.push(<p key={blocos.length}>{inline(texto)}</p>);
    };
    for (const bruta of paragrafo.split("\n")) {
      const linha = bruta.trim();
      if (!linha || /^-{3,}$/.test(linha)) continue;
      if (/^\|.*\|$/.test(linha)) {
        fecharParagrafo(); fecharLista();
        const celulas = linha.slice(1, -1).split("|").map((c) => c.trim());
        // `| --- | --- |`: tudo acima é cabeçalho.
        if (celulas.every((c) => /^:?-{3,}:?$/.test(c))) cabecalho = linhas.length;
        else linhas.push(celulas);
        continue;
      }
      fecharTabela();
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
    fecharTabela();
  }
  fecharLista();
  return <div className={`pg-md ${className}`}>{blocos}</div>;
}

/** Cabeçalho já é negrito: tira o `**…**` que envolve a célula inteira. */
const semNegrito = (c: string) => c.match(/^\*\*([^*]+)\*\*$/)?.[1] ?? c;

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
