/** Drena jobs determinísticos já criados, sem novo crawl nem provider de modelo. */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { lerSources } from "../../src/lib/ruptura-agent/sources";
import { processarJobsPendentes } from "../../src/lib/ruptura-agent/worker";

config({ path: ".env.local" });

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessários.");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { count: semanticCount, error: semanticError } = await client.from("ruptura_agent_jobs")
    .select("id", { count: "exact", head: true })
    .in("kind", ["source_changed", "guide_changed"])
    .in("status", ["pending", "retry", "running"]);
  if (semanticError) throw new Error(`Falha ao verificar jobs semânticos: ${semanticError.message}`);
  if (semanticCount) throw new Error("Há jobs semânticos pendentes; use o ciclo com provider configurado.");
  const { count: crawlsRunning, error: crawlError } = await client.from("ruptura_agent_jobs")
    .select("id", { count: "exact", head: true }).eq("kind", "crawl").eq("status", "running");
  if (crawlError) throw new Error(`Falha ao verificar crawls ativos: ${crawlError.message}`);
  if (crawlsRunning) throw new Error("Há um crawl ativo; aguarde sua conclusão.");
  const sources = [...(await lerSources(client)).values()];
  let processed = 0;
  const summary = await processarJobsPendentes({ client, sources, maxJobs: 1000,
    onProgress: () => { if (++processed % 50 === 0) console.log(`${processed} jobs reivindicados...`); } });
  console.log(JSON.stringify(summary));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
