/**
 * Criação de personagem RUPTURA v1.2 no Ranking F.
 *
 * O cliente envia apenas ESCOLHAS (perfil, distribuição, perícias,
 * Vertente Primária, Trajetória e compras). Este módulo valida essas
 * escolhas contra o documento `class` publicado e monta o payload
 * `schema_version: 2` inteiro: recursos, perícias zeradas, carteira e
 * instâncias de inventário nunca vêm prontos do cliente.
 *
 * A RPC `complete_character_creation_v2` repete as mesmas checagens no
 * banco, porque um usuário autenticado pode chamá-la diretamente.
 */

import {
  RUPTURA_V12_CHARACTER_SCHEMA_VERSION,
  RUPTURA_V12_RULESET_VERSION,
  type AttributeIdV12,
  type CharacterTrajectoryV12,
  type BackgroundContentV12,
  type CharacterV2,
  type ClassContentV12,
  type ComplicationContentV12,
  type QualityContentV12,
  type RankingV12,
} from "./contracts";
import { validateCharacterV2 } from "./validation";

export interface CreationChoicesV12 {
  nome: string;
  classe_id: string;
  perfil_atributos: string;
  atributos: Record<AttributeIdV12, number>;
  perfil_pericias: string;
  pericias: { valor_3: string[]; valor_2: string[]; valor_1: string[] };
  vertente_primaria: string;
  trajetoria: CharacterTrajectoryV12;
  compras: Array<{ itemSlug: string; quantidade: number }>;
}

/** Projeção mínima de um item publicado, suficiente para cobrar e instanciar. */
export interface CreationItemV12 {
  slug: string;
  nome: string;
  categoria: string;
  subtipo?: string;
  preco: number;
}

export interface CreationContextV12 {
  classe: ClassContentV12;
  /** IDs do catálogo publicado de perícias (character_rule.pericias). */
  pericias: string[];
  /** Vertentes reconhecidas pelo ruleset v1.2. */
  vertentes: string[];
  itens: Map<string, CreationItemV12>;
  /** Opções de Trajetória publicadas (globais ou da campanha), por slug. */
  trajetoria: {
    antecedentes: Map<string, BackgroundContentV12>;
    qualidades: Map<string, QualityContentV12>;
    complicacoes: Map<string, ComplicationContentV12>;
  };
  /** Injetáveis para teste determinístico. */
  agora?: () => string;
  novoId?: () => string;
}

export type CreationResultV12 = { ok: true; character: CharacterV2 } | { ok: false; errors: string[] };

export const VERTENTES_V12 = ["biotica", "cinetica", "cognitiva", "energetica", "material", "sinaptica"] as const;

const ATTRIBUTES: AttributeIdV12[] = ["corpo", "mente", "animo"];

const sortedKey = (values: number[]) => [...values].sort((a, b) => a - b).join(",");

/**
 * Ⱥ inicial = valor da Classe + efeitos `aretz_inicial_adicional` das
 * Qualidades escolhidas (ex.: Recursos concede Ⱥ 1.500 ou Ⱥ 3.000).
 */
export function initialAretzV12(
  classe: ClassContentV12,
  qualidades: CharacterTrajectoryV12["qualidades"],
  catalogo: Map<string, QualityContentV12>,
): number {
  let total = classe.criacao.equipamento_inicial.aretz;
  for (const escolha of qualidades) {
    for (const efeito of catalogo.get(escolha.quality_id)?.efeitos ?? []) {
      const e = efeito as { tipo?: string; por_pontos?: Record<string, number> };
      if (e.tipo === "aretz_inicial_adicional") total += e.por_pontos?.[String(escolha.pontos)] ?? 0;
    }
  }
  return total;
}

