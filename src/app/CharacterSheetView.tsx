/**
 * View compartilhada da ficha (checkpoint v0.22) — usada tanto pela rota
 * real `/ficha` quanto pela rota dev `/dev/character-sheet`. Server
 * Component: busca regras_personagem, personagens e mesas, e renderiza
 * o CharacterSheetClient com a mesa/perfil pré-selecionados (via query).
 *
 * `mode` (checkpoint v0.24): "dev" mantém o comportamento anterior
 * (lista global de personagens/mesas para o console de diagnóstico).
 * "product" (`/ficha`) NUNCA busca a lista global — o personagem certo
 * é resolvido no cliente. Isso evita expor a lista global de
 * personagens/mesas de outros narradores na rota de produto, mesmo que
 * a UI não a exiba.
 *
 * A CARGA DOS CATÁLOGOS mora em `lib/console/dadosConsole.ts`, em
 * paralelo, e é compartilhada com a Server Action que abre o Console
 * DENTRO do VTT. Aqui ficou só a montagem do Client.
 */

import { carregarDadosConsole } from "../lib/console/dadosConsole";
import { listLegacyCharactersDev } from "../lib/character/storage";
import { listCampaigns } from "../lib/table/storage";
import type { CharacterRecord } from "../lib/character";
import type { Campaign } from "../lib/table";
import { TABS, type TabId } from "./dev/character-sheet/components/CharacterSheetTabs";
import CharacterSheetClient from "./dev/character-sheet/CharacterSheetClient";

function resolveInitialTab(tab: string | null | undefined): TabId | undefined {
  if (!tab) return undefined;
  return (TABS as readonly string[]).includes(tab) ? (tab as TabId) : undefined;
}

export async function CharacterSheetView({
  campaignId,
  characterId,
  mode = "dev",
  initialTab,
}: {
  campaignId: string | null;
  characterId: string | null;
  mode?: "dev" | "product";
  /** Deep-link de aba (Fase 3, item de menu "Mercado" → `?tab=inventario`) — string arbitrária da URL, validada contra TABS antes de virar TabId. */
  initialTab?: string | null;
}) {
  // Os onze catálogos partem JUNTOS (`carregarDadosConsole`), não em
  // série como antes — era essa soma de esperas que fazia abrir a ficha
  // demorar. A degradação por catálogo continua idêntica: cada um falha
  // sozinho, com a própria mensagem.
  //
  // As listas de DEV (personagens/mesas globais) vão no mesmo lote, e
  // continuam existindo só no modo dev.
  const [dados, personagensSalvos, mesasIniciais] = await Promise.all([
    carregarDadosConsole(campaignId),
    mode === "dev" ? listLegacyCharactersDev().catch(() => [] as CharacterRecord[]) : Promise.resolve([] as CharacterRecord[]),
    mode === "dev" ? listCampaigns().catch(() => [] as Campaign[]) : Promise.resolve([] as Campaign[]),
  ]);

  if (dados.erroFatal) {
    return (
      <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20 }}>Erro ao carregar a ficha</h1>
        <p style={{ color: "#ff6b6b" }}>{dados.erroFatal}</p>
        <p style={{ opacity: 0.6, fontSize: 13 }}>
          Verifique se SUPABASE_URL e SUPABASE_ANON_KEY estão definidos em .env.local e se a
          Biblioteca do Sistema foi importada (npm run seed:content).
        </p>
      </main>
    );
  }

  return (
    <CharacterSheetClient
      regras={dados.regras}
      usandoFallback={dados.usandoFallback}
      personagensIniciais={personagensSalvos}
      mesasIniciais={mesasIniciais}
      condicoesDisponiveis={dados.condicoesDisponiveis}
      condicoesParaAcoes={dados.condicoesParaAcoes}
      conditionContents={dados.conditionContents}
      combatActionsIniciais={dados.combatActions}
      combatActionsError={dados.combatActionsError}
      reactionRules={dados.reactionRules}
      talentsIniciais={dados.talents}
      talentsError={dados.talentsError}
      itemsIniciais={dados.items}
      itemsError={dados.itemsError}
      spellsIniciais={dados.spells}
      spellsError={dados.spellsError}
      propertiesIniciais={dados.properties}
      propertiesError={dados.propertiesError}
      runesIniciais={dados.runes}
      runesError={dados.runesError}
      escalposIniciais={dados.escalpos}
      escalposError={dados.escalposError}
      companionModelsIniciais={dados.companionModels}
      companionModelsError={dados.companionModelsError}
      initialCampaignId={campaignId}
      initialCharacterId={characterId}
      mode={mode}
      initialTab={resolveInitialTab(initialTab)}
    />
  );
}
