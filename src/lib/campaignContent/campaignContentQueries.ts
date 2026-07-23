/**
 * Leitura de conteúdo de campanha (Etapa 12). Duas famílias de função:
 *   - `*Public`: client anon puro (`getContentClient`) — mesmo modelo de
 *     confiança já usado por characters/campaign_profiles/table_logs
 *     (conhecer o `campaign_id` é o que "protege" a mesa hoje, não uma
 *     checagem de identidade real de jogador — ver migration 0025).
 *     Só enxerga `status = 'published'`.
 *   - `*ForOwner`: client scoped (sessão do narrador) — enxerga
 *     published + archived, reforçado pela RLS
 *     `campaign_content_documents_owner_read_all`.
 */

import { getContentClient } from "../content/client";
import { getScopedTableClient } from "../auth/scopedClient";
import type { DraftContentType } from "../contentSchema/draftTypes";
import type { CampaignContentChangelogRow, CampaignContentDocumentRow, CampaignContentDraftRow } from "./campaignContentTypes";

export async function listCampaignContentDocumentsPublic(campaignId: string, contentType?: DraftContentType): Promise<CampaignContentDocumentRow[]> {
  const client = getContentClient();
  let query = client.from("campaign_content_documents").select("*").eq("campaign_id", campaignId).eq("status", "published");
  if (contentType) query = query.eq("content_type", contentType);
  const { data, error } = await query;
  if (error) throw new Error(`Falha ao listar conteúdo efetivo da campanha: ${error.message}`);
  return (data ?? []) as CampaignContentDocumentRow[];
}

export async function getCampaignContentDocumentPublic(campaignId: string, contentType: DraftContentType, slug: string): Promise<CampaignContentDocumentRow | null> {
  const client = getContentClient();
  const { data, error } = await client
    .from("campaign_content_documents")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("content_type", contentType)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar conteúdo efetivo da campanha: ${error.message}`);
  return (data as CampaignContentDocumentRow | null) ?? null;
}

export async function listCampaignContentDocumentsForOwner(campaignId: string, contentType?: DraftContentType): Promise<CampaignContentDocumentRow[]> {
  const client = await getScopedTableClient();
  let query = client.from("campaign_content_documents").select("*").eq("campaign_id", campaignId).order("updated_at", { ascending: false });
  if (contentType) query = query.eq("content_type", contentType);
  const { data, error } = await query;
  if (error) throw new Error(`Falha ao listar conteúdo da campanha (narrador): ${error.message}`);
  return (data ?? []) as CampaignContentDocumentRow[];
}

export async function getCampaignContentDocumentById(id: string): Promise<CampaignContentDocumentRow | null> {
  const client = await getScopedTableClient();
  const { data, error } = await client.from("campaign_content_documents").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha ao buscar conteúdo da campanha ${id}: ${error.message}`);
  return (data as CampaignContentDocumentRow | null) ?? null;
}

export async function listCampaignDrafts(campaignId: string): Promise<CampaignContentDraftRow[]> {
  const client = await getScopedTableClient();
  const { data, error } = await client.from("campaign_content_drafts").select("*").eq("campaign_id", campaignId).order("updated_at", { ascending: false });
  if (error) throw new Error(`Falha ao listar rascunhos da campanha: ${error.message}`);
  return (data ?? []) as CampaignContentDraftRow[];
}

export async function getCampaignDraftById(id: string): Promise<CampaignContentDraftRow | null> {
  const client = await getScopedTableClient();
  const { data, error } = await client.from("campaign_content_drafts").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha ao buscar rascunho de campanha ${id}: ${error.message}`);
  return (data as CampaignContentDraftRow | null) ?? null;
}

export async function findCampaignDraftBySlug(campaignId: string, contentType: DraftContentType, slug: string): Promise<CampaignContentDraftRow | null> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from("campaign_content_drafts")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("content_type", contentType)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar rascunho de campanha por slug: ${error.message}`);
  return (data as CampaignContentDraftRow | null) ?? null;
}

export async function listCampaignChangelog(campaignId: string, contentType?: DraftContentType, slug?: string): Promise<CampaignContentChangelogRow[]> {
  const client = await getScopedTableClient();
  let query = client.from("campaign_content_changelog").select("*").eq("campaign_id", campaignId).order("created_at", { ascending: false });
  if (contentType) query = query.eq("content_type", contentType);
  if (slug) query = query.eq("slug", slug);
  const { data, error } = await query;
  if (error) throw new Error(`Falha ao listar histórico da campanha: ${error.message}`);
  return (data ?? []) as CampaignContentChangelogRow[];
}
