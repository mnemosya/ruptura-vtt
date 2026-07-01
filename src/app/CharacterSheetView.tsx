/**
 * View compartilhada da ficha (checkpoint v0.22) — usada tanto pela rota
 * real `/ficha` quanto pela rota dev `/dev/character-sheet`. Server
 * Component: busca regras_personagem, personagens e mesas, e renderiza
 * o CharacterSheetClient com a mesa/perfil pré-selecionados (via query).
 */

import { getCharacterRules } from "../lib/content";
import { listCharacters } from "../lib/character/storage";
import { listCampaigns } from "../lib/table/storage";
import type { CharacterRecord, CharacterRulesPayload } from "../lib/character";
import type { Campaign } from "../lib/table";
import CharacterSheetClient from "./dev/character-sheet/CharacterSheetClient";

export async function CharacterSheetView({
  campaignId,
  profileId,
}: {
  campaignId: string | null;
  profileId: string | null;
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
  try {
    personagensSalvos = await listCharacters();
  } catch {
    // Lista vazia se a tabela characters estiver fora do ar; o Client mostra o erro ao salvar.
  }

  let mesasIniciais: Campaign[] = [];
  try {
    mesasIniciais = await listCampaigns();
  } catch {
    // A ficha funciona sem mesa selecionada.
  }

  return (
    <CharacterSheetClient
      regras={regras}
      usandoFallback={usandoFallback}
      personagensIniciais={personagensSalvos}
      mesasIniciais={mesasIniciais}
      initialCampaignId={campaignId}
      initialProfileId={profileId}
    />
  );
}
