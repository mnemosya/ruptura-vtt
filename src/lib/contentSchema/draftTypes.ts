/**
 * Tipos do Editor Universal de campos básicos (Etapa 3).
 *
 * Um rascunho guarda um `DraftEnvelope` em `content_drafts.payload`
 * (migration 0021_content_drafts.sql) — NUNCA o formato legado de
 * `content_documents.payload`. O envelope separa:
 *
 *   - `camposEditaveis`: o que o formulário lê e escreve — só os campos
 *     básicos listados no aditivo §Etapa 3 (identificação, classificação,
 *     custos, alcance/duração, requisitos simples). Fonte de verdade
 *     para o que a pessoa administradora está editando.
 *   - `preservado.rawOriginal`: o payload legado original (de
 *     content_documents, quando o rascunho nasceu de conteúdo publicado)
 *     ou um esqueleto mínimo (conteúdo novo) — NUNCA reescrito por esta
 *     etapa. Efeitos, `estatisticas`, campos bespoke e qualquer coisa
 *     ainda não editável continuam vindo daqui, sempre re-adaptados pelos
 *     adapters da Etapa 1 na hora de exibir — nunca duplicados em outro
 *     formato que possa divergir.
 *
 * Isso é o que garante round-trip sem perda: reabrir o rascunho nunca
 * precisa "reconstituir" um payload legado a partir dos campos editados
 * — cada metade tem sua própria fonte de verdade, sempre.
 */

import type { EfeitoEditavel } from "./effectDraftTypes";
import type { CampoDesconhecido, ContentTypeId } from "./types";

export interface RequisitoSimples {
  tipoConteudo: ContentTypeId | "desconhecido";
  slug: string;
  descricao?: string;
}

export interface CamposComuns {
  nome: string;
  slug: string;
  categoria?: string;
  subtipo?: string;
  descricaoCurta?: string;
  descricaoLonga?: string;
  tags: string[];
}

export interface CamposMagia extends CamposComuns {
  vertente?: string;
  nivel?: number;
  tipoMagia?: string;
  custoPa?: number;
  custoMana?: number;
  custoSobrecarga?: number;
  alcanceValorM?: number;
  alcanceTipo?: string;
  areaTipo?: string;
  areaTexto?: string;
  alvo?: string;
  duracaoTexto?: string;
  sustentavel?: boolean;
  resolucao?: string;
  periciaTeste?: string;
  resistenciaPericia?: string;
  resistenciaCdFormula?: string;
  requisitos: RequisitoSimples[];
  /** Construtor de Efeitos (Etapa 4) — só os 6 tipos do MVP; o resto continua em `preservado`. */
  efeitos: EfeitoEditavel[];
}

/**
 * Campos genuinamente editáveis de um nível de talento nesta etapa.
 *
 * `ativação/gatilho/usos/cadência/custo` NÃO viram campos aqui: a
 * auditoria do schema real (`content/schema_talentos_v1_3.json`,
 * `$defs.nivel_talento`) confirma que esses conceitos só existem dentro
 * de `payload_automacao.efeitos[]`, com forma heterogênea por família de
 * efeito — não há um campo único e seguro para editar sem fabricar
 * estrutura que não existe no conteúdo real. Eles continuam visíveis
 * (somente leitura) na seção de efeitos preservados de cada nível.
 */
export interface CamposTalentoNivel {
  nivel: number;
  nomeNivel: string;
  descricaoCurta?: string;
  descricaoLonga?: string;
  requisitos: RequisitoSimples[];
  /** Construtor de Efeitos (Etapa 4) — efeitos deste nível específico, nunca dos outros 2. */
  efeitos: EfeitoEditavel[];
}

export interface CamposTalento extends CamposComuns {
  /** Sempre 3 — a estrutura de árvore/nível não muda nesta etapa. */
  niveis: [CamposTalentoNivel, CamposTalentoNivel, CamposTalentoNivel];
}

