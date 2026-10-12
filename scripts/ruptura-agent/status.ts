/** Estado operacional, somente leitura. */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessários.");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const [table, states, column] of [
    ["ruptura_agent_sources", ["active", "inactive"], "active"],
    ["ruptura_agent_jobs", ["pending", "running", "retry", "completed", "incomplete", "failed"], "status"],
    ["ruptura_agent_findings", ["open", "acknowledged", "stale", "resolved", "ignored"], "status"],
  ] as const) {
    console.log(table);
    for (const state of states) {
      const value = column === "active" ? state === "active" : state;
      const { count, error } = await client.from(table).select("id", { count: "exact", head: true }).eq(column, value);
      if (error) throw new Error(`Falha ao ler ${table}: ${error.message}`);
      console.log(`  ${state}: ${count ?? 0}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
