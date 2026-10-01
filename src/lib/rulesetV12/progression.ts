/**
 * Progressão RUPTURA v1.2 — avanço de um Ranking por vez (capítulo 25).
 *
 * Fluxo: estado atual + próximo Ranking → pacote de avanços da Classe →
 * escolhas obrigatórias → validação → personagem novo. Módulo puro: a
 * server action carrega a Classe efetiva, chama `applyAdvancementV12` e
 * grava o resultado.
 *
 * Regras aplicadas:
 *   · Perícias: pontos do Ranking, cada um +1, respeitando o limite novo.
 *   · Atributo: +1 em D, B e S, até 5.
 *   · Vertente: +1 em E, C, A e S+, numa Vertente conhecida ou nova.
 *   · Subclasse: obrigatória no E, fixa depois.
 *   · PA: atualiza a fórmula copiada (`formulas_derivados.pa_max`).
 *
 * Magias (nível de Vertente e magia adicional) dependem do catálogo v1.2,
 * ainda não publicado: o avanço registra a escolha em
 * `magia.escolhas_pendentes` em vez de ignorá-la. Recursos atuais não
 * mudam: o avanço recalcula máximos, mas não cura.
 */

import {
  RANKINGS_V12,
  type AttributeIdV12,
  type CharacterV2,
  type ClassContentV12,
  type EscolhaPendenteMagiaV12,
  type FeatureV12,
  type RankAdvancementV12,
  type RankingV12,
  type SubclassContentV12,
} from "./contracts";
import { VERTENTES_V12 } from "./creation";

export const ATRIBUTO_MAXIMO_V12 = 5;
export const NIVEL_MAXIMO_VERTENTE_V12 = 5;

export interface AdvancementChoicesV12 {
  subclasse_id?: string;
  /** Pontos de perícia por perícia (cada ponto = +1). */
  pericias?: Record<string, number>;
  atributo?: AttributeIdV12;
  vertente?: string;
}

export interface AdvancementPackageV12 {
  de: RankingV12;
  para: RankingV12;
  avanco: RankAdvancementV12;
  caracteristicas_classe: FeatureV12[];
  caracteristicas_subclasse: FeatureV12[];
  /** Subclasses disponíveis quando o avanço exige escolher uma. */
  subclasses_disponiveis: SubclassContentV12[];
}

export interface AdvancementContextV12 {
  classe: ClassContentV12;
  /** Subclasses da Classe publicadas (efetivas para a campanha). */
  subclasses: SubclassContentV12[];
  /** IDs do catálogo publicado de perícias. */
  pericias: string[];
  agora?: () => string;
}

export type AdvancementResultV12 = { ok: true; character: CharacterV2 } | { ok: false; errors: string[] };

export function nextRankingV12(atual: RankingV12): RankingV12 | null {
  const i = RANKINGS_V12.indexOf(atual);
  return i >= 0 && i < RANKINGS_V12.length - 1 ? RANKINGS_V12[i + 1] : null;
}

/** O que o próximo Ranking concede. `null` no S+ (fim da progressão regular). */
export function advancementPackageV12(character: CharacterV2, ctx: AdvancementContextV12): AdvancementPackageV12 | null {
  const de = character.progressao.ranking;
  const para = nextRankingV12(de);
  if (!para) return null;
  const avanco = ctx.classe.progressao[para];
  const caracteristicasClasse = (ctx.classe.caracteristicas as Partial<Record<RankingV12, FeatureV12[]>>)[para] ?? [];
  const subclasseAtual = ctx.subclasses.find((s) => s.slug === character.progressao.subclasse_id);
  const caracteristicasSubclasse = subclasseAtual
    ? ((subclasseAtual.caracteristicas as Partial<Record<RankingV12, FeatureV12[]>>)[para] ?? [])
    : [];
  return {
    de,
    para,
    avanco,
    caracteristicas_classe: caracteristicasClasse,
    caracteristicas_subclasse: caracteristicasSubclasse,
    subclasses_disponiveis: avanco.escolhe_subclasse ? ctx.subclasses.filter((s) => ctx.classe.subclasses.includes(s.slug)) : [],
  };
}

