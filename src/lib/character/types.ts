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
  /**
   * PV temporário (checkpoint v0.36, PRD 10.2) — camada consumida
   * antes do PV normal, some no descanso longo. Representado como um
   * único número (total acumulado), não como lista de fontes — nada
   * no código atual ainda cria PV temporário por fonte separada
   * (isso é escopo de combate/magia/item, fora deste checkpoint); a
   * estrutura mais simples compatível com "zerar no descanso longo" é
   * só o total. Se um checkpoint futuro precisar rastrear fontes
   * individuais (para a regra "fontes iguais não empilham, diferentes
   * somam"), este campo pode evoluir para array sem quebrar leitura
   * antiga (normalizeCharacter trata ausência como 0).
   */
  pv_temporario?: number;
  /** Mana temporária (checkpoint v0.36, PRD 10.3) — mesmo formato/justificativa de `pv_temporario`. */
  mana_temporaria?: number;
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
   * recente, sem tocar em remoções manuais anteriores. `"acao_combate"`
   * (checkpoint v0.42) marca remoção por efeito simples automatizado do
   * Console de Ação (ex.: Levantar removendo Caído).
   */
  removidaOrigem?: "cura_pv" | "acao_combate";
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
  /**
   * Surtos de Sobrecarga usados no dia (checkpoint v0.36, PRD 10.5) —
   * campo mínimo só para o descanso longo poder resetar algo real.
   * NÃO é o sistema de Sobrecarga completo (sem cargas visuais, sem
   * seletor de tipo de surto, sem dano psíquico, sem teste de Vontade
   * no terceiro surto) — isso é trabalho futuro. Ausente/undefined =
   * 0 (nenhum surto usado ainda).
   */
  sobrecarga_usada_dia?: number;
  /**
   * Ruptura pendente (checkpoint v0.37, PRD 10.6) — marcada quando o
   * personagem atinge o 3º surto de Sobrecarga no dia. Resolvida
   * separadamente no fim da cena (Marca/Traço — fora de escopo ainda).
   * Descanso NUNCA limpa isso — só a resolução de Ruptura (futura).
   */
  ruptura_pendente?: boolean;
  /** Placeholder documentado — sem modelo real de "nível de Ruptura" ainda; sempre 1 quando ruptura_pendente vira true. */
  ruptura_nivel_pendente?: number;
  /** Último surto de Sobrecarga usado — só para exibição/histórico simples, não é log persistente. */
  ultimo_surto?: {
    tipo: string;
    indice: number;
    danoPsiquico: number;
    criadoEm: string;
  };
  /**
   * Colapso (checkpoint v0.38, PRD 10.7) — dispara quando PV ou PE
   * chega a 0. Primeira versão jogável: sem morte/coma definitivos,
   * sem cicatriz completa (só a pendência é marcada). Ausente =
   * personagem nunca colapsou.
   */
  colapso?: {
    ativo: boolean;
    tipo: "pv" | "pe" | null;
    /** 0..3 — no 3º, risco de morte (PV) ou coma/fora de jogo (PE), resolução final não automatizada. */
    segmentos: number;
    /** Estabilizar interrompe o avanço de segmento, mas NÃO cura nem remove Inconsciente. */
    estabilizado: boolean;
    iniciadoEm?: string;
    /** null enquanto ativo. */
    encerradoEm?: string | null;
    /** true após sobreviver a um colapso (cura) — campo de cicatriz pendente de preenchimento manual (fora de escopo ainda). */
    cicatrizPendente?: boolean;
    ultimoEvento?: string;
  };
  /**
   * PM (Pontos de Maestria/evolução, checkpoint v0.40, PRD 3.3/4.3) —
   * total recebido ao longo da campanha e o que ainda não foi gasto.
   * `pm_disponivel` nunca é negativo (gasto além do disponível é
   * clampado a 0, com warning — ver `spendPm`).
   */
  pm_total?: number;
  pm_disponivel?: number;
  /**
   * Histórico de evolução (checkpoint v0.40, PRD 4.3) — append-only,
   * nunca reescrito/apagado. Cobre ganho/gasto de PM e ajustes
   * permanentes de atributo/perícia feitos em Modo Evolução.
   */
  historico_evolucao?: EvolutionHistoryEntry[];
}

export type EvolutionHistoryEntryTipo = "ganho" | "gasto" | "ajuste";

export interface EvolutionHistoryEntry {
  id: string;
  tipo: EvolutionHistoryEntryTipo;
  /** PM ganhos/gastos — 0 para entradas "ajuste" (atributo/perícia, sem custo de PM fechado ainda). */
  quantidade: number;
  descricao: string;
  /** Ex.: "atributo:corpo", "pericia:luta" — só presente em "ajuste". */
  campoAfetado?: string;
  antes?: number;
  depois?: number;
  criadoEm: string;
  criadoPor: "character_sheet";
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
  /**
   * Orçamentos de criação de personagem (checkpoint v0.41) — vêm do
   * payload real de `regras_personagem.criacao_personagem`
   * (confirmado via inspeção do conteúdo publicado: pontos_adicionais
   * de atributo = 3, teto de criação = 3, pontos de perícia = 25,
   * aretz iniciais = 5000). Todos opcionais — o assistente cai em
   * fallback documentado se o campo específico não vier no payload
   * (nunca inventa um número diferente do que já existe no PRD).
   */
  criacao_personagem?: {
    atributos?: { valor_inicial?: number; pontos_adicionais?: number; maximo_na_criacao?: number };
    pericias?: { pontos_totais?: number; maximo_na_criacao?: number };
    pa_base?: number;
    inventario?: { aretz_iniciais?: number };
  };
}
