/**
 * Progressão inicial na Forja: quando o personagem é criado acima do
 * Ranking F, as escolhas de cada avanço (Subclasse, Perícias, Atributo,
 * Vertente) são feitas DENTRO da Forja, antes de selar.
 *
 * O personagem continua nascendo no F (a RPC de criação só aceita F); ao
 * selar, cada avanço é aplicado em sequência por `avancarRankingV12Action`
 * com as escolhas guardadas aqui. Estas funções só calculam, a partir do
 * rascunho, o estado de cada etapa e o que falta — a validação que decide
 * é a do servidor (`validateAdvancementChoicesV12` + a RPC).
 *
 * Magias adicionais NÃO são escolhidas aqui: o avanço as registra como
 * escolhas pendentes na ficha (`magia.escolhas_pendentes`).
 */

import { RANKINGS_V12, type AttributeIdV12, type ClassContentV12, type FeatureV12, type RankAdvancementV12, type RankingV12, type SubclassContentV12 } from "./contracts";
import { ATRIBUTO_MAXIMO_V12, NIVEL_MAXIMO_VERTENTE_V12, type AdvancementChoicesV12 } from "./progression";
import type { DraftV12 } from "./draft";
import type { PendenciaCriacaoV12 } from "./pendencias";

/** Escolhas de UM avanço, como ficam no rascunho. */
export interface DraftAvancoV12 {
  subclasse_id?: string;
  /** Pontos gastos por perícia neste avanço (cada ponto = +1). */
  pericias: Record<string, number>;
  atributo?: AttributeIdV12;
  vertente?: string;
}

/** Valores do personagem ANTES de um avanço (o que as escolhas anteriores já somaram). */
export interface BaseProgressaoV12 {
  atributos: Record<AttributeIdV12, number>;
  pericias: Record<string, number>;
  vertentes: Record<string, number>;
  subclasse_id?: string;
}

export interface EtapaProgressaoV12 {
  para: RankingV12;
  avanco: RankAdvancementV12;
  escolha: DraftAvancoV12;
  base: BaseProgressaoV12;
  pericias_gastas: number;
  caracteristicas_classe: FeatureV12[];
  caracteristicas_subclasse: FeatureV12[];
  /** O que falta ou está fora da regra nesta etapa. Vazio = completa. */
  faltas: string[];
}

const ESCOLHA_VAZIA: DraftAvancoV12 = { pericias: {} };

/** Rankings atravessados entre `de` (F na criação) e o alvo. Vazio quando o alvo não passa de `de`. */
export function rankingsDaProgressaoV12(alvo: RankingV12 | undefined, de: RankingV12 = "F"): RankingV12[] {
  const i = alvo ? RANKINGS_V12.indexOf(alvo) : 0;
  const j = RANKINGS_V12.indexOf(de);
  return i > j ? RANKINGS_V12.slice(j + 1, i + 1) : [];
}

/**
 * Ponto de partida de uma EVOLUÇÃO (personagem já criado): o Ranking
 * atual e os valores da ficha. Sem ela, a progressão parte do F com os
 * valores do rascunho (a criação).
 */
export interface PartidaProgressaoV12 {
  de: RankingV12;
  base: BaseProgressaoV12;
}

/** O que a progressão lê do rascunho (na evolução, só o alvo e as escolhas). */
export type DraftProgressaoV12 = Pick<DraftV12, "rankingInicial" | "avancos"> & Partial<Pick<DraftV12, "atributos" | "pericias" | "vertente">>;

