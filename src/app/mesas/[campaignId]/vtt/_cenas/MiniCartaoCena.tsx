"use client";

/**
 * O CARTÃO DE CENA em miniatura — o item da lista que abre debaixo de
 * uma pasta (ou de "Todas") quando o chevron é acionado.
 *
 * É o mesmo componente conceitual do `CartaoCena`, reduzido ao que cabe
 * numa coluna estreita: a miniatura do mapa, o nome, e o clique que
 * ABRE a cena. Tudo o mais que o cartão grande oferece — renomear,
 * configurar, duplicar, arquivar, excluir, arrastar pra outra pasta —
 * continua morando na grade, e de propósito: seis alvos de clique
 * dentro de um cartão de 30px de altura seriam seis chances de errar o
 * que se queria.
 *
 * O que NÃO se reduziu foi o ESTADO, porque é ele que faz a lista
 * servir pra decidir sem abrir nada: dois selos, cada um uma cor.
 */

import type { PosicaoJogador } from "../../../../../lib/vtt/sceneStorage";

export interface PropsMiniCartaoCena {
  nome: string;
  /** URL assinada da miniatura; `null` cai na inicial do nome, como no cartão grande. */
  miniaturaUrl: string | null;
  /** Esta é a cena que o narrador está olhando. */
  vista: boolean;
  /** Jogadores que estão NESTA cena. */
  jogadoresAqui: PosicaoJogador[];
  /** Quantos jogadores a campanha tem — é o que distingue "todos" de "alguns". */
  totalJogadores: number;
  ocupada: boolean;
  onAbrir: () => void;
}

/**
 * Presença dos jogadores em TRÊS estados, não dois: ninguém, ALGUNS e
 * todos. A diferença importa na hora de decidir — mandar a mesa pra uma
 * cena onde metade do grupo já está não é a mesma decisão que mandar pra
 * uma cena vazia, e um selo só de "tem gente" esconderia justamente
 * isso.
 */
function presenca(aqui: number, total: number): "nenhum" | "alguns" | "todos" {
  if (aqui <= 0) return "nenhum";
  return total > 0 && aqui >= total ? "todos" : "alguns";
}

export function MiniCartaoCena(p: PropsMiniCartaoCena) {
  const quantos = p.jogadoresAqui.length;
  const estado = presenca(quantos, p.totalJogadores);

  return (
    <li className="rv-minicena" data-vista={p.vista || undefined}>
      <button
        type="button" className="rv-minicena-btn"
        disabled={p.ocupada}
        onClick={p.onAbrir}
        data-testid="minicena-abrir"
        aria-label={p.vista ? `Você já está em "${p.nome}"` : `Abrir "${p.nome}"`}
      >
        <span className="rv-minicena-mapa" aria-hidden="true">
          {p.miniaturaUrl
            ? <img src={p.miniaturaUrl} alt="" />
            : <span className="rv-minicena-inicial">{(p.nome.trim()[0] ?? "?").toUpperCase()}</span>}
        </span>
        <span className="rv-minicena-nome">{p.nome}</span>
        <span className="rv-minicena-selos">
          {/* ÂMBAR é você; VERDE/CIANO é a mesa. Os dois podem aparecer
              juntos — são fatos independentes, e o dia em que você está
              numa cena e a mesa está em outra é exatamente quando isto
              precisa ser lido de relance. */}
          {p.vista && <span className="rv-minicena-selo" data-tipo="vista" title="Você está aqui" />}
          {estado !== "nenhum" && (
            <span
              className="rv-minicena-selo" data-tipo={estado === "todos" ? "mesa" : "parcial"}
              title={estado === "todos"
                ? `Todos os jogadores (${quantos}) estão aqui`
                : `${quantos} de ${p.totalJogadores} jogadores aqui`}
            />
          )}
        </span>
      </button>
    </li>
  );
}
