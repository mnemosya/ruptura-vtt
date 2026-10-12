/** Auditoria semântica manual, somente leitura. Nunca altera Notion ou VTT. */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { lerSources } from "../../src/lib/ruptura-agent/sources";
import { executarAuditoriaSemantica } from "../../src/lib/ruptura-agent/agent";
import { OpenAIResponsesModel } from "../../src/lib/ruptura-agent/model/provider";
import { notionId } from "../../src/lib/ruptura-agent/config";
import { persistirFindingsSemanticos } from "../../src/lib/ruptura-agent/model/findings";

config({ path: ".env.local" });

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const id = args.find((arg) => !arg.startsWith("--"));
  if (!id || args.some((arg) => arg.startsWith("--") && arg !== "--write") || args.filter((arg) => !arg.startsWith("--")).length !== 1)
    throw new Error("Uso: npm run ruptura:agent:semantico -- <notion_id> [--write]");
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessários para ler o corpus.");
  const modelKey = process.env.MODEL_API_KEY;
  const modelName = process.env.MODEL_NAME;
  if (!modelKey || !modelName) throw new Error("MODEL_API_KEY e MODEL_NAME são necessários para a API do modelo.");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const sources = [...(await lerSources(client)).values()];
  const target = sources.find((source) => source.notion_id === notionId(id) && source.active);
  if (!target) throw new Error("Fonte não encontrada ou inativa no corpus.");
  const model = new OpenAIResponsesModel({ apiKey: modelKey, model: modelName });
  const task = `Audite impactos e possíveis contradições introduzidas pela fonte atual ${target.title} ` +
    `(${target.notion_id}; revisão ${target.snapshot_hash}; path ${target.path.join(" › ")}). ` +
    "Leia a fonte, pesquise regras relacionadas e siga referências relevantes. Reporte somente achados com trechos exatos e IDs de bloco; exponha conflitos sem resolver silenciosamente.";
  const result = await executarAuditoriaSemantica(model, task, sources);
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "completed") process.exitCode = 2;
  else if (args.includes("--write")) {
    const saved = await persistirFindingsSemanticos(client, target, result.findings, sources);
    console.log(`${saved} achados semânticos persistidos/revistos.`);
  } else console.log("Relatório somente leitura; nenhum finding foi gravado.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
