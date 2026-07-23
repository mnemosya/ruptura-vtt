/**
 * Diagnóstico de impacto antes de remover/arquivar conteúdo de campanha
 * (Etapa 12, correção 2). Verifica três fontes de possível referência:
 *   1. O ÍNDICE ESTRUTURADO `campaign_content_references` (migration
 *      0027, recalculado a cada publicação) — quem, dentro desta
 *      campanha, declara este (tipo, slug) como dependência. Preciso,
 *      não heurístico. Cobertura real: apenas o que
 *      `coletarReferenciasParaIndice`/`coletarReferenciasBrutas`
 *      conseguem extrair hoje (requisitos, condição em efeitos,
 *      propriedades de item) — documentado como não-exaustivo.
 *   2. Personagens da mesma campanha — heurística por SUBSTRING do slug
 *      no payload serializado (`characters.payload` é um blob JSONB
 *      único sem uma coluna dedicada por magia/talento/item conhecido;
 *      não existe hoje uma lista estruturada e indexável de "IDs de
 *      instância que referenciam este modelo" — limitação real,
 *      documentada, não escondida). Por ser heurística, um HIT nunca
 *      bloqueia sozinho — só informa; o resultado mais restritivo entre
 *      (1) e (2) vence.
 *
 * Nunca apaga nada — só classifica para a Server Action decidir bloquear
 * ou pedir confirmação.
 */

import { getScopedTableClient } from "../auth/scopedClient";
import type { DraftContentType } from "../contentSchema/draftTypes";

export type ClassificacaoImpacto = "sem_impacto_detectado" | "impacto_informativo" | "remocao_bloqueada" | "impacto_nao_determinavel";

export interface DiagnosticoImpacto {
  classificacao: ClassificacaoImpacto;
  motivos: string[];
  referenciasEstruturadasEncontradas: { contentType: DraftContentType; slug: string }[];
  personagensComPossivelReferencia: string[];
}

/**
 * Diagnóstico antes de arquivar HOMEBREW independente ou remover
 * OVERRIDE. `obrigatoria` marca se a referência estruturada encontrada é
 * bloqueante — reflete `required` já calculado por
 * `coletarReferenciasParaIndice` no momento da publicação da ORIGEM.
 */
export async function avaliarImpactoRemocao(campaignId: string, contentType: DraftContentType, slug: string): Promise<DiagnosticoImpacto> {
  const motivos: string[] = [];
  const referenciasEstruturadasEncontradas: { contentType: DraftContentType; slug: string }[] = [];
  let naoDeterminavel = false;

  // 1. Índice estruturado — quem referencia este (tipo, slug) hoje, dentro desta campanha.
  try {
    const client = await getScopedTableClient();
    const { data, error } = await client
      .from("campaign_content_references")
      .select("source_content_type, source_slug, required")
      .eq("campaign_id", campaignId)
      .eq("target_content_type", contentType)
      .eq("target_slug", slug);
    if (error) {
      naoDeterminavel = true;
    } else {
      for (const row of (data ?? []) as { source_content_type: DraftContentType; source_slug: string; required: boolean }[]) {
        if (!row.required) continue;
        referenciasEstruturadasEncontradas.push({ contentType: row.source_content_type, slug: row.source_slug });
        motivos.push(`${row.source_content_type}:${row.source_slug} (conteúdo da campanha) referencia "${slug}" como dependência obrigatória (índice estruturado).`);
      }
    }
  } catch {
    naoDeterminavel = true;
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
