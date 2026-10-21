/**
 * Ruptura pela regra da RUPTURA 1.2 (cap. 18 "Sobrecarga e Ruptura").
 *
 * Alcançar o limite de Sobrecarga provoca uma Ruptura (o livro marca o
 * fim da cena; aqui o jogador resolve quando quiser, nada fica travado
 * esperando o narrador). Ao resolver, em ordem:
 *   1. Integridade − total de Rupturas sofridas, contando a atual
 *      (1ª perde 1, 3ª perde 3…).
 *   2. Mana máxima + Ânimo + 2 (`mana_bonus_ruptura`).
 *   3. Limite de Sobrecarga + 1, até 5 — vale no fim do próximo
 *      descanso longo (`sobrecarga_limite_bonus_pendente`).
 *   4. 1 Marca e 5. 1 Traço, escolhidos de listas do livro.
 * Integridade a 0 libera a Última Vontade.
 *
 * Puro: recebe e devolve `Character`, sem I/O.
 */

import { getOverloadMaxPerDay } from "./overload";
import { getIntegrityBand, getRuptureManaBonus } from "./rupture";
import type { Character, OverloadRulesPayload, RuptureResolvedEntry } from "./types";

export const LIMITE_SOBRECARGA_MAXIMO = 5;

/** Rupturas já resolvidas (a Ruptura especial de Ascensão fica fora: não conta para Integridade). */
export function rupturasSofridas(character: Pick<Character, "historico_ruptura">): number {
  return character.historico_ruptura?.length ?? 0;
}

/** Limite de Sobrecarga em vigor: o da regra (3) + 1 por Ruptura já valendo, até 5. */
export function limiteSobrecarga(
  character: Pick<Character, "sobrecarga_limite_bonus">,
  rules?: OverloadRulesPayload | null,
): number {
  const base = getOverloadMaxPerDay(rules);
  return Math.min(LIMITE_SOBRECARGA_MAXIMO, Math.max(base, base + (character.sobrecarga_limite_bonus ?? 0)));
}

export interface PreviaRuptura {
  numero: number;
  perda: number;
  integridadeAntes: number;
  integridadeDepois: number;
  faixaAntes: string;
  faixaDepois: string;
  manaBonus: number;
  limiteAntes: number;
  limiteDepois: number;
  /** A perda leva a Integridade a 0: Última Vontade. */
  ultimaVontade: boolean;
}

/** O que a próxima Ruptura faria agora — usada pela aba antes de resolver. */
export function previaRuptura(character: Character, rules?: OverloadRulesPayload | null): PreviaRuptura {
  const numero = rupturasSofridas(character) + 1;
  const integridadeAntes = character.recursos_atuais?.integridade ?? 0;
  const integridadeDepois = Math.max(0, integridadeAntes - numero);
  const limiteAntes = limiteSobrecarga(character, rules);
  const jaGanho = limiteAntes + (character.sobrecarga_limite_bonus_pendente ?? 0);
  return {
    numero,
    perda: numero,
    integridadeAntes,
    integridadeDepois,
    faixaAntes: getIntegrityBand(integridadeAntes).texto,
    faixaDepois: getIntegrityBand(integridadeDepois).texto,
    manaBonus: getRuptureManaBonus(character),
    limiteAntes: Math.min(LIMITE_SOBRECARGA_MAXIMO, jaGanho),
    limiteDepois: Math.min(LIMITE_SOBRECARGA_MAXIMO, jaGanho + 1),
    ultimaVontade: integridadeDepois === 0,
  };
}

export interface EscolhaRuptura {
  marcaId: string;
  marcaMagia?: string;
  traco: { tipo: number; numero: number };
}

export function resolverRupturaV12(
  character: Character,
  escolha: EscolhaRuptura,
  ctx: { nowIso: string; scene?: number; rules?: OverloadRulesPayload | null },
): { character: Character; previa: PreviaRuptura } | { erro: string } {
  if (character.ruptura_pendente !== true) return { erro: "Não há Ruptura para resolver." };
  if (!escolha.marcaId) return { erro: "Escolha uma Marca." };
  if (!(escolha.traco.tipo >= 1 && escolha.traco.tipo <= 4 && escolha.traco.numero >= 1 && escolha.traco.numero <= 8)) {
    return { erro: "Escolha um Traço." };
  }
  const previa = previaRuptura(character, ctx.rules);
  const manaAntes = character.mana_bonus_ruptura ?? 0;
  const ganhaLimite = previa.limiteDepois > previa.limiteAntes;
  const entrada: RuptureResolvedEntry = {
    id: crypto.randomUUID(),
    scene: ctx.scene ?? character.current_scene ?? 1,
    ruptureLevel: previa.numero,
    integridadeAntes: previa.integridadeAntes,
    integridadeDepois: previa.integridadeDepois,
    manaMaxBonusAntes: manaAntes,
    manaMaxBonusDepois: manaAntes + previa.manaBonus,
    manaBonusAplicado: previa.manaBonus,
    pendingChoiceId: "",
    ultimaVontadePendente: previa.ultimaVontade,
    resolvidoEm: ctx.nowIso,
    marcaId: escolha.marcaId,
    ...(escolha.marcaMagia ? { marcaMagia: escolha.marcaMagia } : {}),
    traco: { tipo: escolha.traco.tipo, numero: escolha.traco.numero },
  };
  return {
    previa,
    character: {
      ...character,
      recursos_atuais: { ...character.recursos_atuais, integridade: previa.integridadeDepois },
      mana_bonus_ruptura: manaAntes + previa.manaBonus,
      sobrecarga_limite_bonus_pendente: (character.sobrecarga_limite_bonus_pendente ?? 0) + (ganhaLimite ? 1 : 0),
      ruptura_pendente: false,
      ruptura_nivel_pendente: 0,
      ultima_vontade_pendente: character.ultima_vontade_pendente === true || previa.ultimaVontade,
      historico_ruptura: [...(character.historico_ruptura ?? []), entrada],
    },
  };
}

/** Descanso longo: o limite ganho nas Rupturas passa a valer. */
export function aplicarLimitePendente(character: Character): Character {
  const pendente = character.sobrecarga_limite_bonus_pendente ?? 0;
  if (pendente <= 0) return character;
  return {
    ...character,
    sobrecarga_limite_bonus: (character.sobrecarga_limite_bonus ?? 0) + pendente,
    sobrecarga_limite_bonus_pendente: 0,
  };
}

/**
 * Desfaz o último surto do dia. Se era o surto que alcançou o limite,
 * a Ruptura que ele provocou some junto: ela nunca aconteceu.
 */
export function removerUltimoSurto(character: Character, limite: number): Character {
  const antes = character.sobrecarga_usada_dia ?? 0;
  if (antes <= 0) return character;
  const desfazRuptura = character.ruptura_pendente === true && antes >= limite;
  return {
    ...character,
    sobrecarga_usada_dia: antes - 1,
    ...(desfazRuptura ? { ruptura_pendente: false, ruptura_nivel_pendente: 0 } : {}),
  };
}