export function etapasProgressaoV12(
  d: DraftProgressaoV12,
  classe: ClassContentV12 | undefined,
  subclasses: SubclassContentV12[],
  partida?: PartidaProgressaoV12,
): EtapaProgressaoV12[] {
  const ranks = rankingsDaProgressaoV12(d.rankingInicial, partida?.de);
  if (!classe || !ranks.length) return [];
  const daClasse = subclasses.filter((s) => s.classe_slug === classe.slug && classe.subclasses.includes(s.slug));

  let base: BaseProgressaoV12 = partida?.base ?? {
    atributos: { corpo: d.atributos?.corpo ?? 0, mente: d.atributos?.mente ?? 0, animo: d.atributos?.animo ?? 0 },
    pericias: { ...d.pericias },
    vertentes: d.vertente ? { [d.vertente]: 1 } : {},
  };

  return ranks.map((para) => {
    const avanco = classe.progressao[para];
    const escolha = d.avancos?.[para] ?? ESCOLHA_VAZIA;
    const faltas: string[] = [];

    if (avanco.escolhe_subclasse) {
      if (!escolha.subclasse_id) faltas.push("escolha a Subclasse");
      else if (!daClasse.some((s) => s.slug === escolha.subclasse_id)) faltas.push("Subclasse indisponível");
    }

    let gastas = 0;
    for (const [id, n] of Object.entries(escolha.pericias)) {
      gastas += n;
      if ((base.pericias[id] ?? 0) + n > avanco.limite_pericia) faltas.push(`perícia acima do limite ${avanco.limite_pericia}`);
    }
    if (gastas !== avanco.pontos_pericia) {
      faltas.push(gastas < avanco.pontos_pericia
        ? `distribua ${avanco.pontos_pericia - gastas} ponto(s) de Perícia`
        : `${gastas - avanco.pontos_pericia} ponto(s) de Perícia a mais`);
    }

    if (avanco.pontos_atributo > 0) {
      if (!escolha.atributo) faltas.push("escolha o Atributo");
      else if (base.atributos[escolha.atributo] + 1 > ATRIBUTO_MAXIMO_V12) faltas.push("Atributo no máximo");
    }
    if (avanco.pontos_vertente > 0) {
      if (!escolha.vertente) faltas.push("escolha a Vertente");
      else if ((base.vertentes[escolha.vertente] ?? 0) + 1 > NIVEL_MAXIMO_VERTENTE_V12) faltas.push("Vertente no nível máximo");
    }

    const subclasse = escolha.subclasse_id && avanco.escolhe_subclasse ? escolha.subclasse_id : base.subclasse_id;
    const sub = daClasse.find((s) => s.slug === subclasse);
    const etapa: EtapaProgressaoV12 = {
      para,
      avanco,
      escolha,
      base,
      pericias_gastas: gastas,
      caracteristicas_classe: (classe.caracteristicas as Partial<Record<RankingV12, FeatureV12[]>>)[para] ?? [],
      caracteristicas_subclasse: sub ? ((sub.caracteristicas as Partial<Record<RankingV12, FeatureV12[]>>)[para] ?? []) : [],
      faltas: [...new Set(faltas)],
    };

    // A base do próximo avanço já soma as escolhas deste.
    const pericias = { ...base.pericias };
    for (const [id, n] of Object.entries(escolha.pericias)) pericias[id] = (pericias[id] ?? 0) + n;
    base = {
      atributos: escolha.atributo && avanco.pontos_atributo > 0 ? { ...base.atributos, [escolha.atributo]: base.atributos[escolha.atributo] + 1 } : base.atributos,
      pericias,
      vertentes: escolha.vertente && avanco.pontos_vertente > 0 ? { ...base.vertentes, [escolha.vertente]: (base.vertentes[escolha.vertente] ?? 0) + 1 } : base.vertentes,
      subclasse_id: subclasse,
    };
    return etapa;
  });
}

/** Uma pendência por Ranking incompleto, para a Revisão e o bloqueio do Selar. */
export function pendenciasProgressaoV12(etapas: EtapaProgressaoV12[]): PendenciaCriacaoV12[] {
  return etapas
    .filter((e) => e.faltas.length)
    .map((e) => ({ campo: "progressao" as const, texto: `Ranking ${e.para}: ${e.faltas.join(" · ")}.` }));
}

/** As escolhas de um avanço no formato que a ação de avanço espera. */
export function escolhasDoAvancoV12(etapa: EtapaProgressaoV12): AdvancementChoicesV12 {
  const { avanco, escolha } = etapa;
  return {
    ...(avanco.escolhe_subclasse && escolha.subclasse_id ? { subclasse_id: escolha.subclasse_id } : {}),
    pericias: Object.fromEntries(Object.entries(escolha.pericias).filter(([, n]) => n > 0)),
    ...(avanco.pontos_atributo > 0 && escolha.atributo ? { atributo: escolha.atributo } : {}),
    ...(avanco.pontos_vertente > 0 && escolha.vertente ? { vertente: escolha.vertente } : {}),
  };
}
