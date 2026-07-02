/**
 * Tipos da ficha mínima de personagem.
 *
 * Os tipos de "regras" abaixo (AttributeDefinition, SkillDefinition,
 * DerivedDefinition, CharacterRulesPayload) descrevem apenas o
 * subconjunto do payload de `character_rule` (regras_personagem) que a
 * ficha mínima realmente lê — não é uma tipagem exaustiva do schema.
 */

// ---------------------------------------------------------------------
// Personagem (estado local, ainda não persistido)
// ---------------------------------------------------------------------

export interface CharacterAttributes {
  corpo: number;
  mente: number;
  animo: number;
}

/** slug da perícia -> valor investido. */
export type CharacterSkills = Record<string, number>;

/**
 * Recursos atuais (não confundir com os _max, que são derivados
 * calculados pelas regras). Todos opcionais — uma ficha recém-criada
 * pode não ter acesso aos derivados ainda (regras não carregadas).
 */
export interface CharacterResources {
  pv?: number;
  pe?: number;
  mana?: number;
  integridade?: number;
}

/**
 * Metadados mínimos de versionamento do payload salvo. schema_version
 * existe para permitir migrações leves no futuro (ver
 * normalizeCharacter) sem quebrar personagens já salvos com um
 * payload mais antigo/incompleto. Nunca é usado no cálculo de
 * derivados — é só rastreabilidade.
 */
export interface CharacterMetadata {
  schema_version: number;
  criado_em?: string;
  atualizado_em?: string;
  /** Outros metadados livres (ex.: notas, origem) — não interpretados pela ficha mínima. */
  [key: string]: unknown;
}

/**
 * Estado operacional de turno/sessão — não é progressão nem ficha
 * permanente. Controla quanto de PA/Reações já foi gasto/usado na
 * rodada atual. Editável em Modo Jogo e Modo Evolução (não é travado
 * pelo seletor de modo, ao contrário de atributos/perícias).
 */
export interface CharacterGameState {
  pa_gastos?: number;
  reacoes_usadas?: number;
  /** Outros campos operacionais futuros — não interpretados pela ficha mínima. */
  [key: string]: unknown;
}

/**
 * Condição ativa (ou já removida, se `ativa: false`) registrada no
 * personagem — checkpoint v0.32. Ainda sem automação de modificadores:
 * é só registro manual, visível na ficha e logado na mesa. `conditionId`
 * aponta para o slug de `content_documents` (content_type="condition",
 * ver db_condicoes_normalizado) quando a condição foi escolhida da
 * Biblioteca; fica `null`/ausente para condições totalmente manuais
 * (nome livre, sem vínculo com a Biblioteca).
 */
export interface ActiveCondition {
  /** uuid gerado no cliente (crypto.randomUUID()) — não é id de content_documents. */
  id: string;
  /** slug de content_documents (content_type="condition"), se veio da Biblioteca. */
  conditionId?: string | null;
  nome: string;
  descricao?: string;
  origem?: string;
  /** Texto livre — "3 rodadas", "até recuperar 1 PV", "cena inteira", etc. Não é contador automático. */
  duracao?: string;
  /** ISO timestamp de quando foi aplicada. */
  aplicadaEm: string;
  /** ISO timestamp de quando foi removida — null enquanto ativa. */
  removidaEm?: string | null;
  ativa: boolean;
  observacoes?: string;
  /**
   * Como a remoção aconteceu (checkpoint v0.34) — ausente/undefined
   * para remoção manual (botão "Remover", v0.32). `"cura_pv"` marca
   * remoção automática por ter recuperado 1+ PV (PRD 9.3), permitindo
   * ao "Desfazer" reativar só as condições removidas pela cura mais
   * recente, sem tocar em remoções manuais anteriores.
   */
  removidaOrigem?: "cura_pv";
}

export interface Character {
  nome: string;
  atributos: CharacterAttributes;
  pericias: CharacterSkills;
  /** Recursos atuais, se já existirem — opcional na ficha mínima. */
  recursos_atuais?: CharacterResources;
  /** Metadados simples e livres, incluindo schema_version. */
  metadados?: CharacterMetadata;
  /** PA gastos / reações usadas no turno atual, se já existirem. */
  estado_jogo?: CharacterGameState;
  /**
   * Condições ativas e histórico de remoções (checkpoint v0.32).
   * Inclui entradas com `ativa: false` para manter histórico simples —
   * nunca apagadas do array, só marcadas como removidas.
   */
  condicoes_ativas?: ActiveCondition[];
}

// ---------------------------------------------------------------------
// Persistência (tabela `characters`, migration 0002_characters.sql)
// ---------------------------------------------------------------------

/** Linha completa da tabela `characters`. payload é o Character inteiro. */
export interface CharacterRecord {
  id: string;
  name: string;
  owner_label: string | null;
  status: string;
  payload: Character;
  created_at: string;
  updated_at: string;
  /** Mesa a que o personagem pertence (migration 0011). Null = legado/sem mesa. */
  campaign_id: string | null;
  /** Perfil a que o personagem pertence dentro da mesa (migration 0011). Null = sem perfil. */
  profile_id: string | null;
  /** Narrador logado dono do registro (migration 0011). Null = criado sem login. */
  owner_id: string | null;
  /** Momento em que foi arquivado (migration 0012). Null = ativo/vivo. */
  archived_at: string | null;
}

// ---------------------------------------------------------------------
// Fórmulas de derivados, como vêm em regras_personagem.derivados[].formula
// ---------------------------------------------------------------------

export type FormulaNode =
  | { const: number }
  | { ref: "atributo" | "derivado"; id: string }
  | { op: "+" | "-" | "*" | "/"; args: FormulaNode[] };

/** ids dos 8 derivados básicos cobertos pela ficha mínima. */
export const DERIVED_IDS = [
  "pv_max",
  "pe_max",
  "mana_max",
  "integridade_max",
  "reacoes_por_rodada",
  "andar_m",
  "correr_m",
  "pa_max",
] as const;

export type DerivedId = (typeof DERIVED_IDS)[number];

export type DerivedStats = Record<DerivedId, number>;

// ---------------------------------------------------------------------
// Subconjunto do payload de regras_personagem usado pela ficha mínima
// ---------------------------------------------------------------------

export interface AttributeDefinition {
  id: string;
  nome: string;
  abreviacao?: string;
  valor_minimo: number;
  valor_maximo: number;
}

export interface SkillDefinition {
  id: string;
  nome: string;
  atributo_primario: string;
  valor_minimo: number;
  valor_maximo: number;
}

export interface DerivedDefinition {
  id: string;
  nome: string;
  abreviacao?: string;
  categoria: string;
  unidade?: string;
  formula: FormulaNode;
  formula_label?: string;
}

export interface CharacterRulesPayload {
  atributos: AttributeDefinition[];
  pericias: SkillDefinition[];
  derivados: DerivedDefinition[];
  criacao_personagem?: {
    atributos?: { valor_inicial?: number };
  };
}
