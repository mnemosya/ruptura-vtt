import "server-only";

/**
 * Carga dos catálogos do Console do Personagem — EM PARALELO.
 *
 * Extraído de `app/CharacterSheetView.tsx`, onde os onze catálogos
 * (condições, ações de combate, fluxo de combate, talentos, itens,
 * magias, propriedades, runas, escalpos, modelos de companheiro) eram
 * carregados um `await` DEPOIS DO OUTRO. Cada um é uma ida
 * independente ao Supabase; em série, o tempo de abertura do Console é
 * a SOMA de todas — e era exatamente por isso que abrir uma ficha
 * demorava.
 *
 * Aqui todas partem juntas (`Promise.allSettled`) e o tempo passa a ser
 * o da mais lenta. Nenhuma regra muda: cada catálogo continua falhando
 * ISOLADAMENTE, com a mesma mensagem de erro por catálogo que a ficha
 * já mostrava — `allSettled` (não `all`) é o que preserva isso.
 *
 * Este módulo é a fonte única dos dois pontos de entrada do Console:
 *   · `CharacterSheetView` (rota `/ficha`, Server Component);
 *   · `vtt/_painel/acoes/consolePainel.ts` (Server Action que abre o
 *     Console DENTRO do VTT, sem navegar).
 */

import {
  getCharacterRules,
  getCombatFlow,
  listConditions,
  listCombatActions,
  listProperties,
  listEscalpos,
  normalizeTechnicalContentItem,
  type TechnicalContentItem,
} from "../content";
import {
  listCompanionModelsEffective,
  listItemsEffective,
  listRunesEffective,
  listSpellsEffective,
  listTalentsEffective,
} from "../campaignContent";
import {
  normalizeCombatActionContent,
  normalizeConditionContent,
  normalizeReactionRules,
  normalizeTalentContent,
  normalizeItemContent,
  normalizeSpellContent,
  normalizeCompanionModel,
  type CombatActionContent,
  type ConditionContent,
  type ReactionRules,
  type TalentContent,
  type ItemContent,
  type SpellContent,
  type CompanionModelSummary,
} from "../character";
import type { CharacterRulesPayload } from "../character";

export interface OpcaoCondicaoConsole {
  slug: string;
  nome: string;
  descricao_curta?: string;
  tags?: string[];
}

export interface DadosConsole {
  regras: CharacterRulesPayload | null;
  usandoFallback: boolean;
  /** Erro FATAL — só quando `regras_personagem` não pôde ser lido. */
  erroFatal: string | null;

  condicoesDisponiveis: OpcaoCondicaoConsole[];
  condicoesParaAcoes: { slug: string; acoes_habilitadas?: { acao: string }[] }[];
  conditionContents: ConditionContent[];

  combatActions: CombatActionContent[];
  combatActionsError: string | null;
  reactionRules: ReactionRules;

  talents: TalentContent[];
  talentsError: string | null;
  items: ItemContent[];
  itemsError: string | null;
  spells: SpellContent[];
  spellsError: string | null;
  properties: TechnicalContentItem[];
  propertiesError: string | null;
  runes: TechnicalContentItem[];
  runesError: string | null;
  escalpos: TechnicalContentItem[];
  escalposError: string | null;
  companionModels: CompanionModelSummary[];
  companionModelsError: string | null;
}

function msg(e: unknown, padrao: string): string {
  return e instanceof Error && e.message ? e.message : padrao;
}

/** `allSettled` numa promessa só, devolvendo dado OU mensagem de erro. */
async function tolerante<T>(p: Promise<T>, padrao: string): Promise<{ dado: T | null; erro: string | null }> {
  try {
    return { dado: await p, erro: null };
  } catch (e) {
    return { dado: null, erro: msg(e, padrao) };
  }
}

