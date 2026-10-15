"use client";

/**
 * Texto de regra com os TERMOS GRIFADOS.
 *
 * Quando a descrição de um item diz "fazem teste de Resistir CD 8; em
 * falha, ficam Atordoados", as duas palavras marcadas são entidades
 * reais do conteúdo — uma `combat_action` e uma `condition`
 * publicadas. Aqui elas viram texto grifado com tooltip da regra.
 *
 * A MARCA É DO PRÓPRIO TEXTO, nunca uma caixa por cima dele. No
 * desenho do Figma essas duas eram `position: absolute` em left/top
 * fixos: funcionavam só naquela quebra de linha exata e cobriam a
 * frase por baixo. Aqui são `<span>` na frase, então acompanham a
 * quebra, o tamanho da fonte, a seleção de texto e o zoom.
 *
 * O glossário vem de `api.glossario` — conteúdo real, montado no
 * cliente da ficha a partir de `combat_action` + `condition`. Este
 * componente não tem lista própria: termo que não está publicado não
 * fica grifado, e isso é o comportamento certo (grifar sem ter regra
 * pra mostrar seria pior que não grifar).
 *
 * O conteúdo vem do Notion em markdown. Entende o subconjunto que o
 * catálogo usa: parágrafos (linha em branco), listas `- ` / `* ` e
 * `1. ` (com recuo), tabelas `| a | b |`, citação `> `, e no texto
 * `**negrito**`, `*itálico*`, `` `termo` `` e `[rótulo](url)` (só o
 * rótulo — os links apontam para páginas internas do Notion).
 */

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpen } from "lucide-react";
import dynamic from "next/dynamic";

/* O livro só carrega quando um link é aberto: fica fora do pacote (e do SSR) da ficha. */
const LivroCodex = dynamic(() => import("../../mesas/[campaignId]/vtt/_compendio/LivroCodex").then((m) => m.LivroCodex), { ssr: false });
import { TermoComDica } from "./TermoComDica";
import { separarTermos } from "./termosDeRegra";
import type { TermoDeRegra } from "./types";

type Bloco =
  | { tipo: "p"; linhas: string[] }
  | { tipo: "lista"; ordenada: boolean; itens: { nivel: number; texto: string }[] }
  | { tipo: "tabela"; linhas: string[][] }
  | { tipo: "citacao"; linhas: string[] };

const ITEM = /^(\s*)([-*•]|\d+[.)])\s+(.*)$/;
const CELULAS = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
const SEPARADOR_TABELA = /^\s*\|?\s*:?-{2,}/;

function emBlocos(texto: string): Bloco[] {
  const blocos: Bloco[] = [];
  for (const linha of texto.replace(/\r\n?/g, "\n").split("\n")) {
    const ultimo = blocos[blocos.length - 1];
    if (!linha.trim()) {
      // Linha em branco fecha parágrafo/citação; listas e tabelas continuam se o próximo for do mesmo tipo.
      if (ultimo?.tipo === "p" || ultimo?.tipo === "citacao") blocos.push({ tipo: "p", linhas: [] });
      continue;
    }
    const item = ITEM.exec(linha);
    if (item) {
      const ordenada = /\d/.test(item[2]);
      const nivel = Math.floor(item[1].replace(/\t/g, "  ").length / 2);
      if (ultimo?.tipo === "lista" && (ultimo.ordenada === ordenada || nivel > 0)) ultimo.itens.push({ nivel, texto: item[3] });
      else blocos.push({ tipo: "lista", ordenada, itens: [{ nivel, texto: item[3] }] });
      continue;
    }
    if (linha.trim().startsWith("|")) {
      if (SEPARADOR_TABELA.test(linha) && !/[^\s|:-]/.test(linha)) continue;
      if (ultimo?.tipo === "tabela") ultimo.linhas.push(CELULAS(linha));
      else blocos.push({ tipo: "tabela", linhas: [CELULAS(linha)] });
      continue;
    }
    if (linha.startsWith(">")) {
      const t = linha.replace(/^>\s?/, "");
      if (ultimo?.tipo === "citacao") ultimo.linhas.push(t);
      else blocos.push({ tipo: "citacao", linhas: [t] });
      continue;
    }
    // Linha recuada logo depois de um item continua o item.
    if (ultimo?.tipo === "lista" && /^\s+/.test(linha)) {
      ultimo.itens[ultimo.itens.length - 1].texto += ` ${linha.trim()}`;
      continue;
    }
    if (ultimo?.tipo === "p") ultimo.linhas.push(linha);
    else blocos.push({ tipo: "p", linhas: [linha] });
  }
  return blocos.filter((b) => (b.tipo === "p" ? b.linhas.length > 0 : true));
}

