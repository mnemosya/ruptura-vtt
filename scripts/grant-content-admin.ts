/**
 * Concede (ou revoga) acesso administrativo à Biblioteca para uma conta
 * já cadastrada no Supabase Auth (via /dev/login ou /login). Não guarda
 * nenhum email/senha/segredo no repositório — o email é passado como
 * argumento de linha de comando na hora de rodar, nunca commitado.
 *
 * Uso:
 *   SUPABASE_DB_URL=postgres://... npx tsx scripts/grant-content-admin.ts conceder alguem@exemplo.com
 *   SUPABASE_DB_URL=postgres://... npx tsx scripts/grant-content-admin.ts revogar alguem@exemplo.com
 *   SUPABASE_DB_URL=postgres://... npx tsx scripts/grant-content-admin.ts listar
 *
 * Requer conexão direta Postgres (mesma variável já usada por
 * scripts/apply-migration.ts) porque precisa consultar auth.users, que
 * não é acessível via PostgREST/anon key.
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

async function findUserIdByEmail(client: Client, email: string): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>("select id from auth.users where lower(email) = lower($1) limit 1", [email]);
  return rows[0]?.id ?? null;
}

async function main(): Promise<void> {
  const [, , comando, emailArg] = process.argv;
  if (!comando || !["conceder", "revogar", "listar"].includes(comando)) {
    console.error("Uso: npx tsx scripts/grant-content-admin.ts <conceder|revogar|listar> [email]");
    process.exit(1);
  }
  if (comando !== "listar" && !emailArg) {
    console.error(`Uso: npx tsx scripts/grant-content-admin.ts ${comando} <email>`);
    process.exit(1);
  }

  const connectionString = requireEnv("SUPABASE_DB_URL");
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    if (comando === "listar") {
      const { rows } = await client.query(
        `select au.user_id, u.email, au.granted_at, au.note
         from admin_users au join auth.users u on u.id = au.user_id
         order by au.granted_at asc`,
      );
      if (rows.length === 0) {
        console.log("Nenhum administrador concedido ainda.");
      } else {
        console.log("Administradores da Biblioteca:");
        for (const row of rows) {
          console.log(`  - ${row.email} (user_id=${row.user_id}, concedido em ${row.granted_at.toISOString?.() ?? row.granted_at})`);
        }
      }
      return;
    }

    const userId = await findUserIdByEmail(client, emailArg);
    if (!userId) {
      console.error(`Nenhuma conta Supabase Auth encontrada para "${emailArg}". Crie a conta primeiro (via /login ou /dev/login) e rode este comando de novo.`);
      process.exit(1);
    }

    if (comando === "conceder") {
      await client.query(
        `insert into admin_users (user_id, granted_by, note)
         values ($1, 'scripts/grant-content-admin.ts', 'concedido via script local')
         on conflict (user_id) do nothing`,
        [userId],
      );
      console.log(`OK — "${emailArg}" (user_id=${userId}) agora é administrador da Biblioteca.`);
    } else {
      await client.query("delete from admin_users where user_id = $1", [userId]);
      console.log(`OK — acesso administrativo de "${emailArg}" (user_id=${userId}) revogado.`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("grant-content-admin FALHOU:", err.message ?? err);
  process.exit(1);
});
