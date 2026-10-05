"use server";

/**
 * Criação de personagem RUPTURA v1.2 — catálogos e conclusão.
 *
 * A tela recebe apenas o necessário para apresentar as escolhas
 * (Classes, perícias, Trajetória e itens efetivos da campanha). A
 * conclusão envia só as ESCOLHAS: o payload é montado e validado no
 * servidor (`createCharacterV2`) e revalidado pela RPC.
 */

import "server-only";
import { resolveCampaignAccess } from "../../../../../lib/campaign/access";
import { resolveEffectiveList } from "../../../../../lib/campaignContent/resolveEffectiveContent";
import {
  createCharacterV2,
  deleteCharacterCreationDraft,
  loadCharacterCreationDraftV12,
  saveCharacterCreationDraftV12,
  updateCharacterSheetPayload,
  type LoadDraftV12Result,
} from "../../../../../lib/character/storage";
import { getCharacterRules } from "../../../../../lib/content";
import type { Character, CharacterRulesPayload } from "../../../../../lib/character/types";
import {
  REGIOES_V12,
  VERTENTES_V12,
  regiaoValida,
  type RegiaoIdV12,
  type RankingV12,
  type ClassContentV12,
  type CreationChoicesV12,
  type DraftV12,
  type TrajectoryOptionContentV12,
} from "../../../../../lib/rulesetV12";

export interface ResultadoAcao<T = undefined> {
  ok: boolean;
  erro?: string;
  dados?: T;
}

export interface OpcaoTrajetoriaV12 {
  slug: string;
  nome: string;
  descricao: string;
  categoria?: string;
  custos: Array<1 | 2>;
  repetivel: boolean;
  /** Ⱥ adicional por custo escolhido (efeito `aretz_inicial_adicional`, ex.: Recursos). */
  aretzPorPontos?: Record<string, number>;
}

export interface CatalogosCriacaoV12 {
  classes: ClassContentV12[];
  pericias: Array<{ id: string; nome: string }>;
  regioes: Array<{ id: string; nome: string; idioma: string }>;
  vertentes: string[];
  antecedentes: Array<{ slug: string; nome: string; descricao: string; familiaridade: string }>;
  qualidades: OpcaoTrajetoriaV12[];
  complicacoes: OpcaoTrajetoriaV12[];
  itens: Array<{ slug: string; nome: string; categoria: string; preco: number }>;
  /** Narrador da campanha: o assistente oferece criar o personagem como PN. */
  ehNarrador: boolean;
  /** Nome da mesa, para o topo da Forja. */
  nomeMesa?: string;
  /** Região onde a campanha começa, quando o narrador definiu. */
  regiaoMesa?: RegiaoIdV12 | null;
  rankingMesa?: RankingV12;
}

async function exigirAcesso(campaignId: string) {
  const acesso = await resolveCampaignAccess(campaignId);
  if (acesso.kind !== "ok") {
    return { erro: acesso.kind === "no_session" ? "Sessão expirada." : "Você não tem acesso a esta campanha." };
  }
  return { acesso };
}

function opcao(slug: string, payload: Record<string, unknown>): OpcaoTrajetoriaV12 {
  const p = payload as unknown as TrajectoryOptionContentV12;
  return {
    slug,
    nome: p.nome ?? slug,
    descricao: p.descricao ?? "",
    categoria: p.categoria,
    custos: Array.isArray(p.custos_permitidos) ? p.custos_permitidos : [1],
    repetivel: p.repetivel === true,
    aretzPorPontos: (p.efeitos ?? [])
      .map((e) => e as { tipo?: string; por_pontos?: Record<string, number> })
      .find((e) => e.tipo === "aretz_inicial_adicional")?.por_pontos,
  };
}

const porNome = <T extends { nome: string }>(a: T, b: T) => a.nome.localeCompare(b.nome, "pt-BR");

