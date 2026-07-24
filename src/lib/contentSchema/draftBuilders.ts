/**
 * Construtores puros de rascunho a partir de payload legado bruto —
 * extraídos de `draftServerActions.ts` (Etapa 3/6) para reuso pela
 * Etapa 11 (importação). Módulo PLAIN (sem `"use server"`): as duas
 * funções aqui são síncronas, e um arquivo `"use server"` exige que
 * TODO export seja uma função assíncrona (restrição do Next.js para
 * Server Actions) — por isso vivem à parte, importadas por
 * `draftServerActions.ts` (criação de rascunho de edição) e por
 * `packageImport.ts` (importação) sem duplicar a lógica.
 */

import { adaptarRawItem, adaptarRawRune, adaptarRawSpell, adaptarRawTalento, extrairCamposItem, extrairCamposMagia, extrairCamposRuna, extrairCamposTalento } from "./draftMapping";
import type { BlocoCapitulo, CamposCapitulo, CamposEditaveis, CamposTalento, DraftContentType, DraftEnvelope } from "./draftTypes";
import type { ContentTypeId } from "./types";
import type { EfeitoEditavel } from "./effectDraftTypes";

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}
function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * Extrai `CamposCapitulo` diretamente do payload público — sem adapter
 * dedicado, porque não há formato legado a traduzir (capítulo é 5º tipo
 * editável, sem conteúdo anterior ao Editor Universal; ver correção do
 * drag editorial, Etapa 11). Payload público já é quase 1:1 com
 * `CamposCapitulo` (mesmo shape escrito por `publishSerialization.ts::serializarCapitulo`).
 */
function extrairCamposCapitulo(raw: Record<string, unknown>): CamposCapitulo {
  const blocos: BlocoCapitulo[] = asArray(raw.blocos).flatMap((bruto): BlocoCapitulo[] => {
    const bloco = asRecord(bruto);
    if (!bloco) return [];
    const id = asString(bloco.id) ?? "";
    if (bloco.tipo === "texto") return [{ id, tipo: "texto", texto: asString(bloco.texto) ?? "" }];
    if (bloco.tipo === "entidade") {
      const entidade = asRecord(bloco.entidade);
      const contentType = asString(entidade?.tipo_conteudo);
      const slug = asString(entidade?.slug);
      if (!contentType || !slug) return [];
      return [{ id, tipo: "entidade", entidade: { contentType: contentType as ContentTypeId, slug } }];
    }
    return [];
  });
  return {
    nome: asString(raw.nome) ?? "",
    slug: asString(raw.slug) ?? "",
    categoria: asString(raw.categoria),
    descricaoCurta: asString(raw.descricao_curta),
    descricaoLonga: asString(raw.descricao_longa),
    tags: asArray(raw.tags).filter((t): t is string => typeof t === "string"),
    corpo: asString(raw.corpo),
    blocos,
  };
}

export function montarCamposECamposDesconhecidosIniciais(
  contentType: DraftContentType,
  rawOriginal: Record<string, unknown>,
  overrideNome?: string,
  overrideSlug?: string,
): { camposEditaveis: CamposEditaveis; camposDesconhecidos: DraftEnvelope["preservado"]["camposDesconhecidos"] } {
  if (contentType === "spell") {
    const adaptado = adaptarRawSpell(rawOriginal);
    const campos = extrairCamposMagia(adaptado.canonico);
    return {
      camposEditaveis: { contentType: "spell", campos: { ...campos, nome: overrideNome ?? campos.nome, slug: overrideSlug ?? campos.slug } },
      camposDesconhecidos: adaptado.camposDesconhecidos,
    };
  }
  if (contentType === "item") {
    const adaptado = adaptarRawItem(rawOriginal);
    const campos = extrairCamposItem(adaptado.canonico);
    return {
      camposEditaveis: { contentType: "item", campos: { ...campos, nome: overrideNome ?? campos.nome, slug: overrideSlug ?? campos.slug } },
      camposDesconhecidos: adaptado.camposDesconhecidos,
    };
  }
  if (contentType === "rune") {
    const adaptado = adaptarRawRune(rawOriginal);
    const campos = extrairCamposRuna(adaptado.canonico);
    return {
      camposEditaveis: { contentType: "rune", campos: { ...campos, nome: overrideNome ?? campos.nome, slug: overrideSlug ?? campos.slug } },
      camposDesconhecidos: adaptado.camposDesconhecidos,
    };
  }
  if (contentType === "capitulo") {
    const campos = extrairCamposCapitulo(rawOriginal);
    return {
      camposEditaveis: { contentType: "capitulo", campos: { ...campos, nome: overrideNome ?? campos.nome, slug: overrideSlug ?? campos.slug } },
      camposDesconhecidos: [],
    };
  }
  const resultados = adaptarRawTalento(rawOriginal);
  const nome = overrideNome ?? String(rawOriginal.nome ?? overrideSlug ?? "");
  const slug = overrideSlug ?? String(rawOriginal.slug ?? "");
  const campos = extrairCamposTalento(slug, nome, rawOriginal, resultados.map((r) => r.canonico));
  return {
    camposEditaveis: { contentType: "talent", campos: { ...campos, nome, slug } },
    camposDesconhecidos: resultados.flatMap((r) => r.camposDesconhecidos),
  };
}

/**
 * Sobrepõe os efeitos re-derivados dos adapters legados pela metadata
 * editorial COMPLETA (`content_editor_metadata`, migration 0023),
 * quando existir para a versão publicada atual — recupera com
 * fidelidade total (id estável, habilitado, gatilho, alvo, duração,
 * campos por tipo) o que os adapters legados não conseguem reconstituir
 * sozinhos (ex.: `ignoraMit`, autoria de condição, flags de acúmulo).
 * Sem metadata (conteúdo nunca publicado por esta via, ou seedado antes
 * da correção), mantém o resultado dos adapters — fallback seguro, sem
 * inventar dado ausente.
 */
export function sobreporMetadataEditorial(camposEditaveis: CamposEditaveis, metadata: unknown[] | null): CamposEditaveis {
  if (!metadata) return camposEditaveis;
  // Capítulo nunca grava `content_editor_metadata` (não tem efeitos) —
  // `metadata` chega null na prática para este tipo, mas o guard é
  // explícito para nunca tentar setar `.efeitos` num CamposCapitulo.
  if (camposEditaveis.contentType === "capitulo") return camposEditaveis;
  if (camposEditaveis.contentType === "talent") {
    const porNivel = new Map<number, EfeitoEditavel[]>();
    for (const entrada of metadata) {
      const item = entrada as { nivel?: unknown; efeitos?: unknown };
      if (entrada && typeof entrada === "object" && typeof item.nivel === "number" && Array.isArray(item.efeitos)) {
        porNivel.set(item.nivel, item.efeitos as EfeitoEditavel[]);
      }
    }
    return {
      ...camposEditaveis,
      campos: {
        ...camposEditaveis.campos,
        niveis: camposEditaveis.campos.niveis.map((n) => ({ ...n, efeitos: porNivel.get(n.nivel) ?? n.efeitos })) as CamposTalento["niveis"],
      },
    };
  }
  return { ...camposEditaveis, campos: { ...camposEditaveis.campos, efeitos: metadata as EfeitoEditavel[] } } as CamposEditaveis;
}
