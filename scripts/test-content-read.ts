/**
 * Script TEMPORÁRIO de teste manual da camada de leitura (src/lib/content).
 * Sem interface visual — só console.log. Usa a anon key (leitura pública).
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... npx tsx scripts/test-content-read.ts
 */

import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local" });

import {
  listSpells,
  listItems,
  getCondition,
  getCombatAction,
  getMasterTables,
} from "../src/lib/content/index.js";

function summarize(docs: { slug: string; nome: string | null }[]): string {
  return docs.map((d) => `${d.slug} (${d.nome ?? "sem nome"})`).join(", ");
}

async function main(): Promise<void> {
  console.log("=== 1. Magias cinéticas (listSpells({ vertente: 'cinetica' })) ===");
  const cineticas = await listSpells({ vertente: "cinetica" });
  console.log(`Total: ${cineticas.length}`);
  console.log(summarize(cineticas));

  console.log("\n=== 2. Itens corpo a corpo (listItems({ subtipo: 'corpo_a_corpo' })) ===");
  const corpoACorpo = await listItems({ subtipo: "corpo_a_corpo" });
  console.log(`Total: ${corpoACorpo.length}`);
  console.log(summarize(corpoACorpo));

  console.log("\n=== 3. Condição sangrando (getCondition('sangrando')) ===");
  const sangrando = await getCondition("sangrando");
  console.log(sangrando ? JSON.stringify(sangrando.payload, null, 2) : "NÃO ENCONTRADA");

  console.log("\n=== 4. Ação atacar (getCombatAction('atacar')) ===");
  const atacar = await getCombatAction("atacar");
  console.log(atacar ? JSON.stringify(atacar.payload, null, 2) : "NÃO ENCONTRADA");

  console.log("\n=== 5. Tabelas mestre (getMasterTables()) ===");
  const masterTables = await getMasterTables();
  if (!masterTables) {
    console.log("NÃO ENCONTRADA");
  } else {
    const payload = masterTables.payload as Record<string, unknown>;
    console.log(`slug: ${masterTables.slug}, chaves do payload: ${Object.keys(payload).join(", ")}`);
  }
}

main().catch((err) => {
  console.error("\ntest-content-read FALHOU:", err.message ?? err);
  process.exit(1);
});