function validateTrajectoryChoicesV12(trajetoria: CharacterTrajectoryV12, ctx: CreationContextV12): string[] {
  const errors: string[] = [];
  if (!ctx.trajetoria.antecedentes.has(trajetoria.antecedente?.antecedente_id)) {
    errors.push(`trajetoria.antecedente: Antecedente inexistente ou não publicado "${trajetoria.antecedente?.antecedente_id}".`);
  }
  const checar = (
    lista: Array<{ id: string; pontos: number }>,
    catalogo: Map<string, QualityContentV12 | ComplicationContentV12>,
    rotulo: string,
  ) => {
    const vistos = new Set<string>();
    for (const { id, pontos } of lista) {
      const opcao = catalogo.get(id);
      if (!opcao) {
        errors.push(`trajetoria.${rotulo}: opção inexistente ou não publicada "${id}".`);
        continue;
      }
      if (!opcao.custos_permitidos.includes(pontos as 1 | 2)) {
        errors.push(`trajetoria.${rotulo}: "${opcao.nome}" custa ${opcao.custos_permitidos.join(" ou ")} ponto(s), recebido ${pontos}.`);
      }
      if (vistos.has(id) && !opcao.repetivel) errors.push(`trajetoria.${rotulo}: "${opcao.nome}" não pode ser escolhida mais de uma vez.`);
      vistos.add(id);
    }
  };
  checar((trajetoria.qualidades ?? []).map((q) => ({ id: q.quality_id, pontos: q.pontos })), ctx.trajetoria.qualidades, "qualidades");
  checar((trajetoria.complicacoes ?? []).map((c) => ({ id: c.complication_id, pontos: c.pontos })), ctx.trajetoria.complicacoes, "complicacoes");
  return errors;
}

/** Recurso da Classe → derivado da ficha. */
export const CLASS_RESOURCE_TO_DERIVED_V12 = {
  pv: "pv_max",
  pe: "pe_max",
  mana: "mana_max",
  integridade: "integridade_max",
  reacoes: "reacoes_por_rodada",
  andar: "andar_m",
  correr: "correr_m",
} as const;

type FormulaNodeV12 =
  | { const: number }
  | { ref: "atributo"; id: AttributeIdV12 }
  | { op: "+" | "*"; args: FormulaNodeV12[] };

/**
 * Converte as fórmulas de recurso da Classe (e o PA do Ranking) para a
 * árvore de fórmula lida pela ficha e pelo HUD. A mesma construção é
 * refeita em SQL pela RPC de criação para conferir a cópia gravada.
 */
export function classDerivedFormulasV12(classe: ClassContentV12, ranking: RankingV12): {
  formulas: Record<string, FormulaNodeV12>;
  textos: Record<string, string>;
} {
  const formulas: Record<string, FormulaNodeV12> = {};
  const textos: Record<string, string> = {};
  for (const [recurso, derivado] of Object.entries(CLASS_RESOURCE_TO_DERIVED_V12)) {
    const f = classe.criacao.recursos[recurso];
    if (!f) continue;
    formulas[derivado] = f.atributo
      ? { op: "+", args: [{ const: f.constante }, { op: "*", args: [{ ref: "atributo", id: f.atributo }, { const: f.multiplicador_atributo ?? 1 }] }] }
      : { const: f.constante };
    textos[derivado] = f.texto;
  }
  const pa = classe.progressao[ranking]?.pa;
  if (pa !== undefined) {
    formulas.pa_max = { const: pa };
    textos.pa_max = `${pa} (Ranking ${ranking})`;
  }
  return { formulas, textos };
}

/** Resolve uma fórmula de recurso da Classe (constante + atributo × multiplicador). */
export function resolveClassResourceV12(
  classe: ClassContentV12,
  recurso: string,
  atributos: Record<AttributeIdV12, number>,
): number | undefined {
  const formula = classe.criacao.recursos[recurso];
  if (!formula) return undefined;
  const parcela = formula.atributo ? atributos[formula.atributo] * (formula.multiplicador_atributo ?? 1) : 0;
  return formula.constante + parcela;
}

