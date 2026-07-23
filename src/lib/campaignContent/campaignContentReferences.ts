/**
 * Índice estruturado de referências de conteúdo de campanha (Etapa 12,
 * correção 2 — `campaign_content_references`, migration 0027).
 *
 * Reaproveita `coletarReferenciasBrutas` (Etapa 11,
 * `contentSchema/contentDependencies.ts`) — a MESMA extração já usada
 * para pacotes de importação/exportação — para nunca duplicar a lógica
 * de "quais campos são referência real" (requisitos de topo/nível,
 * `condicao`/`condicoes_possiveis` em efeitos, `estatisticas.propriedades`
 * de item). Cobertura HONESTA: isto NÃO ainda inclui item concedido
 * (`conceder_item`), runa referenciada explicitamente fora de
 * `estatisticas.propriedades`, nem dependências dentro de efeitos
 * compostos/companheiro — documentado como limitação real no checkpoint,
 * não fingido como suporte universal.
 */

import { getContentDocument } from "../content/queries";
import type { ContentType } from "../content/types";
import { coletarReferenciasBrutas } from "../contentSchema/contentDependencies";
import { isDraftContentType } from "../contentSchema/draftTypes";
import { getCampaignContentDocumentPublic, listCampaignContentDocumentsForOwner } from "./campaignContentQueries";

export interface ReferenciaParaIndice {
  targetScope: "official" | "campaign";
  targetContentType: string;
  targetSlug: string;
  targetOfficialId?: string;
  targetCampaignContentId?: string;
  required: boolean;
  path: string;
}

/**
 * Coleta e resolve as referências de um payload público, prontas para
 * persistir no índice (`campaign_content_references`) na publicação.
 * Resolve OFICIAL primeiro; se ausente lá, tenta a MESMA campanha
 * (nunca outra) — nunca escolhe ambiguidade automaticamente: quando o
 * mesmo (tipo, slug) existir nos dois escopos, o oficial vence (mesma
 * regra de `resolverReferenciaCampanha`).
 */
export async function coletarReferenciasParaIndice(campaignId: string, payload: Record<string, unknown>): Promise<ReferenciaParaIndice[]> {
  const brutas = coletarReferenciasBrutas(payload);
  if (brutas.length === 0) return [];

  const publicadosCampanha = await listCampaignContentDocumentsForOwner(campaignId).catch(() => []);
  const referencias: ReferenciaParaIndice[] = [];

  for (const ref of brutas) {
    const oficial = await getContentDocument(ref.tipo as ContentType, ref.slugOuId).catch(() => null);
    if (oficial) {
      referencias.push({
        targetScope: "official",
        targetContentType: ref.tipo,
        targetSlug: ref.slugOuId,
        targetOfficialId: oficial.id,
        required: ref.obrigatoria,
        path: `requisitos.${ref.tipo}:${ref.slugOuId}`,
      });
      continue;
    }
    const local = publicadosCampanha.find((p) => p.content_type === ref.tipo && p.slug === ref.slugOuId && p.status === "published");
    if (local) {
      referencias.push({
        targetScope: "campaign",
        targetContentType: ref.tipo,
        targetSlug: ref.slugOuId,
        targetCampaignContentId: local.id,
        required: ref.obrigatoria,
        path: `requisitos.${ref.tipo}:${ref.slugOuId}`,
      });
    }
    // Nem oficial nem campanha: `validarCamposCampanha` já bloqueia a
    // publicação nesse caso (referência inexistente) — este coletor só
    // registra o que de fato resolve.
  }
  return referencias;
}

/** Usado por telas administrativas — confirma se um (tipo,slug) específico já resolve nesta campanha (oficial ou local). Nunca usado para autorização. */
export async function referenciaResolveNaCampanha(campaignId: string, tipoConteudo: string, slug: string): Promise<boolean> {
  const oficial = await getContentDocument(tipoConteudo as ContentType, slug).catch(() => null);
  if (oficial) return true;
  if (!isDraftContentType(tipoConteudo)) return false;
  const local = await getCampaignContentDocumentPublic(campaignId, tipoConteudo, slug).catch(() => null);
  return Boolean(local);
}
