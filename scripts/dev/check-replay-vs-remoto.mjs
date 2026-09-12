#!/usr/bin/env node
/**
 * Compara o CATÁLOGO de dois bancos — o local recém-replayado e o
 * remoto — e lista tudo que diverge.
 *
 * `check-migrations-vs-banco.mjs` compara corpos de função lendo os
 * arquivos SQL; é barato e roda sem infraestrutura, mas não enxerga
 * tabela, coluna, índice, constraint, policy, gatilho nem grant. Este
 * enxerga, porque não lê arquivo nenhum: ele deixa o Postgres replayar
 * as migrations e compara os dois catálogos resultantes.
 *
 * É este que responde "o histórico local reproduz o banco remoto?".
 *
 * Uso: npx tsx scripts/dev/check-replay-vs-remoto.mjs
 *   (depois de `supabase start` + `replay-migrations.mjs`)
 */
import { config } from "dotenv";
import { Client } from "pg";
config({ path: ".env.local" });

const LOCAL = process.env.SUPABASE_DB_URL_LOCAL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const REMOTO = process.env.SUPABASE_DB_URL;
if (!REMOTO) { console.error("SUPABASE_DB_URL ausente em .env.local"); process.exit(1); }

/**
 * Cada consulta devolve linhas com uma `chave` (o que identifica o
 * objeto) e um `valor` (o que precisa bater). Comparar chave a chave
 * distingue os três casos que importam — só aqui, só lá, e diferente —
 * em vez de despejar um diff de texto.
 */
const CONSULTAS = {
  "tabelas e colunas": `
    select c.relname || '.' || a.attname as chave,
           format_type(a.atttypid, a.atttypmod)
             || case when a.attnotnull then ' NOT NULL' else '' end
             || coalesce(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '') as valor
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid
      left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
     where n.nspname = 'public' and c.relkind = 'r'
       and a.attnum > 0 and not a.attisdropped`,

  "RLS ligada": `
    select c.relname as chave, c.relrowsecurity::text as valor
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'`,

  "policies": `
    select tablename || '.' || policyname as chave,
           cmd || ' | ' || coalesce(qual, '-') || ' | ' || coalesce(with_check, '-') as valor
      from pg_policies where schemaname = 'public'`,

  "índices": `
    select indexname as chave, indexdef as valor
      from pg_indexes where schemaname = 'public'`,

  "constraints": `
    select c.conname as chave, pg_get_constraintdef(c.oid) as valor
      from pg_constraint c join pg_namespace n on n.oid = c.connamespace
     where n.nspname = 'public'`,

  "funções": `
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as chave,
           md5(regexp_replace(regexp_replace(p.prosrc, '--[^\\n]*', '', 'g'), '\\s+', ' ', 'g'))
             || ' secdef=' || p.prosecdef::text as valor
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'`,

  "gatilhos": `
    select c.relname || '.' || t.tgname as chave, pg_get_triggerdef(t.oid) as valor
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and not t.tgisinternal`,

  "grants de tabela": `
    select table_name || '.' || grantee || '.' || privilege_type as chave, 'sim' as valor
      from information_schema.role_table_grants
     where table_schema = 'public' and grantee in ('anon','authenticated','service_role')`,

  "grants de função": `
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ').' || r.rolname as chave,
           has_function_privilege(r.rolname, p.oid, 'EXECUTE')::text as valor
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      cross join (select unnest(array['anon','authenticated','service_role']) as rolname) r
     where n.nspname = 'public'`,

  "publicação de realtime": `
    select tablename as chave, 'publicada' as valor
      from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'`,
};

async function catalogo(url) {
  const c = new Client({
    connectionString: url,
    ssl: url.includes("127.0.0.1") || url.includes("localhost") ? false : { rejectUnauthorized: false },
  });
  await c.connect();
  const out = {};
  for (const [nome, sql] of Object.entries(CONSULTAS)) {
    const { rows } = await c.query(sql);
    out[nome] = new Map(rows.map((r) => [r.chave, r.valor]));
  }
  await c.end();
  return out;
}

const [local, remoto] = await Promise.all([catalogo(LOCAL), catalogo(REMOTO)]);

let total = 0;
for (const nome of Object.keys(CONSULTAS)) {
  const L = local[nome], R = remoto[nome];
  const soLocal = [...L.keys()].filter((k) => !R.has(k));
  const soRemoto = [...R.keys()].filter((k) => !L.has(k));
  const diferem = [...L.keys()].filter((k) => R.has(k) && R.get(k) !== L.get(k));
  const n = soLocal.length + soRemoto.length + diferem.length;
  total += n;

  console.log(`${n === 0 ? "ok  " : "DIFF"} ${nome}: ${L.size} local / ${R.size} remoto` + (n ? ` — ${n} divergência(s)` : ""));
  const amostra = (rotulo, lista) => {
    if (!lista.length) return;
    console.log(`       ${rotulo} (${lista.length}): ${lista.slice(0, 8).join(", ")}${lista.length > 8 ? ", …" : ""}`);
  };
  amostra("só no replay", soLocal);
  amostra("só no remoto", soRemoto);
  amostra("diferentes", diferem);
}

console.log(total === 0
  ? "\nO replay reproduz o remoto. O histórico local é a verdade."
  : `\n${total} divergência(s): o remoto NÃO é reproduzível a partir do Git como está.`);
process.exit(total === 0 ? 0 : 1);
