"use client";

/**
 * QUEM ESTÁ ONDE — a coluna da direita da gaveta.
 *
 * Existe por um motivo que a lista dentro do cartão nunca deu conta:
 * "quem joga aqui" respondia a pergunta uma cena por vez, com
 * caixinhas, e só depois de abrir um menu. A pergunta real do narrador
 * é a inversa e é sobre a mesa inteira — *onde está cada um?* — e ela
 * só tem resposta boa se todo mundo estiver visível ao mesmo tempo.
 *
 * Daí o gesto ser ARRASTAR. Mandar alguém para uma cena vira o que a
 * frase já dizia: pegar a pessoa e largar no mapa. O caminho de
 * teclado continua existindo no menu do ladrilho — arrasto não é
 * alcançável sem mouse, e essa é a razão de ele nunca ser o único.
 */

import { Undo2, UsersRound } from "lucide-react";
import type { PosicaoJogador } from "../../../../../lib/vtt/sceneStorage";

/** MIME próprio: o ladrilho precisa saber se o que caiu é jogador ou cena. */
export const MIME_JOGADOR = "ruptura/vtt-jogador";

export interface PropsTrilhoJogadores {
  jogadores: PosicaoJogador[];
  /** Nome da cena onde cada um está, para a linha de baixo do item. */
  nomeDaCena: (sceneId: string | null) => string | null;
  /** Quantos estão fora da cena da mesa — some quando ninguém está. */
  separados: number;
  onReagrupar: () => void;
  arrastandoId: string | null;
  onArrastarInicio: (userId: string) => void;
  onArrastarFim: () => void;
}

export function TrilhoJogadores(p: PropsTrilhoJogadores) {
  return (
    <aside className="rv-gav-jogadores" aria-label="Jogadores da campanha">
      <p className="rv-gav-rotulo">Jogadores</p>

      {p.jogadores.length === 0 ? (
        /* Campanha sem jogadores não é erro nem estado vazio de lista:
           é a coluna dizendo por que ela está quieta. */
        <p className="rv-gav-vazio-lateral">
          Ninguém na campanha ainda. Convide jogadores para poder mandá-los a uma cena.
        </p>
      ) : (
        <ul className="rv-gav-jogadores-lista">
          {p.jogadores.map((j) => (
            <li
              key={j.userId}
              className="rv-gav-jogador"
              data-arrastando={p.arrastandoId === j.userId || undefined}
              data-atribuido={j.atribuido || undefined}
              data-testid="gaveta-jogador"
              data-user-id={j.userId}
              draggable
              onDragStart={(e) => {
                p.onArrastarInicio(j.userId);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData(MIME_JOGADOR, j.userId);
                // Firefox não inicia arrasto sem um payload de texto.
                e.dataTransfer.setData("text/plain", j.userId);
              }}
              onDragEnd={p.onArrastarFim}
            >
              <span className="rv-gav-jogador-sigla" aria-hidden="true">
                {(j.nome.trim()[0] ?? "?").toUpperCase()}
              </span>
              <span className="rv-gav-jogador-txt">
                <span className="rv-gav-jogador-nome">{j.nome}</span>
                <span className="rv-gav-jogador-onde">
                  {p.nomeDaCena(j.sceneId) ?? "sem cena"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* REAGRUPAR só existe quando há grupo dividido: um botão
          permanente de "juntar a mesa" numa mesa que nunca se separou é
          um controle que nunca faz nada. */}
      {p.separados > 0 && (
        <button
          type="button" className="rv-btn" data-tipo="reagrupar"
          data-testid="cenas-reagrupar"
          onClick={p.onReagrupar}
        >
          <UsersRound size={14} aria-hidden="true" /> Reagrupar ({p.separados})
          <span className="rv-dica rv-dica--acima">Todos voltam para a cena da mesa</span>
        </button>
      )}
      {p.separados === 0 && p.jogadores.length > 0 && (
        <p className="rv-gav-nota-lateral">
          <Undo2 size={11} aria-hidden="true" /> Arraste alguém até um mapa para separá-lo da mesa
        </p>
      )}
    </aside>
  );
}
