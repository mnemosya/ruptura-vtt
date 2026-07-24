"use server";

/**
 * Importação de pacote de conteúdo (Etapa 11) — admin-only, cria SOMENTE
 * rascunhos (`content_drafts`, via o RPC transacional `import_content_drafts`,
 * migration 0024). Nunca publica, nunca escreve em `content_documents`,
 * nunca sobrescreve um rascunho existente silenciosamente.
 *
 * Disciplina de confiança: o client pode mandar o pacote JSON já
 * parseado (para preview rápido na tela), mas a CONFIRMAÇÃO sempre
 * recalcula manifest/hash/schema/dependências/classificação a partir do
 * zero contra o estado atual do banco — nunca confia na classificação,
 * hash ou diff computados no preview anterior.
 */

import { getContentAdminStatus } from "../auth/contentAdmin";
import { getContentDocumentForAdmin } from "./adminQueries";
import type { ContentType } from "../content/types";
import { getScopedTableClient } from "../auth/scopedClient";
import { hashCanonico } from "./canonicalHash";
import {
  CONTENT_TYPES_SOMENTE_LEITURA,
  ehContentTypeEditavel,
  validarManifestPacote,
  type ContentPackage,
  type ContentTypePacote,
  type DocumentoPacote,
  type ErroValidacaoPacote,
} from "./contentPackage";
import { coletarReferenciasBrutas, resolverDependencias } from "./contentDependencies";
import { montarCamposECamposDesconhecidosIniciais, sobreporMetadataEditorial } from "./draftBuilders";
import { findDraftBySlug } from "./draftQueries";
import { isDraftContentType, type DraftEnvelope } from "./draftTypes";
import { findConfirmedSessionByHash } from "./importSessionQueries";
import { classificarDocumentoImportado, type EstadoAtualDocumento, type PreviewDocumentoImportado } from "./importPreview";
import { validarContraSchemaOficial } from "./officialSchemaValidator";

async function requireAdmin(): Promise<{ id: string; email: string | null }> {
  const status = await getContentAdminStatus();
  if (!status.user) throw new Error("Não autenticado.");
  if (!status.isAdmin) throw new Error("Sem acesso administrativo à Biblioteca.");
  return status.user;
}

// Limites documentados no checkpoint — evitam processar payload excessivo antes da validação cara.
const LIMITE_TAMANHO_ARQUIVO_BYTES = 5 * 1024 * 1024; // 5 MB
const LIMITE_DOCUMENTOS_POR_PACOTE = 200;

const TIPOS_SOMENTE_LEITURA_SET = new Set<string>(CONTENT_TYPES_SOMENTE_LEITURA);

