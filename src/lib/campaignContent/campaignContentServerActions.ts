"use server";

/**
 * Ações administrativas de conteúdo de campanha/homebrew (Etapa 12).
 * Toda função:
 *   - reverifica "narrador desta campanha" no servidor
 *     (`campaigns.owner_id = auth.uid()` — mesma autoridade já usada em
 *     `table/storage.ts`, nenhum papel novo inventado);
 *   - a escrita passa pelo client "scoped" + pelas funções SECURITY
 *     DEFINER da migration 0025, que reforçam a MESMA checagem no banco;
 *   - nunca toca `content_documents`/`content_drafts` oficiais;
 *   - nunca altera estado de instância (personagem/inventário).
 */

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth/session";
import { getScopedTableClient } from "../auth/scopedClient";
import { getCampaign } from "../table/storage";
import { getContentDocument } from "../content/queries";
import type { ContentType } from "../content/types";
import {
  rawOriginalItemVazio,
  rawOriginalRunaVazio,
  rawOriginalSpellVazio,
  rawOriginalTalentoVazio,
  vazioCamposItem,
  vazioCamposMagia,
  vazioCamposRuna,
  vazioCamposTalento,
} from "../contentSchema/draftMapping";
import { montarCamposECamposDesconhecidosIniciais, sobreporMetadataEditorial } from "../contentSchema/draftBuilders";
import { getEditorMetadataAtual } from "../contentSchema/editorMetadataQueries";
import type { CamposEditaveis, CamposItem, CamposMagia, CamposRuna, CamposTalento, ContentDraftRow, DraftContentType } from "../contentSchema/draftTypes";
import { serializarRascunhoParaPublicacao } from "../contentSchema/publishSerialization";
import { isValidSlug, slugify } from "../contentSchema/slug";
import { validarCamposCampanha } from "./campaignContentValidation";
import { findCampaignDraftBySlug, getCampaignContentDocumentById, getCampaignDraftById } from "./campaignContentQueries";
import type { CampaignContentDraftRow, CampaignDraftEnvelope, CampaignContentOperation } from "./campaignContentTypes";

async function requireCampaignNarrator(campaignId: string): Promise<{ id: string; email: string | null }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Não autenticado.");
  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error("Campanha não encontrada.");
  if (campaign.owner_id !== user.id) throw new Error("Sem acesso de narrador a esta campanha.");
  return user;
}

export interface AcaoCampanhaResultado {
  ok: boolean;
  erro?: string;
  draftId?: string;
}

function camposEIniciaisVazios(contentType: DraftContentType, nome: string, slug: string): { campos: CamposEditaveis; rawOriginal: Record<string, unknown> } {
  if (contentType === "spell") return { campos: { contentType: "spell", campos: { ...vazioCamposMagia(), nome, slug } }, rawOriginal: rawOriginalSpellVazio() };
  if (contentType === "item") return { campos: { contentType: "item", campos: { ...vazioCamposItem(), nome, slug } }, rawOriginal: rawOriginalItemVazio() };
  if (contentType === "rune") return { campos: { contentType: "rune", campos: { ...vazioCamposRuna(), nome, slug } }, rawOriginal: rawOriginalRunaVazio() };
  return { campos: { contentType: "talent", campos: { ...vazioCamposTalento(), nome, slug } }, rawOriginal: rawOriginalTalentoVazio(slug, nome) };
}

async function inserirRascunho(
  campaignId: string,
  contentType: DraftContentType,
  slug: string,
  operation: CampaignContentOperation,
  envelope: CampaignDraftEnvelope,
  admin: { id: string },
  extras: { baseCampaignDocumentId?: string; baseOfficialDocumentId?: string; basePayloadHash?: string; baseOfficialVersion?: string } = {},
): Promise<AcaoCampanhaResultado> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from("campaign_content_drafts")
    .insert({
      campaign_id: campaignId,
      content_type: contentType,
      slug,
      operation,
      base_campaign_document_id: extras.baseCampaignDocumentId ?? null,
      base_official_document_id: extras.baseOfficialDocumentId ?? null,
      base_payload_hash: extras.basePayloadHash ?? null,
      base_official_version: extras.baseOfficialVersion ?? null,
      payload: envelope,
      created_by: admin.id,
      updated_by: admin.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, erro: `Falha ao criar rascunho de campanha: ${error.message}` };
  revalidatePath(`/mesas/${campaignId}/biblioteca`);
  return { ok: true, draftId: data.id as string };
}

