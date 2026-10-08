/** Bootstrap A do agente: relatório read-only ou persistência explícita. */
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { rastrearCorpus, relatorioCobertura } from "../../src/lib/ruptura-agent/crawler";
import { criarLeitorNotionAgent } from "../../src/lib/ruptura-agent/notion";
import { lerSources } from "../../src/lib/ruptura-agent/sources";
import { finalizarJob, iniciarCrawlJob, persistirCorpusComJobs } from "../../src/lib/ruptura-agent/jobs";

config({ path: ".env.local" });

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some((arg) => !["--report", "--write"].includes(arg))) throw new Error("Uso: npm run ruptura:agent:crawl -- [--report] [--write]");
  const write = args.includes("--write");
  if (write && args.includes("--report")) throw new Error("Escolha --report (somente leitura) ou --write (persistir corpus).");
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (write && (!url || !key)) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessários para --write.");
  const client = write && url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  const workerId = `manual-crawl-${randomUUID()}`;
  const crawlJob = client ? await iniciarCrawlJob(client, randomUUID(), workerId) : null;
  const startedAt = new Date().toISOString();
  const notion = criarLeitorNotionAgent();
  const progresso = setInterval(() => console.error(`Lendo Notion: ${notion.requisicoes()} requisições...`), 30_000);
  try {
    const previous = client ? await lerSources(client) : undefined;
    const result = await rastrearCorpus(notion, previous);
    console.log(relatorioCobertura(result));
    if (client && crawlJob) {
      const persisted = await persistirCorpusComJobs(client, result.sources, previous ?? new Map(), startedAt);
      await finalizarJob(client, crawlJob.id, workerId, "completed", { sources: result.sources.length, requests: result.requests,
        jobsCreated: persisted.jobs, sourcesRemoved: persisted.removed });
      console.log(`Corpus gravado: ${result.sources.length} fontes; ${persisted.jobs} jobs de criação/alteração; ${persisted.removed} remoções.`);
    } else console.log("Relatório somente leitura; nenhuma fonte foi gravada.");
  } catch (error) {
    if (client && crawlJob) await finalizarJob(client, crawlJob.id, workerId, "failed", {},
      error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    clearInterval(progresso);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
