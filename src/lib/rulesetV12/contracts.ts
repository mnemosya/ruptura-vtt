import type { Character } from "../character/types";

export const RUPTURA_V12_RULESET_VERSION = "1.2" as const;
export const RUPTURA_V12_CONTENT_SCHEMA_VERSION = 1 as const;
export const RUPTURA_V12_CHARACTER_SCHEMA_VERSION = 2 as const;

export const RANKINGS_V12 = ["F", "E", "D", "C", "B", "A", "S", "S+"] as const;
export type RankingV12 = (typeof RANKINGS_V12)[number];

export const CLASS_FEATURE_RANKINGS_V12 = ["F", "D", "B", "S"] as const;
export type ClassFeatureRankingV12 = (typeof CLASS_FEATURE_RANKINGS_V12)[number];

export const SUBCLASS_FEATURE_RANKINGS_V12 = ["E", "C", "A"] as const;
export type SubclassFeatureRankingV12 = (typeof SUBCLASS_FEATURE_RANKINGS_V12)[number];

export type AttributeIdV12 = "corpo" | "mente" | "animo";

/** As cinco regiões do Império; não são opções personalizáveis (cap. 8, Região de origem). */
export const REGIOES_V12 = {
  beldran: { nome: "Beldran", idioma: "beldrano" },
  kravus: { nome: "Kravus", idioma: "kravino" },
  talesh: { nome: "Talesh", idioma: "taleshino" },
  torvash: { nome: "Torvash", idioma: "torvashino" },
  vastra: { nome: "Vastra", idioma: "vastrano" },
} as const;
export type RegiaoIdV12 = keyof typeof REGIOES_V12;

export interface ContentReferenceV12 {
  content_type: "item" | "spell" | "class" | "subclass" | "background" | "quality" | "complication";
  slug: string;
}

export interface FeatureV12 {
  slug: string;
  nome: string;
  descricao: string;
  efeitos?: unknown[];
}

export interface AttributeProfileV12 {
  slug: string;
  nome: string;
  /** Três valores atribuíveis livremente a Corpo, Mente e Ânimo. */
  valores: [number, number, number];
}

export interface SkillProfileV12 {
  slug: string;
  nome: string;
  quantidades: {
    valor_1: number;
    valor_2: number;
    valor_3: number;
  };
}

export interface ResourceFormulaV12 {
  constante: number;
  atributo?: AttributeIdV12;
  multiplicador_atributo?: number;
  /** Mantém legível a forma editorial sem fazê-la virar executável. */
  texto: string;
}

export interface RankAdvancementV12 {
  ranking: RankingV12;
  pontos_pericia: number;
  limite_pericia: 3 | 4 | 5;
  pontos_atributo: number;
  pontos_vertente: number;
  magias_adicionais: number;
  pa: 3 | 4 | 5;
  escolhe_subclasse: boolean;
  mudancas_recursos_classe?: Record<string, number | string>;
}

export interface ClassContentV12 {
  schema_version: typeof RUPTURA_V12_CONTENT_SCHEMA_VERSION;
  ruleset_version: typeof RUPTURA_V12_RULESET_VERSION;
  slug: string;
  nome: string;
  descricao: string;
  papel_principal: string;
  papeis_secundarios: string[];
  criacao: {
    perfis_atributos: AttributeProfileV12[];
    perfis_pericias: SkillProfileV12[];
    pericias_valor_3: string[];
    pericias_valor_2: string[];
    pericias_valor_1: "qualquer_nao_escolhida" | string[];
    recursos: Record<string, ResourceFormulaV12>;
    vertentes_primarias: "qualquer" | string[];
    sinergia_vertentes?: Record<string, 1 | 2 | 3 | 4 | 5>;
    equipamento_inicial: {
      aretz: number;
      espacos_mochila: number;
      itens: ContentReferenceV12[];
    };
  };
  /** Uma Classe pode conceder mais de uma característica no mesmo Ranking (ex.: Técnico no D). */
  caracteristicas: Record<ClassFeatureRankingV12, FeatureV12[]>;
  subclasses: string[];
  progressao: Record<RankingV12, RankAdvancementV12>;
}

