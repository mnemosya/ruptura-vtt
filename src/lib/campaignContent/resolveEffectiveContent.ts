/**
 * Resolução de conteúdo EFETIVO por campanha (Etapa 12, CORRIGIDO na
 * migration 0026) — o único lugar que decide "qual payload vale para
 * esta campanha": override publicado > conteúdo oficial publicado, mais
 * homebrew publicado como entradas adicionais. Nunca deixa um homebrew
 * independente substituir um oficial só por coincidência de slug — só
 * um `override` (vinculado explicitamente a um `official_document_id`)
 * substitui.
 *
 * Entrada mínima: `campaignId` + `content_type` (+ slug para resolução
 * unitária). Quem chama é responsável por já ter validado que
 * `campaignId` é legítimo para o contexto atual (nunca aceito cru do
 * client quando a campanha puder ser derivada de sessão/personagem) —
 * este módulo não faz autenticação, só resolve dados já escopados.
 *
 * IMPORTANTE (correção da falha estrutural): a leitura de
 * `campaign_content_documents` (via `listCampaignContentDocumentsPublic`/
 * `getCampaignContentDocumentPublic`) agora exige sessão autenticada
 * membro da campanha (RLS `can_read_campaign_content`, migration 0026)
 * — nunca mais aberta por só conhecer o `campaign_id`. Sem sessão (ex.:
 * jogador anônimo, que não tem `auth.uid()` — ver auditoria), essas
 * funções devolvem lista vazia/`null`, e este resolvedor cai
 * SILENCIOSAMENTE para o conteúdo oficial puro — nunca lança, nunca
 * expõe override/homebrew a quem não tem autorização real. É por isso
 * que a leitura de conteúdo efetivo pelo jogador continua uma limitação
 * documentada (não uma feature "que funciona") até existir autenticação
 * real de jogador.
 */

import { getContentDocument, listContentDocuments } from "../content/queries";
import type { ContentDocument, ContentType } from "../content/types";
import { listCampaignContentDocumentsPublic, getCampaignContentDocumentPublic } from "./campaignContentQueries";
import type { CampaignContentDocumentRow, ConteudoEfetivo, EstadoAtualizacaoOficial } from "./campaignContentTypes";

export function classificarEstadoAtualizacao(officialCurrent: ContentDocument | null, versionBase: string | null, hashBase: string | null): EstadoAtualizacaoOficial {
  if (!officialCurrent) return "oficial_arquivado";
  if (versionBase == null || hashBase == null) return "base_ausente";
  if (officialCurrent.version === versionBase && officialCurrent.payload_hash === hashBase) return "atualizado";
  return "oficial_alterado";
}

function paraConteudoEfetivoOficial(contentType: ContentType, doc: ContentDocument): ConteudoEfetivo {
  return { contentType, slug: doc.slug, nome: doc.nome, payload: (doc.payload as Record<string, unknown>) ?? {}, origem: "oficial", officialDocumentId: doc.id, officialVersionAtual: doc.version ?? undefined };
}

function paraConteudoEfetivoCampanha(row: CampaignContentDocumentRow, officialCurrent: ContentDocument | null): ConteudoEfetivo {
  return {
    contentType: row.content_type,
    slug: row.slug,
    nome: row.nome,
    payload: row.payload,
    origem: row.origin_type === "override" ? "modificado_pela_mesa" : "homebrew_da_mesa",
    campaignContentDocumentId: row.id,
    officialDocumentId: row.official_document_id ?? undefined,
    officialVersionAtual: officialCurrent?.version ?? undefined,
    localVersion: row.local_version,
    estadoAtualizacao: row.origin_type === "override" ? classificarEstadoAtualizacao(officialCurrent, row.official_version_base, row.official_hash_base) : undefined,
  };
}

/**
 * Lista o conteúdo EFETIVO de um tipo para uma campanha: cada oficial
 * publicado, substituído por override quando existir, mais os
 * homebrews publicados da campanha como entradas adicionais.
 */
export async function resolveEffectiveList(campaignId: string, contentType: ContentType): Promise<ConteudoEfetivo[]> {
  const [oficiais, campanhaRows] = await Promise.all([
    listContentDocuments(contentType as ContentType),
    listCampaignContentDocumentsPublic(campaignId, contentType),
  ]);

  const overridesPorSlug = new Map(campanhaRows.filter((r) => r.origin_type === "override").map((r) => [r.slug, r]));
  const homebrews = campanhaRows.filter((r) => r.origin_type === "homebrew");

  const efetivos: ConteudoEfetivo[] = oficiais.map((doc) => {
    const override = overridesPorSlug.get(doc.slug);
    return override ? paraConteudoEfetivoCampanha(override, doc) : paraConteudoEfetivoOficial(contentType, doc);
  });

  for (const homebrew of homebrews) {
    efetivos.push(paraConteudoEfetivoCampanha(homebrew, null));
  }

  return efetivos;
}

/** Resolução unitária: override da campanha > homebrew local com esse slug > oficial. */
export async function resolveEffectiveOne(campaignId: string, contentType: ContentType, slug: string): Promise<ConteudoEfetivo | null> {
  const campanhaRow = await getCampaignContentDocumentPublic(campaignId, contentType, slug);
  if (campanhaRow) {
    const officialCurrent = campanhaRow.official_document_id ? await getContentDocument(contentType as ContentType, slug).catch(() => null) : null;
    return paraConteudoEfetivoCampanha(campanhaRow, officialCurrent);
  }
  const oficial = await getContentDocument(contentType as ContentType, slug);
  return oficial ? paraConteudoEfetivoOficial(contentType, oficial) : null;
}

/**
 * Wrapper para os 4 catálogos consumidos pela ficha/mesa
 * (`listSpells`/`listTalents`/`listItems`/`listRunes`) — quando
 * `campaignId` é `null` (ficha dev sem contexto de mesa), cai para o
 * catálogo oficial puro, comportamento IDÊNTICO ao que já existia antes
 * desta etapa. Nunca escolhe uma campanha por inferência.
 */
async function listEffectiveOrOfficial(contentType: ContentType, campaignId: string | null): Promise<ConteudoEfetivo[]> {
  if (!campaignId) {
    const oficiais = await listContentDocuments(contentType);
    return oficiais.map((doc) => paraConteudoEfetivoOficial(contentType, doc));
  }
  return resolveEffectiveList(campaignId, contentType);
}

export const listSpellsEffective = (campaignId: string | null) => listEffectiveOrOfficial("spell", campaignId);
export const listTalentsEffective = (campaignId: string | null) => listEffectiveOrOfficial("talent", campaignId);
export const listItemsEffective = (campaignId: string | null) => listEffectiveOrOfficial("item", campaignId);
export const listRunesEffective = (campaignId: string | null) => listEffectiveOrOfficial("rune", campaignId);
/** Checkpoint pós-v0.94 (fase 10) — capítulos publicados para a Biblioteca do Livro (leitura). */
export const listCapitulosEffective = (campaignId: string | null) => listEffectiveOrOfficial("capitulo", campaignId);
/** Catálogo de modelos de drone/robô (fonte: docs/fontes/DRONES E ROBÔS....md) consumido pela ficha. */
export const listCompanionModelsEffective = (campaignId: string | null) => listEffectiveOrOfficial("companion_model", campaignId);
