/**
 * Modelo de REVISÃO antes de publicar (Etapa 5). Reúne tudo que a tela
 * de revisão mostra e que o servidor revalida: erros bloqueantes vs
 * avisos vs infos, comparação estruturada com o publicado, impacto em
 * instâncias, versão atual/próxima e o corpo serializado.
 *
 * A versão calculada aqui é só para EXIBIÇÃO — a autoridade é o RPC
 * `publish_content_draft` (SQL), que recomputa a versão a partir do
 * publicado atual. Nunca confiamos numa versão vinda do client.
 */

import { getContentDocument } from "../content/queries";
import type { ContentType } from "../content/types";
import type { ContentDraftRow, DraftContentType } from "./draftTypes";
import { diagnosticarEfeitoEditavel } from "./effectDiagnostics";
import type { EfeitoEditavel } from "./effectDraftTypes";
import { validarEfeitoParaPublicacao } from "./effectLegacySerialization";
import { classificarImpacto, type ImpactoInstancias } from "./publishImpact";
import { compararPublicado, type ResultadoDiff } from "./publishDiff";
import { serializarRascunhoParaPublicacao } from "./publishSerialization";
import { validarCamposItem, validarCamposMagia, validarCamposTalento } from "./draftValidation";
import type { ModoAutomacao } from "./types";

export interface EfeitoResumoRevisao {
  rotulo: string;
  tipo: string;
  modo: ModoAutomacao;
  motivo: string;
  habilitado: boolean;
}

export interface RevisaoPublicacao {
  draftId: string;
  draftVersion: number;
  contentType: DraftContentType;
  slug: string;
  nome: string;
  isNovo: boolean;
  versaoAtual: string | null;
  proximaVersao: string;
  baseStatus: "sem_origem" | "atual" | "mudou" | "removido";
  basePayloadHash: string | null;
  publicadoAtualHash: string | null;
  erros: string[];
  avisos: string[];
  infos: string[];
  diff: ResultadoDiff;
  impacto: ImpactoInstancias;
  efeitos: EfeitoResumoRevisao[];
  /** Corpo legado serializado — passado ao RPC no momento de confirmar. */
  corpo: Record<string, unknown>;
  /**
   * Metadata editorial completa (EfeitoEditavel[], ou por nível para
   * talento) — vai para `content_editor_metadata` (migration 0023),
   * NUNCA para o payload público. Ver correção pós-Etapa 5.
   */
  metadataEfeitos: unknown;
  podePublicar: boolean;
}

/** Estrutura gravada em `content_editor_metadata.efeitos` — nunca no payload público. */
function montarMetadataEfeitos(draft: ContentDraftRow): unknown {
  const ed = draft.payload.camposEditaveis;
  if (ed.contentType === "talent") {
    return ed.campos.niveis.map((n) => ({ nivel: n.nivel, efeitos: n.efeitos }));
  }
  return ed.campos.efeitos;
}

