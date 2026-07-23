/**
 * Índice estruturado de referências de conteúdo de campanha (Etapa 12,
 * correções 2/3/4 — `campaign_content_references`, migrations
 * 0027/0028/0029).
 *
 * Reaproveita `coletarReferenciasBrutas` (Etapa 11,
 * `contentSchema/contentDependencies.ts`) — a MESMA extração já usada
 * para pacotes de importação/exportação — para nunca duplicar a lógica
 * de "quais campos são referência real" (requisitos de topo/nível,
 * `condicao`/`condicoes_possiveis` em efeitos, `estatisticas.propriedades`
 * de item). A correção 3 ADICIONOU (aqui, não em `contentDependencies.ts`
 * — módulo compartilhado com a Etapa 11, não alterado): `item_slug` de
 * `conceder_item`/`consumir_item` (campo real confirmado em
 * `effectLegacySerialization.ts`).
 *
 * AUDITORIA DA CORREÇÃO 4 (famílias que o pedido listava como
 * pendentes — cada uma investigada no código real, não presumida):
 *
 *   - **Efeitos compostos/filhos (`teste_resistencia`/
 *     `efeito_com_resistencia`)**: `serializarArvoreTesteResistencia`
 *     (`effectLegacySerialization.ts`) achata a árvore em OBJETOS
 *     IRMÃOS no MESMO array `payload_automacao.efeitos[]` (nunca um
 *     `resultados[].efeitos[]` aninhado no payload público final — a
 *     árvore só existe no modelo em memória do editor). Ou seja: um
 *     `aplicar_condicao`/`conceder_item` dentro de um resultado JÁ é
 *     escaneado pelo loop de topo existente — **não era uma lacuna de
 *     extração, era uma suposição incorreta sobre o formato**. Nenhum
 *     código novo foi necessário.
 *   - **`modificar_instancia`**: auditado (`CamposModificarInstancia`)
 *     — só tem `operacao`/`valor`/`limite`, sempre modifica a PRÓPRIA
 *     instância do item que carrega o efeito (MIT/PD/munição atual),
 *     nunca um slug de outro conteúdo. Confirmado: não é uma
 *     referência de conteúdo, é auto-referência implícita.
 *   - **Instalar/remover/ativar runa como efeito**: auditado — não
 *     existe esse tipo no catálogo de efeitos; runas são instaladas
 *     via operação de inventário (`installRuneOnItem`/
 *     `removeRuneFromItem`/`toggleInstalledRune`, `inventory.ts`),
 *     nunca por um efeito com slug de outra runa.
 *   - **`efeito_temporario`**: auditado (`CamposEfeitoTemporario`) — só
 *     duração/acúmulo/modificadores simples, nenhum campo de slug.
 *   - Runa referenciada por slug fora de `estatisticas.propriedades`,
 *     `modeloReferencia` de companheiro/Trama (texto livre por design,
 *     auditoria da Etapa 10): confirmados ausentes, não uma lacuna.
 *
 * Cobertura real e completa no escopo que o schema atual comporta:
 * requisitos, condição em efeitos (incluindo dentro de árvores de
 * teste/resistência, por já estarem achatadas), propriedades de item,
 * item concedido/consumido. Nenhuma família adicional de referência
 * real foi encontrada nesta auditoria.
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

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** conceder_item/consumir_item serializam `item_slug` (confirmado em effectLegacySerialization.ts) — item é sempre opcional (nunca bloqueia publicação por si só, mesmo critério de propriedades de item). */
function coletarItemSlugsDeEfeitos(efeitos: unknown[]): { tipo: string; slugOuId: string; obrigatoria: boolean }[] {
  const refs: { tipo: string; slugOuId: string; obrigatoria: boolean }[] = [];
  for (const efeitoBruto of efeitos) {
    const efeito = asRecord(efeitoBruto);
    if (!efeito) continue;
    if ((efeito.tipo === "conceder_item" || efeito.tipo === "consumir_item") && typeof efeito.item_slug === "string" && efeito.item_slug.trim() !== "") {
      refs.push({ tipo: "item", slugOuId: efeito.item_slug, obrigatoria: false });
    }
  }
  return refs;
}

/** Exportada para verificação focada (é pura — sem I/O). */
export function coletarItemSlugsDoPayload(payload: Record<string, unknown>): { tipo: string; slugOuId: string; obrigatoria: boolean }[] {
  const refs: { tipo: string; slugOuId: string; obrigatoria: boolean }[] = [];
  const automacao = asRecord(payload.payload_automacao);
  if (automacao) refs.push(...coletarItemSlugsDeEfeitos(asArray(automacao.efeitos)));
  for (const nivel of asArray(payload.niveis)) {
    const n = asRecord(nivel);
    const automacaoNivel = n && asRecord(n.payload_automacao);
    if (automacaoNivel) refs.push(...coletarItemSlugsDeEfeitos(asArray(automacaoNivel.efeitos)));
  }
  return refs;
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
  const brutas = [...coletarReferenciasBrutas(payload), ...coletarItemSlugsDoPayload(payload)];
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
    // publicação nesse caso quando obrigatória — este coletor só
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
