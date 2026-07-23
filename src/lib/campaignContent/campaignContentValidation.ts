/**
 * Validação de campos editáveis no escopo de CAMPANHA (Etapa 12).
 *
 * Não reaproveita `validarCamposMagia`/`validarCamposItem`/etc. (Etapa
 * 3) diretamente porque a checagem de colisão de slug delas é
 * INCOMPATÍVEL aqui: um `override` precisa necessariamente ter o MESMO
 * slug do oficial que substitui — a validação oficial rejeitaria isso
 * como "já existe conteúdo publicado com esse slug". Este módulo faz a
 * MESMA validação estrutural (nome/slug/custos/efeitos, reaproveitando
 * `validarEfeitosEditaveis` da Etapa 4 sem duplicar), mas com uma regra
 * de slug própria do escopo de campanha.
 */

import { getContentDocument } from "../content/queries";
import type { ContentType } from "../content/types";
import type { CamposComuns, CamposEditaveis, DraftContentType } from "../contentSchema/draftTypes";
import { validarEfeitosEditaveis } from "../contentSchema/effectDraftValidation";
import { isValidSlug } from "../contentSchema/slug";
import type { ResultadoValidacao } from "../contentSchema/types";
import { findCampaignDraftBySlug, listCampaignContentDocumentsForOwner } from "./campaignContentQueries";
import type { CampaignContentOperation } from "./campaignContentTypes";
import { validarQuantidadeEfeitos, validarQuantidadeReferencias, validarTamanhoPayload, validarTamanhoTexto } from "./campaignContentLimits";

async function slugColideNaCampanha(campaignId: string, contentType: DraftContentType, slug: string, ignorarDraftId?: string): Promise<boolean> {
  const publicados = await listCampaignContentDocumentsForOwner(campaignId, contentType);
  if (publicados.some((p) => p.slug === slug && p.status === "published")) return true;
  const draftExistente = await findCampaignDraftBySlug(campaignId, contentType, slug);
  if (draftExistente && draftExistente.id !== ignorarDraftId) return true;
  return false;
}

/**
 * Resolve uma referência (`requisitos[]`) contra o catálogo OFICIAL
 * primeiro; quando ausente lá, contra o conteúdo PUBLICADO da MESMA
 * campanha (homebrew local pode ser dependência válida de outro
 * homebrew/override da mesma mesa) — nunca contra outra campanha (a
 * consulta só busca `campaign_id = campaignId`, então uma referência
 * para outra campanha estruturalmente não tem como resolver aqui).
 * Conteúdo arquivado nunca satisfaz uma referência nova.
 */
async function resolverReferenciaCampanha(
  campaignId: string,
  tipoConteudo: string,
  slug: string,
  publicadosCampanha: { content_type: string; slug: string; status: string }[],
): Promise<boolean> {
  const oficial = await getContentDocument(tipoConteudo as ContentType, slug).catch(() => null);
  if (oficial) return true;
  return publicadosCampanha.some((p) => p.content_type === tipoConteudo && p.slug === slug && p.status === "published");
}

/**
 * Valida os campos comuns + custos + requisitos + efeitos. A regra de
 * slug depende da operação:
 *   - `novo_override`/`edicao_override`: slug DEVE bater com o oficial
 *     vinculado (checado por quem chama, que já conhece o oficial) —
 *     aqui só validamos formato, nunca colisão (colidir com o próprio
 *     oficial é o comportamento correto de um override).
 *   - demais operações (homebrew): slug não pode colidir com outro
 *     homebrew/override da MESMA campanha nem com um oficial publicado
 *     (evita ambiguidade referencial) — nunca comparado contra rascunhos
 *     OFICIAIS de outra campanha ou do catálogo global.
 */
