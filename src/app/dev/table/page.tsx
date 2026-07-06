/**
 * Página de DEBUG da base mínima de Mesa/Log persistente — sem design
 * definitivo, igual a /dev/character-sheet.
 *
 * Server Component: busca a lista inicial de mesas no Supabase (camada
 * de leitura pública, anon key — ver src/lib/table/storage.ts). A
 * interatividade (criar mesa, selecionar mesa, ver/adicionar log) fica
 * no Client Component (TableClient).
 */

import { listCampaigns } from "../../../lib/table/storage";
import { listLegacyCharactersDev } from "../../../lib/character/storage";
import { getCurrentUser } from "../../../lib/auth/session";
import { getCharacterRules, listConditions } from "../../../lib/content";
import type { Campaign } from "../../../lib/table";
import type { CharacterRecord, CharacterRulesPayload } from "../../../lib/character";
import TableClient from "./TableClient";

export const dynamic = "force-dynamic";

export interface NarratorConditionOption {
  slug: string;
  nome: string;
}

export default async function TablePage() {
  let mesasIniciais: Campaign[] = [];
  let personagensIniciais: CharacterRecord[] = [];
  let errorMessage: string | null = null;

  // Auth dev (checkpoint v0.13) — só informativo nesta etapa: a RLS ainda
  // é a dev aberta, então o fluxo funciona logado ou não.
  const currentUser = await getCurrentUser();

  try {
    mesasIniciais = await listCampaigns();
    personagensIniciais = await listLegacyCharactersDev();
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Erro desconhecido ao carregar mesas.";
  }

  // regras_personagem (checkpoint v0.63) — só para a ferramenta de
  // narrador calcular PV/PE/Mana/Integridade MÁXIMOS de cada
  // personagem (computeDerivedStats), igual à ficha. Falha aqui não
  // trava a página — a seção "Estado dos personagens" mostra só os
  // recursos atuais sem máximo se `regras` vier null.
  let regras: CharacterRulesPayload | null = null;
  try {
    const doc = await getCharacterRules();
    regras = (doc?.payload as CharacterRulesPayload | undefined) ?? null;
  } catch {
    // Segue com regras=null — fallback de fórmulas cobre isso em computeDerivedStats.
  }

  // Condições publicadas na Biblioteca (checkpoint v0.63) — fonte única
  // do select "Aplicar condição" da ferramenta de narrador; nunca uma
  // lista hardcoded no componente.
  let condicoesDisponiveis: NarratorConditionOption[] = [];
  try {
    const docs = await listConditions();
    condicoesDisponiveis = docs.map((doc) => ({ slug: doc.slug, nome: doc.nome ?? doc.slug }));
  } catch {
    // Lista vazia — a ferramenta de aplicar condição fica sem opções, mas não quebra a página.
  }

  if (errorMessage) {
    return (
      <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20 }}>Erro ao carregar mesas</h1>
        <p style={{ color: "#ff6b6b" }}>{errorMessage}</p>
        <p style={{ opacity: 0.6, fontSize: 13 }}>
          Verifique se SUPABASE_URL e SUPABASE_ANON_KEY estão definidos em .env.local e se a
          migration 0003_campaigns_table_logs.sql foi aplicada.
        </p>
      </main>
    );
  }

  return (
    <TableClient
      mesasIniciais={mesasIniciais}
      personagensIniciais={personagensIniciais}
      currentUserEmail={currentUser?.email ?? null}
      currentUserId={currentUser?.id ?? null}
      regras={regras}
      condicoesDisponiveis={condicoesDisponiveis}
    />
  );
}