export interface SubclassContentV12 {
  schema_version: typeof RUPTURA_V12_CONTENT_SCHEMA_VERSION;
  ruleset_version: typeof RUPTURA_V12_RULESET_VERSION;
  slug: string;
  nome: string;
  descricao: string;
  classe_slug: string;
  caracteristicas: Record<SubclassFeatureRankingV12, FeatureV12[]>;
}

export interface BackgroundContentV12 {
  schema_version: typeof RUPTURA_V12_CONTENT_SCHEMA_VERSION;
  ruleset_version: typeof RUPTURA_V12_RULESET_VERSION;
  slug: string;
  nome: string;
  descricao: string;
  familiaridade: string;
  recurso_por_sessao: {
    usos: 1;
    opcoes: string[];
  };
}

export interface TrajectoryOptionContentV12 {
  schema_version: typeof RUPTURA_V12_CONTENT_SCHEMA_VERSION;
  ruleset_version: typeof RUPTURA_V12_RULESET_VERSION;
  slug: string;
  nome: string;
  descricao: string;
  categoria: string;
  custos_permitidos: Array<1 | 2>;
  repetivel?: boolean;
  campos_instancia?: string[];
  /** Efeitos mecânicos estruturados, ex.: { tipo: "aretz_inicial_adicional", por_pontos: { "1": 1500 } }. */
  efeitos?: unknown[];
}

export type QualityContentV12 = TrajectoryOptionContentV12;
export type ComplicationContentV12 = TrajectoryOptionContentV12;

export interface RulesetContentBundleV12 {
  classes: ClassContentV12[];
  subclasses: SubclassContentV12[];
  backgrounds: BackgroundContentV12[];
  qualities: QualityContentV12[];
  complications: ComplicationContentV12[];
}

export interface CharacterTrajectoryV12 {
  regiao_id: string;
  local_origem: string;
  idiomas: string[];
  antecedente: {
    antecedente_id: string;
    meio: string;
    papel: string;
    relacao_atual: string;
  };
  transformacao_refratario: {
    estopim: string;
    primeiros_passos: string;
    consequencia: string;
  };
  rpi_forjado: {
    nivel: 1;
    nome_registrado: string;
    ocupacao_declarada: string;
    origem: string;
  };
  codinome?: string;
  qualidades: Array<{ quality_id: string; pontos: 1 | 2; detalhes: Record<string, string> }>;
  complicacoes: Array<{ complication_id: string; pontos: 1 | 2; detalhes: Record<string, string> }>;
}

export interface CharacterProgressionV12 {
  classe_id: string;
  subclasse_id?: string;
  ranking: RankingV12;
  escolhas_por_ranking: Partial<Record<RankingV12, Record<string, unknown>>>;
  /**
   * Cópia das fórmulas de recurso da Classe (e do PA do Ranking atual),
   * no formato de árvore lido pela ficha e pelo HUD. Gravada na criação
   * e conferida pela RPC contra o documento `class` publicado.
   */
  formulas_derivados?: Record<string, unknown>;
  /** Texto editorial de cada fórmula, para exibição (ex.: "13 + Mente"). */
  formulas_derivados_texto?: Record<string, string>;
}

export type EscolhaPendenteMagiaV12 =
  | { tipo: "magias_nivel_vertente"; vertente: string; nivel: number; origem: string }
  | { tipo: "magia_adicional"; origem: string };

export interface CharacterMagicV12 {
  vertente_primaria: string;
  niveis_vertente: Record<string, number>;
  magias_aprendidas: string[];
  /**
   * Escolhas de magia ainda não feitas porque o catálogo v1.2 não está
   * publicado (nível de Vertente na criação e na progressão, magia
   * adicional em D/B/S). Preenchidas quando o catálogo existir.
   */
  escolhas_pendentes?: EscolhaPendenteMagiaV12[];
}

/**
 * Payload canônico após o corte. Os campos operacionais já existentes da
 * ficha continuam disponíveis; estes campos são a fonte de verdade do
 * domínio v1.2. Não existe união com personagem v1 neste contrato.
 */
export type CharacterV2 = Character & {
  schema_version: typeof RUPTURA_V12_CHARACTER_SCHEMA_VERSION;
  ruleset_version: typeof RUPTURA_V12_RULESET_VERSION;
  trajetoria: CharacterTrajectoryV12;
  progressao: CharacterProgressionV12;
  magia: CharacterMagicV12;
};
