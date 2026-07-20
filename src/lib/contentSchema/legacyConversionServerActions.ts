"use server";

/**
 * Fluxo de conversão de conteúdo legado (Etapa 6) — só entra em jogo
 * quando "Criar rascunho de edição" é acionado sobre conteúdo publicado
 * SEM `content_editor_metadata` para a versão atual (conteúdo seedado
 * antes do Editor Universal, ou nunca editado por esta via desde a
 * correção da Etapa 5).
 *
 * Disciplina igual à dos demais server actions:
 *   - reverifica admin no servidor;
 *   - RECALCULA o relatório de conversão no servidor — nunca confia em
 *     classificação/decisões vindas do client, mesmo que o client só
 *     exiba o que este mesmo código gerou;
 *   - nunca altera o conteúdo publicado;
 *   - bloqueia a criação do rascunho quando o relatório aponta perda
 *     inevitável (`bloqueado`) ou faltam confirmações para campos
 *     ambíguos.
 */

import { getContentAdminStatus } from "../auth/contentAdmin";
import { getScopedTableClient } from "../auth/scopedClient";
import { getContentDocument } from "../content/queries";
import type { ContentType } from "../content/types";
import {
  adaptarRawItem,
  adaptarRawSpell,
  adaptarRawTalento,
  extrairCamposItem,
  extrairCamposMagia,
  extrairCamposTalento,
} from "./draftMapping";
import { findDraftBySlug, getDraftById } from "./draftQueries";
import type { CamposEditaveis, DraftContentType, DraftEnvelope, DraftOrigemLegado } from "./draftTypes";
import { getEditorMetadataAtual } from "./editorMetadataQueries";
import { ADAPTER_VERSIONS, caminhosPendentesDeConfirmacao, gerarRelatorioItem, gerarRelatorioSpell, gerarRelatorioTalento, type RelatorioConversaoLegado } from "./legacyConversion";
import type { Referencia } from "./types";

async function requireAdmin(): Promise<{ id: string; email: string | null }> {
  const status = await getContentAdminStatus();
  if (!status.user) throw new Error("Não autenticado.");
  if (!status.isAdmin) throw new Error("Sem acesso administrativo à Biblioteca.");
  return status.user;
}

function gerarRelatorio(contentType: DraftContentType, slug: string, raw: Record<string, unknown>): RelatorioConversaoLegado {
  if (contentType === "spell") return gerarRelatorioSpell(slug, raw);
  if (contentType === "item") return gerarRelatorioItem(slug, raw);
  return gerarRelatorioTalento(slug, raw);
}

export interface ReferenciaVerificada {
  caminho: string;
  referencia: Referencia;
  obrigatoria: boolean;
  existe: boolean;
}

export interface DiagnosticoConversaoResultado {
  ok: boolean;
  erro?: string;
  temMetadataEditorial?: boolean;
  relatorio?: RelatorioConversaoLegado;
  referenciasVerificadas?: ReferenciaVerificada[];
  pendentesDeConfirmacao?: string[];
}

/**
 * Diagnóstico de conversão — sem side-effects, pode ser chamado antes
 * de qualquer confirmação. Também usado pela tela de revisão para
 * reexibir o estado atual.
 */
