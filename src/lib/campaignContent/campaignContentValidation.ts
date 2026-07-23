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

async function slugColideNaCampanha(campaignId: string, contentType: DraftContentType, slug: string, ignorarDraftId?: string): Promise<boolean> {
  const publicados = await listCampaignContentDocumentsForOwner(campaignId, contentType);
  if (publicados.some((p) => p.slug === slug && p.status === "published")) return true;
  const draftExistente = await findCampaignDraftBySlug(campaignId, contentType, slug);
  if (draftExistente && draftExistente.id !== ignorarDraftId) return true;
  return false;
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
  for (const req of requisitos) {
    if (req.tipoConteudo === "desconhecido") continue;
    const encontrado = await getContentDocument(req.tipoConteudo as ContentType, req.slug).catch(() => null);
    if (!encontrado) erros.push(`Referência inexistente: ${req.tipoConteudo}:${req.slug}.`);
  }

  const efeitos = "efeitos" in campos ? (campos as { efeitos: unknown[] }).efeitos : ("niveis" in campos ? (campos as { niveis: { efeitos: unknown[] }[] }).niveis.flatMap((n) => n.efeitos) : []);
  const resultadoEfeitos = await validarEfeitosEditaveis(efeitos as Parameters<typeof validarEfeitosEditaveis>[0]);
  erros.push(...resultadoEfeitos.erros.map((e) => `Efeitos: ${e}`));
  avisos.push(...resultadoEfeitos.avisos.map((a) => `Efeitos: ${a}`));
  infos.push(...resultadoEfeitos.infos.map((i) => `Efeitos: ${i}`));

  return { valido: erros.length === 0, erros, avisos, infos };
}