/** Bump de patch para EXIBIÇÃO (o SQL recomputa de verdade). '1.0.0' para conteúdo novo. */
function proximaVersaoExibicao(versaoAtual: string | null): string {
  if (!versaoAtual) return "1.0.0";
  const m = versaoAtual.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return "(versão publicada inválida)";
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

function coletarEfeitos(draft: ContentDraftRow): EfeitoEditavel[] {
  const ed = draft.payload.camposEditaveis;
  if (ed.contentType === "talent") return ed.campos.niveis.flatMap((n) => n.efeitos);
  return ed.campos.efeitos;
}

function resumirEfeitos(draft: ContentDraftRow, avisos: string[], erros: string[]): EfeitoResumoRevisao[] {
  const efeitos = coletarEfeitos(draft);
  return efeitos.map((e) => {
    const diag = diagnosticarEfeitoEditavel(e);
    if (e.habilitado) {
      // Bloqueante: o efeito não pode ser publicado se não for representável
      // no vocabulário legado real daquele content_type (ver auditoria de
      // schemas em effectLegacySerialization.ts) — nunca publica algo
      // inválido contra o contrato oficial silenciosamente.
      erros.push(...validarEfeitoParaPublicacao(draft.content_type, e));
    }
    if (e.habilitado && diag.modoAutomacao !== "automatico") {
      const rotuloAviso =
        diag.modoAutomacao === "assistido"
          ? "assistido (exige confirmação/ação do narrador)"
          : diag.modoAutomacao === "lembrete"
            ? "lembrete (sem execução automática)"
            : diag.modoAutomacao === "sem_executor"
              ? "sem executor (configuração incompleta ou sem automação)"
              : diag.modoAutomacao;
      avisos.push(`Efeito "${e.nomeOpcional || e.tipo}" é ${rotuloAviso}.`);
    }
    if (e.tipo === "aplicar_condicao" && e.habilitado) {
      avisos.push(`Efeito "${e.nomeOpcional || "aplicar condição"}": o executor operacional de condição tem aceite parcial (Etapa 4) — validado em código, confirmação de fluxo real ainda manual.`);
    }
    return { rotulo: e.nomeOpcional || e.tipo, tipo: e.tipo, modo: diag.modoAutomacao, motivo: diag.motivo, habilitado: e.habilitado };
  });
}

async function validarCampos(draft: ContentDraftRow): Promise<{ erros: string[]; avisos: string[]; infos: string[] }> {
  const ed = draft.payload.camposEditaveis;
  const r =
    ed.contentType === "spell"
      ? await validarCamposMagia(ed.campos, draft.id)
      : ed.contentType === "item"
        ? await validarCamposItem(ed.campos, draft.id)
        : await validarCamposTalento(ed.campos, draft.id);
  return { erros: [...r.erros], avisos: [...r.avisos], infos: [...r.infos] };
}

export async function montarRevisaoPublicacao(draft: ContentDraftRow): Promise<RevisaoPublicacao> {
  const publicado = await getContentDocument(draft.content_type as ContentType, draft.slug).catch(() => null);
  const isNovo = !publicado;

  const { erros, avisos, infos } = await validarCampos(draft);

  // Serialização — se lançar, é erro bloqueante ("serialização que não produz payload consumível").
  let corpo: Record<string, unknown> = {};
  try {
    corpo = serializarRascunhoParaPublicacao(draft);
    if (!corpo || typeof corpo !== "object") erros.push("Serialização não produziu um payload publicável.");
  } catch (e) {
    erros.push(`Falha ao serializar para publicação: ${e instanceof Error ? e.message : "erro desconhecido"}.`);
  }

  // Conflito de base / concorrência (espelha o bloqueio do RPC, mais cedo na UI).
  let baseStatus: RevisaoPublicacao["baseStatus"] = "sem_origem";
  if (draft.base_document_id) {
    if (!publicado) {
      baseStatus = "removido";
      erros.push("O conteúdo publicado de origem não existe mais (removido ou arquivado). Não é possível publicar esta edição — crie um novo rascunho.");
    } else if (publicado.payload_hash !== draft.base_payload_hash) {
      baseStatus = "mudou";
      erros.push("Conflito: o conteúdo publicado mudou desde que este rascunho foi criado. Publicar sobrescreveria uma versão mais recente — crie um novo rascunho de edição sobre a versão atual.");
    } else {
      baseStatus = "atual";
    }
  } else if (publicado) {
    // Rascunho novo/duplicado cujo slug já foi publicado por outro caminho.
    erros.push(`Já existe conteúdo publicado com este tipo e slug ("${draft.slug}"). Escolha outro slug antes de publicar.`);
  }

  const efeitos = resumirEfeitos(draft, avisos, erros);
  const diff = compararPublicado((publicado?.payload as Record<string, unknown>) ?? null, corpo);
  const efeitosMudaram = diff.efeitos.adicionados > 0 || diff.efeitos.removidos > 0 || diff.efeitos.alterados > 0 || diff.efeitos.ordemMudou;
  const impacto: ImpactoInstancias = classificarImpacto(diff.campos, efeitosMudaram, isNovo);

  if (!isNovo && !diff.houveMudanca) {
    avisos.push("Nenhuma diferença detectada em relação ao conteúdo publicado — publicar só incrementa a versão.");
  }

  return {
    draftId: draft.id,
    draftVersion: draft.version,
    contentType: draft.content_type,
    slug: draft.slug,
    nome: draft.payload.camposEditaveis.campos.nome,
    isNovo,
    versaoAtual: publicado?.version ?? null,
    proximaVersao: proximaVersaoExibicao(publicado?.version ?? null),
    baseStatus,
    basePayloadHash: draft.base_payload_hash,
    publicadoAtualHash: publicado?.payload_hash ?? null,
    erros,
    avisos,
    infos,
    diff,
    impacto,
    efeitos,
    corpo,
    metadataEfeitos: montarMetadataEfeitos(draft),
    podePublicar: erros.length === 0,
  };
}
