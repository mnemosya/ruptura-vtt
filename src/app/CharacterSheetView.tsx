/**
 * View compartilhada da ficha (checkpoint v0.22) — usada tanto pela rota
 * real `/ficha` quanto pela rota dev `/dev/character-sheet`. Server
 * Component: busca regras_personagem, personagens e mesas, e renderiza
 * o CharacterSheetClient com a mesa/perfil pré-selecionados (via query).
 *
 * `mode` (checkpoint v0.24): "dev" mantém o comportamento anterior
 * (lista global de personagens/mesas para o console de diagnóstico).
 * "product" (`/ficha`) NUNCA busca a lista global — o personagem certo
 * (o ativo do perfil da sessão real) é resolvido no cliente, depois de
 * validar `sessionId` contra `lock_session_id` do perfil
 * (validateProductSession, src/lib/table/storage.ts). Isso evita expor
 * a lista global de personagens/mesas de outros narradores na rota de
 * produto, mesmo que a UI não a exiba.
 */

import { getCharacterRules, getCombatFlow, listConditions, listCombatActions, listTalents, listItems, listSpells } from "../lib/content";
import { listLegacyCharactersDev } from "../lib/character/storage";
import { listCampaigns } from "../lib/table/storage";
import {
  normalizeCombatActionContent,
  normalizeConditionContent,
  normalizeReactionRules,
  normalizeTalentContent,
  normalizeItemContent,
  normalizeSpellContent,
  type CombatActionContent,
  type ConditionContent,
  type ReactionRules,
  type TalentContent,
  type ItemContent,
  type SpellContent,
} from "../lib/character";
import type { CharacterRecord, CharacterRulesPayload } from "../lib/character";
import type { Campaign } from "../lib/table";
import type { ConditionOption } from "./dev/character-sheet/components/ConditionsTab";
import CharacterSheetClient from "./dev/character-sheet/CharacterSheetClient";

