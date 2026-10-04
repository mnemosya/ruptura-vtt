"use client";

/**
 * Desenha os blocos de um capítulo no idioma visual do Códex da Forja.
 * Negrito vira destaque âmbar, código inline vira etiqueta de termo (com
 * link quando o termo é um verbete do livro), verbetes abrem e fecham.
 */

import { Fragment, type ReactNode } from "react";
import type { BlocoCompendio, TrechoCompendio } from "../../../../../lib/compendio/tipos";
import { resolverTermo, type DestinoLivro } from "./modelo";

export interface ContextoLeitura {
  termos: Map<string, DestinoLivro>;
  /** Títulos dos capítulos por ID, para links de página. */
  titulos: Map<string, string>;
  /** Número, título e página-mãe de cada página, para o botão de link de página. */
  paginas: Map<string, { numero: number | null; titulo: string; pai: string | null }>;
  ir: (destino: DestinoLivro) => void;
  /** Verbetes abertos (por âncora). */
  abertos: Set<string>;
  alternar: (ancora: string) => void;
  /** Abre a imagem em tela cheia. */
  expandir?: (url: string, legenda: string) => void;
  /** Envia um verbete ao chat da mesa. */
  enviar?: (ancora: string) => void;
}

export function Texto({ trechos, ctx }: { trechos: TrechoCompendio[]; ctx: ContextoLeitura }) {
  return (
    <>
      {trechos.map((t, i) => {
        let no: ReactNode = t.texto;
        if (t.termo) {
          const destino = resolverTermo(t.texto, ctx.termos);
          no = destino ? (
            <button type="button" className="fj-livro-termo fj-livro-termo--link" onClick={() => ctx.ir(destino)} title="Abrir verbete">
              {t.texto}
            </button>
          ) : (
            <span className="fj-livro-termo">{t.texto}</span>
          );
        } else if (t.negrito) {
          no = <strong className="fj-destaque">{t.texto}</strong>;
        }
        if (t.italico && !t.termo) no = <em>{no}</em>;
        if (t.paginaNotionId) {
          const id = t.paginaNotionId;
          no = (
            <button type="button" className="fj-livro-link" onClick={() => ctx.ir({ pageId: id })}>
              {ctx.titulos.get(id) ?? t.texto}
            </button>
          );
        } else if (t.url) {
          no = (
            <a className="fj-livro-link" href={t.url} target="_blank" rel="noreferrer noopener">
              {no}
            </a>
          );
        }
        return <Fragment key={i}>{no}</Fragment>;
      })}
    </>
  );
}

/** Link para outra página do livro, no visual do botão de Códex da Forja (opção B, 04/10/2026). */
function BotaoPagina({ pageId, tituloReserva, ctx }: { pageId: string; tituloReserva?: string; ctx: ContextoLeitura }) {
  const pagina = ctx.paginas.get(pageId);
  const titulo = pagina?.titulo ?? tituloReserva ?? "Página";
  const selo = pagina?.numero != null ? String(pagina.numero).padStart(2, "0") : titulo.replace(/[^A-Za-zÀ-ÿ ]/g, "").split(/\s+/).filter((p) => p.length > 2).slice(0, 2).map((p) => p[0]).join("");
  // Capítulo: "Capítulo 8". Subpágina: só o nome da página-mãe ("Mercado Noturno").
  const kicker = pagina?.numero != null ? `Capítulo ${pagina.numero}` : pagina?.pai ?? "Página";
  return (
    <button type="button" className="fj-livro-pagina-botao" onClick={() => ctx.ir({ pageId })} data-testid="compendio-link-pagina">
      <span className="fj-borda fj-ch fj-livro-pagina-botao__borda">
        <span className="fj-ch fj-livro-pagina-botao__corpo">
          <span className="fj-codex-botao__varredura" />
          <span className="fj-ch-hex fj-livro-pagina-botao__selo">{selo}</span>
          <span className="fj-livro-pagina-botao__texto">
            <span className="fj-mono fj-mono--pequeno fj-mono--am">{kicker}</span>
            <span className="fj-livro-pagina-botao__titulo">{titulo}</span>
          </span>
          <span className="fj-codex-botao__setas" aria-hidden="true"><span>›</span><span>›</span></span>
        </span>
      </span>
    </button>
  );
}

