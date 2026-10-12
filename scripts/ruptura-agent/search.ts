/** Busca local sobre o corpus já persistido. Não consulta nem altera o Notion. */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { lerSources } from "../../src/lib/ruptura-agent/sources";
import { SourceSearch, type SearchDomain } from "../../src/lib/ruptura-agent/search";

config({ path: ".env.local" });

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const domainArg = args.find((arg) => arg.startsWith("--domain="));
  const domain = domainArg?.slice("--domain=".length) ?? "rules";
  if (!["rules", "editorial", "design", "historical", "all"].includes(domain)) throw new Error(`Domínio inválido: ${domain}`);
  const query = args.filter((arg) => !arg.startsWith("--domain=")).join(" ").trim();
  if (!query) throw new Error("Uso: npm run ruptura:agent:search -- termo [--domain=rules|editorial|design|historical|all]");
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessários para ler o corpus.");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const corpus = await lerSources(client);
  const search = new SourceSearch([...corpus.values()]);
  for (const hit of search.search(query, { domain: domain as SearchDomain, limit: 20 })) {
    console.log(`${hit.score}\t${hit.role}\t${hit.path.join(" › ")}\t${hit.blockId ?? "página"}\t${hit.snippet.replace(/\s+/g, " ").slice(0, 160)}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
