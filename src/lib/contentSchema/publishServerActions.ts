"use server";

/**
 * Ações de publicação e arquivamento (Etapa 5). Mesma disciplina das
 * ações da Etapa 3:
 *   - reverifica admin no servidor (`requireAdmin`);
 *   - NUNCA confia em versão/status/hash/corpo vindos do client — o
 *     corpo é RE-serializado aqui e a versão/estado são autoridade do
 *     RPC SQL `publish_content_draft` (SECURITY DEFINER, transacional);
 *   - a escrita passa pelo client "scoped" (sessão do admin), então a
 *     checagem `is_content_admin()` dentro do RPC reforça no banco.
 *
 * A atomicidade real (validar versão otimista → conferir hash da base →
 * upsert do documento → changelog → consumir rascunho) acontece TODA
 * dentro do RPC — nunca simulada por várias chamadas independentes.
 */

import { revalidatePath } from "next/cache";
import { getContentAdminStatus } from "../auth/contentAdmin";
import { getScopedTableClient } from "../auth/scopedClient";
import { getDraftById } from "./draftQueries";
import { montarRevisaoPublicacao } from "./publishReview";

async function requireAdmin(): Promise<{ id: string; email: string | null }> {
  const status = await getContentAdminStatus();
  if (!status.user) throw new Error("Não autenticado.");
  if (!status.isAdmin) throw new Error("Sem acesso administrativo à Biblioteca.");
  return status.user;
}

export interface PublicarResultado {
  ok: boolean;
  erro?: string;
  erros?: string[];
  conflito?: boolean;
  documentId?: string;
  versaoAnterior?: string | null;
  versaoNova?: string;
}

/**
 * Publica um rascunho. `resumo` é o resumo obrigatório do changelog.
 * `expectedDraftVersion` vem da tela de revisão — controle otimista: se
 * o rascunho mudou desde a revisão, o RPC bloqueia.
 */
export async function publicarRascunho(draftId: string, expectedDraftVersion: number, resumo: string): Promise<PublicarResultado> {
  try {
    const admin = await requireAdmin();
    if (!resumo || resumo.trim() === "") return { ok: false, erro: "O resumo do changelog é obrigatório." };

    const draft = await getDraftById(draftId);
    if (!draft) return { ok: false, erro: "Rascunho não encontrado." };
    if (draft.version !== expectedDraftVersion) {
      return { ok: false, conflito: true, erro: "O rascunho foi alterado desde a revisão. Recarregue a revisão antes de publicar." };
    }

    // Re-serializa e revalida no servidor — nunca confia no que veio da tela.
    const revisao = await montarRevisaoPublicacao(draft);
    if (!revisao.podePublicar) {
      return { ok: false, erros: revisao.erros, conflito: revisao.baseStatus === "mudou" || revisao.baseStatus === "removido" };
    }

    const client = await getScopedTableClient();
    const { data, error } = await client.rpc("publish_content_draft", {
      p_draft_id: draftId,
      p_expected_draft_version: expectedDraftVersion,
      p_body: revisao.corpo,
      p_summary: resumo.trim(),
      p_changed_paths: revisao.diff.campos,
      p_impact: revisao.impacto,
      p_author_email: admin.email,
      // Metadata editorial completa (EfeitoEditavel[]) — grava em
      // content_editor_metadata na mesma transação, NUNCA no payload
      // público (ver correção pós-Etapa 5).
      p_efeitos_editaveis: revisao.metadataEfeitos,
    });

    if (error) {
      const conflito = /serialization_failure|mudou|consumido|versão/i.test(error.message);
      return { ok: false, erro: `Falha ao publicar: ${error.message}`, conflito };
    }

    const resultado = data as { documentId: string; versionBefore: string | null; versionAfter: string };
    revalidatePath("/admin/biblioteca");
    revalidatePath("/admin/biblioteca/rascunhos");
    revalidatePath(`/admin/biblioteca/${draft.content_type}/${draft.slug}`);
    return { ok: true, documentId: resultado.documentId, versaoAnterior: resultado.versionBefore, versaoNova: resultado.versionAfter };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}

export interface ArquivarResultado {
  ok: boolean;
  erro?: string;
}

/** Arquiva um conteúdo publicado (some do jogo; preserva tudo). Motivo obrigatório. */
export async function arquivarConteudo(documentId: string, motivo: string): Promise<ArquivarResultado> {
  try {
    const admin = await requireAdmin();
    if (!motivo || motivo.trim() === "") return { ok: false, erro: "O motivo do arquivamento é obrigatório." };

    const client = await getScopedTableClient();
    const { error } = await client.rpc("archive_content_document", {
      p_document_id: documentId,
      p_reason: motivo.trim(),
      p_author_email: admin.email,
    });
    if (error) return { ok: false, erro: `Falha ao arquivar: ${error.message}` };

    const [contentType, ...slugParts] = documentId.split(":");
    revalidatePath("/admin/biblioteca");
    revalidatePath(`/admin/biblioteca/${contentType}/${slugParts.join(":")}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}
