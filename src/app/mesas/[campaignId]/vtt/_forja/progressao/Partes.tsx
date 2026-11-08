"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { arteSubclasse } from "../acervo/subclasses";
import type { TipoPasso } from "./fluxo";

/** Arte da subclasse; sem arquivo, cai na arte da classe. */
export function ArteSubclasse({ slug, classeSlug, posicao, className = "pg-arte", alt = "" }: { slug: string; classeSlug: string; posicao: string; className?: string; alt?: string }) {
  const [falhou, setFalhou] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // Uma falha antes da hidratação não chega ao onError: confere na montagem.
  useEffect(() => {
    setFalhou(false);
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setFalhou(true);
  }, [slug]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} src={falhou ? `/forja/classes/${classeSlug}.webp` : arteSubclasse(slug)} alt={alt} className={className} style={{ objectPosition: posicao }} onError={() => setFalhou(true)} />;
}

export interface ItemStepper {
  tipo: TipoPasso;
  rotulo: string;
  estado: "feito" | "atual" | "pendente";
  onIr: () => void;
}

/** O stepper das sub-etapas do Ranking: ✓ feito, número (ou ★ no "Você ganha") no atual e nos pendentes. */
export function Stepper({ itens }: { itens: ItemStepper[] }) {
  return (
    <div className="pg-stps">
      {itens.map((it, i) => (
        <Fragment key={it.tipo}>
          {i > 0 && <span className="pg-stp-fio" />}
          <button type="button" onClick={it.onIr} aria-current={it.estado === "atual" ? "step" : undefined}
            className={`pg-stp ${it.estado === "feito" ? "pg-stp--feito" : it.estado === "atual" ? "pg-stp--atual" : ""}`}>
            <b>
              {it.estado === "feito"
                ? <Check size={9} strokeWidth={3.5} aria-hidden="true" />
                : <span className="pg-stp__n">{it.tipo === "ganhos" && it.estado === "atual" ? "★" : i + 1}</span>}
            </b>
            {it.rotulo}
          </button>
        </Fragment>
      ))}
    </div>
  );
}

/** Cabeçalho do console: rótulo mono ("Rank E · Vertente") + stepper à esquerda, `direita` à direita. */
export function Cabecalho({ ranking, titulo, stepper, direita }: { ranking: string; titulo: string; stepper?: ReactNode; direita?: ReactNode }) {
  return (
    <header className="pg-cab">
      <div className="pg-cab__esq">
        <span className="pg-mono">{ranking} · <span className="pg-mono--gelo">{titulo}</span></span>
        {stepper}
      </div>
      <div className="pg-cab__dir">{direita}</div>
    </header>
  );
}

export const HexRanking = ({ r }: { r: string }) => <span className="pg-hex-rank">{r}</span>;
export const Tecla = ({ k }: { k: string }) => <span className="pg-tecla" aria-hidden="true">{k}</span>;

export interface Acao { rotulo: string; onClick: () => void; desabilitado?: boolean }

/**
 * Rodapé do console, com as teclas da doca da Forja: [Q] volta; avançar em
 * ciano com [E]; o fecho de um Ranking (Concluir / Selar) em âmbar, como o
 * "Selar" da Forja.
 */
export function Rodape({ voltar, avancar, fecho, nota, erro }: { voltar?: Acao; avancar?: Acao; fecho?: boolean; nota?: ReactNode; erro?: string | null }) {
  return (
    <footer className="pg-rod">
      {voltar ? <button type="button" onClick={voltar.onClick} className="pg-voltar"><Tecla k="Q" />{voltar.rotulo}</button> : <span />}
      <div className="pg-rod__dir">
        {erro ? <span className="pg-erro" role="alert">{erro}</span> : nota ? <span className="pg-nota">{nota}</span> : null}
        {avancar && (
          <button type="button" onClick={avancar.onClick} disabled={avancar.desabilitado} className="pg-avancar">
            {fecho ? <span className="pg-selar">{avancar.rotulo}</span> : <span className="pg-proximo">{avancar.rotulo}&nbsp;›</span>}
            <Tecla k="E" />
          </button>
        )}
      </div>
    </footer>
  );
}
