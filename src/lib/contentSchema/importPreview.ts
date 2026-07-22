/**
 * Classificação de preview de importação (Etapa 11) — pura, sem I/O.
 * Recebe dados já buscados pelo chamador (publicado atual, rascunho
 * existente, resultado da validação de schema/referências) e devolve
 * uma classificação + razão. Roda IGUAL no preview e na confirmação —
 * o servidor sempre recalcula a partir do estado atual do banco, nunca
 * confia na classificação computada pelo client.
 */

import { hashCanonico } from "./canonicalHash";
import { ehContentTypeEditavel, type DependenciaPacote, type DocumentoPacote } from "./contentPackage";

export const CLASSIFICACOES_DOCUMENTO_IMPORTADO = [
  "novo",
  "identico",
  "atualizacao",
  "conflito_com_publicado",
  "conflito_com_rascunho",
  "referencia_ausente",
  "schema_invalido",
  "tipo_nao_editavel",
  "versao_nao_suportada",
  "incompativel",
  "bloqueado",
] as const;
export type ClassificacaoDocumentoImportado = (typeof CLASSIFICACOES_DOCUMENTO_IMPORTADO)[number];

export interface PreviewDocumentoImportado {
  contentType: DocumentoPacote["contentType"];
  slug: string;
  classificacao: ClassificacaoDocumentoImportado;
  motivo: string;
  /** `true` quando este documento pode virar rascunho se a pessoa administradora confirmar. */
  podeConfirmar: boolean;
  hashImportado: string;
  hashAtualPublicado?: string;
  versaoPublicadaAtual?: string;
  temRascunhoExistente: boolean;
  dependenciasNaoResolvidas: DependenciaPacote[];
  errosSchema: string[];
}

export interface EstadoAtualDocumento {
  publicado: { version: string | null; payload: Record<string, unknown>; payload_hash: string } | null;
  rascunhoExistenteId: string | null;
}

/**
 * Classifica UM documento do pacote contra o estado atual real da
 * Biblioteca. `errosSchemaOficial`/`dependenciasResolvidas` já vêm
 * calculados pelo chamador (schema oficial roda contra o payload real,
 * dependências já foram cruzadas contra o pacote + Biblioteca).
 */
export function classificarDocumentoImportado(params: {
  documento: DocumentoPacote;
  versaoFormatoSuportada: boolean;
  errosSchemaOficial: string[];
  dependencias: DependenciaPacote[];
  estadoAtual: EstadoAtualDocumento;
}): PreviewDocumentoImportado {
  const { documento, versaoFormatoSuportada, errosSchemaOficial, dependencias, estadoAtual } = params;
  const hashImportado = hashCanonico(documento.payloadPublico);
  const dependenciasNaoResolvidas = dependencias.filter(
    (d) => d.obrigatoria && (d.estadoResolucao === "ausente" || d.estadoResolucao === "ambigua" || d.estadoResolucao === "incompativel"),
  );

  const base: Omit<PreviewDocumentoImportado, "classificacao" | "motivo" | "podeConfirmar"> = {
    contentType: documento.contentType,
    slug: documento.slug,
    hashImportado,
    hashAtualPublicado: estadoAtual.publicado?.payload_hash,
    versaoPublicadaAtual: estadoAtual.publicado?.version ?? undefined,
    temRascunhoExistente: estadoAtual.rascunhoExistenteId !== null,
    dependenciasNaoResolvidas,
    errosSchema: errosSchemaOficial,
  };

  if (!versaoFormatoSuportada) {
    return { ...base, classificacao: "versao_nao_suportada", motivo: "Versão do formato do pacote não é suportada por este importador.", podeConfirmar: false };
  }
  if (!ehContentTypeEditavel(documento.contentType)) {
    return { ...base, classificacao: "tipo_nao_editavel", motivo: `Tipo "${documento.contentType}" ainda não tem editor completo — inspeção disponível, edição/rascunho não são criados pelo Editor Universal.`, podeConfirmar: false };
  }
  if (errosSchemaOficial.length > 0) {
    return { ...base, classificacao: "schema_invalido", motivo: `Payload não é válido contra o schema oficial (${errosSchemaOficial.length} erro(s)).`, podeConfirmar: false };
  }
  if (dependenciasNaoResolvidas.length > 0) {
    return { ...base, classificacao: "referencia_ausente", motivo: `${dependenciasNaoResolvidas.length} referência(s) obrigatória(s) não resolvida(s).`, podeConfirmar: false };
  }
  if (estadoAtual.rascunhoExistenteId) {
    return { ...base, classificacao: "conflito_com_rascunho", motivo: "Já existe um rascunho ativo para este tipo/slug — confirme explicitamente para decidir o que fazer (esta etapa não cria um segundo rascunho nem sobrescreve o existente automaticamente).", podeConfirmar: false };
  }
  if (!estadoAtual.publicado) {
    return { ...base, classificacao: "novo", motivo: "Nenhum conteúdo publicado nem rascunho existente para este tipo/slug — pode ser criado como rascunho novo.", podeConfirmar: true };
  }

  const hashAtualRecomputado = hashCanonico(estadoAtual.publicado.payload);
  if (hashAtualRecomputado === hashImportado) {
    return { ...base, classificacao: "identico", motivo: "Conteúdo publicado atual é idêntico ao importado (mesmo hash canônico) — nada a fazer.", podeConfirmar: false };
  }

  // Pacote foi exportado de uma versão publicada mais antiga do que a atual — a
  // mesma regra de "base desatualizada" já usada pelo fluxo normal de publicação
  // (`publish_content_draft`: base_payload_hash precisa bater com o publicado atual).
  if (documento.versaoPublicada && estadoAtual.publicado.version && documento.versaoPublicada !== estadoAtual.publicado.version) {
    return {
      ...base,
      classificacao: "conflito_com_publicado",
      motivo: `O pacote foi exportado da versão ${documento.versaoPublicada}, mas a versão publicada atual é ${estadoAtual.publicado.version} — o conteúdo publicado mudou desde a exportação. Revise as diferenças antes de confirmar.`,
      podeConfirmar: true,
    };
  }

  return { ...base, classificacao: "atualizacao", motivo: "Conteúdo publicado existe e difere do importado — pode virar rascunho de edição com o publicado atual como base.", podeConfirmar: true };
}