export async function lerCatalogosCriacaoV12Action(campaignId: string): Promise<ResultadoAcao<CatalogosCriacaoV12>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };

  try {
    const [regrasDoc, classes, antecedentes, qualidades, complicacoes, itens] = await Promise.all([
      getCharacterRules(),
      resolveEffectiveList(campaignId, "class"),
      resolveEffectiveList(campaignId, "background"),
      resolveEffectiveList(campaignId, "quality"),
      resolveEffectiveList(campaignId, "complication"),
      resolveEffectiveList(campaignId, "item"),
    ]);
    const regras = regrasDoc?.payload as CharacterRulesPayload | undefined;
    if (!regras) return { ok: false, erro: "As regras de personagem não vieram do banco." };

    return {
      ok: true,
      dados: {
        ehNarrador: v.acesso?.role === "narrator",
        nomeMesa: v.acesso?.campaign.name,
        regiaoMesa: regiaoValida(v.acesso?.campaign.regiao),
        rankingMesa: v.acesso?.campaign.initial_ranking ?? "F",
        classes: classes.map((c) => c.payload as unknown as ClassContentV12),
        pericias: regras.pericias.map((p) => ({ id: p.id, nome: p.nome })).sort(porNome),
        regioes: Object.entries(REGIOES_V12).map(([id, r]) => ({ id, nome: r.nome, idioma: r.idioma })),
        vertentes: [...VERTENTES_V12],
        antecedentes: antecedentes
          .map((a) => {
            const p = a.payload as { nome?: string; descricao?: string; familiaridade?: string };
            return { slug: a.slug, nome: p.nome ?? a.slug, descricao: p.descricao ?? "", familiaridade: p.familiaridade ?? "" };
          })
          .sort(porNome),
        qualidades: qualidades.map((q) => opcao(q.slug, q.payload)).sort(porNome),
        complicacoes: complicacoes.map((c) => opcao(c.slug, c.payload)).sort(porNome),
        itens: itens
          .map((i) => {
            const p = i.payload as { nome?: string; categoria?: string; preco?: number };
            return { slug: i.slug, nome: p.nome ?? i.slug, categoria: p.categoria ?? "", preco: p.preco ?? 0 };
          })
          .filter((i) => i.preco > 0)
          .sort(porNome),
      },
    };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao carregar os catálogos da criação." };
  }
}

export async function criarPersonagemV12Action(
  campaignId: string,
  choices: CreationChoicesV12,
  creationRequestId: string,
  opcoes: { pn?: boolean; characterId?: string } = {},
): Promise<ResultadoAcao<{ characterId: string }>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  if (opcoes.pn && v.acesso?.role !== "narrator") return { ok: false, erro: "Só o narrador cria PN." };
  try {
    const record = await createCharacterV2(campaignId, choices, { creationRequestId, characterId: opcoes.characterId });
    if (opcoes.pn) {
      // PN: mesmo personagem v1.2, marcado como do narrador (metadado que só o narrador altera).
      const payload = record.payload as Character;
      if (payload.metadados?.tipo_personagem !== "pn") {
        await updateCharacterSheetPayload(record.id, {
          ...payload,
          metadados: { ...payload.metadados, schema_version: payload.metadados?.schema_version ?? 1, tipo_personagem: "pn" },
        });
      }
    }
    return { ok: true, dados: { characterId: record.id } };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao criar o personagem." };
  }
}

export async function lerRascunhoV12Action(campaignId: string): Promise<ResultadoAcao<LoadDraftV12Result>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  try {
    return { ok: true, dados: await loadCharacterCreationDraftV12(campaignId) };
  } catch (e) {
    return { ok: true, dados: { kind: "network_error", message: e instanceof Error ? e.message : "Falha ao ler o rascunho." } };
  }
}

/** `conflito: true` quando outra aba gravou antes (revisão diferente) — resultado esperado, não erro. */
export async function salvarRascunhoV12Action(
  campaignId: string,
  rascunho: DraftV12,
  creationRequestId: string,
  revisaoEsperada: number,
): Promise<ResultadoAcao<{ revisao: number } | { conflito: true }>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  try {
    const r = await saveCharacterCreationDraftV12(campaignId, rascunho, creationRequestId, revisaoEsperada);
    return { ok: true, dados: "conflict" in r ? { conflito: true } : { revisao: r.revision } };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao salvar o rascunho." };
  }
}

export async function apagarRascunhoV12Action(campaignId: string): Promise<ResultadoAcao> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  try {
    await deleteCharacterCreationDraft(campaignId);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao apagar o rascunho." };
  }
}
