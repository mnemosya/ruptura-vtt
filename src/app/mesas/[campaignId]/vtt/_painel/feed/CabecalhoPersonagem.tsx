"use client";

/**
 * Avatar do autor (personagem) de um card do feed.
 *
 * Board "Chat Log": um avatar REDONDO que vive FORA do card, à esquerda
 * (o `CartaoBase` o posiciona na linha). Segue o lado do personagem na
 * cor (ciano PJ, vermelho PN) e, sem retrato (ou sem permissão de vê-lo),
 * mostra a sigla — a mesma leitura da aba Personagens.
 */

import { siglaDoNome } from "../personagensModelo";
import type { AutoriaCartao } from "./contratos";
import { useRetratoFeed } from "./retratos";

/** O avatar só existe quando a autoria é de um personagem. */
export function temCabecalhoPersonagem(autoria: AutoriaCartao): boolean {
  return autoria.tipo === "personagem";
}

export function CabecalhoPersonagem({ autoria }: { autoria: AutoriaCartao }) {
  const retrato = useRetratoFeed(autoria.characterId);
  const corLado = retrato?.tipo === "pn" ? "var(--rv-dg)" : "var(--rv-cy)";
  return (
    <span
      className="pn-av"
      style={{ "--fg-a": corLado } as React.CSSProperties}
      data-testid="painel-feed-personagem"
      aria-hidden="true"
    >
      {retrato?.avatarUrl
        ? <img className="pn-av-img" src={retrato.avatarUrl} alt="" draggable={false} />
        : (siglaDoNome(autoria.nome) || "?")}
    </span>
  );
}

/** Atalho dos cards: o avatar quando o autor é personagem; `undefined` (sem
    token, card em largura cheia) quando não. A hora vai na linha de meta do
    card, então não é mais usada aqui. */
export function cabecalhoDe(autoria: AutoriaCartao, _hora?: string, _horaISO?: string) {
  return temCabecalhoPersonagem(autoria)
    ? <CabecalhoPersonagem autoria={autoria} />
    : undefined;
}
