/**
 * Leitura de conteúdo de campanha (Etapa 12, CORRIGIDO na migration
 * 0026). `*Public` deixou de usar o client anon puro — a RLS de
 * `campaign_content_documents` agora exige `can_read_campaign_content()`
 * (membership real via `campaign_members`/`campaigns.owner_id`), nunca
 * mais "conhecer o campaign_id". Por isso estas funções passaram a usar
 * `getScopedTableClient()` também: SEM sessão autenticada (o caso do
 * jogador anônimo, que não tem `auth.uid()` — ver auditoria da correção),
 * a RLS bloqueia e a função retorna lista vazia/`null` — nunca lança,
 * mas também nunca mais devolve conteúdo de campanha para quem não é
 * membro autenticado. Isso é uma restrição DELIBERADA e documentada: a
 * leitura de conteúdo efetivo de campanha pelo jogador (anônimo) fica
 * bloqueada até existir autenticação real de jogador — o oficial puro
 * continua disponível normalmente (fallback do resolvedor).
 *   - `*ForOwner`: idem, mas para o narrador (published + archived).
 */

import { getScopedTableClient } from "../auth/scopedClient";
import type { ContentType } from "../content/types";
import type { DraftContentType } from "../contentSchema/draftTypes";
import type { CampaignContentChangelogRow, CampaignContentDocumentRow, CampaignContentDraftRow } from "./campaignContentTypes";

/**
 * Auditoria da Fase 5: esta função era a ÚNICA do arquivo que engolia o
 * erro (`if (error) return []`) em vez de lançar como todas as irmãs —
 * e é justamente a base de `resolveEffectiveList`, ou seja, do conteúdo
 * efetivo inteiro da campanha. Consequências reais, todas confirmadas
 * por teste com o GRANT da tabela revogado:
 *   - Livro: "Nenhum capítulo publicado ainda" para uma falha de leitura;
 *   - Livro/[slug]: `notFound()` — um 404 afirmando que o capítulo não
 *     existe, sobre um capítulo que existe;
 *   - Conteúdo da campanha: pior que vazio — os overrides e homebrews
 *     somem da resolução e cada linha passa a se apresentar como
 *     "Oficial", ou seja, procedência ERRADA na exata tela usada para
 *     gerenciá-la.
 * Corrigir na página não bastava: o erro morria aqui, uma camada abaixo.
 */
export async function listCampaignContentDocumentsPublic(campaignId: string, contentType?: ContentType): Promise<CampaignContentDocumentRow[]> {
  const client = await getScopedTableClient();
  let query = client.from("campaign_content_documents").select("*").eq("campaign_id", campaignId).eq("status", "published");
  if (contentType) query = query.eq("content_type", contentType);
  const { data, error } = await query;
  if (error) throw new Error(`Falha ao listar conteúdo publicado da campanha: ${error.message}`);
  return (data ?? []) as CampaignContentDocumentRow[];
}

export async function getCampaignContentDocumentPublic(campaignId: string, contentType: ContentType, slug: string): Promise<CampaignContentDocumentRow | null> {
  const client = await getScopedTableClient();
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

export async function listCampaignContentDocumentsForOwner(campaignId: string, contentType?: ContentType): Promise<CampaignContentDocumentRow[]> {
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

export async function listCampaignChangelog(campaignId: string, contentType?: ContentType, slug?: string): Promise<CampaignContentChangelogRow[]> {
  const client = await getScopedTableClient();
  let query = client.from("campaign_content_changelog").select("*").eq("campaign_id", campaignId).order("created_at", { ascending: false });
  if (contentType) query = query.eq("content_type", contentType);
  if (slug) query = query.eq("slug", slug);
  const { data, error } = await query;
  if (error) throw new Error(`Falha ao listar histórico da campanha: ${error.message}`);
  return (data ?? []) as CampaignContentChangelogRow[];
}