export async function CharacterSheetView({
  campaignId,
  profileId,
  mode = "dev",
}: {
  campaignId: string | null;
  profileId: string | null;
  mode?: "dev" | "product";
}) {
  let regras: CharacterRulesPayload | null = null;
  let errorMessage: string | null = null;

  try {
    const doc = await getCharacterRules();
    regras = (doc?.payload as CharacterRulesPayload | undefined) ?? null;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Erro desconhecido ao carregar regras_personagem.";
  }

  if (errorMessage) {
    return (
      <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20 }}>Erro ao carregar a ficha</h1>
        <p style={{ color: "#ff6b6b" }}>{errorMessage}</p>
        <p style={{ opacity: 0.6, fontSize: 13 }}>
          Verifique se SUPABASE_URL e SUPABASE_ANON_KEY estão definidos em .env.local e se a
          Biblioteca do Sistema foi importada (npm run seed:content).
        </p>
      </main>
    );
  }

  const usandoFallback = !regras || regras.derivados.length === 0;

  let personagensSalvos: CharacterRecord[] = [];
  let mesasIniciais: Campaign[] = [];
  if (mode === "dev") {
    try {
      personagensSalvos = await listLegacyCharactersDev();
    } catch {
      // Lista vazia se a tabela characters estiver fora do ar; o Client mostra o erro ao salvar.
    }
    try {
      mesasIniciais = await listCampaigns();
    } catch {
      // A ficha funciona sem mesa selecionada.
    }
  }

  // Condições publicadas na Biblioteca (checkpoint v0.32) — só para
  // pré-preencher o formulário manual da aba Condições; falha aqui não
  // deve travar a ficha (lista vazia = formulário totalmente manual).
  let condicoesDisponiveis: ConditionOption[] = [];
  /** Slug + acoes_habilitadas de cada condição (checkpoint v0.42) — usado só para cruzar visibilidade condicional de ações, ver actionConsole.ts. */
  let condicoesParaAcoes: { slug: string; acoes_habilitadas?: { acao: string }[] }[] = [];
  /** Conteúdo completo (payload_automacao) de cada condição publicada (checkpoint v0.44) — fonte única do motor de fim de rodada, ver endRoundConditions.ts. */
  let conditionContents: ConditionContent[] = [];
  try {
    const docs = await listConditions();
    condicoesDisponiveis = docs.map((doc) => {
      const payload = doc.payload as { descricao_curta?: string; tags?: string[] } | null;
      return {
        slug: doc.slug,
        nome: doc.nome ?? doc.slug,
        descricao_curta: payload?.descricao_curta,
        tags: Array.isArray(payload?.tags) ? payload.tags : undefined,
      };
    });
    condicoesParaAcoes = docs.map((doc) => {
      const payload = doc.payload as { acoes_habilitadas?: { acao: string }[] } | null;
      return { slug: doc.slug, acoes_habilitadas: payload?.acoes_habilitadas };
    });
    conditionContents = docs.map((doc) => normalizeConditionContent(doc.payload as Record<string, unknown>));
  } catch {
    // Biblioteca fora do ar — aba Condições continua funcional em modo manual; fim de rodada fica sem efeitos data-driven.
  }

  // Ações de combate publicadas na Biblioteca (checkpoint v0.42) — fonte
  // de verdade única do console de ação; nunca uma lista manual aqui.
  let combatActions: CombatActionContent[] = [];
  let combatActionsError: string | null = null;
  try {
    const docs = await listCombatActions();
    combatActions = docs.map((doc) => normalizeCombatActionContent(doc.payload as Record<string, unknown>));
  } catch (error) {
    // Biblioteca fora do ar — informa indisponibilidade, sem inventar catálogo local.
    combatActionsError =
      error instanceof Error ? error.message : "Não foi possível carregar o catálogo de ações.";
  }

  let reactionRules: ReactionRules = normalizeReactionRules(null);
  try {
    const combatFlow = await getCombatFlow();
    reactionRules = normalizeReactionRules(combatFlow?.payload);
  } catch {
    // Fail-closed: Reações normais continuam utilizáveis pelo custo da
    // ação, mas defesa sem Reação fica indisponível sem combat_flow.
  }

  // Talentos publicados na Biblioteca (checkpoint v0.48) — fonte única
  // do catálogo da aba Talentos; nunca uma lista manual aqui.
  let talents: TalentContent[] = [];
  let talentsError: string | null = null;
  try {
    const docs = await listTalents();
    talents = docs.map((doc) => normalizeTalentContent(doc.payload as Record<string, unknown>));
  } catch (error) {
    talentsError = error instanceof Error ? error.message : "Não foi possível carregar o catálogo de talentos.";
  }

  // Itens publicados na Biblioteca (checkpoint v0.49) — fonte única do
  // catálogo da loja/inventário; nunca uma lista manual aqui.
  let items: ItemContent[] = [];
  let itemsError: string | null = null;
  try {
    const docs = await listItems();
    items = docs.map((doc) => normalizeItemContent(doc.payload as Record<string, unknown>));
  } catch (error) {
    itemsError = error instanceof Error ? error.message : "Não foi possível carregar o catálogo de itens.";
  }

  // Magias publicadas na Biblioteca (checkpoint v0.50) — fonte única do
  // catálogo da aba Magias; nunca uma lista manual aqui.
  let spells: SpellContent[] = [];
  let spellsError: string | null = null;
  try {
    const docs = await listSpells();
    spells = docs.map((doc) => normalizeSpellContent(doc.payload as Record<string, unknown>));
  } catch (error) {
    spellsError = error instanceof Error ? error.message : "Não foi possível carregar o catálogo de magias.";
  }

  return (
    <CharacterSheetClient
      regras={regras}
      usandoFallback={usandoFallback}
      personagensIniciais={personagensSalvos}
      mesasIniciais={mesasIniciais}
      condicoesDisponiveis={condicoesDisponiveis}
      condicoesParaAcoes={condicoesParaAcoes}
      conditionContents={conditionContents}
      combatActionsIniciais={combatActions}
      combatActionsError={combatActionsError}
      reactionRules={reactionRules}
      talentsIniciais={talents}
      talentsError={talentsError}
      itemsIniciais={items}
      itemsError={itemsError}
      spellsIniciais={spells}
      spellsError={spellsError}
      initialCampaignId={campaignId}
      initialProfileId={profileId}
      mode={mode}
    />
  );
}