// ---------------------------------------------------------------------
// 1. Criar rascunho de OVERRIDE (substitui um oficial só nesta campanha)
// ---------------------------------------------------------------------
export async function criarRascunhoOverride(campaignId: string, contentType: DraftContentType, slugOficial: string): Promise<AcaoCampanhaResultado> {
  try {
    const admin = await requireCampaignNarrator(campaignId);

    const existente = await findCampaignDraftBySlug(campaignId, contentType, slugOficial);
    if (existente) return { ok: true, draftId: existente.id };

    const oficial = await getContentDocument(contentType as ContentType, slugOficial);
    if (!oficial) return { ok: false, erro: "Conteúdo oficial não encontrado." };

    const rawOriginal = (oficial.payload as Record<string, unknown>) ?? {};
    const { camposEditaveis: camposDosAdapters, camposDesconhecidos } = montarCamposECamposDesconhecidosIniciais(contentType, rawOriginal);
    const metadataAtual = oficial.version ? await getEditorMetadataAtual(oficial.id, oficial.version).catch(() => null) : null;
    const camposEditaveis = sobreporMetadataEditorial(camposDosAdapters, metadataAtual);

    const envelope: CampaignDraftEnvelope = {
      schemaVersion: "campaign-draft.v1",
      contentType,
      operation: "novo_override",
      camposEditaveis,
      preservado: { rawOriginal, camposDesconhecidos },
    };

    return inserirRascunho(campaignId, contentType, slugOficial, "novo_override", envelope, admin, {
      baseOfficialDocumentId: oficial.id,
      basePayloadHash: oficial.payload_hash,
      baseOfficialVersion: oficial.version ?? undefined,
    });
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}

// ---------------------------------------------------------------------
// 2. Criar rascunho de CÓPIA HOMEBREW (a partir de um oficial, novo slug local)
// ---------------------------------------------------------------------
export async function criarRascunhoCopiaHomebrew(
  campaignId: string,
  contentType: DraftContentType,
  slugOficial: string,
  novoSlugLocal: string,
  novoNome: string,
): Promise<AcaoCampanhaResultado> {
  try {
    const admin = await requireCampaignNarrator(campaignId);
    const slug = (novoSlugLocal?.trim() || slugify(novoNome)).toLowerCase();
    if (!isValidSlug(slug)) return { ok: false, erro: "Slug inválido." };

    const oficial = await getContentDocument(contentType as ContentType, slugOficial);
    if (!oficial) return { ok: false, erro: "Conteúdo oficial de origem não encontrado." };

    // Identidade nunca reaproveitada: novo slug/nome já embutidos no raw preservado antes de adaptar.
    const rawAjustado: Record<string, unknown> = { ...(oficial.payload as Record<string, unknown>), slug, nome: novoNome };
    if (contentType === "talent" && Array.isArray(rawAjustado.niveis)) {
      rawAjustado.niveis = (rawAjustado.niveis as Record<string, unknown>[]).map((n) => ({ ...n, talento_id: slug }));
    }
    const { camposEditaveis, camposDesconhecidos } = montarCamposECamposDesconhecidosIniciais(contentType, rawAjustado, novoNome, slug);

    const envelope: CampaignDraftEnvelope = {
      schemaVersion: "campaign-draft.v1",
      contentType,
      operation: "copia_homebrew",
      camposEditaveis,
      preservado: { rawOriginal: rawAjustado, camposDesconhecidos },
    };

    // official_document_id registrado só como PROVENIÊNCIA (nunca vínculo de substituição).
    return inserirRascunho(campaignId, contentType, slug, "copia_homebrew", envelope, admin, { baseOfficialDocumentId: oficial.id });
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}

// ---------------------------------------------------------------------
// 3. Criar rascunho de HOMEBREW NOVO (do zero, independente)
// ---------------------------------------------------------------------
export async function criarRascunhoHomebrewNovo(campaignId: string, contentType: DraftContentType, nome: string, slugDesejado?: string): Promise<AcaoCampanhaResultado> {
  try {
    const admin = await requireCampaignNarrator(campaignId);
    if (!nome || nome.trim() === "") return { ok: false, erro: "Nome é obrigatório." };
    const slug = (slugDesejado?.trim() || slugify(nome)).toLowerCase();
    if (!isValidSlug(slug)) return { ok: false, erro: "Slug inválido." };

    const { campos, rawOriginal } = camposEIniciaisVazios(contentType, nome, slug);
    const envelope: CampaignDraftEnvelope = {
      schemaVersion: "campaign-draft.v1",
      contentType,
      operation: "novo_homebrew",
      camposEditaveis: campos,
      preservado: { rawOriginal, camposDesconhecidos: [] },
    };
    return inserirRascunho(campaignId, contentType, slug, "novo_homebrew", envelope, admin);
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}

// ---------------------------------------------------------------------
// 4. Atualizar rascunho de campanha (edição de campos)
// ---------------------------------------------------------------------
export interface AtualizarRascunhoCampanhaResultado {
  ok: boolean;
  erro?: string;
  erros?: string[];
  avisos?: string[];
  conflito?: boolean;
  novaVersao?: number;
}

export async function atualizarRascunhoCampanha(
  draftId: string,
  campos: CamposMagia | CamposItem | CamposRuna | CamposTalento,
  expectedVersion: number,
): Promise<AtualizarRascunhoCampanhaResultado> {
  try {
    const draft = await getCampaignDraftById(draftId);
    if (!draft) return { ok: false, erro: "Rascunho não encontrado." };
    await requireCampaignNarrator(draft.campaign_id);

    if (draft.version !== expectedVersion) {
      return { ok: false, conflito: true, erro: "Este rascunho foi alterado desde que foi carregado. Recarregue antes de salvar." };
    }

    const validacao = await validarCamposCampanha(draft.campaign_id, draft.content_type, draft.operation, campos, draftId);
    if (!validacao.valido) return { ok: false, erros: validacao.erros, avisos: validacao.avisos };

    const novoEnvelope: CampaignDraftEnvelope = { ...draft.payload, camposEditaveis: { contentType: draft.content_type, campos } as CamposEditaveis };

    const client = await getScopedTableClient();
    const { data, error } = await client
      .from("campaign_content_drafts")
      .update({ payload: novoEnvelope, slug: campos.slug, updated_by: (await getCurrentUser())?.id })
      .eq("id", draftId)
      .eq("version", expectedVersion)
      .select("version")
      .maybeSingle();
    if (error) return { ok: false, erro: `Falha ao salvar: ${error.message}` };
    if (!data) return { ok: false, conflito: true, erro: "Conflito de versão detectado ao salvar — recarregue e tente novamente." };

    revalidatePath(`/mesas/${draft.campaign_id}/biblioteca`);
    return { ok: true, avisos: validacao.avisos, novaVersao: data.version as number };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}

// ---------------------------------------------------------------------
// 5. Publicar rascunho de campanha
// ---------------------------------------------------------------------
export interface PublicarCampanhaResultado {
  ok: boolean;
  erro?: string;
  erros?: string[];
  conflito?: boolean;
  campaignContentDocumentId?: string;
  localVersion?: number;
}

export async function publicarRascunhoCampanha(draftId: string, expectedDraftVersion: number, resumo: string): Promise<PublicarCampanhaResultado> {
  try {
    const draft = await getCampaignDraftById(draftId);
    if (!draft) return { ok: false, erro: "Rascunho não encontrado." };
    await requireCampaignNarrator(draft.campaign_id);
    if (!resumo || resumo.trim() === "") return { ok: false, erro: "O resumo é obrigatório." };
    if (draft.version !== expectedDraftVersion) {
      return { ok: false, conflito: true, erro: "O rascunho foi alterado desde a revisão. Recarregue antes de publicar na campanha." };
    }

    const validacao = await validarCamposCampanha(draft.campaign_id, draft.content_type, draft.operation, draft.payload.camposEditaveis.campos, draftId);
    if (!validacao.valido) return { ok: false, erros: validacao.erros };

    // Reaproveita a serialização legada real (Etapa 3/5) — as duas
    // estruturas (draft oficial x draft de campanha) compartilham o
    // mesmo formato de `payload.camposEditaveis`/`payload.preservado`.
    const payloadFinal = serializarRascunhoParaPublicacao(draft as unknown as ContentDraftRow);

    const efeitos = draft.payload.camposEditaveis.contentType === "talent"
      ? (draft.payload.camposEditaveis.campos as CamposTalento).niveis.map((n) => ({ nivel: n.nivel, efeitos: n.efeitos }))
      : (draft.payload.camposEditaveis.campos as { efeitos: unknown[] }).efeitos;

    let officialSnapshot: Record<string, unknown> | null = null;
    if (draft.base_official_document_id) {
      const oficialAtual = await getContentDocument(draft.content_type as ContentType, draft.slug).catch(() => null);
      if (oficialAtual) officialSnapshot = oficialAtual.payload as Record<string, unknown>;
    }

    const client = await getScopedTableClient();
    const { data, error } = await client.rpc("publish_campaign_content_draft", {
      p_draft_id: draftId,
      p_expected_draft_version: expectedDraftVersion,
      p_final_payload: payloadFinal,
      p_metadata_efeitos: efeitos ?? null,
      p_official_snapshot: officialSnapshot,
      p_summary: resumo,
      p_impact: { avisos: validacao.avisos },
    });
    if (error) return { ok: false, erro: `Falha ao publicar na campanha: ${error.message}` };

    revalidatePath(`/mesas/${draft.campaign_id}/biblioteca`);
    const resultado = data as { campaignContentDocumentId: string; localVersion: number };
    return { ok: true, campaignContentDocumentId: resultado.campaignContentDocumentId, localVersion: resultado.localVersion };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}

// ---------------------------------------------------------------------
// 6. Remover override (restaura fallback oficial)
// ---------------------------------------------------------------------
export async function removerOverrideCampanha(campaignContentDocumentId: string, expectedLocalVersion: number, motivo: string): Promise<AcaoCampanhaResultado> {
  try {
    const doc = await getCampaignContentDocumentById(campaignContentDocumentId);
    if (!doc) return { ok: false, erro: "Conteúdo de campanha não encontrado." };
    await requireCampaignNarrator(doc.campaign_id);

    const client = await getScopedTableClient();
    const { error } = await client.rpc("remove_campaign_content_override", {
      p_campaign_content_document_id: campaignContentDocumentId,
      p_expected_local_version: expectedLocalVersion,
      p_reason: motivo,
    });
    if (error) return { ok: false, erro: `Falha ao remover override: ${error.message}` };

    revalidatePath(`/mesas/${doc.campaign_id}/biblioteca`);
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}

// ---------------------------------------------------------------------
// 7. Arquivar homebrew independente
// ---------------------------------------------------------------------
export async function arquivarHomebrewCampanha(campaignContentDocumentId: string, expectedLocalVersion: number, motivo: string): Promise<AcaoCampanhaResultado> {
  try {
    const doc = await getCampaignContentDocumentById(campaignContentDocumentId);
    if (!doc) return { ok: false, erro: "Conteúdo de campanha não encontrado." };
    await requireCampaignNarrator(doc.campaign_id);

    const client = await getScopedTableClient();
    const { error } = await client.rpc("archive_campaign_homebrew", {
      p_campaign_content_document_id: campaignContentDocumentId,
      p_expected_local_version: expectedLocalVersion,
      p_reason: motivo,
    });
    if (error) return { ok: false, erro: `Falha ao arquivar homebrew: ${error.message}` };

    revalidatePath(`/mesas/${doc.campaign_id}/biblioteca`);
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}

// ---------------------------------------------------------------------
// 8. Excluir rascunho de campanha (cancelar sem publicar)
// ---------------------------------------------------------------------
export async function excluirRascunhoCampanha(draftId: string): Promise<AcaoCampanhaResultado> {
  try {
    const draft = await getCampaignDraftById(draftId);
    if (!draft) return { ok: true };
    await requireCampaignNarrator(draft.campaign_id);
    const client = await getScopedTableClient();
    const { error } = await client.from("campaign_content_drafts").delete().eq("id", draftId);
    if (error) return { ok: false, erro: `Falha ao excluir rascunho: ${error.message}` };
    revalidatePath(`/mesas/${draft.campaign_id}/biblioteca`);
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}

// ---------------------------------------------------------------------
// 9. Resolução de atualização oficial — "manter override atual"
//    (só registra a revisão; não altera o payload da campanha).
// ---------------------------------------------------------------------
export async function manterOverrideAposRevisao(campaignContentDocumentId: string): Promise<AcaoCampanhaResultado> {
  try {
    const doc = await getCampaignContentDocumentById(campaignContentDocumentId);
    if (!doc) return { ok: false, erro: "Conteúdo de campanha não encontrado." };
    const admin = await requireCampaignNarrator(doc.campaign_id);
    const oficialAtual = doc.official_document_id ? await getContentDocument(doc.content_type as ContentType, doc.slug).catch(() => null) : null;

    const client = await getScopedTableClient();
    const { error } = await client.from("campaign_content_changelog").insert({
      campaign_id: doc.campaign_id,
      content_type: doc.content_type,
      slug: doc.slug,
      operation: "revisao_mantida",
      local_version: doc.local_version,
      official_version_base: doc.official_version_base,
      official_version_atual: oficialAtual?.version ?? null,
      created_by: admin.id,
      summary: "Narrador manteve o override atual após revisão contra o oficial.",
    });
    if (error) return { ok: false, erro: `Falha ao registrar revisão: ${error.message}` };
    revalidatePath(`/mesas/${doc.campaign_id}/biblioteca`);
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}

/**
 * Adotar o oficial atual: remove o override (mesmo caminho de remoção,
 * decorado com o motivo) — a resolução efetiva volta a ler o oficial
 * diretamente, sem copiar o oficial para uma linha nova.
 */
export async function adotarOficialAtual(campaignContentDocumentId: string, expectedLocalVersion: number): Promise<AcaoCampanhaResultado> {
  return removerOverrideCampanha(campaignContentDocumentId, expectedLocalVersion, "Narrador adotou o oficial atual (revisão de atualização).");
}

/**
 * Criar rascunho de reconciliação: reabre um rascunho de edição de
 * override tendo o override publicado atual como base — a pessoa
 * narradora edita manualmente à vista das três versões (oficial-base,
 * oficial atual, campanha atual) mostradas no preview/diff da UI; a
 * publicação segue o fluxo normal (`publicarRascunhoCampanha`).
 */
export async function criarRascunhoReconciliacao(campaignContentDocumentId: string): Promise<AcaoCampanhaResultado> {
  try {
    const doc = await getCampaignContentDocumentById(campaignContentDocumentId);
    if (!doc) return { ok: false, erro: "Conteúdo de campanha não encontrado." };
    const admin = await requireCampaignNarrator(doc.campaign_id);
    if (doc.origin_type !== "override") return { ok: false, erro: "Reconciliação só se aplica a overrides." };

    const existente = await findCampaignDraftBySlug(doc.campaign_id, doc.content_type, doc.slug);
    if (existente) return { ok: true, draftId: existente.id };

    const { camposEditaveis: camposDosAdapters, camposDesconhecidos } = montarCamposECamposDesconhecidosIniciais(doc.content_type, doc.payload);
    const metadataAtual = await getEditorMetadataAtual(doc.id, String(doc.local_version)).catch(() => null);
    const camposEditaveis = sobreporMetadataEditorial(camposDosAdapters, metadataAtual);

    const envelope: CampaignDraftEnvelope = {
      schemaVersion: "campaign-draft.v1",
      contentType: doc.content_type,
      operation: "resolucao_atualizacao",
      camposEditaveis,
      preservado: { rawOriginal: doc.payload, camposDesconhecidos },
    };

    return inserirRascunho(doc.campaign_id, doc.content_type, doc.slug, "resolucao_atualizacao", envelope, admin, {
      baseCampaignDocumentId: doc.id,
      baseOfficialDocumentId: doc.official_document_id ?? undefined,
      basePayloadHash: doc.payload_hash,
      baseOfficialVersion: doc.official_version_base ?? undefined,
    });
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}

export type { CampaignContentDraftRow };
