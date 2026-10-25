import type { ReactNode } from "react";

/** Chip de subclasse: rótulo, estado e dica, no mesmo desenho dos chips da classe. */
export type ChipSub = { chave: string; icone: string; rotulo: string; valor: string; usado: boolean; dica: string; clicar: () => void; tom?: string };

/** O que cada subclasse do Técnico acrescenta à tela das Unidades. */
export type ModSub = {
  /** Chips no topo, logo abaixo do cabeçalho. */
  chips?: ChipSub[];
  /** Chips ao lado de Protocolo e Registro, na Unidade selecionada. */
  chipsUnidade?: ChipSub[];
  /** Ações extras na linha da Unidade (instalada ou guardada). */
  acoesInstalada?: ReactNode;
  acoesGuardada?: ReactNode;
  /** Troca o texto da forma da Unidade (ex.: na Trama) e o que o toque abre. */
  forma?: { texto: string; clicar: () => void } | null;
  /** Anel pontilhado ciano em volta do hexágono (Unidade na Trama). */
  anel?: boolean;
  /** Botão à esquerda do rodapé. */
  rodape?: ReactNode;
  /** Folhas próprias da subclasse. */
  painel?: ReactNode;
};