export async function carregarDadosConsole(campaignId: string | null): Promise<DadosConsole> {
  // TUDO parte junto. `regras` é a única leitura cujo erro é fatal —
  // as outras dez degradam isoladamente, como sempre degradaram.
  const [
    regrasR,
    condicoesR,
    combatActionsR,
    combatFlowR,
    talentsR,
    itemsR,
    spellsR,
    propertiesR,
    runesR,
    escalposR,
    companionR,
  ] = await Promise.all([
    tolerante(getCharacterRules(), "Erro ao carregar regras_personagem."),
    tolerante(listConditions(), "Não foi possível carregar o catálogo de condições."),
    tolerante(listCombatActions(), "Não foi possível carregar o catálogo de ações."),
    tolerante(getCombatFlow(), "Não foi possível carregar o fluxo de combate."),
    tolerante(listTalentsEffective(campaignId), "Não foi possível carregar o catálogo de talentos."),
    tolerante(listItemsEffective(campaignId), "Não foi possível carregar o catálogo de itens."),
    tolerante(listSpellsEffective(campaignId), "Não foi possível carregar o catálogo de magias."),
    tolerante(listProperties(), "Não foi possível carregar o catálogo de propriedades."),
    tolerante(listRunesEffective(campaignId), "Não foi possível carregar o catálogo de runas."),
    tolerante(listEscalpos(), "Não foi possível carregar o catálogo de escalpos."),
    tolerante(listCompanionModelsEffective(campaignId), "Não foi possível carregar o catálogo de drones/robôs."),
  ]);

  const regras = (regrasR.dado?.payload as CharacterRulesPayload | undefined) ?? null;
  const docsCondicoes = condicoesR.dado ?? [];

  return {
    regras,
    usandoFallback: !regras || regras.derivados.length === 0,
    erroFatal: regrasR.erro,

    condicoesDisponiveis: docsCondicoes.map((doc) => {
      const payload = doc.payload as { descricao_curta?: string; tags?: string[] } | null;
      return {
        slug: doc.slug,
        nome: doc.nome ?? doc.slug,
        descricao_curta: payload?.descricao_curta,
        tags: Array.isArray(payload?.tags) ? payload.tags : undefined,
      };
    }),
    condicoesParaAcoes: docsCondicoes.map((doc) => {
      const payload = doc.payload as { acoes_habilitadas?: { acao: string }[] } | null;
      return { slug: doc.slug, acoes_habilitadas: payload?.acoes_habilitadas };
    }),
    conditionContents: docsCondicoes.map((doc) => normalizeConditionContent(doc.payload as Record<string, unknown>)),

    combatActions: (combatActionsR.dado ?? []).map((doc) => normalizeCombatActionContent(doc.payload as Record<string, unknown>)),
    combatActionsError: combatActionsR.erro,
    // Fail-closed: sem `combat_flow`, defesa sem Reação fica indisponível.
    reactionRules: normalizeReactionRules(combatFlowR.dado?.payload ?? null),

    talents: (talentsR.dado ?? []).map((doc) => normalizeTalentContent(doc.payload as Record<string, unknown>)),
    talentsError: talentsR.erro,
    items: (itemsR.dado ?? []).map((doc) => normalizeItemContent(doc.payload as Record<string, unknown>)),
    itemsError: itemsR.erro,
    spells: (spellsR.dado ?? []).map((doc) => normalizeSpellContent(doc.payload as Record<string, unknown>)),
    spellsError: spellsR.erro,
    properties: (propertiesR.dado ?? []).map((doc) => normalizeTechnicalContentItem(doc.payload as Record<string, unknown>)),
    propertiesError: propertiesR.erro,
    runes: (runesR.dado ?? []).map((doc) => normalizeTechnicalContentItem(doc.payload as Record<string, unknown>)),
    runesError: runesR.erro,
    escalpos: (escalposR.dado ?? []).map((doc) => normalizeTechnicalContentItem(doc.payload as Record<string, unknown>)),
    escalposError: escalposR.erro,
    companionModels: (companionR.dado ?? []).map((doc) => normalizeCompanionModel(doc.payload as Record<string, unknown>)),
    companionModelsError: companionR.erro,
  };
}
