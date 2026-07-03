/**
 * Verifica que `characters`/`campaigns`/`table_logs` estão publicadas
 * para Realtime (checkpoint v0.46.1) — sem isso, o client de browser
 * conecta ao canal com sucesso mas nunca recebe eventos
 * `postgres_changes` (ver relatório do v0.46).
 *
 * `pg_publication_tables` é um catálogo do sistema, não exposto via
 * PostgREST (o client `@supabase/supabase-js` usado no resto do
 * projeto só alcança tabelas do schema `public`) — por isso este
 * script usa conexão direta Postgres (`pg` + `SUPABASE_DB_URL`), mesmo
 * padrão já usado por `scripts/apply-migration.ts`.
 */

import { config as loadDotenv } from "dotenv";
import { Client } from "pg";

loadDotenv({ path: ".env.local" });

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Variável de ambiente obrigatória ausente: ${name}`);
    process.exit(1);
  }
  return v;
}

const REQUIRED_TABLES = ["characters", "campaigns", "table_logs"] as const;

async function main(): Promise<void> {
  console.log("=== test-realtime-publication ===\n");

  const client = new Client({ connectionString: requireEnv("SUPABASE_DB_URL") });
  await client.connect();

  try {
    const { rows } = await client.query<{ tablename: string }>(
      `select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'`,
    );
    const published = new Set(rows.map((r) => r.tablename));

    const missing = REQUIRED_TABLES.filter((t) => !published.has(t));

    for (const table of REQUIRED_TABLES) {
      const status = published.has(table) ? "publicada" : "AUSENTE";
      console.log(`- public.${table}: ${status}`);
    }

    if (missing.length > 0) {
      throw new Error(
        `Tabela(s) faltando na publicação "supabase_realtime": ${missing.map((t) => `public.${t}`).join(", ")}. ` +
          `Aplique a migration 0018_realtime_publication.sql (ou rode: alter publication supabase_realtime add table public.<tabela>;).`,
      );
    }

    console.log("\ntest-realtime-publication — todas as tabelas obrigatórias estão publicadas.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("\ntest-realtime-publication FALHOU:", err instanceof Error ? err.message : err);
  process.exit(1);
});
