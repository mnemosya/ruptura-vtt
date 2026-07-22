"use server";

/**
 * Exportação de pacote de conteúdo (Etapa 11) — admin-only, gera o
 * contrato versionado (`contentPackage.ts`) a partir de `content_documents`
 * PUBLICADO. Nunca inclui: dados de sessão/personagem/campanha/mesa,
 * segredos, IDs de autenticação — só o payload público + metadata
 * editorial da MESMA versão publicada (nunca de outra) + dependências +
 * vínculos editoriais.
 *
 * Escopo unitário e por seleção explícita — nunca "exportar tudo" num
 * único clique implícito (a chamada sempre recebe a lista exata de
 * (contentType, slug) a incluir).
 */

import { getContentAdminStatus } from "../auth/contentAdmin";
import { getContentDocumentForAdmin } from "./adminQueries";
import type { ContentType } from "../content/types";
import { listBookLinksForDocument } from "./bookLinksQueries";
import { hashCanonico } from "./canonicalHash";
import {
  CONTENT_PACKAGE_FORMATO,
  CONTENT_PACKAGE_VERSAO_ATUAL,
  CONTENT_PACKAGE_VERSAO_MINIMA_SUPORTADA,
  ehContentTypeEditavel,
  type ContentPackage,
  type ContentTypePacote,
  type DocumentoPacote,
  type EscopoPacote,
  type VinculoEditorialPacote,
} from "./contentPackage";
import { coletarReferenciasBrutas, resolverDependencias } from "./contentDependencies";
import { getEditorMetadataAtual } from "./editorMetadataQueries";

async function requireAdmin(): Promise<{ id: string; email: string | null }> {
  const status = await getContentAdminStatus();
  if (!status.user) throw new Error("Não autenticado.");
  if (!status.isAdmin) throw new Error("Sem acesso administrativo à Biblioteca.");
  return status.user;
}

export interface ItemSelecaoExportacao {
  contentType: ContentTypePacote;
  slug: string;
}

export interface ResultadoExportacao {
  ok: boolean;
  erro?: string;
  pacote?: ContentPackage;
  nomeArquivo?: string;
}

async function montarDocumentoPacote(
  contentType: ContentTypePacote,
  slug: string,
  slugsNoPacote: Set<string>,
): Promise<{ documento: DocumentoPacote; avisos: string[] } | { erro: string }> {
  const avisos: string[] = [];
  const publicado = await getContentDocumentForAdmin(contentType as ContentType, slug);
  if (!publicado || publicado.status !== "published") {
    return { erro: `Nenhum conteúdo PUBLICADO encontrado para ${contentType}:${slug}.` };
  }

  const payloadPublico = (publicado.payload as Record<string, unknown>) ?? {};
  const hashPayload = hashCanonico(payloadPublico);

  let metadataEditorial: unknown | undefined;
  if (ehContentTypeEditavel(contentType) && publicado.version) {
    const metadata = await getEditorMetadataAtual(publicado.id, publicado.version).catch(() => null);
    if (metadata) metadataEditorial = metadata;
    else avisos.push(`${contentType}:${slug} — sem metadata editorial completa para a versão ${publicado.version} (payload público exportado normalmente; importação futura usará o adapter legado).`);
  }

  const brutas = coletarReferenciasBrutas(payloadPublico);
  const dependencias = resolverDependencias(brutas, slugsNoPacote, (tipo, refSlug) => {
    // Resolução contra a Biblioteca publicada real acontece de forma best-effort e síncrona
    // não é possível aqui sem I/O extra por dependência — marcamos como "ausente" por padrão,
    // o importador (que roda no destino) é quem faz a resolução real contra o SEU catálogo.
    void tipo;
    void refSlug;
    return "ausente";
  });

  const vinculos = await listBookLinksForDocument(publicado.id).catch(() => []);
  const vinculosEditoriais: VinculoEditorialPacote[] = vinculos.map((v) => ({
    capitulo: v.capitulo,
    secao: v.secao ?? undefined,
    ancora: v.ancora ?? undefined,
    rotulo: v.rotulo ?? undefined,
    tipoVinculo: v.tipo_vinculo,
    principal: v.principal,
    urlExterna: v.url_externa ?? undefined,
    ordem: v.ordem,
  }));

  const documento: DocumentoPacote = {
    contentType,
    slug,
    versaoPublicada: publicado.version ?? undefined,
    statusOrigem: "published",
    payloadPublico,
    hashPayload,
    dependencias,
    metadataEditorial,
    vinculosEditoriais,
  };
  return { documento, avisos };
}

