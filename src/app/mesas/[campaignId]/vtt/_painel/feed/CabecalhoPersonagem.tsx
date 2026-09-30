"use client";

/**
 * Cabeçalho de card do chat quando quem agiu é um PERSONAGEM: a mesma
 * peça da aba Personagens — coluna do rosto com fio à direita, nome em
 * caixa alta na cor do lado (ciano PJ, vermelho PN) — com a hora do
 * card no canto. Sem avatar (ou sem permissão de vê-lo), a coluna
 * mostra a sigla, como na aba.
 */

import { siglaDoNome } from "../personagensModelo";
import type { AutoriaCartao } from "./contratos";
import { useRetratoFeed } from "./retratos";
import { BotaoMenuCard } from "./MenuCard";

/** O cabeçalho só existe quando a autoria é de um personagem. */
export function temCabecalhoPersonagem(autoria: AutoriaCartao): boolean {
  return autoria.tipo === "personagem";
}

export function CabecalhoPersonagem({
  autoria,
  hora,
  horaISO,
}: {
  autoria: AutoriaCartao;
  hora: string;
  horaISO: string;
}) {
  const retrato = useRetratoFeed(autoria.characterId);
  const pn = retrato?.tipo === "pn";
  return (
    <div
      className="pn-cartao-pers"
      style={{ "--fg-a": pn ? "var(--rv-dg)" : "var(--rv-cy)" } as React.CSSProperties}
      data-testid="painel-feed-personagem"
    >
      <span className="pn-cartao-pers-face" aria-hidden="true">
        {retrato?.avatarUrl
          ? <img className="pn-cartao-pers-img" src={retrato.avatarUrl} alt="" draggable={false} />
          : (siglaDoNome(autoria.nome) || "?")}
      </span>
      <span className="pn-cartao-pers-nome">{autoria.nome}</span>
      <time className="pn-cartao-pers-hora" dateTime={horaISO}>{hora}</time>
      <BotaoMenuCard />
    </div>
  );
}

/** Atalho dos cards: o cabeçalho quando o autor é personagem, `undefined` (cabeçalho padrão) quando não. */
export function cabecalhoDe(autoria: AutoriaCartao, hora: string, horaISO: string) {
  return temCabecalhoPersonagem(autoria)
    ? <CabecalhoPersonagem autoria={autoria} hora={hora} horaISO={horaISO} />
    : undefined;
}
