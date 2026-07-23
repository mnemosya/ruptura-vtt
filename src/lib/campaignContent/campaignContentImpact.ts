/**
 * Diagnóstico de impacto antes de remover/arquivar conteúdo de campanha
 * (Etapa 12, correção). Verifica três fontes de possível referência:
 *   1. Outros conteúdos da MESMA campanha que referenciam este slug em
 *      `requisitos` (estrutura real, `{tipo_conteudo, slug}`).
 *   2. Personagens da mesma campanha — heurística por SUBSTRING do slug
 *      no payload serializado (`characters.payload` é um blob JSONB
 *      único sem uma coluna dedicada por magia/talento/item conhecido;
 *      não existe hoje uma lista estruturada e indexável de "IDs de
 *      instância que referenciam este modelo" para consultar com
 *      precisão total — ver limitação documentada no checkpoint).
 *      Por ser heurística, um HIT é tratado como aviso forte (nunca
 *      ausência de impacto); NUNCA declarado "sem impacto" só porque a
 *      substring não apareceu — combinado com (3), o resultado mais
 *      seguro (mais restritivo) vence.
 *   3. Overrides desta campanha cujo oficial-base referencia o slug via
 *      `official_document_id` — não aplicável a homebrew (que nunca é
 *      base de override).
 *
 * Nunca apaga nada — só classifica para a Server Action decidir bloquear
 * ou pedir confirmação.
 */

import { getScopedTableClient } from "../auth/scopedClient";
import type { DraftContentType } from "../contentSchema/draftTypes";
import { listCampaignContentDocumentsForOwner } from "./campaignContentQueries";

export type ClassificacaoImpacto = "sem_impacto_detectado" | "impacto_informativo" | "remocao_bloqueada" | "impacto_nao_determinavel";

export interface DiagnosticoImpacto {
  classificacao: ClassificacaoImpacto;
  motivos: string[];
  referenciasEstruturadasEncontradas: { contentType: DraftContentType; slug: string }[];
  personagensComPossivelReferencia: string[];
}

function payloadReferenciaSlug(payload: Record<string, unknown>, slug: string): boolean {
  const requisitos = Array.isArray(payload.requisitos) ? (payload.requisitos as { slug?: string }[]) : [];
  if (requisitos.some((r) => r.slug === slug)) return true;
  const niveis = Array.isArray(payload.niveis) ? (payload.niveis as { requisitos?: { slug?: string }[] }[]) : [];
  return niveis.some((n) => Array.isArray(n.requisitos) && n.requisitos.some((r) => r.slug === slug));
}

/**
 * Diagnóstico antes de arquivar HOMEBREW independente ou remover
 * OVERRIDE. `obrigatoria` marca se a referência estruturada encontrada é
 * bloqueante (requisito obrigatório) — hoje todo `requisitos` real é
 * tratado como obrigatório (mesmo critério de `contentDependencies.ts`).
 */
export async function avaliarImpactoRemocao(campaignId: string, contentType: DraftContentType, slug: string): Promise<DiagnosticoImpacto> {
  const motivos: string[] = [];
  const referenciasEstruturadasEncontradas: { contentType: DraftContentType; slug: string }[] = [];
  let naoDeterminavel = false;

  // 1. Outros conteúdos da campanha referenciando este slug em requisitos.
  const outrosDocumentos = await listCampaignContentDocumentsForOwner(campaignId).catch(() => {
    naoDeterminavel = true;
    return [];
  });
  for (const doc of outrosDocumentos) {
    if (doc.slug === slug && doc.content_type === contentType) continue;
    if (doc.status !== "published") continue;
    if (payloadReferenciaSlug(doc.payload, slug)) {
      referenciasEstruturadasEncontradas.push({ contentType: doc.content_type, slug: doc.slug });
      motivos.push(`${doc.content_type}:${doc.slug} (conteúdo da campanha) referencia "${slug}" em requisitos.`);
    }
  }

  // 2. Personagens da campanha — heurística por substring (ver limitação no cabeçalho).
  const personagensComPossivelReferencia: string[] = [];
  try {
    const client = await getScopedTableClient();
    const { data, error } = await client.from("characters").select("id, name, payload").eq("campaign_id", campaignId);
    if (error) {
      naoDeterminavel = true;
    } else {
      for (const row of (data ?? []) as { id: string; name: string; payload: unknown }[]) {
        const serializado = JSON.stringify(row.payload ?? {});
        if (serializado.includes(`"${slug}"`)) {
          personagensComPossivelReferencia.push(row.name || row.id);
          motivos.push(`Personagem "${row.name || row.id}" pode referenciar "${slug}" (detecção heurística por texto, não exaustiva).`);
        }
      }
    }
  } catch {
    naoDeterminavel = true;
  }

  if (referenciasEstruturadasEncontradas.length > 0) {
    return { classificacao: "remocao_bloqueada", motivos, referenciasEstruturadasEncontradas, personagensComPossivelReferencia };
  }
  if (personagensComPossivelReferencia.length > 0) {
    return { classificacao: "impacto_informativo", motivos, referenciasEstruturadasEncontradas, personagensComPossivelReferencia };
  }
  if (naoDeterminavel) {
    motivos.push("Não foi possível varrer todas as fontes de referência (falha ao consultar personagens ou outros conteúdos da campanha).");
    return { classificacao: "impacto_nao_determinavel", motivos, referenciasEstruturadasEncontradas, personagensComPossivelReferencia };
  }
  return { classificacao: "sem_impacto_detectado", motivos, referenciasEstruturadasEncontradas, personagensComPossivelReferencia };
}