/**
 * Exportação unitária (tela de detalhe de conteúdo publicado): 1 documento
 * + sua metadata editorial (da versão correspondente) + dependências +
 * vínculos editoriais.
 */
export async function exportarDocumentoUnico(contentType: ContentTypePacote, slug: string): Promise<ResultadoExportacao> {
  try {
    await requireAdmin();
    const resultado = await montarDocumentoPacote(contentType, slug, new Set([`${contentType}:${slug}`]));
    if ("erro" in resultado) return { ok: false, erro: resultado.erro };

    const pacote: ContentPackage = {
      manifest: {
        formato: CONTENT_PACKAGE_FORMATO,
        versaoFormato: CONTENT_PACKAGE_VERSAO_ATUAL,
        versaoMinimaImportador: CONTENT_PACKAGE_VERSAO_MINIMA_SUPORTADA,
        exportadoEm: new Date().toISOString(),
        origem: "ruptura-vtt-admin",
        escopo: "documento_unico" as EscopoPacote,
        quantidadeDocumentos: 1,
        avisos: resultado.avisos,
      },
      documentos: [resultado.documento],
    };
    pacote.manifest.hashManifest = hashCanonico(pacote.documentos);

    return { ok: true, pacote, nomeArquivo: `ruptura-content-package_${contentType}_${slug}.json` };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}

/** Limite de itens por exportação em lote — evita degradar paginação/busca e memória do processo. Documentado no checkpoint. */
const LIMITE_ITENS_LOTE = 200;

/**
 * Exportação por seleção explícita (nunca implícita de página não
 * carregada). `itens` é dedupado e ordenado deterministicamente antes de
 * montar o pacote.
 */
export async function exportarSelecao(itens: ItemSelecaoExportacao[]): Promise<ResultadoExportacao> {
  try {
    await requireAdmin();
    if (itens.length === 0) return { ok: false, erro: "Nenhum documento selecionado." };
    if (itens.length > LIMITE_ITENS_LOTE) {
      return { ok: false, erro: `Seleção excede o limite de ${LIMITE_ITENS_LOTE} documentos por exportação em lote.` };
    }

    const chaves = new Set<string>();
    const dedupados: ItemSelecaoExportacao[] = [];
    for (const item of itens) {
      const chave = `${item.contentType}:${item.slug}`;
      if (chaves.has(chave)) continue;
      chaves.add(chave);
      dedupados.push(item);
    }
    dedupados.sort((a, b) => (a.contentType === b.contentType ? a.slug.localeCompare(b.slug) : a.contentType.localeCompare(b.contentType)));

    const slugsNoPacote = new Set(dedupados.map((i) => `${i.contentType}:${i.slug}`));
    const documentos: DocumentoPacote[] = [];
    const avisos: string[] = [];
    for (const item of dedupados) {
      const resultado = await montarDocumentoPacote(item.contentType, item.slug, slugsNoPacote);
      if ("erro" in resultado) return { ok: false, erro: resultado.erro };
      documentos.push(resultado.documento);
      avisos.push(...resultado.avisos);
    }

    // Avisa (sem bloquear) sobre dependências obrigatórias fora do pacote — a pessoa
    // administradora decide se inclui explicitamente antes de exportar de novo.
    for (const doc of documentos) {
      for (const dep of doc.dependencias) {
        if (dep.obrigatoria && !dep.incluida) {
          avisos.push(`${doc.contentType}:${doc.slug} depende de ${dep.tipo}:${dep.slugOuId}, que não está incluído neste pacote.`);
        }
      }
    }

    const pacote: ContentPackage = {
      manifest: {
        formato: CONTENT_PACKAGE_FORMATO,
        versaoFormato: CONTENT_PACKAGE_VERSAO_ATUAL,
        versaoMinimaImportador: CONTENT_PACKAGE_VERSAO_MINIMA_SUPORTADA,
        exportadoEm: new Date().toISOString(),
        origem: "ruptura-vtt-admin",
        escopo: "selecao" as EscopoPacote,
        quantidadeDocumentos: documentos.length,
        avisos,
      },
      documentos,
    };
    pacote.manifest.hashManifest = hashCanonico(pacote.documentos);

    return { ok: true, pacote, nomeArquivo: `ruptura-content-package_selecao_${documentos.length}documentos.json` };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}