export function validateAdvancementChoicesV12(character: CharacterV2, choices: AdvancementChoicesV12, ctx: AdvancementContextV12): string[] {
  const errors: string[] = [];
  if (character.progressao.classe_id !== ctx.classe.slug) errors.push("A Classe carregada não é a do personagem.");
  const pacote = advancementPackageV12(character, ctx);
  if (!pacote) return [...errors, "O Ranking S+ é o limite da progressão regular."];
  const { avanco } = pacote;

  // Subclasse.
  if (avanco.escolhe_subclasse) {
    if (!choices.subclasse_id) errors.push(`O Ranking ${pacote.para} exige escolher uma Subclasse.`);
    else if (!pacote.subclasses_disponiveis.some((s) => s.slug === choices.subclasse_id)) {
      errors.push(`Subclasse "${choices.subclasse_id}" não pertence à Classe ou não está publicada.`);
    }
  } else if (choices.subclasse_id !== undefined && choices.subclasse_id !== character.progressao.subclasse_id) {
    errors.push("A Subclasse só é escolhida no Ranking E.");
  }

  // Perícias.
  const pericias = choices.pericias ?? {};
  const catalogo = new Set(ctx.pericias);
  let pontos = 0;
  for (const [id, n] of Object.entries(pericias)) {
    if (!catalogo.has(id)) errors.push(`Perícia desconhecida: "${id}".`);
    if (!Number.isInteger(n) || n < 1) {
      errors.push(`Pontos inválidos em "${id}".`);
      continue;
    }
    pontos += n;
    const novo = (character.pericias[id] ?? 0) + n;
    if (novo > avanco.limite_pericia) errors.push(`"${id}" ficaria em ${novo}, acima do limite ${avanco.limite_pericia} do Ranking ${pacote.para}.`);
  }
  if (pontos !== avanco.pontos_pericia) {
    errors.push(`O Ranking ${pacote.para} concede ${avanco.pontos_pericia} ponto(s) de Perícia; recebido ${pontos}.`);
  }

  // Atributo.
  if (avanco.pontos_atributo > 0) {
    if (!choices.atributo) errors.push(`O Ranking ${pacote.para} concede +1 ponto de Atributo: escolha Corpo, Mente ou Ânimo.`);
    else if (!["corpo", "mente", "animo"].includes(choices.atributo)) errors.push(`Atributo inválido: "${choices.atributo}".`);
    else if (character.atributos[choices.atributo] + 1 > ATRIBUTO_MAXIMO_V12) errors.push(`${choices.atributo} já está no limite de ${ATRIBUTO_MAXIMO_V12}.`);
  } else if (choices.atributo) {
    errors.push(`O Ranking ${pacote.para} não concede ponto de Atributo.`);
  }

  // Vertente.
  if (avanco.pontos_vertente > 0) {
    if (!choices.vertente) errors.push(`O Ranking ${pacote.para} concede +1 ponto de Vertente.`);
    else if (!(VERTENTES_V12 as readonly string[]).includes(choices.vertente)) errors.push(`Vertente inválida: "${choices.vertente}".`);
    else if ((character.magia.niveis_vertente[choices.vertente] ?? 0) + 1 > NIVEL_MAXIMO_VERTENTE_V12) {
      errors.push(`${choices.vertente} já está no nível máximo ${NIVEL_MAXIMO_VERTENTE_V12}.`);
    }
  } else if (choices.vertente) {
    errors.push(`O Ranking ${pacote.para} não concede ponto de Vertente.`);
  }
  return errors;
}

export function applyAdvancementV12(character: CharacterV2, choices: AdvancementChoicesV12, ctx: AdvancementContextV12): AdvancementResultV12 {
  const errors = validateAdvancementChoicesV12(character, choices, ctx);
  if (errors.length > 0) return { ok: false, errors };
  const pacote = advancementPackageV12(character, ctx)!;
  const { para, avanco } = pacote;
  const agora = ctx.agora?.() ?? new Date().toISOString();

  const c: CharacterV2 = structuredClone(character);

  for (const [id, n] of Object.entries(choices.pericias ?? {})) c.pericias[id] = (c.pericias[id] ?? 0) + n;
  if (choices.atributo) c.atributos[choices.atributo] += 1;

  const pendentes: EscolhaPendenteMagiaV12[] = [...(c.magia.escolhas_pendentes ?? [])];
  if (choices.vertente) {
    const nivel = (c.magia.niveis_vertente[choices.vertente] ?? 0) + 1;
    c.magia.niveis_vertente = { ...c.magia.niveis_vertente, [choices.vertente]: nivel };
    c.niveis_vertente = { ...(c.niveis_vertente ?? {}), [choices.vertente]: nivel };
    pendentes.push({ tipo: "magias_nivel_vertente", vertente: choices.vertente, nivel, origem: `Ranking ${para}` });
  }
  for (let i = 0; i < avanco.magias_adicionais; i++) pendentes.push({ tipo: "magia_adicional", origem: `Ranking ${para}` });
  c.magia.escolhas_pendentes = pendentes;

  c.progressao.ranking = para;
  if (avanco.escolhe_subclasse) c.progressao.subclasse_id = choices.subclasse_id;
  c.progressao.escolhas_por_ranking = {
    ...c.progressao.escolhas_por_ranking,
    [para]: { ...choices, aplicado_em: agora },
  };
  c.progressao.formulas_derivados = { ...(c.progressao.formulas_derivados ?? {}), pa_max: { const: avanco.pa } };
  c.progressao.formulas_derivados_texto = { ...(c.progressao.formulas_derivados_texto ?? {}), pa_max: `${avanco.pa} (Ranking ${para})` };

  return { ok: true, character: c };
}
