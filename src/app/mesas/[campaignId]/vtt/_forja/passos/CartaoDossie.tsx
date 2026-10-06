"use client";

import type { ReactNode } from "react";
import { Mono } from "../ui";

/**
 * Cartão de dossiê do painel lateral (Região e Classe): a arte vira o topo,
 * com o nome em brilho e o selo de estado no canto; embaixo, a frase, os
 * dados em linhas (rótulo · valor) e o que mais o passo precisar. O botão
 * do Códex vem por `codex`, no fim do cartão, dentro dele.
 */
export function CartaoDossie({ arte, posicaoArte, kicker, nome, on, selo, frase, linhas, children, codex }: {
  arte: string;
  posicaoArte?: string;
  kicker: string;
  nome: string;
  /** Confirmado (âmbar) ou só visualizando (ciano). */
  on: boolean;
  selo: string;
  frase: string;
  linhas: Array<{ rotulo: string; valor: ReactNode; ambar?: boolean }>;
  children?: ReactNode;
  codex?: ReactNode;
}) {
  return (
    <div className="fj-dossie">
      <div className={`${on ? "fj-borda-ambar" : "fj-borda"} fj-ch`}>
        <div className="fj-ch fj-vidro fj-dossie__cartao">
          <div className="fj-dossie__retrato">
            {/* eslint-disable-next-line @next/next/no-img-element -- arte estática do acervo */}
            <img key={arte} src={arte} alt="" className="fj-boot" style={posicaoArte ? { objectPosition: posicaoArte } : undefined} />
            <div className="fj-dossie__veu" />
            <div className="fj-scan fj-cobre" />
            <span className={`fj-dossie__selo ${on ? "fj-dossie__selo--on" : ""}`}>{selo}</span>
            <div className="fj-dossie__nome">
              <Mono tom={on ? "am" : "cy"}>{kicker}</Mono>
              <div className="fj-dossie__titulo fj-glow">{nome}</div>
            </div>
          </div>
          <div className="fj-dossie__corpo">
            <p className="fj-dossie__frase">{frase}</p>
            <dl className="fj-dossie__linhas">
              {linhas.map((l) => (
                <div key={l.rotulo} className="fj-dossie__linha">
                  <dt><Mono pequeno>{l.rotulo}</Mono></dt>
                  <dd className={l.ambar ? "fj-dossie__valor fj-dossie__valor--am" : "fj-dossie__valor"}>{l.valor}</dd>
                </div>
              ))}
            </dl>
            {children}
            {codex}
          </div>
        </div>
      </div>
    </div>
  );
}
