"use server";

/**
 * Mutações de rascunho (Etapa 3). Toda função aqui:
 *   - reverifica admin no servidor (`getContentAdminStatus`, Etapa 2) —
 *     nunca confia em nada vindo do client além dos dados de formulário;
 *   - a escrita em si passa pelo client "scoped" (sessão do admin
 *     anexada), então a RLS de `content_drafts` (is_content_admin())
 *     reforça a mesma checagem no banco — dupla camada, nunca uma só;
 *   - revalida os campos com a validação da Etapa 3 antes de gravar;
 *   - nunca usa a service role key.
 */

import { revalidatePath } from "next/cache";
import { getContentAdminStatus } from "../auth/contentAdmin";
import { getScopedTableClient } from "../auth/scopedClient";
import { getContentDocument } from "../content/queries";
import type { ContentType } from "../content/types";
import {
  rawOriginalCapituloVazio,
  rawOriginalItemVazio,
  rawOriginalRunaVazio,
  rawOriginalSpellVazio,
  rawOriginalTalentoVazio,
  vazioCamposCapitulo,
  vazioCamposItem,
  vazioCamposMagia,
  vazioCamposRuna,
  vazioCamposTalento,
} from "./draftMapping";
import { montarCamposECamposDesconhecidosIniciais, sobreporMetadataEditorial } from "./draftBuilders";
import { findDraftBySlug, getDraftById } from "./draftQueries";
import type { CamposCapitulo, CamposEditaveis, CamposItem, CamposMagia, CamposRuna, CamposTalento, DraftContentType, DraftEnvelope } from "./draftTypes";
import { getEditorMetadataAtual } from "./editorMetadataQueries";
import type { EfeitoEditavel } from "./effectDraftTypes";
import { validarCamposCapitulo, validarCamposItem, validarCamposMagia, validarCamposRuna, validarCamposTalento } from "./draftValidation";
import { isValidSlug, slugDuplicadoSugerido, slugify } from "./slug";

async function requireAdmin(): Promise<{ id: string; email: string | null }> {
  const status = await getContentAdminStatus();
  if (!status.user) throw new Error("Não autenticado.");
  if (!status.isAdmin) throw new Error("Sem acesso administrativo à Biblioteca.");
  return status.user;
}

export interface AcaoResultado {
  ok: boolean;
  erro?: string;
  draftId?: string;
}

