#!/usr/bin/env node
/**
 * Aplica TODAS as migrations, em ordem, num banco alvo — o replay que
 * responde "um banco limpo chega onde o remoto está?".
 *
 * Usa a mesma ordenação por nome de arquivo que este projeto sempre
 * usou na prática (`apply-migration-generic.ts`, um arquivo por vez),
 * e NÃO o ledger `supabase_migrations.schema_migrations`, que aqui
 * nunca foi fonte de verdade: aplicar por conexão direta não registra
 * nada nele. É de propósito que o replay imite o caminho real em vez
 * do caminho oficial — é o caminho real que produziu o banco atual.
 *
 * Para no PRIMEIRO erro e diz qual arquivo e qual linha. Uma migration
 * que não replaya do zero é um achado, não um contratempo.
 *
 * Uso:
 *   npx tsx scripts/dev/replay-migrations.mjs                 # banco local
 *   npx tsx scripts/dev/replay-migrations.mjs "postgres://…"  # explícito
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { Client } from "pg";
config({ path: ".env.local" });

const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const url = process.argv[2] ?? process.env.SUPABASE_DB_URL_LOCAL ?? LOCAL;

if (url === process.env.SUPABASE_DB_URL) {
  console.error("Recusado: esse é o banco de PRODUÇÃO. O replay é para banco descartável.");
  process.exit(1);
}

const DIR = "supabase/migrations";
const arquivos = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

const client = new Client({
  connectionString: url,
  ssl: url.includes("127.0.0.1") || url.includes("localhost") ? false : { rejectUnauthorized: false },
});
await client.connect();
console.log(`Replay de ${arquivos.length} migrations em ${url.replace(/:[^:@]*@/, ":***@")}\n`);

let n = 0;
for (const f of arquivos) {
  const sql = readFileSync(join(DIR, f), "utf8");
  try {
    await client.query(sql);
    n++;
    process.stdout.write(`  ok  ${f}\n`);
  } catch (e) {
    console.error(`\nFALHOU em ${f} (após ${n} aplicadas com sucesso)`);
    console.error(`  ${e.message}`);
    if (e.position) {
      const linha = sql.slice(0, Number(e.position)).split("\n").length;
      console.error(`  linha ~${linha}: ${sql.split("\n")[linha - 1]?.trim()}`);
    }
    if (e.where) console.error(`  em: ${e.where}`);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log(`\n${n} migrations aplicadas. Agora: npx tsx scripts/dev/check-replay-vs-remoto.mjs`);