export interface CamposItem extends CamposComuns {
  raridade?: string;
  preco?: number;
  /**
   * `moeda`/`quantidadePadrao`/`cargasPadrao`/`custoPa`/`disponibilidade`/
   * `aquisicao` (abaixo): campos existentes desde a Etapa 3, mas SEM
   * qualquer leitor real (auditoria da Etapa 9 — não há campo `moeda`,
   * `disponibilidade` ou `aquisicao` no schema/conteúdo real de
   * equipamento, nem em `normalizeItemContent`/`serializarItem`).
   * Mantidos como estavam (não é escopo desta etapa inventar uma
   * economia/semântica para eles) — ver checkpoint da Etapa 9 §limitações.
   */
  moeda?: string;
  quantidadePadrao?: number;
  cargasPadrao?: number;
  custoPa?: number;
  disponibilidade?: string;
  aquisicao?: string;
  propriedades: string[];
  /**
   * Defaults de modelo (Etapa 9) — mesmas chaves REAIS de
   * `estatisticas.*` já lidas por `normalizeItemContent`
   * (character/inventory.ts): `mit_base`, `pd_max`, `slots_runa_max`,
   * `cargas_max`, `municao_max`, `municao_compativel`, `tipo_protecao`.
   * `regioes` é exposto (existe em conteúdo real, ex.: `["tronco"]`) mas
   * SEM leitor real ainda — preservado/editável, nunca automatizado.
   * Nenhum destes é lido de `Character`/instância — só do MODELO
   * publicado (nunca sobrescreve MIT/PD/carga/munição atuais de uma
   * instância já existente).
   */
  mitBase?: number;
  pdBase?: number;
  tipoProtecao?: string;
  regioes?: string[];
  slotsRunaMax?: number;
  cargasMax?: number;
  municaoMax?: number;
  municaoCompativelSlug?: string;
  /** Construtor de Efeitos (Etapa 4) — vive em `payload_automacao`, nunca em `estatisticas`. */
  efeitos: EfeitoEditavel[];
}

/**
 * Runa (Etapa 9) — 4º content type editável. Campos mapeados 1:1 ao
 * schema real (`content/schema_runas_v1_2.json`): `categoria`/
 * `categoria_label` são `const` no schema (sempre "runa"/"Runa", nunca
 * editáveis); `custoIntegridade` idem — o schema exige o campo, mas
 * `_meta.observacoes` do conteúdo real confirma que runas NUNCA custam
 * Integridade (exclusivo de escalpo) — as 40 runas reais têm
 * `custo_integridade: 0`; por isso este campo é sempre fixado em 0 na
 * serialização, nunca exposto como editável (evita reintroduzir uma
 * regra que o próprio conteúdo real já eliminou).
 */
export interface CamposRuna extends CamposComuns {
  raridade?: string;
  preco?: number;
  /** `slots_possiveis` real: subconjunto de "arma"|"armadura"|"escudo". */
  slotsPossiveis: string[];
  /** `restricao_subtipo` real — só existe em runas de arma: "corpo_a_corpo"|"arremesso_disparo"|"fogo". */
  restricaoSubtipo?: string;
  requisitoPericia?: string;
  /** Reaproveita o mesmo catálogo universal — mapeado para o vocabulário real de `payload_automacao.efeitos[].tipo` de runa (ver effectLegacySerialization.ts). */
  efeitos: EfeitoEditavel[];
}

export type CamposEditaveisMagia = { contentType: "spell"; campos: CamposMagia };
export type CamposEditaveisTalento = { contentType: "talent"; campos: CamposTalento };
export type CamposEditaveisItem = { contentType: "item"; campos: CamposItem };
export type CamposEditaveisRuna = { contentType: "rune"; campos: CamposRuna };

export type CamposEditaveis = CamposEditaveisMagia | CamposEditaveisTalento | CamposEditaveisItem | CamposEditaveisRuna;

export type DraftContentType = CamposEditaveis["contentType"];

export function isDraftContentType(value: string): value is DraftContentType {
  return value === "spell" || value === "talent" || value === "item" || value === "rune";
}

export interface DraftPreservado {
  /** `{}` (spell/item) ou `{ niveis: [...] }` (talent) para conteúdo novo. */
  rawOriginal: Record<string, unknown>;
  camposDesconhecidos: CampoDesconhecido[];
}

/**
 * Registro de uma conversão de conteúdo legado sem `content_editor_metadata`
 * (Etapa 6) — só existe quando o rascunho nasceu de "Criar rascunho de
 * edição" sobre conteúdo publicado antes do Editor Universal. Guarda o
 * que foi decidido no momento da conversão; nunca recalculado
 * silenciosamente depois (uma mudança futura no adapter não altera um
 * rascunho já iniciado).
 */
export interface DraftOrigemLegado {
  adapterId: DraftContentType;
  adapterVersion: string;
  classificacaoLegado: string;
  /** Caminho → valor confirmado pela pessoa administradora, para cada campo `conversao_com_confirmacao`. */
  decisoesConfirmadas: Record<string, unknown>;
  camposSomenteLeitura: string[];
  camposDesconhecidos: string[];
  efeitosPreservados: string[];
  avisos: string[];
  convertidoEm: string;
  convertidoPor: string;
}

export interface DraftEnvelope {
  schemaVersion: "draft.v1";
  contentType: DraftContentType;
  camposEditaveis: CamposEditaveis;
  preservado: DraftPreservado;
  /** Só presente quando o rascunho nasceu de uma conversão de legado (Etapa 6). */
  origemLegado?: DraftOrigemLegado;
}

/** Linha de `content_drafts` como lida do banco. */
export interface ContentDraftRow {
  id: string;
  content_type: DraftContentType;
  slug: string;
  base_document_id: string | null;
  base_payload_hash: string | null;
  duplicated_from: string | null;
  payload: DraftEnvelope;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}
