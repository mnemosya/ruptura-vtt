/** Bootstrap B: validators determinísticos sobre snapshots persistidos. */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { lerSources } from "../../src/lib/ruptura-agent/sources";
import { auditarCorpus, persistirAuditoriaDeterministica } from "../../src/lib/ruptura-agent/findings";

config({ path: ".env.local" });

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some((arg) => !["--report", "--write"].includes(arg)) || (args.includes("--report") && args.includes("--write")))
    throw new Error("Uso: npm run ruptura:agent:auditar -- [--report|--write]");
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessários para ler o corpus.");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const sources = [...(await lerSources(client)).values()];
  const audit = auditarCorpus(sources);
  console.log(`${audit.sources} fontes canônicas auditadas; ${audit.findings.length} achados candidatos.`);
  for (const finding of audit.findings.slice(0, 30))
    console.log(`${finding.severity}\t${finding.detector}\t${finding.evidence[0].sourceId}\t${finding.blockId}\t${finding.title}`);
  if (args.includes("--write")) {
    const saved = await persistirAuditoriaDeterministica(client, sources);
    console.log(`${saved} achados persistidos/revistos.`);
  } else console.log("Relatório somente leitura; nenhum finding foi gravado.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
