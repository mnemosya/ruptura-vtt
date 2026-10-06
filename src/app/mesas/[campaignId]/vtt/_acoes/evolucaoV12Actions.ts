"use server";

/**
 * Avanço de Ranking RUPTURA v1.2 (capítulo 25).
 *
 * `lerAvancoV12Action` descreve o pacote do próximo Ranking para a tela;
 * `avancarRankingV12Action` recarrega o personagem e a Classe efetiva no
 * servidor, aplica as escolhas com `applyAdvancementV12` (que valida
 * tudo) e grava por `advance_character_ranking_v2`, que exige ser
 * narrador ou controlador e revalida no banco que o salto é de um único
 * Ranking com os ganhos da Classe. O cliente nunca envia o personagem
 * resultante — só as escolhas.
 */

import "server-only";
import { resolveCampaignAccess } from "../../../../../lib/campaign/access";
import { resolveEffectiveList } from "../../../../../lib/campaignContent/resolveEffectiveContent";
import { advanceCharacterRankingV2, getCharacter, getCharacterForCampaign } from "../../../../../lib/character/storage";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { getCharacterRules } from "../../../../../lib/content";
import type { Character, CharacterRulesPayload } from "../../../../../lib/character/types";
import {
  advancementPackageV12,
  applyAdvancementV12,
  validateCharacterV2,
  type AdvancementChoicesV12,
  type AdvancementContextV12,
  type CharacterV2,
  type ClassContentV12,
  type FeatureV12,
  type RankAdvancementV12,
  type RankingV12,
  type SubclassContentV12,
} from "../../../../../lib/rulesetV12";

export interface ResultadoAcao<T = undefined> {
  ok: boolean;
  erro?: string;
  dados?: T;
}

export interface PacoteAvancoV12 {
  de: RankingV12;
  para: RankingV12;
  avanco: RankAdvancementV12;
  classeNome: string;
  caracteristicasClasse: FeatureV12[];
  caracteristicasSubclasse: FeatureV12[];
  subclasses: Array<{ slug: string; nome: string; descricao: string }>;
  pericias: Array<{ id: string; nome: string; valor: number }>;
  atributos: CharacterV2["atributos"];
  niveisVertente: Record<string, number>;
}

/** Sem campanha (personagem solto do jogador): basta estar logado; a RLS e a RPC conferem o dono. */
async function exigirAcesso(campaignId: string | null) {
  if (!campaignId) {
    const user = await getCurrentUser();
    return user ? { acesso: null } : { erro: "Sessão expirada." };
  }
  const acesso = await resolveCampaignAccess(campaignId);
  if (acesso.kind !== "ok") {
    return { erro: acesso.kind === "no_session" ? "Sessão expirada." : "Você não tem acesso a esta campanha." };
  }
  return { acesso };
}

async function carregar(campaignId: string | null, characterId: string) {
  const record = campaignId
    ? await getCharacterForCampaign(campaignId, characterId)
    : await getCharacter(characterId).then((r) => (r && !r.campaign_id ? r : null));
  if (!record) return { erro: "Personagem não encontrado." as const };
  const personagem = record.payload as unknown;
  const v = validateCharacterV2(personagem);
  if (!v.ok) return { erro: "Este personagem não segue a RUPTURA v1.2; o avanço de Ranking não se aplica a ele." as const };
  const character = personagem as CharacterV2;

  const [regrasDoc, classes, subclasses] = await Promise.all([
    getCharacterRules(),
    resolveEffectiveList(campaignId, "class"),
    resolveEffectiveList(campaignId, "subclass"),
  ]);
  const classe = classes.find((c) => c.slug === character.progressao.classe_id)?.payload as unknown as ClassContentV12 | undefined;
  if (!classe) return { erro: `A Classe "${character.progressao.classe_id}" não está publicada.` as const };
  const regras = regrasDoc?.payload as CharacterRulesPayload | undefined;
  if (!regras) return { erro: "As regras de personagem não vieram do banco." as const };

  const ctx: AdvancementContextV12 = {
    classe,
    subclasses: subclasses
      .map((s) => s.payload as unknown as SubclassContentV12)
      .filter((s) => s.classe_slug === classe.slug),
    pericias: regras.pericias.map((p) => p.id),
  };
  return { character, ctx, regras };
}

export async function lerAvancoV12Action(campaignId: string | null, characterId: string): Promise<ResultadoAcao<PacoteAvancoV12 | null>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  try {
    const c = await carregar(campaignId, characterId);
    if ("erro" in c) return { ok: false, erro: c.erro };
    const pacote = advancementPackageV12(c.character, c.ctx);
    if (!pacote) return { ok: true, dados: null };
    return {
      ok: true,
      dados: {
        de: pacote.de,
        para: pacote.para,
        avanco: pacote.avanco,
        classeNome: c.ctx.classe.nome,
        caracteristicasClasse: pacote.caracteristicas_classe,
        caracteristicasSubclasse: pacote.caracteristicas_subclasse,
        subclasses: pacote.subclasses_disponiveis.map((s) => ({ slug: s.slug, nome: s.nome, descricao: s.descricao })),
        pericias: c.regras.pericias
          .map((p) => ({ id: p.id, nome: p.nome, valor: c.character.pericias[p.id] ?? 0 }))
          .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
        atributos: c.character.atributos,
        niveisVertente: c.character.magia.niveis_vertente,
      },
    };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao ler o avanço de Ranking." };
  }
}

export async function avancarRankingV12Action(
  campaignId: string | null,
  characterId: string,
  escolhas: AdvancementChoicesV12,
): Promise<ResultadoAcao<{ ranking: RankingV12 }>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  try {
    const c = await carregar(campaignId, characterId);
    if ("erro" in c) return { ok: false, erro: c.erro };
    const r = applyAdvancementV12(c.character, escolhas, c.ctx);
    if (!r.ok) return { ok: false, erro: r.errors.join(" ") };
    await advanceCharacterRankingV2(characterId, r.character as unknown as Character);
    return { ok: true, dados: { ranking: r.character.progressao.ranking } };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao avançar o Ranking." };
  }
}