export async function diagnosticarConversaoLegado(contentType: DraftContentType, slug: string): Promise<DiagnosticoConversaoResultado> {
  try {
    await requireAdmin();

    const publicado = await getContentDocument(contentType as ContentType, slug);
    if (!publicado) return { ok: false, erro: "Conteúdo publicado não encontrado." };

    const metadata = publicado.version ? await getEditorMetadataAtual(publicado.id, publicado.version) : null;
    if (metadata) return { ok: true, temMetadataEditorial: true };

    const raw = (publicado.payload as Record<string, unknown>) ?? {};
    const relatorio = gerarRelatorio(contentType, slug, raw);

    const referenciasVerificadas: ReferenciaVerificada[] = [];
    for (const r of relatorio.referencias) {
      const doc = await getContentDocument(r.referencia.tipoConteudo as ContentType, r.referencia.slug).catch(() => null);
      referenciasVerificadas.push({ caminho: r.caminho, referencia: r.referencia, obrigatoria: r.obrigatoria, existe: doc !== null });
    }
    const referenciaQuebradaObrigatoria = referenciasVerificadas.some((r) => r.obrigatoria && !r.existe);
    if (referenciaQuebradaObrigatoria) {
      relatorio.bloqueado = true;
      relatorio.motivosBloqueio.push("Uma ou mais referências obrigatórias não correspondem a conteúdo publicado (referência quebrada).");
    }

    return { ok: true, temMetadataEditorial: false, relatorio, referenciasVerificadas, pendentesDeConfirmacao: caminhosPendentesDeConfirmacao(relatorio) };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}

export interface CriarRascunhoLegadoResultado {
  ok: boolean;
  erro?: string;
  draftId?: string;
  /** Presente quando confirmações estão faltando — a UI reexibe o relatório com o que falta. */
  relatorio?: RelatorioConversaoLegado;
  pendentesDeConfirmacao?: string[];
}

/**
 * Cria o rascunho de edição a partir de conteúdo legado, DEPOIS das
 * confirmações. `decisoes` é um mapa `caminho -> valor confirmado`,
 * cobrindo cada entrada de `caminhosPendentesDeConfirmacao` (campos
 * `conversao_com_confirmacao`). O relatório é RECALCULADO aqui — as
 * decisões do client só dizem "o que a pessoa confirmou para este
 * caminho", nunca "qual é a classificação".
 */
export async function criarRascunhoDeEdicaoLegado(
  contentType: DraftContentType,
  slug: string,
  decisoes: Record<string, unknown>,
): Promise<CriarRascunhoLegadoResultado> {
  try {
    const admin = await requireAdmin();

    const existente = await findDraftBySlug(contentType, slug);
    if (existente) return { ok: true, draftId: existente.id };

    const publicado = await getContentDocument(contentType as ContentType, slug);
    if (!publicado) return { ok: false, erro: "Conteúdo publicado não encontrado." };

    const raw = (publicado.payload as Record<string, unknown>) ?? {};
    const relatorio = gerarRelatorio(contentType, slug, raw);

    // Referências obrigatórias quebradas bloqueiam antes mesmo de olhar confirmações.
    for (const r of relatorio.referencias) {
      const doc = await getContentDocument(r.referencia.tipoConteudo as ContentType, r.referencia.slug).catch(() => null);
      if (r.obrigatoria && !doc) {
        relatorio.bloqueado = true;
        relatorio.motivosBloqueio.push(`Referência obrigatória quebrada: "${r.referencia.slug}" (${r.referencia.tipoConteudo}) não corresponde a conteúdo publicado.`);
      }
    }

    if (relatorio.bloqueado) {
      return { ok: false, erro: "Conversão bloqueada — há perda inevitável ou referência quebrada. Veja o relatório.", relatorio };
    }

    const pendentes = caminhosPendentesDeConfirmacao(relatorio);
    const faltando = pendentes.filter((p) => !(p in decisoes));
    if (faltando.length > 0) {
      return { ok: false, erro: "Faltam confirmações para campos ambíguos.", relatorio, pendentesDeConfirmacao: faltando };
    }

    // Reconstrói camposEditaveis pelos adapters já existentes (nunca duplica o parsing).
    let camposEditaveis: CamposEditaveis;
    let camposDesconhecidosPaths: string[];
    if (contentType === "spell") {
      const adaptado = adaptarRawSpell(raw);
      const campos = extrairCamposMagia(adaptado.canonico);
      camposEditaveis = { contentType: "spell", campos };
      camposDesconhecidosPaths = adaptado.camposDesconhecidos.map((c) => c.caminho);
    } else if (contentType === "item") {
      const adaptado = adaptarRawItem(raw);
      const campos = extrairCamposItem(adaptado.canonico);
      camposEditaveis = { contentType: "item", campos };
      camposDesconhecidosPaths = adaptado.camposDesconhecidos.map((c) => c.caminho);
    } else {
      const resultados = adaptarRawTalento(raw);
      const nome = String(raw.nome ?? slug);
      const campos = extrairCamposTalento(slug, nome, raw, resultados.map((r) => r.canonico));
      camposEditaveis = { contentType: "talent", campos };
      camposDesconhecidosPaths = resultados.flatMap((r) => r.camposDesconhecidos.map((c) => c.caminho));
    }

    const origemLegado: DraftOrigemLegado = {
      adapterId: contentType,
      adapterVersion: ADAPTER_VERSIONS[contentType],
      classificacaoLegado: relatorio.classificacaoGeral,
      decisoesConfirmadas: decisoes,
      camposSomenteLeitura: relatorio.campos.filter((c) => c.classificacao === "somente_leitura").map((c) => c.caminho),
      camposDesconhecidos: camposDesconhecidosPaths,
      efeitosPreservados: relatorio.efeitos.filter((e) => !e.editavel).map((e) => `${e.id} (${e.tipoLegado ?? "?"}) — ${e.motivo}`),
      avisos: relatorio.avisosSchema,
      convertidoEm: new Date().toISOString(),
      convertidoPor: admin.email ?? admin.id,
    };

    const envelope: DraftEnvelope = {
      schemaVersion: "draft.v1",
      contentType,
      camposEditaveis,
      preservado: { rawOriginal: raw, camposDesconhecidos: [] },
      origemLegado,
    };

    const client = await getScopedTableClient();
    const { data, error } = await client
      .from("content_drafts")
      .insert({
        content_type: contentType,
        slug,
        base_document_id: publicado.id,
        base_payload_hash: publicado.payload_hash,
        payload: envelope,
        created_by: admin.id,
        updated_by: admin.id,
      })
      .select("id")
      .single();
    if (error) return { ok: false, erro: `Falha ao criar rascunho de edição: ${error.message}` };

    return { ok: true, draftId: data.id as string };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}

/** Lê `origemLegado` de um rascunho já criado, quando existir — usado pela tela de edição para mostrar o indicador "Conteúdo legado". */
export async function getOrigemLegadoDoRascunho(draftId: string) {
  const draft = await getDraftById(draftId);
  return draft?.payload.origemLegado ?? null;
}
