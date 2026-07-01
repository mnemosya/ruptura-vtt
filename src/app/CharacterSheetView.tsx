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

import { getCharacterRules } from "../lib/content";
import { listCharacters } from "../lib/character/storage";
import { listCampaigns } from "../lib/table/storage";
import type { CharacterRecord, CharacterRulesPayload } from "../lib/character";
import type { Campaign } from "../lib/table";
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
      personagensSalvos = await listCharacters();
    } catch {
      // Lista vazia se a tabela characters estiver fora do ar; o Client mostra o erro ao salvar.
    }
    try {
      mesasIniciais = await listCampaigns();
    } catch {
      // A ficha funciona sem mesa selecionada.
    }
  }

  return (
    <CharacterSheetClient
      regras={regras}
      usandoFallback={usandoFallback}
      personagensIniciais={personagensSalvos}
      mesasIniciais={mesasIniciais}
      initialCampaignId={campaignId}
      initialProfileId={profileId}
      mode={mode}
    />
  );
}