/** ID da página do Notion num link (`app.notion.com/p/<id>`, `notion.so/...-<id>`) — é o mesmo ID dos capítulos do Compêndio. */
const paginaDoNotion = (url: string) => /notion\.(?:com|so)\/(?:[^?#]*?[-/])?([0-9a-f]{32})(?:[?#]|$)/i.exec(url)?.[1] ?? null;

/** Link para um capítulo do livro: abre o Compêndio ali mesmo, por cima da ficha. */
function LinkDoLivro({ pageId, children }: { pageId: string; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  // O livro (z 486) abre por cima de janelas do Console como o catálogo (z 600): sobe enquanto estiver aberto por aqui.
  useEffect(() => {
    if (!aberto) return;
    document.body.classList.add("rc-livro-por-cima");
    return () => document.body.classList.remove("rc-livro-por-cima");
  }, [aberto]);
  return <>
    {/* <a> e não <button>: fica fora da regra global que chanfra botões do chassi */}
    <a href="#" className="rc-link-livro" onClick={(e) => { e.preventDefault(); setAberto(true); }}>
      <BookOpen size={14} strokeWidth={1.8} aria-hidden="true" />{children}
    </a>
    {aberto && <LivroCodex campaignId={null} inicial={{ pageId }} onClose={() => setAberto(false)} />}
  </>;
}

/** Texto corrido: negrito, itálico, `termo`, [link](url) — e os termos do glossário grifados em tudo. */
function emLinha(texto: string, glossario: TermoDeRegra[], chave: string): ReactNode[] {
  // Link para página do Notion vira atalho do livro; outros links ficam só com o rótulo.
  const semLinks = texto.replace(/\[([^\]]+)\]\(([^)]*)\)/g, (todo, rotulo: string, url: string) => (paginaDoNotion(url) ? todo : rotulo));
  const comTermos = (t: string, k: string) =>
    separarTermos(t, glossario).map((p, i) =>
      p.termo ? <TermoComDica key={`${k}-${i}-${p.termo.slug}`} termo={p.termo}>{p.texto}</TermoComDica> : <Fragment key={`${k}-${i}`}>{p.texto}</Fragment>,
    );
  // Ordem importa: negrito antes de itálico (o `*` do itálico casaria dentro de `**`).
  const PADRAO = /\[([^\]]+)\]\(([^)]*)\)|\*\*(.+?)\*\*|`([^`]+)`|\*([^*\s][^*]*?)\*/g;
  const saida: ReactNode[] = [];
  let resto = 0, n = 0;
  for (const m of semLinks.matchAll(PADRAO)) {
    if (m.index! > resto) saida.push(...comTermos(semLinks.slice(resto, m.index), `${chave}t${n}`));
    const k = `${chave}m${n++}`;
    if (m[1] != null) saida.push(<LinkDoLivro key={k} pageId={paginaDoNotion(m[2])!}>{m[1].replace(/\*/g, "")}</LinkDoLivro>);
    else if (m[3] != null) saida.push(<strong key={k} className="rc-negrito">{emLinha(m[3], glossario, k)}</strong>);
    else if (m[4] != null) saida.push(<strong key={k} className="rc-negrito">{comTermos(m[4], k)}</strong>);
    else saida.push(<em key={k}>{comTermos(m[5], k)}</em>);
    resto = m.index! + m[0].length;
  }
  if (resto < semLinks.length) saida.push(...comTermos(semLinks.slice(resto), `${chave}t${n}`));
  return saida;
}

export function TextoComRegras({
  texto,
  glossario,
  className,
}: {
  texto: string;
  glossario: TermoDeRegra[];
  className?: string;
}) {
  const conteudo = useMemo<ReactNode[]>(
    () =>
      emBlocos(texto).map((b, i) => {
        const k = `b${i}`;
        const topo = i === 0 ? 0 : "0.6em";
        if (b.tipo === "p") return <p key={k} style={{ margin: `${topo} 0 0` }}>{emLinha(b.linhas.join(" "), glossario, k)}</p>;
        if (b.tipo === "citacao") {
          // Listas dentro de uma nota mantêm seus blocos e marcadores.
          // Unir tudo com espaços transforma os exemplos em um único parágrafo.
          if (b.linhas.some(linha => ITEM.test(linha))) {
            return <blockquote key={k} style={{ margin: `${topo} 0 0`, paddingLeft: "0.8em", borderLeft: "2px solid currentColor" }}><TextoComRegras texto={b.linhas.join("\n")} glossario={glossario} /></blockquote>;
          }
          // Citação do Notion = nota em itálico, exportada picotada ("*texto *[*link*](url)* *").
          // O bloco inteiro já é itálico; os "*" soltos que sobram saem (o **negrito** fica).
          // Os "*" do link saem antes (rótulo limpo); o link em si continua e vira atalho do livro.
          const links: string[] = [];
          const texto = b.linhas.join(" ")
            .replace(/\[\*?([^\]]*?)\*?\]\(([^)]*)\)/g, (_t, rot: string, url: string) => `\u0000${links.push(`[${rot.replace(/\*/g, "")}](${url})`) - 1}\u0000`)
            .replace(/(?<!\*)\*(?!\*)/g, "").replace(/\s+/g, " ").trim()
            .replace(/\u0000(\d+)\u0000/g, (_t, i: string) => links[Number(i)]);
          return <blockquote key={k} style={{ margin: `${topo} 0 0`, paddingLeft: "0.8em", borderLeft: "2px solid currentColor", opacity: 0.75, fontStyle: "italic" }}>{emLinha(texto, glossario, k)}</blockquote>;
        }
        if (b.tipo === "tabela" && b.linhas.length === 1 && b.linhas[0].length === 2) {
          // Tabela só com cabeçalho de duas células ("RAM:" | "5 + (Mana × 2)") é uma fórmula: vira destaque.
          const [rotulo, valor] = b.linhas[0];
          return (
            <div key={k} className="rc-formula" style={{ margin: `${topo} 0 0`, display: "flex", alignItems: "baseline", gap: "0.8em", flexWrap: "wrap", padding: "0.6em 0.9em", borderLeft: "2px solid var(--rv-vertente-cor, currentColor)", background: "color-mix(in srgb, currentColor 6%, transparent)" }}>
              <span style={{ fontSize: "0.8em", fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--rv-vertente-cor, currentColor)" }}>{emLinha(rotulo.replace(/\*\*/g, ""), glossario, `${k}r`)}</span>
              <span style={{ fontSize: "1.15em", fontWeight: 700 }}>{emLinha(valor.replace(/\*\*/g, ""), glossario, `${k}v`)}</span>
            </div>
          );
        }
        if (b.tipo === "tabela") {
          const [cab, ...corpo] = b.linhas;
          return (
            <table key={k} style={{ margin: `${topo} 0 0`, borderCollapse: "collapse", width: "100%", fontSize: "0.92em" }}>
              <thead><tr>{cab.map((c, j) => <th key={j} style={{ textAlign: "left", padding: "4px 8px 4px 0", borderBottom: "1px solid color-mix(in srgb, currentColor 25%, transparent)" }}>{emLinha(c.replace(/\*\*/g, ""), glossario, `${k}h${j}`)}</th>)}</tr></thead>
              <tbody>{corpo.map((l, r) => <tr key={r}>{l.map((c, j) => <td key={j} style={{ padding: "4px 8px 4px 0", borderBottom: "1px solid color-mix(in srgb, currentColor 10%, transparent)" }}>{emLinha(c, glossario, `${k}r${r}c${j}`)}</td>)}</tr>)}</tbody>
            </table>
          );
        }
        const Lista = b.ordenada ? "ol" : "ul";
        return (
          <Lista key={k} className="rc-lista-texto" style={{ margin: `${topo} 0 0`, paddingLeft: "1.2em", listStyle: b.ordenada ? "decimal" : "disc" }}>
            {b.itens.map((it, j) => <li key={j} style={{ marginTop: j ? "0.35em" : 0, marginLeft: `${it.nivel * 1.2}em` }}>{emLinha(it.texto, glossario, `${k}i${j}`)}</li>)}
          </Lista>
        );
      }),
    [texto, glossario],
  );

  return <div className={className}>{conteudo}</div>;
}