/** Botão "Expandir" sobre uma imagem: aparece só no hover (ou com foco do teclado). */
export function BotaoExpandir({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="fj-mapa__expandir fj-livro-expandir" aria-label="Expandir imagem" title="Expandir" data-testid="compendio-expandir-imagem">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
    </button>
  );
}

/**
 * Rótulo de um destaque: o texto inteiro, quando ele é só um título em negrito
 * (o conteúdo vem nos filhos); ou o negrito curto que abre o texto ("Gás arcano:").
 */
function rotuloDoDestaque(trechos: TrechoCompendio[]): { rotulo: string | null; texto: TrechoCompendio[] } {
  const plano = trechos.map((t) => t.texto).join("").trim();
  if (!plano) return { rotulo: null, texto: [] };
  if (trechos.every((t) => t.negrito || !t.texto.trim()) && plano.length <= 80) return { rotulo: plano.replace(/:$/, ""), texto: [] };
  const [primeiro, ...resto] = trechos;
  if (primeiro?.negrito && !primeiro.termo && primeiro.texto.trim().length <= 60) {
    const restante = [...resto];
    // O texto continuava a frase do negrito ("Gás arcano: para funcionar…"); sem o rótulo na frente, abre em maiúscula.
    if (restante[0]) {
      const t = restante[0].texto.replace(/^\s+/, "");
      restante[0] = { ...restante[0], texto: t.charAt(0).toLocaleUpperCase("pt-BR") + t.slice(1) };
    }
    return { rotulo: primeiro.texto.trim().replace(/:$/, ""), texto: restante };
  }
  return { rotulo: null, texto: trechos };
}

export function Blocos({ blocos, ctx }: { blocos: BlocoCompendio[]; ctx: ContextoLeitura }) {
  return (
    <>
      {blocos.map((b, i) => (
        <Bloco key={i} b={b} ctx={ctx} />
      ))}
    </>
  );
}

