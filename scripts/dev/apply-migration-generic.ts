/**
 * Aplica um arquivo de migration arbitrário de supabase/migrations/ via
 * conexão direta Postgres (SUPABASE_DB_URL). Uso genérico, reutilizado
 * nos checkpoints v0.17–v0.20 (renomeado de scripts/_tmp_apply.ts —
 * ver checkpoint v0.22.1 do relatório de Mesas/Log).
 *
 * Idempotência depende do próprio arquivo de migration (usar
 * `create table if not exists`, `drop policy if exists` + `create
 * policy`, etc. — mesmo padrão das migrations já existentes).
 *
 * Uso:
 *   npx tsx scripts/dev/apply-migration-generic.ts 0011_algo.sql
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local" });

const __dirname = dirname(fileURLToPath(import.meta.url));

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Variável de ambiente obrigatória ausente: ${name}`);
    process.exit(1);
  }
  return v;
}

async function main(): Promise<void> {
  const filename = process.argv[2];
  if (!filename) {
    console.error("Uso: npx tsx scripts/dev/apply-migration-generic.ts <arquivo.sql>");
    process.exit(1);
  }
  const filePath = join(__dirname, "..", "..", "supabase", "migrations", filename);
  const connectionString = requireEnv("SUPABASE_DB_URL");

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const sql = readFileSync(filePath, "utf8");
    await client.query(sql);
    console.log("Aplicada:", filename);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("apply-migration-generic FALHOU:", err.message ?? err);
  process.exit(1);
});
