"use client";

/**
 * Um termo de regra com a dica dele — a peça que TextoComRegras (termos
 * no meio de uma frase) e a lista de propriedades de um item (termos
 * soltos, em linha própria) compartilham.
 *
 * Existe separado porque as duas precisam do MESMO comportamento —
 * abrir no hover e no foco, respirar antes de fechar, posicionar em
 * `fixed` — e só diferem no que está escrito dentro. Duplicar isso
 * daria dois tooltips que divergem no primeiro ajuste.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { listarCapitulosAction } from "../../mesas/[campaignId]/vtt/_compendio/acoes";
import { indiceDeTermos, resolverTermo, type DestinoLivro } from "../../mesas/[campaignId]/vtt/_compendio/modelo";
import type { TermoDeRegra } from "./types";

const LivroCodex = dynamic(() => import("../../mesas/[campaignId]/vtt/_compendio/LivroCodex").then((m) => m.LivroCodex), { ssr: false });

let indiceDoCodex: Promise<Map<string, DestinoLivro>> | null = null;

function carregarIndiceDoCodex() {
  if (!indiceDoCodex) {
    indiceDoCodex = listarCapitulosAction(null).then((r) => {
      if (!r.ok || !r.dados) throw new Error(r.erro ?? "Não foi possível carregar o Códex.");
      return indiceDeTermos(r.dados);
    }).catch((erro) => {
      indiceDoCodex = null;
      throw erro;
    });
  }
  return indiceDoCodex;
}

export function TermoComDica({
  termo,
  className = "rc-termo",
  children,
}: {
  termo: TermoDeRegra;
  className?: string;
  children: ReactNode;
}) {
  const [em, setEm] = useState<{
    x: number;
    y: number;
    vertenteCor: string;
  } | null>(null);
  const timerRef = useRef<number | null>(null);
  const [destino, setDestino] = useState<DestinoLivro | null>(null);
  const [buscaCodex, setBuscaCodex] = useState("");
  const [codexAberto, setCodexAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!codexAberto) return;
    document.body.classList.add("rc-livro-por-cima");
    return () => document.body.classList.remove("rc-livro-por-cima");
  }, [codexAberto]);

  const abrirNoCodex = async () => {
    setEm(null);
    setErro(null);
    try {
      const indice = await carregarIndiceDoCodex();
      const encontrado = resolverTermo(termo.nome, indice);
      setDestino(encontrado);
      // Nem todo termo publicado é um verbete individual. Nesses casos,
      // abre a busca do livro já preenchida, incluindo o texto dos capítulos.
      setBuscaCodex(encontrado ? "" : termo.nome);
      setCodexAberto(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir o Códex.");
    }
  };

  const abrir = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const estilo = window.getComputedStyle(el);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setEm({
      x: r.left + r.width / 2,
      y: r.top,
      /* Esta variável nasce no item selecionado. Ao portar a dica para
         o body, ela precisa viajar junto para preservar a vertente. */
      vertenteCor: estilo.getPropertyValue("--rv-vertente-cor").trim(),
    });
  };

  return (
    <>
      <span
        className={className}
        data-tipo={termo.tipo}
        tabIndex={0}
        role="button"
        aria-label={`Abrir ${termo.nome} no Códex`}
        onClick={(e) => { e.stopPropagation(); void abrirNoCodex(); }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          e.stopPropagation();
          void abrirNoCodex();
        }}
        onMouseEnter={(e) => abrir(e.currentTarget)}
        onMouseLeave={() => {
          /* Um respiro antes de sumir: sem isso, atravessar o termo com
             o mouse pisca o tooltip a cada passagem. */
          timerRef.current = window.setTimeout(() => setEm(null), 80);
        }}
        onFocus={(e) => abrir(e.currentTarget)}
        onBlur={() => setEm(null)}
      >
        {children}
      </span>
      {erro && <span role="alert" className="rc-termo-erro">{erro}</span>}
      {em && typeof document !== "undefined" && createPortal(
        <span
          role="tooltip"
          className="rc-termo-dica rc-cursor-scope"
          data-tipo={termo.tipo}
          /* O portal tira a dica de dentro do overflow/clip-path da
             janela. As coordenadas continuam sendo as da viewport. */
          style={{
            left: `${em.x}px`,
            top: `${em.y}px`,
            "--rv-vertente-cor": em.vertenteCor,
          } as CSSProperties}
        >
          <span className="rc-termo-dica-cab">
            {termo.nome}
            <em>{termo.rotulo ?? ROTULO_DO_TIPO[termo.tipo]}</em>
          </span>
          {termo.descricao ? (
            <span className="rc-termo-dica-txt">{termo.descricao}</span>
          ) : (
            /* O termo existe publicado mas sem descrição. Dizer isso é
               melhor que um tooltip vazio ou que inventar texto. */
            <span className="rc-termo-dica-txt rc-termo-dica-txt--vazio">
              Sem descrição publicada para este termo.
            </span>
          )}
        </span>,
        document.body,
      )}
      {codexAberto && <LivroCodex campaignId={null} inicial={destino} buscaInicial={buscaCodex} onClose={() => setCodexAberto(false)} />}
    </>
  );
}

const ROTULO_DO_TIPO: Record<TermoDeRegra["tipo"], string> = {
  acao: "ação",
  condicao: "condição",
  propriedade: "propriedade",
};
