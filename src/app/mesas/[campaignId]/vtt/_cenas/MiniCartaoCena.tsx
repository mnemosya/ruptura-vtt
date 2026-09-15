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
import { useDicaFlutuante } from "../_shell/DicaFlutuante";

export interface PropsMiniCartaoCena {
  nome: string;
  /** URL assinada da miniatura; `null` cai na inicial do nome, como no cartão grande. */
  miniaturaUrl: string | null;
  /** Esta é a cena que o narrador está olhando. */
  vista: boolean;
  /**
   * A MESA está aqui — é a cena apresentada no palco. Vem da cena, não
   * da contagem de jogadores: é o mesmo dado que o cartão grande usa
   * pro selo "Jogadores aqui", e é o que responde "pra onde a mesa está
   * olhando" mesmo quando ninguém foi individualmente atribuído.
   */
  apresentada: boolean;
  /** Jogadores MANDADOS especificamente pra esta cena (ver `PosicaoJogador`). */
  jogadoresAqui: PosicaoJogador[];
  /** Quantos jogadores a campanha tem — é o que distingue "todos" de "alguns". */
  totalJogadores: number;
  ocupada: boolean;
  onAbrir: () => void;
  /**
   * O ARRASTO. A miniatura era o único lugar onde uma cena aparecia sem
   * poder ser pega: dentro de uma pasta expandida no trilho, tirá-la
   * dali exigia abrir a pasta pra achar o cartão grande. O gesto é o
   * mesmo do cartão grande, e os alvos também (outra pasta, "Todas", a
   * área da pasta aberta).
   */
  arrastavel?: boolean;
  arrastando?: boolean;
  onArrastarInicio?: (e: React.DragEvent) => void;
  onArrastarFim?: () => void;
}

/**
 * Presença dos jogadores em TRÊS estados, não dois: ninguém, ALGUNS e
 * todos. A diferença importa na hora de decidir — mandar a mesa pra uma
 * cena onde metade do grupo já está não é a mesma decisão que mandar pra
 * uma cena vazia, e um selo só de "tem gente" esconderia justamente
 * isso.
 */
function presenca(apresentada: boolean, aqui: number, total: number): "nenhum" | "alguns" | "todos" {
  // A cena APRESENTADA é onde a mesa está, por definição — é o palco.
  // Contar jogadores só distingue o caso em que alguns foram mandados
  // pra OUTRA cena (0118, "dividir o grupo").
  if (apresentada) return total > 0 && aqui > 0 && aqui < total ? "alguns" : "todos";
  if (aqui <= 0) return "nenhum";
  return total > 0 && aqui >= total ? "todos" : "alguns";
}

export function MiniCartaoCena(p: PropsMiniCartaoCena) {
  const quantos = p.jogadoresAqui.length;
  const estado = presenca(p.apresentada, quantos, p.totalJogadores);
  const textoMesa = estado === "todos"
    ? "A mesa está aqui"
    : `${quantos} de ${p.totalJogadores} jogadores aqui`;
  // A dica sai na COR do selo que ela explica — ver `useDicaFlutuante`.
  const dicaVoce = useDicaFlutuante("Você está aqui", { acento: "var(--rv-am)" });
  const dicaMesa = useDicaFlutuante(textoMesa, {
    acento: estado === "todos" ? "var(--rv-ok)" : "var(--rv-cy)",
  });

  return (
    <li
      className="rv-minicena"
      data-vista={p.vista || undefined}
      data-arrastando={p.arrastando || undefined}
      draggable={p.arrastavel || undefined}
      onDragStart={p.onArrastarInicio}
      onDragEnd={p.onArrastarFim}
    >
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
          {p.vista && (
            <span className="rv-minicena-selo" data-tipo="vista" aria-label="Você está aqui" {...dicaVoce.alvo}>
              {dicaVoce.dica}
            </span>
          )}
          {estado !== "nenhum" && (
            <span
              className="rv-minicena-selo" data-tipo={estado === "todos" ? "mesa" : "parcial"}
              aria-label={textoMesa} {...dicaMesa.alvo}
            >
              {dicaMesa.dica}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
