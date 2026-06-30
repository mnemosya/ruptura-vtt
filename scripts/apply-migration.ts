/**
 * Ruptura VTT — Aplica a migration 0001_content_library.sql via conexão
 * direta Postgres (necessário porque a migration cria tabelas e RLS,
 * algo fora do alcance do cliente PostgREST usado pelo seed/validador).
 *
 * Idempotente: a migration usa `create table if not exists`,
 * `create extension if not exists` e `drop policy if exists` + `create
 * policy`, então rodar de novo não duplica nada.
 *
 * Uso:
 *   SUPABASE_DB_URL=postgres://... npx tsx scripts/apply-migration.ts
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { Client } from "pg";

loadDotenv({ path: ".env.local" });

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_FILE = join(__dirname, "..", "supabase", "migrations", "0001_content_library.sql");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Variável de ambiente obrigatória ausente: ${name}`);
    process.exit(1);
  }
  return v;
}

const TABLES = ["content_packs", "content_documents", "content_changelog"] as const;

async function tablesExist(client: Client): Promise<Record<string, boolean>> {
  const { rows } = await client.query(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_name = any($1::text[])`,
    [TABLES],
  );
  const present = new Set(rows.map((r) => r.table_name as string));
  return Object.fromEntries(TABLES.map((t) => [t, present.has(t)]));
}

async function rlsStatus(client: Client): Promise<Record<string, boolean>> {
  const { rows } = await client.query(
    `select relname, relrowsecurity from pg_class
     where relnamespace = 'public'::regnamespace and relname = any($1::text[])`,
    [TABLES],
  );
  const status = new Map(rows.map((r) => [r.relname as string, r.relrowsecurity as boolean]));
  return Object.fromEntries(TABLES.map((t) => [t, status.get(t) ?? false]));
}

interface PolicyRow {
  tablename: string;
  policyname: string;
  cmd: string;
  roles: string[];
  qual: string | null;
}

/** pg_policies.roles vem como literal de array do Postgres, ex. "{anon,authenticated}". */
function parsePgTextArray(v: string): string[] {
  return v.replace(/^\{|\}$/g, "").split(",").filter(Boolean);
}

async function policiesFor(client: Client, table: string): Promise<PolicyRow[]> {
  const { rows } = await client.query(
    `select tablename, policyname, cmd, roles, qual from pg_policies
     where schemaname = 'public' and tablename = $1`,
    [table],
  );
  return rows.map((r) => ({
    ...r,
    roles: Array.isArray(r.roles) ? r.roles : parsePgTextArray(r.roles as unknown as string),
  })) as PolicyRow[];
}

async function main(): Promise<void> {
  const SUPABASE_DB_URL = requireEnv("SUPABASE_DB_URL");
  const client = new Client({ connectionString: SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const before = await tablesExist(client);
    const missing = TABLES.filter((t) => !before[t]);

    if (missing.length > 0) {
      console.log(`Tabelas ausentes (${missing.join(", ")}) — aplicando migration...`);
      const sql = readFileSync(MIGRATION_FILE, "utf8");
      await client.query(sql);
      console.log("Migration aplicada.");
    } else {
      console.log("As três tabelas já existem — migration não precisou ser aplicada (idempotente, mas pulada).");
      // Roda mesmo assim para garantir RLS/policies/índices em dia (tudo idempotente no arquivo).
      const sql = readFileSync(MIGRATION_FILE, "utf8");
      await client.query(sql);
      console.log("Migration reaplicada para garantir convergência (idempotente).");
    }

    const after = await tablesExist(client);
    const rls = await rlsStatus(client);

    console.log("\nTabelas:");
    for (const t of TABLES) console.log(`  ${after[t] ? "OK  " : "FAIL"} ${t}`);

    console.log("\nRLS habilitado:");
    for (const t of TABLES) console.log(`  ${rls[t] ? "OK  " : "FAIL"} ${t}`);

    const docsPolicies = await policiesFor(client, "content_documents");
    const publicRead = docsPolicies.find(
      (p) => p.cmd === "SELECT" && p.roles.includes("anon") && (p.qual ?? "").includes("published"),
    );
    console.log("\ncontent_documents — policy pública de leitura (status='published'):");
    console.log(`  ${publicRead ? "OK  " : "FAIL"} ${publicRead ? publicRead.policyname : "não encontrada"}`);

    const changelogPolicies = await policiesFor(client, "content_changelog");
    const changelogPublicSelect = changelogPolicies.find(
      (p) => p.cmd === "SELECT" && (p.roles.includes("anon") || p.roles.includes("authenticated")),
    );
    console.log("\ncontent_changelog — sem leitura pública:");
    console.log(`  ${!changelogPublicSelect ? "OK  " : "FAIL"} ${changelogPublicSelect ? `policy inesperada: ${changelogPublicSelect.policyname}` : "nenhuma policy de select pública"}`);

    const allOk =
      TABLES.every((t) => after[t] && rls[t]) && !!publicRead && !changelogPublicSelect;
    if (!allOk) {
      console.error("\nVerificação de migration/RLS FALHOU.");
      process.exit(1);
    }
    console.log("\nMigration + RLS + policies OK.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("\napply-migration FALHOU:", err.message ?? err);
  process.exit(1);
});
