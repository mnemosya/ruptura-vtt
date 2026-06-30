/**
 * Página de DEBUG da ficha mínima — sem design definitivo.
 *
 * Server Component: busca regras_personagem no Supabase (camada de
 * leitura pública, anon key — ver src/lib/content) e a lista inicial de
 * personagens salvos (ver src/lib/character/storage). A interatividade
 * (mudar atributos/perícias, recalcular derivados, salvar/carregar)
 * fica no Client Component (CharacterSheetClient).
 */

import { getCharacterRules } from "../../../lib/content";
import { listCharacters } from "../../../lib/character/storage";
import { listCampaigns } from "../../../lib/table/storage";
import type { CharacterRecord, CharacterRulesPayload } from "../../../lib/character";
import type { Campaign } from "../../../lib/table";
import CharacterSheetClient from "./CharacterSheetClient";

export const dynamic = "force-dynamic";

interface PageProps {
  /**
   * `?campaignId=...&profileId=...` — vindos de `/dev/join/[campaignId]`
   * (checkpoint v0.10), repassados para CharacterSheetClient
   * pré-selecionar mesa/perfil. Ausentes na abertura direta da ficha.
   */
  searchParams: Promise<{ campaignId?: string; profileId?: string }>;
}

export default async function CharacterSheetPage({ searchParams }: PageProps) {
  const params = await searchParams;
  let regras: CharacterRulesPayload | null = null;
  let errorMessage: string | null = null;

  try {
    const doc = await getCharacterRules();
    regras = (doc?.payload as CharacterRulesPayload | undefined) ?? null;
  } catch (err) {
    errorMessage =
      err instanceof Error ? err.message : "Erro desconhecido ao carregar regras_personagem.";
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
    // Lista vazia se a tabela characters ainda não existir/estiver fora do ar;
    // o Client Component mostra o erro ao tentar salvar, não bloqueia a página.
  }

  let mesasIniciais: Campaign[] = [];
  try {
    mesasIniciais = await listCampaigns();
  } catch {
    // Lista vazia se a tabela campaigns ainda não existir/estiver fora do ar;
    // a ficha funciona normalmente sem mesa selecionada (ver RollsTab).
  }

  return (
    <CharacterSheetClient
      regras={regras}
      usandoFallback={usandoFallback}
      personagensIniciais={personagensSalvos}
      mesasIniciais={mesasIniciais}
      initialCampaignId={params.campaignId ?? null}
      initialProfileId={params.profileId ?? null}
    />
  );
}