export function validateCreationChoicesV12(choices: CreationChoicesV12, ctx: CreationContextV12): string[] {
  const errors: string[] = [];
  const { classe } = ctx;
  const criacao = classe.criacao;

  if (choices.classe_id !== classe.slug) errors.push(`classe_id: esperado "${classe.slug}".`);
  if (typeof choices.nome !== "string" || choices.nome.trim() === "") errors.push("nome: obrigatório.");

  // Atributos: permutação exata de um perfil da Classe.
  const perfilAtributos = criacao.perfis_atributos.find((p) => p.slug === choices.perfil_atributos);
  if (!perfilAtributos) {
    errors.push(`perfil_atributos: "${choices.perfil_atributos}" não pertence à Classe.`);
  } else {
    const valores = ATTRIBUTES.map((a) => choices.atributos?.[a]);
    if (valores.some((v) => !Number.isInteger(v))) {
      errors.push("atributos: Corpo, Mente e Ânimo precisam ser inteiros.");
    } else if (sortedKey(valores as number[]) !== sortedKey(perfilAtributos.valores)) {
      errors.push(`atributos: a distribuição precisa usar exatamente ${perfilAtributos.valores.join(", ")} (${perfilAtributos.nome}).`);
    }
  }

  // Perícias: quantidades do perfil, listas da Classe e catálogo publicado.
  const perfilPericias = criacao.perfis_pericias.find((p) => p.slug === choices.perfil_pericias);
  if (!perfilPericias) {
    errors.push(`perfil_pericias: "${choices.perfil_pericias}" não pertence à Classe.`);
  } else {
    const catalogo = new Set(ctx.pericias);
    const escolhidas = [...choices.pericias.valor_3, ...choices.pericias.valor_2, ...choices.pericias.valor_1];
    const repetidas = escolhidas.filter((slug, i) => escolhidas.indexOf(slug) !== i);
    if (repetidas.length > 0) errors.push(`pericias: cada perícia ocupa uma única seleção (repetidas: ${[...new Set(repetidas)].join(", ")}).`);
    for (const slug of escolhidas) if (!catalogo.has(slug)) errors.push(`pericias: perícia desconhecida "${slug}".`);
    for (const nivel of [3, 2, 1] as const) {
      const lista = choices.pericias[`valor_${nivel}`];
      const esperado = perfilPericias.quantidades[`valor_${nivel}`];
      if (lista.length !== esperado) errors.push(`pericias.valor_${nivel}: o perfil ${perfilPericias.nome} exige ${esperado}, recebido ${lista.length}.`);
    }
    for (const slug of choices.pericias.valor_3) {
      if (!criacao.pericias_valor_3.includes(slug)) errors.push(`pericias.valor_3: "${slug}" não está entre as opções de valor 3 da Classe.`);
    }
    for (const slug of choices.pericias.valor_2) {
      if (!criacao.pericias_valor_2.includes(slug)) errors.push(`pericias.valor_2: "${slug}" não está entre as opções de valor 2 da Classe.`);
    }
    if (criacao.pericias_valor_1 !== "qualquer_nao_escolhida") {
      for (const slug of choices.pericias.valor_1) {
        if (!criacao.pericias_valor_1.includes(slug)) errors.push(`pericias.valor_1: "${slug}" não está entre as opções de valor 1 da Classe.`);
      }
    }
  }

  // Vertente Primária.
  const permitidas = criacao.vertentes_primarias === "qualquer" ? ctx.vertentes : criacao.vertentes_primarias;
  if (!permitidas.includes(choices.vertente_primaria)) {
    errors.push(`vertente_primaria: "${choices.vertente_primaria}" não é permitida para a Classe.`);
  }

  errors.push(...validateTrajectoryChoicesV12(choices.trajetoria, ctx));

  // Compras: itens publicados, quantidades inteiras e orçamento inicial.
  let gasto = 0;
  for (const [i, compra] of (choices.compras ?? []).entries()) {
    const item = ctx.itens.get(compra.itemSlug);
    if (!item) {
      errors.push(`compras[${i}]: item inexistente ou não publicado "${compra.itemSlug}".`);
      continue;
    }
    if (!Number.isInteger(compra.quantidade) || compra.quantidade <= 0) {
      errors.push(`compras[${i}]: quantidade inválida para "${compra.itemSlug}".`);
      continue;
    }
    gasto += item.preco * compra.quantidade;
  }
  const orcamento = initialAretzV12(classe, choices.trajetoria?.qualidades ?? [], ctx.trajetoria.qualidades);
  if (gasto > orcamento) {
    errors.push(`compras: gasto total ${gasto} excede o orçamento inicial de Ⱥ ${orcamento}.`);
  }

  return errors;
}

