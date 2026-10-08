/** Entry point do worker; o núcleo reutilizável está em src/lib/ruptura-agent/worker.ts. */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { criarLeitorNotionAgent } from "../../src/lib/ruptura-agent/notion";
import { executarCiclo } from "../../src/lib/ruptura-agent/worker";
import { OpenAIResponsesModel } from "../../src/lib/ruptura-agent/model/provider";

config({ path: ".env.local" });

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const modelKey = process.env.MODEL_API_KEY;
  const modelName = process.env.MODEL_NAME;
  if (!url || !key || !process.env.NOTION_TOKEN || !modelKey || !modelName)
    throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NOTION_TOKEN, MODEL_API_KEY e MODEL_NAME são necessários.");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const notion = criarLeitorNotionAgent();
  const progress = setInterval(() => console.error(`Crawl Notion: ${notion.requisicoes()} requisições...`), 30_000);
  try {
    const summary = await executarCiclo({ client, notion,
      modelFactory: () => new OpenAIResponsesModel({ apiKey: modelKey, model: modelName }),
      onProgress: (message) => console.log(message),
    });
    console.log(JSON.stringify({ sources: summary.crawl.sources.length, requests: summary.crawl.requests,
      jobsCreated: summary.jobsCreated, sourcesRemoved: summary.sourcesRemoved,
      jobsCompleted: summary.jobsCompleted, jobsRetried: summary.jobsRetried,
      jobsIncomplete: summary.jobsIncomplete, bootstrap: summary.bootstrap }));
  } finally {
    clearInterval(progress);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