export async function validarCamposCampanha(
  campaignId: string,
  contentType: DraftContentType,
  operation: CampaignContentOperation,
  campos: CamposEditaveis["campos"],
  draftId?: string,
): Promise<ResultadoValidacao> {
  const erros: string[] = [];
  const avisos: string[] = [];
  const infos: string[] = [];

  const comuns = campos as CamposComuns;
  if (!comuns.nome || comuns.nome.trim() === "") erros.push("Nome é obrigatório.");
  if (!comuns.slug || comuns.slug.trim() === "") {
    erros.push("Slug é obrigatório.");
  } else if (!isValidSlug(comuns.slug)) {
    erros.push('Slug inválido — use letras minúsculas, números e "_", começando por letra.');
  } else if (operation !== "novo_override" && operation !== "edicao_override" && operation !== "resolucao_atualizacao") {
    const oficialColide = await getContentDocument(contentType as ContentType, comuns.slug).catch(() => null);
    if (oficialColide) erros.push(`Já existe conteúdo OFICIAL publicado com o slug "${comuns.slug}" — escolha outro para o homebrew local.`);
    else if (await slugColideNaCampanha(campaignId, contentType, comuns.slug, draftId)) {
      erros.push(`Já existe outro conteúdo da campanha com o slug "${comuns.slug}".`);
    }
  }
  if (!comuns.descricaoCurta) avisos.push("Sem descrição curta.");

  if ("custoPa" in campos && typeof (campos as { custoPa?: number }).custoPa === "number" && (campos as { custoPa?: number }).custoPa! < 0) {
    erros.push("Custo de PA não pode ser negativo.");
  }
  if ("preco" in campos && typeof (campos as { preco?: number }).preco === "number" && (campos as { preco?: number }).preco! < 0) {
    erros.push("Preço não pode ser negativo.");
  }

  const requisitos = (campos as { requisitos?: { tipoConteudo: string; slug: string }[] }).requisitos ?? [];
  const limiteRefs = validarQuantidadeReferencias(requisitos);
  if (!limiteRefs.ok) erros.push(limiteRefs.erro!);

  if (requisitos.length > 0) {
    const publicadosCampanha = await listCampaignContentDocumentsForOwner(campaignId).catch(() => []);
    for (const req of requisitos) {
      if (req.tipoConteudo === "desconhecido") continue;
      const resolvida = await resolverReferenciaCampanha(campaignId, req.tipoConteudo, req.slug, publicadosCampanha);
      if (!resolvida) erros.push(`Referência inexistente (nem no oficial, nem na campanha): ${req.tipoConteudo}:${req.slug}.`);
    }
  }

  const efeitos = "efeitos" in campos ? (campos as { efeitos: unknown[] }).efeitos : ("niveis" in campos ? (campos as { niveis: { efeitos: unknown[] }[] }).niveis.flatMap((n) => n.efeitos) : []);
  const limiteEfeitos = validarQuantidadeEfeitos(efeitos);
  if (!limiteEfeitos.ok) erros.push(limiteEfeitos.erro!);

  const limiteTextoCurto = validarTamanhoTexto(comuns.descricaoCurta, "Descrição curta");
  if (!limiteTextoCurto.ok) erros.push(limiteTextoCurto.erro!);
  const limiteTextoLongo = validarTamanhoTexto(comuns.descricaoLonga, "Descrição longa");
  if (!limiteTextoLongo.ok) erros.push(limiteTextoLongo.erro!);

  const limitePayload = validarTamanhoPayload(campos);
  if (!limitePayload.ok) erros.push(limitePayload.erro!);

  const resultadoEfeitos = await validarEfeitosEditaveis(efeitos as Parameters<typeof validarEfeitosEditaveis>[0]);
  erros.push(...resultadoEfeitos.erros.map((e) => `Efeitos: ${e}`));
  avisos.push(...resultadoEfeitos.avisos.map((a) => `Efeitos: ${a}`));
  infos.push(...resultadoEfeitos.infos.map((i) => `Efeitos: ${i}`));

  return { valido: erros.length === 0, erros, avisos, infos };
}