export function buildCharacterV2(choices: CreationChoicesV12, ctx: CreationContextV12): CreationResultV12 {
  const errors = validateCreationChoicesV12(choices, ctx);
  if (errors.length > 0) return { ok: false, errors };

  const agora = ctx.agora?.() ?? new Date().toISOString();
  const novoId = ctx.novoId ?? (() => crypto.randomUUID());
  const { classe } = ctx;
  const atributos = { corpo: choices.atributos.corpo, mente: choices.atributos.mente, animo: choices.atributos.animo };

  const pericias: Record<string, number> = Object.fromEntries(ctx.pericias.map((slug) => [slug, 0]));
  for (const nivel of [3, 2, 1] as const) for (const slug of choices.pericias[`valor_${nivel}`]) pericias[slug] = nivel;

  const recurso = (id: string) => {
    const valor = resolveClassResourceV12(classe, id, atributos);
    if (valor === undefined) throw new Error(`Classe "${classe.slug}" sem fórmula de recurso "${id}".`);
    return valor;
  };

  let gasto = 0;
  const inventario = choices.compras.map((compra) => {
    const item = ctx.itens.get(compra.itemSlug)!;
    const precoPago = item.preco * compra.quantidade;
    gasto += precoPago;
    return {
      id: novoId(),
      itemSlug: item.slug,
      itemNome: item.nome,
      categoria: item.categoria,
      ...(item.subtipo ? { subtipo: item.subtipo } : {}),
      quantidade: compra.quantidade,
      estado: "mochila" as const,
      adquiridoEm: agora,
      precoPago,
    };
  });

  const niveisVertente = { [choices.vertente_primaria]: 1 };
  const character: CharacterV2 = {
    schema_version: RUPTURA_V12_CHARACTER_SCHEMA_VERSION,
    ruleset_version: RUPTURA_V12_RULESET_VERSION,
    nome: choices.nome.trim(),
    atributos,
    pericias,
    recursos_atuais: {
      pv: recurso("pv"),
      pe: recurso("pe"),
      mana: recurso("mana"),
      integridade: recurso("integridade"),
    },
    estado_jogo: { pa_gastos: 0, reacoes_usadas: 0, defesas_sem_reacao: 0 },
    carteira: {
      aretz_informal: initialAretzV12(classe, choices.trajetoria.qualidades, ctx.trajetoria.qualidades) - gasto,
      cdi: 0,
      cdi_craqueada: 0,
    },
    inventario,
    magias_aprendidas: [],
    // Campo operacional lido hoje pela ficha (CD das magias); espelha `magia.niveis_vertente`.
    niveis_vertente: { ...niveisVertente },
    trajetoria: choices.trajetoria,
    progressao: {
      classe_id: classe.slug,
      ranking: "F",
      formulas_derivados: classDerivedFormulasV12(classe, "F").formulas,
      formulas_derivados_texto: classDerivedFormulasV12(classe, "F").textos,
      escolhas_por_ranking: {
        F: { perfil_atributos: choices.perfil_atributos, perfil_pericias: choices.perfil_pericias },
      },
    },
    magia: {
      vertente_primaria: choices.vertente_primaria,
      niveis_vertente: niveisVertente,
      magias_aprendidas: [],
      // As magias do nível 1 da Vertente Primária dependem do catálogo v1.2.
      escolhas_pendentes: [{ tipo: "magias_nivel_vertente", vertente: choices.vertente_primaria, nivel: 1, origem: "Criação" }],
    },
    metadados: { schema_version: RUPTURA_V12_CHARACTER_SCHEMA_VERSION, criado_em: agora },
  };

  const final = validateCharacterV2(character);
  if (!final.ok) return { ok: false, errors: final.errors };
  return { ok: true, character };
}
