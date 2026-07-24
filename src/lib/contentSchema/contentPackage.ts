/**
 * Contrato versionado de pacote de importação/exportação (Etapa 11).
 *
 * Auditoria (ver checkpoint): `content_packs` já existe, mas é um
 * registro de LINHAGEM (qual pipeline produziu um `content_document`),
 * não um contrato de pacote de arquivo — nunca reaproveitado como tal
 * aqui. Este é um contrato NOVO, versionado desde o início.
 *
 * Nomenclatura: `"ruptura-content-package"`, versão inteira `1` — segue
 * o padrão do projeto (schemas oficiais usam `versao`/`_schema` como
 * string versionada; aqui optamos por inteiro simples porque não há
 * necessidade de semver para um contrato de transporte único).
 */

import { isDraftContentType, type DraftContentType, type DraftOrigemLegado } from "./draftTypes";

export const CONTENT_PACKAGE_FORMATO = "ruptura-content-package" as const;
export const CONTENT_PACKAGE_VERSAO_ATUAL = 1;
/** Versão mínima de FORMATO que este importador aceita — nunca aceita versão futura desconhecida. */
export const CONTENT_PACKAGE_VERSAO_MINIMA_SUPORTADA = 1;
/** Versão máxima de FORMATO conhecida por este importador — rejeita qualquer versão maior (nunca interpreta "por tentativa"). */
export const CONTENT_PACKAGE_VERSAO_MAXIMA_CONHECIDA = 1;

/** Content types read-only exportáveis (inspeção), além dos 4 editáveis. Espelha `ContentType` (`content/types.ts`) menos os 4 editáveis. */
export const CONTENT_TYPES_SOMENTE_LEITURA = [
  "master_table",
  "character_rule",
  "combat_field",
  "combat_flow",
  "combat_action",
  "condition",
  "property",
  "escalpo",
] as const;
export type ContentTypeSomenteLeitura = (typeof CONTENT_TYPES_SOMENTE_LEITURA)[number];

export type ContentTypePacote = DraftContentType | ContentTypeSomenteLeitura;

export type EscopoPacote = "documento_unico" | "selecao" | "lote_filtrado";

export interface ManifestPacote {
  formato: typeof CONTENT_PACKAGE_FORMATO;
  versaoFormato: number;
  versaoMinimaImportador: number;
  exportadoEm: string;
  origem: string;
  escopo: EscopoPacote;
  quantidadeDocumentos: number;
  hashManifest?: string;
  avisos: string[];
}

export const ESTADOS_RESOLUCAO_DEPENDENCIA = [
  "resolvida_no_pacote",
  "resolvida_na_biblioteca",
  "ausente",
  "ambigua",
  "incompativel",
  "opcional_nao_resolvida",
] as const;
export type EstadoResolucaoDependencia = (typeof ESTADOS_RESOLUCAO_DEPENDENCIA)[number];

export interface DependenciaPacote {
  tipo: string;
  slugOuId: string;
  obrigatoria: boolean;
  incluida: boolean;
  versaoConhecida?: string;
  estadoResolucao: EstadoResolucaoDependencia;
}

export interface VinculoEditorialPacote {
  capitulo: string;
  secao?: string;
  ancora?: string;
  rotulo?: string;
  tipoVinculo: string;
  principal: boolean;
  urlExterna?: string;
  ordem: number;
}

export interface DocumentoPacote {
  contentType: ContentTypePacote;
  slug: string;
  versaoPublicada?: string;
  versaoSchema?: string;
  statusOrigem: "published" | "archived";
  payloadPublico: Record<string, unknown>;
  hashPayload: string;
  dependencias: DependenciaPacote[];
  /** `EfeitoEditavel[]` (ou por-nível, para talento) — só quando existir metadata real; nunca fabricado. */
  metadataEditorial?: unknown;
  versaoAdapter?: string;
  origemLegado?: DraftOrigemLegado;
  vinculosEditoriais: VinculoEditorialPacote[];
}

export interface ContentPackage {
  manifest: ManifestPacote;
  documentos: DocumentoPacote[];
}

/**
 * Editável pelo Editor Universal hoje — reaproveita `isDraftContentType`
 * (única fonte de verdade, `draftTypes.ts`) em vez de duplicar a lista
 * aqui. Antes da correção do drag editorial (Etapa 11), esta função
 * duplicava a lista como `spell|talent|item|rune` — divergiu
 * silenciosamente de `DraftContentType` assim que "capitulo" foi
 * adicionado, classificando um 5º tipo editável como somente-leitura.
 */
export function ehContentTypeEditavel(tipo: ContentTypePacote): tipo is DraftContentType {
  return isDraftContentType(tipo);
}

export interface ErroValidacaoPacote {
  caminho: string;
  mensagem: string;
}

/**
 * Validação estrutural mínima do MANIFEST (sintaxe/versão) — não valida
 * ainda os documentos individuais (isso é `validarDocumentoPacote`,
 * em `packageImport.ts`, que também roda contra os schemas oficiais).
 * Pura, sem I/O — roda igual no preview e na confirmação (recalculada
 * no servidor sempre, nunca confiando no que o client mandou).
 */
export function validarManifestPacote(valor: unknown): { ok: true; manifest: ManifestPacote } | { ok: false; erros: ErroValidacaoPacote[] } {
  const erros: ErroValidacaoPacote[] = [];
  if (typeof valor !== "object" || valor === null) {
    return { ok: false, erros: [{ caminho: "manifest", mensagem: "Manifest ausente ou não é um objeto." }] };
  }
  const m = valor as Record<string, unknown>;
  if (m.formato !== CONTENT_PACKAGE_FORMATO) {
    erros.push({ caminho: "manifest.formato", mensagem: `Formato desconhecido: "${String(m.formato)}" (esperado "${CONTENT_PACKAGE_FORMATO}").` });
  }
  if (typeof m.versaoFormato !== "number" || !Number.isInteger(m.versaoFormato)) {
    erros.push({ caminho: "manifest.versaoFormato", mensagem: "Versão do formato ausente ou inválida (precisa ser um inteiro)." });
  } else if (m.versaoFormato > CONTENT_PACKAGE_VERSAO_MAXIMA_CONHECIDA) {
    erros.push({
      caminho: "manifest.versaoFormato",
      mensagem: `Versão do pacote (${m.versaoFormato}) é mais nova do que este importador suporta (máx. ${CONTENT_PACKAGE_VERSAO_MAXIMA_CONHECIDA}). Atualize o importador antes de tentar novamente — nunca interpretado por tentativa.`,
    });
  } else if (m.versaoFormato < CONTENT_PACKAGE_VERSAO_MINIMA_SUPORTADA) {
    erros.push({ caminho: "manifest.versaoFormato", mensagem: `Versão do pacote (${m.versaoFormato}) é anterior ao mínimo suportado (${CONTENT_PACKAGE_VERSAO_MINIMA_SUPORTADA}).` });
  }
  if (typeof m.exportadoEm !== "string" || Number.isNaN(Date.parse(m.exportadoEm))) {
    erros.push({ caminho: "manifest.exportadoEm", mensagem: "Data de exportação ausente ou inválida." });
  }
  if (typeof m.quantidadeDocumentos !== "number" || m.quantidadeDocumentos < 0) {
    erros.push({ caminho: "manifest.quantidadeDocumentos", mensagem: "Quantidade de documentos ausente ou inválida." });
  }
  if (erros.length > 0) return { ok: false, erros };
  return { ok: true, manifest: m as unknown as ManifestPacote };
}
