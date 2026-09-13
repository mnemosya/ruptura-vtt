"use client";

/**
 * A CASCA da gaveta de cenas — cabeçalho, as três colunas e a folha.
 *
 * Existe separada do `GerenciadorCenas` por um motivo só: a galeria de
 * estilos precisa montar esta superfície com dados fabricados, e o
 * gerenciador é quem chama Server Action. Sem a separação, ou a galeria
 * duplicaria a marcação da gaveta — que é como uma galeria começa a
 * mentir — ou a gaveta ficaria de fora dela.
 *
 * É PURA: recebe pedaços prontos e devolve o arranjo. Não sabe de cena,
 * de pasta nem de jogador; sabe que existem três colunas e onde cada
 * uma fica.
 */

import type { ReactNode } from "react";
import { Clapperboard, Search, X } from "lucide-react";

export interface PropsGavetaCasca {
  /** A linha de modo do cabeçalho: "3 cenas", "Salvando a ordem…". */
  modo: string;
  busca: string;
  onBusca: (valor: string) => void;
  /** Os botões do cabeçalho, à direita. */
  acoes: ReactNode;
  /** Formulários inline que abrem abaixo do cabeçalho. */
  linhaNova?: ReactNode;
  /** Coluna da esquerda. `null` some — é o que a busca faz. */
  trilho?: ReactNode;
  conteudo: ReactNode;
  /** Coluna da direita. */
  jogadores: ReactNode;
  /** A folha que desliza sobre a direita (parâmetros, novo mapa). */
  folha?: ReactNode;
  onFechar: () => void;
  /**
   * Na galeria a gaveta vive DENTRO de um bloco da página, não colada
   * no topo da tela — senão ela cobriria a galeria inteira.
   */
  emLinha?: boolean;
}

export function GavetaCasca(p: PropsGavetaCasca) {
  return (
    <div
      className="rv-gaveta"
      data-em-linha={p.emLinha || undefined}
      role="dialog" aria-modal="false"
      aria-label="Catálogo de cenas da campanha" data-testid="janela-cenas"
    >
      <header className="rv-gav-cab">
        <span className="rv-gav-ico" aria-hidden="true"><Clapperboard size={17} /></span>
        <span className="rv-gav-titulo-bloco">
          <h2 className="rv-gav-titulo">Cenas</h2>
          <p className="rv-gav-modo">{p.modo}</p>
        </span>

        {/* A busca fica no CABEÇALHO e com largura fixa: numa gaveta
            larga um campo que estica até onde couber vira uma faixa de
            700px, e busca não fica melhor por ser maior. */}
        <span className="rv-cena-busca-casca">
          <Search size={14} aria-hidden="true" />
          <input
            className="rv-cena-campo rv-cena-busca"
            type="search"
            value={p.busca}
            placeholder="Procurar cena por nome ou local…"
            aria-label="Procurar cena pelo nome ou local"
            data-testid="cenas-busca"
            onChange={(e) => p.onBusca(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); p.onBusca(""); } }}
          />
        </span>

        <span className="rv-gav-espaco" />
        {p.acoes}

        <button
          type="button" className="rv-gav-fechar" onClick={p.onFechar}
          aria-label="Fechar o catálogo de cenas"
        >
          <X size={16} aria-hidden="true" />
          <span className="rv-dica rv-dica--abaixo">Fechar</span>
        </button>
      </header>

      {p.linhaNova && <div className="rv-gav-linha-nova">{p.linhaNova}</div>}

      <div className="rv-gav-corpo">
        {p.trilho}
        <div className="rv-gav-conteudo">{p.conteudo}</div>
        {p.jogadores}
      </div>

      {p.folha}
    </div>
  );
}
