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
  ir: (destino: DestinoLivro) => void;
  /** Verbetes abertos (por âncora). */
  abertos: Set<string>;
  alternar: (ancora: string) => void;
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
    case "destaque":
      return (
        <div className="fj-codex__nota fj-livro-destaque">
          {b.icone && <span className="fj-livro-destaque__icone" aria-hidden="true">{b.icone}</span>}
          <div>
            <p><Texto trechos={b.texto} ctx={ctx} /></p>
            {b.filhos.length > 0 && <Blocos blocos={b.filhos} ctx={ctx} />}
          </div>
        </div>
      );
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={b.url} alt={b.legenda.map((t) => t.texto).join("")} loading="lazy" />
          {b.legenda.length > 0 && (
            <figcaption className="fj-mono fj-mono--pequeno">
              <Texto trechos={b.legenda} ctx={ctx} />
            </figcaption>
          )}
        </figure>
      );
    case "link_pagina":
      return (
        <p className="fj-livro-par">
          <button type="button" className="fj-livro-link fj-livro-link--bloco" onClick={() => ctx.ir({ pageId: b.paginaNotionId })}>
            › {ctx.titulos.get(b.paginaNotionId) ?? b.titulo ?? "Abrir página"}
          </button>
        </p>
      );
    case "galeria":
      return (
        <div className="fj-livro-galeria" data-testid="compendio-galeria">
          {b.itens.map((card) => (
            <button type="button" key={card.pageId} className="fj-livro-card" onClick={() => ctx.ir({ pageId: card.pageId })} data-testid="compendio-card">
              <span className="fj-livro-card__arte">
                {card.imagem ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.imagem} alt="" loading="lazy" />
                ) : (
                  <span className="fj-livro-card__sem-arte" aria-hidden="true">{card.titulo.slice(0, 2)}</span>
                )}
              </span>
              <span className="fj-livro-card__texto">
                <span className="fj-livro-card__titulo">
                  {card.icone && (/^https?:/.test(card.icone) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.icone} alt="" className="fj-livro-card__icone" />
                  ) : (
                    <span className="fj-livro-card__icone" aria-hidden="true">{card.icone}</span>
                  ))}
                  {card.titulo}
                </span>
                {card.descricao && <span className="fj-livro-card__descricao">{card.descricao}</span>}
                {card.etiquetas.length > 0 && (
                  <span className="fj-livro-card__etiquetas">
                    {card.etiquetas.map((e) => <span key={e} className="fj-livro-termo">{e}</span>)}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      );
    case "divisor":
      return <hr className="fj-livro-divisor" />;
    case "nao_suportado":
      return <p className="fj-livro-aviso fj-mono fj-mono--pequeno">Conteúdo do Notion ainda não suportado ({b.tipoNotion}).</p>;
  }
}