// ---------------------------------------------------------------------
// 1. Criar novo conteúdo (rascunho vazio)
// ---------------------------------------------------------------------
export async function criarRascunhoNovo(contentType: DraftContentType, nome: string, slugDesejado?: string): Promise<AcaoResultado> {
  try {
    const admin = await requireAdmin();
    if (!nome || nome.trim() === "") return { ok: false, erro: "Nome é obrigatório." };

    const slug = (slugDesejado?.trim() || slugify(nome)).toLowerCase();
    if (!isValidSlug(slug)) return { ok: false, erro: "Slug inválido — use letras minúsculas, números e “_”." };

    const publicado = await getContentDocument(contentType as ContentType, slug);
    if (publicado) return { ok: false, erro: `Já existe conteúdo publicado com o slug "${slug}".` };
    const draftExistente = await findDraftBySlug(contentType, slug);
    if (draftExistente) return { ok: false, erro: `Já existe um rascunho com o slug "${slug}" — abra-o em vez de criar outro.` };

    let camposEditaveis: CamposEditaveis;
    let rawOriginal: Record<string, unknown>;
    if (contentType === "spell") {
      camposEditaveis = { contentType: "spell", campos: { ...vazioCamposMagia(), nome, slug } };
      rawOriginal = rawOriginalSpellVazio();
    } else if (contentType === "item") {
      camposEditaveis = { contentType: "item", campos: { ...vazioCamposItem(), nome, slug } };
      rawOriginal = rawOriginalItemVazio();
    } else if (contentType === "rune") {
      camposEditaveis = { contentType: "rune", campos: { ...vazioCamposRuna(), nome, slug } };
      rawOriginal = rawOriginalRunaVazio();
    } else if (contentType === "capitulo") {
      camposEditaveis = { contentType: "capitulo", campos: { ...vazioCamposCapitulo(), nome, slug } };
      rawOriginal = rawOriginalCapituloVazio();
    } else {
      camposEditaveis = { contentType: "talent", campos: { ...vazioCamposTalento(), nome, slug } };
      rawOriginal = rawOriginalTalentoVazio(slug, nome);
    }

    const envelope: DraftEnvelope = {
      schemaVersion: "draft.v1",
      contentType,
      camposEditaveis,
      preservado: { rawOriginal, camposDesconhecidos: [] },
    };

    const client = await getScopedTableClient();
    const { data, error } = await client
      .from("content_drafts")
      .insert({ content_type: contentType, slug, payload: envelope, created_by: admin.id, updated_by: admin.id })
      .select("id")
      .single();
    if (error) return { ok: false, erro: `Falha ao criar rascunho: ${error.message}` };

    revalidatePath("/admin/biblioteca/rascunhos");
    return { ok: true, draftId: data.id as string };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}

// ---------------------------------------------------------------------
// 2. Criar rascunho de edição a partir de conteúdo publicado
// ---------------------------------------------------------------------
export async function criarRascunhoDeEdicao(contentType: DraftContentType, slugPublicado: string): Promise<AcaoResultado> {
  try {
    const admin = await requireAdmin();

    const existente = await findDraftBySlug(contentType, slugPublicado);
    if (existente) return { ok: true, draftId: existente.id };

    const publicado = await getContentDocument(contentType as ContentType, slugPublicado);
    if (!publicado) return { ok: false, erro: "Conteúdo publicado não encontrado." };

    const rawOriginal = (publicado.payload as Record<string, unknown>) ?? {};
    const { camposEditaveis: camposDosAdapters, camposDesconhecidos } = montarCamposECamposDesconhecidosIniciais(contentType, rawOriginal);
    const metadataAtual = publicado.version ? await getEditorMetadataAtual(publicado.id, publicado.version).catch(() => null) : null;
    const camposEditaveis = sobreporMetadataEditorial(camposDosAdapters, metadataAtual);

    const envelope: DraftEnvelope = {
      schemaVersion: "draft.v1",
      contentType,
      camposEditaveis,
      preservado: { rawOriginal, camposDesconhecidos },
    };

    const client = await getScopedTableClient();
    const { data, error } = await client
      .from("content_drafts")
      .insert({
        content_type: contentType,
        slug: slugPublicado,
        base_document_id: publicado.id,
        base_payload_hash: publicado.payload_hash,
        payload: envelope,
        created_by: admin.id,
        updated_by: admin.id,
      })
      .select("id")
      .single();
    if (error) return { ok: false, erro: `Falha ao criar rascunho de edição: ${error.message}` };

    revalidatePath("/admin/biblioteca/rascunhos");
    return { ok: true, draftId: data.id as string };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}

// ---------------------------------------------------------------------
// 3. Duplicar conteúdo (publicado ou rascunho) como novo rascunho
// ---------------------------------------------------------------------
export type OrigemDuplicacao = { tipo: "publicado"; slug: string } | { tipo: "rascunho"; draftId: string };

export async function duplicarConteudo(
  contentType: DraftContentType,
  origem: OrigemDuplicacao,
  novoNome: string,
  novoSlugDesejado?: string,
): Promise<AcaoResultado> {
  try {
    const admin = await requireAdmin();
    if (!novoNome || novoNome.trim() === "") return { ok: false, erro: "Nome é obrigatório para a cópia." };

    let rawOriginal: Record<string, unknown>;
    let origemDescricao: string;
    if (origem.tipo === "publicado") {
      const publicado = await getContentDocument(contentType as ContentType, origem.slug);
      if (!publicado) return { ok: false, erro: "Conteúdo publicado de origem não encontrado." };
      rawOriginal = (publicado.payload as Record<string, unknown>) ?? {};
      origemDescricao = publicado.id;
    } else {
      const draftOrigem = await getDraftById(origem.draftId);
      if (!draftOrigem) return { ok: false, erro: "Rascunho de origem não encontrado." };
      rawOriginal = draftOrigem.payload.preservado.rawOriginal;
      origemDescricao = `draft:${draftOrigem.id}`;
    }

    const slugSugerido = (novoSlugDesejado?.trim() || slugDuplicadoSugerido(slugify(novoNome))).toLowerCase();
    if (!isValidSlug(slugSugerido)) return { ok: false, erro: "Slug inválido." };

    const publicadoComMesmoSlug = await getContentDocument(contentType as ContentType, slugSugerido);
    if (publicadoComMesmoSlug) return { ok: false, erro: `Já existe conteúdo publicado com o slug "${slugSugerido}" — escolha outro.` };
    const draftComMesmoSlug = await findDraftBySlug(contentType, slugSugerido);
    if (draftComMesmoSlug) return { ok: false, erro: `Já existe um rascunho com o slug "${slugSugerido}" — escolha outro.` };

    // Identidade nunca reaproveitada: novo slug/nome já embutidos no raw
    // preservado antes de adaptar — os `id`s de efeito (gerados a partir
    // do slug pelos adapters da Etapa 1) mudam automaticamente também.
    const rawAjustado: Record<string, unknown> = { ...rawOriginal, slug: slugSugerido, nome: novoNome };
    if (contentType === "talent" && Array.isArray(rawAjustado.niveis)) {
      rawAjustado.niveis = (rawAjustado.niveis as Record<string, unknown>[]).map((n) => ({ ...n, talento_id: slugSugerido }));
    }

    const { camposEditaveis, camposDesconhecidos } = montarCamposECamposDesconhecidosIniciais(contentType, rawAjustado, novoNome, slugSugerido);

    const envelope: DraftEnvelope = {
      schemaVersion: "draft.v1",
      contentType,
      camposEditaveis,
      preservado: { rawOriginal: rawAjustado, camposDesconhecidos },
    };

    const client = await getScopedTableClient();
    const { data, error } = await client
      .from("content_drafts")
      .insert({
        content_type: contentType,
        slug: slugSugerido,
        duplicated_from: origemDescricao,
        payload: envelope,
        created_by: admin.id,
        updated_by: admin.id,
      })
      .select("id")
      .single();
    if (error) return { ok: false, erro: `Falha ao duplicar: ${error.message}` };

    revalidatePath("/admin/biblioteca/rascunhos");
    return { ok: true, draftId: data.id as string };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}

// ---------------------------------------------------------------------
// 4. Atualizar rascunho existente
// ---------------------------------------------------------------------
export interface AtualizarRascunhoResultado {
  ok: boolean;
  erro?: string;
  erros?: string[];
  avisos?: string[];
  conflito?: boolean;
  novaVersao?: number;
}

export async function atualizarRascunho(
  draftId: string,
  campos: CamposMagia | CamposItem | CamposRuna | CamposTalento | CamposCapitulo,
  expectedVersion: number,
): Promise<AtualizarRascunhoResultado> {
  try {
    const admin = await requireAdmin();
    const draft = await getDraftById(draftId);
    if (!draft) return { ok: false, erro: "Rascunho não encontrado." };

    if (draft.version !== expectedVersion) {
      return {
        ok: false,
        conflito: true,
        erro: "Este rascunho foi alterado (por você em outra aba, ou por outro admin) desde que foi carregado. Recarregue antes de salvar.",
      };
    }

    const validacao =
      draft.content_type === "spell"
        ? await validarCamposMagia(campos as CamposMagia, draftId)
        : draft.content_type === "item"
          ? await validarCamposItem(campos as CamposItem, draftId)
          : draft.content_type === "rune"
            ? await validarCamposRuna(campos as CamposRuna, draftId)
            : draft.content_type === "capitulo"
              ? await validarCamposCapitulo(campos as CamposCapitulo, draftId)
              : await validarCamposTalento(campos as CamposTalento, draftId);

    if (!validacao.valido) return { ok: false, erros: validacao.erros, avisos: validacao.avisos };

    const novoEnvelope: DraftEnvelope = {
      ...draft.payload,
      camposEditaveis: { contentType: draft.content_type, campos } as CamposEditaveis,
    };

    const client = await getScopedTableClient();
    const { data, error } = await client
      .from("content_drafts")
      .update({ payload: novoEnvelope, slug: campos.slug, updated_by: admin.id })
      .eq("id", draftId)
      .eq("version", expectedVersion)
      .select("version")
      .maybeSingle();

    if (error) return { ok: false, erro: `Falha ao salvar: ${error.message}` };
    if (!data) return { ok: false, conflito: true, erro: "Conflito de versão detectado ao salvar — recarregue e tente novamente." };

    revalidatePath(`/admin/biblioteca/rascunhos/${draftId}`);
    revalidatePath("/admin/biblioteca/rascunhos");
    return { ok: true, avisos: validacao.avisos, novaVersao: data.version as number };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}

// ---------------------------------------------------------------------
// 5. Excluir rascunho (usado pelo cancelar-e-descartar e pela limpeza dos browser checks)
// ---------------------------------------------------------------------
export async function excluirRascunho(draftId: string): Promise<AcaoResultado> {
  try {
    await requireAdmin();
    const client = await getScopedTableClient();
    const { error } = await client.from("content_drafts").delete().eq("id", draftId);
    if (error) return { ok: false, erro: `Falha ao excluir rascunho: ${error.message}` };
    revalidatePath("/admin/biblioteca/rascunhos");
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}