// Antes da correção do drag editorial (Etapa 11), a checagem aqui
// duplicava os 4 tipos editáveis por nome (`["spell","talent","item","rune"]`)
// em vez de reaproveitar `isDraftContentType` — divergiu silenciosamente
// assim que "capitulo" foi adicionado a `DraftContentType`, rejeitando a
// importação de um capítulo real com "Tipo de conteúdo desconhecido"
// (mesma classe de bug já corrigida em `contentPackage.ts::ehContentTypeEditavel`).
function ehTipoDeConteudoValido(tipo: string): tipo is ContentTypePacote {
  return isDraftContentType(tipo) || TIPOS_SOMENTE_LEITURA_SET.has(tipo);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Validação estrutural bruta do JSON recebido (sintaxe já garantida por
 * quem chamou via `JSON.parse`) — manifest + forma mínima de cada
 * documento + INTEGRIDADE do hash declarado (recomputado aqui; um hash
 * que não bate indica corrupção/adulteração do arquivo).
 */
export async function validarPacoteBruto(
  raw: unknown,
  tamanhoBytes: number,
): Promise<{ ok: true; pacote: ContentPackage } | { ok: false; erros: ErroValidacaoPacote[] }> {
  if (tamanhoBytes > LIMITE_TAMANHO_ARQUIVO_BYTES) {
    return { ok: false, erros: [{ caminho: "arquivo", mensagem: `Arquivo excede o limite de ${LIMITE_TAMANHO_ARQUIVO_BYTES / (1024 * 1024)} MB.` }] };
  }
  if (!isRecord(raw)) return { ok: false, erros: [{ caminho: "$", mensagem: "Pacote não é um objeto JSON válido." }] };

  const manifestResultado = validarManifestPacote(raw.manifest);
  if (!manifestResultado.ok) return { ok: false, erros: manifestResultado.erros };

  const documentosBrutos = raw.documentos;
  if (!Array.isArray(documentosBrutos)) return { ok: false, erros: [{ caminho: "documentos", mensagem: "Campo \"documentos\" ausente ou não é uma lista." }] };
  if (documentosBrutos.length !== manifestResultado.manifest.quantidadeDocumentos) {
    return { ok: false, erros: [{ caminho: "manifest.quantidadeDocumentos", mensagem: "Quantidade declarada no manifest não bate com o número real de documentos no pacote." }] };
  }
  if (documentosBrutos.length > LIMITE_DOCUMENTOS_POR_PACOTE) {
    return { ok: false, erros: [{ caminho: "documentos", mensagem: `Pacote excede o limite de ${LIMITE_DOCUMENTOS_POR_PACOTE} documentos.` }] };
  }

  const documentos: DocumentoPacote[] = [];
  const erros: ErroValidacaoPacote[] = [];
  documentosBrutos.forEach((docBruto, i) => {
    if (!isRecord(docBruto)) {
      erros.push({ caminho: `documentos[${i}]`, mensagem: "Documento não é um objeto." });
      return;
    }
    const contentType = docBruto.contentType;
    const slug = docBruto.slug;
    const payloadPublico = docBruto.payloadPublico;
    const hashPayload = docBruto.hashPayload;
    if (typeof contentType !== "string" || !ehTipoDeConteudoValido(contentType)) {
      erros.push({ caminho: `documentos[${i}].contentType`, mensagem: `Tipo de conteúdo desconhecido: "${String(contentType)}".` });
      return;
    }
    if (typeof slug !== "string" || slug.trim() === "") {
      erros.push({ caminho: `documentos[${i}].slug`, mensagem: "Slug ausente ou inválido." });
      return;
    }
    if (!isRecord(payloadPublico)) {
      erros.push({ caminho: `documentos[${i}].payloadPublico`, mensagem: "Payload público ausente ou não é um objeto." });
      return;
    }
    if (typeof hashPayload !== "string" || hashPayload.trim() === "") {
      erros.push({ caminho: `documentos[${i}].hashPayload`, mensagem: "Hash do payload ausente." });
      return;
    }
    const hashRecomputado = hashCanonico(payloadPublico);
    if (hashRecomputado !== hashPayload) {
      erros.push({
        caminho: `documentos[${i}].hashPayload`,
        mensagem: `Hash declarado não bate com o hash recomputado do payload — o pacote pode estar corrompido ou adulterado (${contentType}:${slug}).`,
      });
      return;
    }
    documentos.push({
      contentType: contentType as ContentTypePacote,
      slug,
      versaoPublicada: typeof docBruto.versaoPublicada === "string" ? docBruto.versaoPublicada : undefined,
      versaoSchema: typeof docBruto.versaoSchema === "string" ? docBruto.versaoSchema : undefined,
      statusOrigem: docBruto.statusOrigem === "archived" ? "archived" : "published",
      payloadPublico,
      hashPayload,
      dependencias: Array.isArray(docBruto.dependencias) ? (docBruto.dependencias as DocumentoPacote["dependencias"]) : [],
      metadataEditorial: docBruto.metadataEditorial,
      versaoAdapter: typeof docBruto.versaoAdapter === "string" ? docBruto.versaoAdapter : undefined,
      vinculosEditoriais: Array.isArray(docBruto.vinculosEditoriais) ? (docBruto.vinculosEditoriais as DocumentoPacote["vinculosEditoriais"]) : [],
    });
  });

  if (erros.length > 0) return { ok: false, erros };
  return { ok: true, pacote: { manifest: manifestResultado.manifest, documentos } };
}

export interface ResultadoPreviewImportacao {
  ok: boolean;
  erro?: string;
  previews?: PreviewDocumentoImportado[];
  avisosManifest?: string[];
}

/**
 * Gera o preview — SEMPRE recalculado contra o estado real do banco
 * (nunca usa a classificação vinda do client). Roda igual na tela de
 * preview e de novo na confirmação (defesa em profundidade).
 */
export async function gerarPreviewImportacao(pacote: ContentPackage): Promise<ResultadoPreviewImportacao> {
  try {
    await requireAdmin();

    const slugsNoPacote = new Set(pacote.documentos.map((d) => `${d.contentType}:${d.slug}`));

    const previews: PreviewDocumentoImportado[] = [];
    for (const documento of pacote.documentos) {
      const publicado = await getContentDocumentForAdmin(documento.contentType as ContentType, documento.slug).catch(() => null);
      const rascunhoExistente = ehContentTypeEditavel(documento.contentType)
        ? await findDraftBySlug(documento.contentType, documento.slug).catch(() => null)
        : null;

      const errosSchemaOficial = ehContentTypeEditavel(documento.contentType)
        ? validarContraSchemaOficial(documento.contentType, documento.payloadPublico).erros
        : [];

      const brutas = coletarReferenciasBrutas(documento.payloadPublico);
      const resolvidasContraBiblioteca = new Map<string, "resolvida_na_biblioteca" | "ausente">();
      for (const ref of brutas) {
        const chave = `${ref.tipo}:${ref.slugOuId}`;
        if (slugsNoPacote.has(chave) || resolvidasContraBiblioteca.has(chave)) continue;
        if (ehTipoDeConteudoValido(ref.tipo)) {
          const encontrado = await getContentDocumentForAdmin(ref.tipo as ContentType, ref.slugOuId).catch(() => null);
          resolvidasContraBiblioteca.set(chave, encontrado ? "resolvida_na_biblioteca" : "ausente");
        } else {
          resolvidasContraBiblioteca.set(chave, "ausente");
        }
      }
      const dependencias = resolverDependencias(brutas, slugsNoPacote, (tipo, slug) => {
        return resolvidasContraBiblioteca.get(`${tipo}:${slug}`) ?? "ausente";
      });

      const estadoAtual: EstadoAtualDocumento = {
        publicado: publicado ? { version: publicado.version, payload: (publicado.payload as Record<string, unknown>) ?? {}, payload_hash: publicado.payload_hash } : null,
        rascunhoExistenteId: rascunhoExistente?.id ?? null,
      };

      previews.push(
        classificarDocumentoImportado({
          documento,
          versaoFormatoSuportada: true, // manifest já validado antes de chegar aqui (validarPacoteBruto)
          errosSchemaOficial,
          dependencias,
          estadoAtual,
        }),
      );
    }

    return { ok: true, previews, avisosManifest: pacote.manifest.avisos };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}

export type DecisaoImportacao = "confirmar" | "ignorar";

export interface ResultadoConfirmacaoImportacao {
  ok: boolean;
  erro?: string;
  sessionId?: string;
  draftIds?: string[];
  ignorados?: string[];
}

/**
 * Confirma a importação: recalcula TUDO de novo a partir do pacote +
 * banco (nunca confia nas decisões/hash/preview que o client mandou de
 * "achado"), monta 1 rascunho por documento confirmado e chama o RPC
 * transacional — ou tudo entra, ou nada entra (nenhum rascunho órfão em
 * caso de erro no meio).
 */
export async function confirmarImportacao(
  pacote: ContentPackage,
  decisoes: Record<string, DecisaoImportacao>,
  nomeArquivo: string,
): Promise<ResultadoConfirmacaoImportacao> {
  try {
    const admin = await requireAdmin();

    const hashPacotePrevio = hashCanonico(pacote.documentos);
    const sessaoExistente = await findConfirmedSessionByHash(hashPacotePrevio).catch(() => null);
    if (sessaoExistente) {
      return {
        ok: true,
        sessionId: sessaoExistente.id,
        draftIds: sessaoExistente.rascunhos_criados,
        ignorados: sessaoExistente.resumo_documentos.map((d) => `${d.contentType}:${d.slug}`),
      };
    }

    const preview = await gerarPreviewImportacao(pacote);
    if (!preview.ok || !preview.previews) return { ok: false, erro: preview.erro ?? "Falha ao recalcular o preview no momento da confirmação." };

    const ignorados: string[] = [];
    const documentosParaCriar: {
      content_type: string;
      slug: string;
      base_document_id: string | null;
      base_payload_hash: string | null;
      payload: DraftEnvelope;
    }[] = [];

    for (const item of preview.previews) {
      const chave = `${item.contentType}:${item.slug}`;
      const decisao = decisoes[chave] ?? "ignorar";
      if (decisao === "ignorar" || item.classificacao === "identico") {
        ignorados.push(chave);
        continue;
      }
      if (!item.podeConfirmar) {
        return { ok: false, erro: `Documento ${chave} não pode ser confirmado (classificação: ${item.classificacao}) — ${item.motivo}` };
      }

      const documento = pacote.documentos.find((d) => `${d.contentType}:${d.slug}` === chave);
      if (!documento || !ehContentTypeEditavel(documento.contentType)) {
        return { ok: false, erro: `Documento ${chave} não é um tipo editável — importação só cria rascunho para os 4 tipos editáveis.` };
      }

      const { camposEditaveis: camposDosAdapters, camposDesconhecidos } = montarCamposECamposDesconhecidosIniciais(documento.contentType, documento.payloadPublico);
      const camposEditaveis = sobreporMetadataEditorial(camposDosAdapters, Array.isArray(documento.metadataEditorial) ? (documento.metadataEditorial as unknown[]) : null);

      const envelope: DraftEnvelope = {
        schemaVersion: "draft.v1",
        contentType: documento.contentType,
        camposEditaveis,
        preservado: { rawOriginal: documento.payloadPublico, camposDesconhecidos },
      };

      documentosParaCriar.push({
        content_type: documento.contentType,
        slug: documento.slug,
        base_document_id: item.hashAtualPublicado ? `${documento.contentType}:${documento.slug}` : null,
        base_payload_hash: item.hashAtualPublicado ?? null,
        payload: envelope,
      });
    }

    if (documentosParaCriar.length === 0) {
      return { ok: false, erro: "Nenhum documento confirmado para importação (todos ignorados ou idênticos)." };
    }

    const hashPacote = hashCanonico(pacote.documentos);
    const resumoDocumentos = preview.previews.map((p) => ({ contentType: p.contentType, slug: p.slug, classificacao: p.classificacao }));
    const conflitos = preview.previews.filter((p) => p.classificacao === "conflito_com_publicado" || p.classificacao === "conflito_com_rascunho");

    const client = await getScopedTableClient();
    const { data, error } = await client.rpc("import_content_drafts", {
      p_documentos: documentosParaCriar,
      p_nome_arquivo: nomeArquivo,
      p_hash_pacote: hashPacote,
      p_versao_formato: pacote.manifest.versaoFormato,
      p_resumo_documentos: resumoDocumentos,
      p_decisoes: decisoes,
      p_conflitos: conflitos,
      p_avisos: pacote.manifest.avisos,
      p_manifest: pacote.manifest,
    });

    if (error) return { ok: false, erro: `Falha ao confirmar importação: ${error.message}` };

    void admin;
    const resultado = data as { sessionId: string; draftIds: string[] };
    return { ok: true, sessionId: resultado.sessionId, draftIds: resultado.draftIds, ignorados };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}
