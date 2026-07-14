/**
 * Camada canônica de definições da Biblioteca (Etapa 1 do aditivo do
 * Editor Universal — docs/ADITIVO_PRD_EDITOR_UNIVERSAL_CONTEUDO.md §13).
 *
 * Estes tipos descrevem o envelope canônico que o editor e o motor
 * deverão consumir no futuro. Não substituem `content_documents.payload`
 * (continua sendo a fonte de verdade em disco/banco) — são a projeção
 * normalizada produzida pelos adapters em `./adapters`.
 */

import type { ContentType as ContentTypeId } from "../content/types";

export type { ContentTypeId };

/**
 * Grau de automação de um efeito, derivado da capacidade real do motor
 * (nunca escolhido livremente pela pessoa administradora — ver
 * `./effectTypeRegistry.ts`).
 *
 * - automatico: o motor já resolve a mecânica sozinho hoje.
 * - assistido: o motor resolve parte (ex.: rola dado) mas exige uma
 *   decisão humana para concluir (selecionar alvo, confirmar aplicação).
 * - lembrete: efeito reconhecido e catalogado, mas o motor ainda não tem
 *   executor — vira texto para o narrador resolver (decisão de design
 *   documentada, não uma lacuna desconhecida).
 * - narrativo_rastreado: a consequência principal é narrativa; o motor
 *   só registra uso/duração/log.
 * - sem_executor: o `tipo` do efeito ainda não foi canonicalizado/
 *   triado — não há sequer uma decisão registrada sobre como tratá-lo.
 */
export type ModoAutomacao = "automatico" | "assistido" | "lembrete" | "narrativo_rastreado" | "sem_executor";

/** Referência estável a outro conteúdo da Biblioteca. */
export interface Referencia {
  tipoConteudo: ContentTypeId | "desconhecido";
  slug: string;
  papel?: string;
}

export type TipoDuracao =
  | "instantaneo"
  | "rodadas"
  | "turno"
  | "cena"
  | "combate"
  | "tempo"
  | "enquanto_ativo"
  | "manual"
  | "texto_narrativo"
  | "desconhecido";

/**
 * Forma única de duração. A auditoria encontrou 4 representações
 * legadas diferentes (objeto em magias, string|null em condições,
 * "qualquer coisa" em efeitos de talento/item/runa/escalpo) — esta é a
 * forma para a qual todas devem convergir na leitura.
 */
export interface DuracaoCanonica {
  tipo: TipoDuracao;
  valor?: number;
  unidade?: string;
  texto?: string;
  sustentavel?: boolean;
}

/**
 * Forma única de teste/resistência. A auditoria encontrou 2
 * representações legadas (`cd_formula` textual em magias vs. `cd`
 * numérico literal em equipamentos/runas/propriedades).
 */
export interface ResistenciaCanonica {
  pericia?: string;
  cdFormula?: string;
  cdValor?: number;
  acoes?: string[];
}

export interface EfeitoCanonico {
  /** Estável dentro do documento (ex.: "<slug>#efeito-0"). */
  id: string;
  /** Chave do catálogo em `effectTypeRegistry.ts` — nunca um `tipo` legado cru. */
  tipo: string;
  ordem: number;
  habilitado: boolean;
  gatilho?: string;
  alvo?: string;
  duracao?: DuracaoCanonica;
  /** Campos próprios do tipo de efeito (dado, recurso, condição-alvo, etc.). */
  payloadEspecifico: Record<string, unknown>;
  /** Derivado por `diagnostics.ts` a partir do catálogo — não é entrada livre. */
  modoAutomacao: ModoAutomacao;
  diagnostico: string;
}

export interface ConteudoCanonico {
  schemaVersion: "content.v1";
  contentType: ContentTypeId;
  slug: string;
  nome: string;
  categoria?: string;
  subtipo?: string;
  descricaoCurta?: string;
  descricaoLonga?: string;
  tags: string[];
  /** Campos de classificação condicionais por tipo (nível, vertente, árvore, raridade, ...). */
  classificacao: Record<string, unknown>;
  duracao?: DuracaoCanonica;
  resistencia?: ResistenciaCanonica;
  efeitos: EfeitoCanonico[];
  referencias: Referencia[];
  status: string;
  versao?: string;
  origem: {
    sourcePackId?: string;
    sourcePackVersion?: string;
  };
}

export interface CampoDesconhecido {
  /** Caminho no payload original (ex.: "estatisticas.slots_runa_max"). */
  caminho: string;
  valor: unknown;
  motivo: string;
}

export type ClassificacaoLegado =
  | "conversao_direta"
  | "conversao_com_confirmacao"
  | "somente_leitura"
  | "incompativel"
  | "invalido";

export interface ResultadoAdaptacao {
  canonico: ConteudoCanonico;
  camposDesconhecidos: CampoDesconhecido[];
  classificacaoLegado: ClassificacaoLegado;
  /** Preenchido só quando classificacaoLegado === "invalido". */
  errosFatais?: string[];
}

export interface ResultadoValidacao {
  valido: boolean;
  erros: string[];
  avisos: string[];
  infos: string[];
}
