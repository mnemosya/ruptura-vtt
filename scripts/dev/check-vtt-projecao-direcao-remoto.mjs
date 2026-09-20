import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import { Client } from 'pg';

config({ path: '.env.local', quiet: true });
const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
const sql = readFileSync('supabase/migrations/0136_vtt_projecao_direcao_token.sql', 'utf8');
const oldSql = readFileSync('supabase/migrations/0112_vtt_autorizacao_por_cena.sql', 'utf8');
const body = source => source.match(/AS \$function\$([\s\S]*?)\$function\$;/i)[1];
const normalize = source => source.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();

try {
  assert.ok(process.env.SUPABASE_DB_URL, 'SUPABASE_DB_URL ausente');
  await client.connect();
  const { rows: [fn] } = await client.query("select prosrc from pg_proc where oid = 'public.read_vtt_scene_tokens(uuid)'::regprocedure");
  const oldBody = body(oldSql.slice(oldSql.indexOf('CREATE OR REPLACE FUNCTION public.read_vtt_scene_tokens')));
  assert.ok([normalize(oldBody), normalize(body(sql))].includes(normalize(fn.prosrc)), 'A função remota divergiu da base conhecida; aplicação interrompida para preservar alterações.');
  if (process.argv.includes('--apply')) {
    await client.query(sql);
    console.log('Migration 0136 aplicada.');
  }
  const { rows: [updated] } = await client.query("select prosrc from pg_proc where oid = 'public.read_vtt_scene_tokens(uuid)'::regprocedure");
  assert.equal(normalize(updated.prosrc), normalize(body(sql)), 'Função remota não corresponde à correção');
  console.log('Definição remota confirmada.');

  // Exercita a função real com identidade do narrador, sem alterar tokens.
  await client.query('begin read only');
  const { rows: scenes } = await client.query(`select distinct t.scene_id, c.owner_id
    from public.vtt_tokens t join public.campaigns c on c.id=t.campaign_id
    where c.owner_id is not null order by t.scene_id limit 20`);
  let checked = 0, colossal = 0, nonzero = 0;
  for (const scene of scenes) {
    await client.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)", [scene.owner_id, JSON.stringify({ sub: scene.owner_id, role: 'authenticated' })]);
    const { rows: [result] } = await client.query('select public.read_vtt_scene_tokens($1) as tokens', [scene.scene_id]);
    const { rows: stored } = await client.query('select id, direcao from public.vtt_tokens where scene_id=$1', [scene.scene_id]);
    const expected = new Map(stored.map(t => [t.id, t.direcao]));
    for (const token of result.tokens) {
      assert.equal(token.direcao, expected.get(token.id), 'Direção projetada diverge da persistida');
      checked++;
      if (token.tamanho === 'colossal') colossal++;
      if (token.direcao !== 0) nonzero++;
    }
  }
  await client.query('rollback');
  console.log(JSON.stringify({ tokensVerificados: checked, colossais: colossal, direcoesNaoZero: nonzero }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
