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

import { createContext, Fragment, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpen } from "lucide-react";
import dynamic from "next/dynamic";

/* O livro só carrega quando um link é aberto: fica fora do pacote (e do SSR) da ficha. */
const LivroCodex = dynamic(() => import("../../mesas/[campaignId]/vtt/_compendio/LivroCodex").then((m) => m.LivroCodex), { ssr: false });
import { TermoComDica } from "./TermoComDica";
import { separarTermos } from "./termosDeRegra";
import type { TermoDeRegra } from "./types";

import { emBlocos, ITEM } from "./blocosDeRegra";
import "./textoComRegras.css";

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

/**
 * Glossário do Console inteiro. Quem chama sem glossário próprio (painéis
 * de classe, fichas de companheiro, codex) usa este, então todo texto de
 * regra aberto no Console grifa as mesmas ações e condições.
 */
export const GlossarioDoConsole = createContext<TermoDeRegra[]>([]);

/* Formatos dos livros de classe, além do Markdown. */
const ACAO = /^(\d+ PA) ([^.]+?)\.\s*(.*)$/;
const NATURAL = /\s*\(Ataque natural\)$/;
const MAIUSC = "A-ZÁÉÍÓÚÂÊÔÃÕÇÜ";
const CHAVE_VALOR = new RegExp(`^([${MAIUSC}][^:.]{0,24}):\\s*(.+)$`);
const PALAVRA = `[${MAIUSC}][\\wÀ-ÿ-]*`;
// Nome em destaque no começo do parágrafo: "Passos Silenciosos. O companheiro…", "Instinto. Utilizar…".
const NOME_NA_FRENTE = new RegExp(`^(${PALAVRA}(?:\\s+(?:de|da|do|das|dos|e|em|${PALAVRA})){0,4}\\.)\\s+(.+)$`);
const ROTULO = /^(Exemplos?|Nota|Observação|Especial):\s+(.+)$/;

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
  const doConsole = useContext(GlossarioDoConsole);
  const termos = glossario.length ? glossario : doConsole;
  const conteudo = useMemo<ReactNode[]>(
    () => {
      const todos = emBlocos(texto);
      return todos.map((b, i) => {
        const k = `b${i}`;
        const topo = i === 0 ? 0 : "1em";
        if (b.tipo === "titulo") {
          const Titulo = `h${b.nivel}` as "h3" | "h4" | "h5" | "h6";
          return <Titulo key={k} className="rc-regra-titulo">{emLinha(b.texto, termos, k)}{b.custo && <span className="rc-custo">{b.custo}</span>}</Titulo>;
        }
        if (b.tipo === "divisor") return <hr key={k}/>;
        if (b.tipo === "p") {
          const corrido = b.linhas.join(" ");
          const margem = { margin: `${topo} 0 0` };
          // "1 PA Andar. texto": a ação com o custo à frente (fichas de companheiro e máquinas).
          const acao = ACAO.exec(corrido);
          if (acao) return <p key={k} className="rc-acao" style={margem}><span className="rc-custo">{acao[1]}</span><strong className="rc-acao-nome">{emLinha(acao[2].replace(NATURAL, ""), termos, `${k}n`)}</strong>{NATURAL.test(acao[2]) && <span className="rc-marca">ATAQUE NATURAL</span>}{acao[3] && <> {emLinha(acao[3], termos, `${k}t`)}</>}</p>;
          // Frase curta que abre a lista logo abaixo ("Se o ataque acertar:").
          if (corrido.endsWith(":") && corrido.length <= 140 && todos[i + 1]?.tipo === "lista") return <p key={k} className="rc-introduz" style={margem}>{emLinha(corrido, termos, k)}</p>;
          const rotulo = ROTULO.exec(corrido), lider = rotulo ?? NOME_NA_FRENTE.exec(corrido);
          if (lider) return <p key={k} style={margem}><strong className="rc-negrito">{lider[1]}{rotulo ? ":" : ""}</strong> {emLinha(lider[2], termos, k)}</p>;
          return <p key={k} style={margem}>{emLinha(corrido, termos, k)}</p>;
        }
        if (b.tipo === "citacao") {
          // Listas dentro de uma nota mantêm seus blocos e marcadores.
          // Unir tudo com espaços transforma os exemplos em um único parágrafo.
          if (b.linhas.some(linha => ITEM.test(linha))) {
            return <blockquote key={k} style={{ margin: `${topo} 0 0`, paddingLeft: "0.8em", borderLeft: "2px solid currentColor" }}><TextoComRegras texto={b.linhas.join("\n")} glossario={termos} /></blockquote>;
          }
          // Citação do Notion = nota em itálico, exportada picotada ("*texto *[*link*](url)* *").
          // O bloco inteiro já é itálico; os "*" soltos que sobram saem (o **negrito** fica).
          // Os "*" do link saem antes (rótulo limpo); o link em si continua e vira atalho do livro.
          const links: string[] = [];
          const texto = b.linhas.join(" ")
            .replace(/\[\*?([^\]]*?)\*?\]\(([^)]*)\)/g, (_t, rot: string, url: string) => `\u0000${links.push(`[${rot.replace(/\*/g, "")}](${url})`) - 1}\u0000`)
            .replace(/(?<!\*)\*(?!\*)/g, "").replace(/\s+/g, " ").trim()
            .replace(/\u0000(\d+)\u0000/g, (_t, i: string) => links[Number(i)]);
          return <blockquote key={k} style={{ margin: `${topo} 0 0`, paddingLeft: "0.8em", borderLeft: "2px solid currentColor", opacity: 0.75, fontStyle: "italic" }}>{emLinha(texto, termos, k)}</blockquote>;
        }
        if (b.tipo === "tabela" && b.linhas.length === 1 && b.linhas[0].length === 2) {
          // Tabela só com cabeçalho de duas células ("RAM:" | "5 + (Mana × 2)") é uma fórmula: vira destaque.
          const [rotulo, valor] = b.linhas[0];
          return (
            <div key={k} className="rc-formula" style={{ margin: `${topo} 0 0`, display: "flex", alignItems: "baseline", gap: "0.8em", flexWrap: "wrap", padding: "0.6em 0.9em", borderLeft: "2px solid var(--rv-vertente-cor, currentColor)", background: "color-mix(in srgb, currentColor 6%, transparent)" }}>
              <span style={{ fontSize: "0.8em", fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--rv-vertente-cor, currentColor)" }}>{emLinha(rotulo.replace(/\*\*/g, ""), termos, `${k}r`)}</span>
              <span style={{ fontSize: "1.15em", fontWeight: 700 }}>{emLinha(valor.replace(/\*\*/g, ""), termos, `${k}v`)}</span>
            </div>
          );
        }
        if (b.tipo === "tabela") {
          const [cab, ...corpo] = b.linhas;
          return (
            <div key={k} className="rc-regra-tabela"><table style={{ margin: `${topo} 0 0`, borderCollapse: "collapse", width: "100%", fontSize: "0.92em" }}>
              <thead><tr>{cab.map((c, j) => <th key={j} style={{ textAlign: "left", padding: "4px 8px 4px 0", borderBottom: "1px solid color-mix(in srgb, currentColor 25%, transparent)" }}>{emLinha(c.replace(/\*\*/g, ""), termos, `${k}h${j}`)}</th>)}</tr></thead>
              <tbody>{corpo.map((l, r) => <tr key={r}>{l.map((c, j) => <td key={j} style={{ padding: "4px 8px 4px 0", borderBottom: "1px solid color-mix(in srgb, currentColor 10%, transparent)" }}>{emLinha(c, termos, `${k}r${r}c${j}`)}</td>)}</tr>)}</tbody>
            </table></div>
          );
        }
        // Lista só de "Chave: valor" (Tamanho, PV, regiões, modulações…) vira uma ficha de duas colunas.
        const pares = !b.ordenada && b.itens.length > 1 && b.itens.every(it => !it.nivel) ? b.itens.map(it => CHAVE_VALOR.exec(it.texto.replace(/^\*\*([^*]+?):?\*\*:?/, "$1:"))) : [];
        if (pares.length && pares.every(Boolean)) return (
          <dl key={k} className="rc-ficha" style={{ margin: `${topo} 0 0` }}>
            {pares.map((par, j) => <div key={j}><dt>{emLinha(par![1], termos, `${k}c${j}`)}</dt><dd>{emLinha(par![2], termos, `${k}v${j}`)}</dd></div>)}
          </dl>
        );
        const Lista = b.ordenada ? "ol" : "ul";
        return (
          <Lista key={k} className="rc-lista-texto" data-marca={b.ordenada ? undefined : "losango"} style={{ margin: `${topo} 0 0`, paddingLeft: "1.2em", listStyle: b.ordenada ? "decimal" : "none" }}>
            {b.itens.map((it, j) => <li key={j} style={{ marginTop: j ? "0.35em" : 0, marginLeft: `${it.nivel * 1.2}em` }}>{emLinha(it.texto.replace(/^([^:*\n]{2,65}):(?=\s)/, "**$1:**"), termos, `${k}i${j}`)}</li>)}
          </Lista>
        );
      });
    },
    [texto, termos],
  );

  return <div className={["rc-prosa", className].filter(Boolean).join(" ")}>{conteudo}</div>;
}
