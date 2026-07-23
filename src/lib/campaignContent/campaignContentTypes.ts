/**
 * Tipos de conteúdo de campanha/homebrew (Etapa 12). Reaproveita
 * `CamposEditaveis`/`EfeitoEditavel`/`CampoDesconhecido` do Editor
 * Universal (Etapa 3/4) — o FORMATO do conteúdo editável não muda por
 * escopo (campanha vs. oficial), só onde ele é persistido e quem pode
 * publicá-lo. Nunca duplica a estrutura de campos.
 */

import type { CamposEditaveis, DraftContentType, DraftPreservado } from "../contentSchema/draftTypes";

export type CampaignContentOriginType = "homebrew" | "override";

export type CampaignContentOperation =
  | "novo_homebrew"
  | "copia_homebrew"
  | "novo_override"
  | "edicao_homebrew"
  | "edicao_override"
  | "resolucao_atualizacao";

/** Linha de `campaign_content_documents` — conteúdo EFETIVO publicado da campanha. */
export interface CampaignContentDocumentRow {
  id: string;
  campaign_id: string;
  content_type: DraftContentType;
  slug: string;
  nome: string | null;
  origin_type: CampaignContentOriginType;
  official_document_id: string | null;
  official_version_base: string | null;
  official_hash_base: string | null;
  official_snapshot: Record<string, unknown> | null;
  payload: Record<string, unknown>;
  payload_hash: string;
  status: "published" | "archived";
  local_version: number;
  schema_version: string | null;
  created_by: string | null;
  published_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  archived_at: string | null;
  archive_reason: string | null;
}

/** Envelope de rascunho de campanha — espelha `DraftEnvelope`, com o contexto de campanha/operação a mais. */
export interface CampaignDraftEnvelope {
  schemaVersion: "campaign-draft.v1";
  contentType: DraftContentType;
  operation: CampaignContentOperation;
  camposEditaveis: CamposEditaveis;
  preservado: DraftPreservado;
}

/** Linha de `campaign_content_drafts`. */
export interface CampaignContentDraftRow {
  id: string;
  campaign_id: string;
  content_type: DraftContentType;
  slug: string;
  operation: CampaignContentOperation;
  base_campaign_document_id: string | null;
  base_official_document_id: string | null;
  base_payload_hash: string | null;
  base_official_version: string | null;
  payload: CampaignDraftEnvelope;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

/** Linha de `campaign_content_changelog`. */
export interface CampaignContentChangelogRow {
  id: string;
  campaign_id: string;
  content_type: DraftContentType;
  slug: string;
  operation: string;
  local_version: number | null;
  official_version_base: string | null;
  official_version_atual: string | null;
  payload_before: Record<string, unknown> | null;
  payload_after: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  summary: string | null;
  impact: Record<string, unknown> | null;
  decision: Record<string, unknown> | null;
}

/** Estado de atualização de um override frente ao oficial atual — nunca resolvido automaticamente, só classificado. */
export type EstadoAtualizacaoOficial = "atualizado" | "oficial_alterado" | "oficial_arquivado" | "base_ausente";

/** Origem exibida ao jogador/narrador — nunca "override"/"homebrew" cru na UI de jogador. */
export type OrigemConteudoEfetivo = "oficial" | "modificado_pela_mesa" | "homebrew_da_mesa";

/** Um item da listagem/resolução efetiva — o que consumidores (ficha, mesa) realmente leem. */
export interface ConteudoEfetivo {
  contentType: DraftContentType;
  slug: string;
  nome: string | null;
  payload: Record<string, unknown>;
  origem: OrigemConteudoEfetivo;
  campaignContentDocumentId?: string;
  officialDocumentId?: string;
  officialVersionAtual?: string;
  localVersion?: number;
  estadoAtualizacao?: EstadoAtualizacaoOficial;
}