function Bloco({ b, ctx }: { b: BlocoCompendio; ctx: ContextoLeitura }) {
  switch (b.tipo) {
    case "titulo": {
      const Tag = (["h2", "h3", "h4", "h5"] as const)[b.nivel - 1];
      return (
        <Tag id={b.ancora} data-sec className={`fj-livro-titulo fj-livro-titulo--${b.nivel}`}>
          <Texto trechos={b.texto} ctx={ctx} />
        </Tag>
      );
    }
    case "paragrafo":
      return (
        <p className="fj-livro-par">
          <Texto trechos={b.texto} ctx={ctx} />
        </p>
      );
    case "lista": {
      const Tag = b.ordenada ? "ol" : "ul";
      return (
        <Tag className={`fj-livro-lista ${b.ordenada ? "fj-livro-lista--num" : ""}`}>
          {b.itens.map((item, i) => (
            <li key={i} className="fj-livro-lista__item">
              {!b.ordenada && <span className="fj-regra__marca" aria-hidden="true" />}
              <Texto trechos={item.texto} ctx={ctx} />
              {item.filhos.length > 0 && (
                <div className="fj-livro-lista__filhos">
                  <Blocos blocos={item.filhos} ctx={ctx} />
                </div>
              )}
            </li>
          ))}
        </Tag>
      );
    }
    case "citacao":
      return (
        <blockquote className="fj-livro-citacao">
          <Texto trechos={b.texto} ctx={ctx} />
          {b.filhos.length > 0 && <Blocos blocos={b.filhos} ctx={ctx} />}
        </blockquote>
      );
    case "destaque": {
      // Opção A (04/10/2026): rótulo técnico — losango âmbar, nome espaçado e um fio —
      // em vez da caixa. O rótulo é o título do destaque, ou o negrito que abre o texto.
      const { rotulo, texto } = rotuloDoDestaque(b.texto);
      const filhos = b.filhos[0]?.tipo === "divisor" ? b.filhos.slice(1) : b.filhos;
      // Destaque que só embrulha links de página: o botão já é o destaque.
      if (!rotulo && texto.length === 0 && filhos.length > 0 && filhos.every((f) => f.tipo === "link_pagina")) {
        return <div className="fj-livro-paginas"><Blocos blocos={filhos} ctx={ctx} /></div>;
      }
      return (
        <div className="fj-livro-nota">
          <div className="fj-livro-nota__rotulo">
            <span className="fj-livro-nota__losango" aria-hidden="true" />
            {rotulo && <span className="fj-livro-nota__nome">{rotulo}</span>}
            <span className="fj-livro-nota__fio" aria-hidden="true" />
          </div>
          <div className="fj-livro-nota__corpo">
            {texto.length > 0 && <p><Texto trechos={texto} ctx={ctx} /></p>}
            {filhos.length > 0 && <Blocos blocos={filhos} ctx={ctx} />}
          </div>
        </div>
      );
    }
    case "verbete": {
      const aberto = ctx.abertos.has(b.ancora);
      return (
        <section id={b.ancora} className={`fj-livro-verbete ${aberto ? "fj-livro-verbete--aberto" : ""}`}>
          <button type="button" className="fj-livro-verbete__titulo" aria-expanded={aberto} onClick={() => ctx.alternar(b.ancora)}>
            <span className="fj-livro-verbete__seta" aria-hidden="true">›</span>
            <span><Texto trechos={b.titulo} ctx={{ ...ctx, termos: new Map() }} /></span>
          </button>
          {aberto && ctx.enviar && (
            <button type="button" className="fj-livro-enviar" onClick={() => ctx.enviar!(b.ancora)} data-testid="compendio-enviar-verbete">
              Enviar ao chat
            </button>
          )}
          {aberto && (
            <div className="fj-livro-verbete__corpo">
              <Blocos blocos={b.filhos} ctx={ctx} />
            </div>
          )}
        </section>
      );
    }
    case "tabela":
      return (
        <div className="fj-livro-tabela-rolagem">
          <table className="fj-livro-tabela">
            <tbody>
              {b.linhas.map((linha, i) => (
                <tr key={i}>
                  {linha.map((celula, j) => {
                    const cabecalho = (b.cabecalhoLinha && i === 0) || (b.cabecalhoColuna && j === 0);
                    const Tag = cabecalho ? "th" : "td";
                    return (
                      <Tag key={j}>
                        <Texto trechos={celula} ctx={ctx} />
                      </Tag>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "imagem":
      return (
        <figure className="fj-livro-figura">
          <div className="fj-livro-figura__moldura">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.url} alt={b.legenda.map((t) => t.texto).join("")} loading="lazy" width={b.largura} height={b.altura} />
            {ctx.expandir && <BotaoExpandir onClick={() => ctx.expandir!(b.url, b.legenda.map((t) => t.texto).join(""))} />}
          </div>
          {b.legenda.length > 0 && (
            <figcaption className="fj-mono fj-mono--pequeno">
              <Texto trechos={b.legenda} ctx={ctx} />
            </figcaption>
          )}
        </figure>
      );
    case "link_pagina":
      return <BotaoPagina pageId={b.paginaNotionId} tituloReserva={b.titulo} ctx={ctx} />;
    case "divisor":
      return <hr className="fj-livro-divisor" />;
    case "nao_suportado":
      return <p className="fj-livro-aviso fj-mono fj-mono--pequeno">Conteúdo do Notion ainda não suportado ({b.tipoNotion}).</p>;
  }
}
