import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { Client } from 'pg';
config({ path: '.env.local', quiet: true });
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
try {
  assert.ok(process.env.SUPABASE_DB_URL);
  await db.connect();
  await db.query('begin');
  // Migration e fixtures inteiramente revertidas, inclusive em falha.
  const { rows: [existing] } = await db.query("select to_regclass('public.campaign_online_sessions') as relation");
  if (!existing.relation) await db.query(readFileSync('supabase/migrations/0137_campaign_online_sessions.sql', 'utf8').replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, ''));
  const { rows: users } = await db.query('select id from auth.users limit 2');
  assert.equal(users.length, 2, 'Necessárias duas contas existentes para identidades do teste');
  const campaign = randomUUID();
  await db.query('insert into public.campaigns(id,name,owner_id) values($1,$2,$3)', [campaign, 'Fixture transacional sessão online', users[0].id]);
  const identity = async id => {
    await db.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)", [id, JSON.stringify({ sub: id, role: 'authenticated' })]);
    await db.query('set local role authenticated');
  };
  const set = (online, expected = null) => db.query('select public.set_campaign_online_session($1,$2,$3)', [campaign, online, expected]);
  const rows = async () => (await db.query('select * from public.campaign_online_sessions where campaign_id=$1 order by started_at', [campaign])).rows;
  const rejected = async operation => {
    await db.query('savepoint rejected');
    let failed = false;
    try { await operation(); } catch { failed = true; }
    await db.query('rollback to savepoint rejected');
    assert.ok(failed, 'A operação deveria ser recusada');
  };
  await identity(users[0].id);
  await set(true);
  const first = (await rows())[0];
  assert.equal(first.ended_at, null);
  await set(true);
  assert.equal((await rows()).length, 1, 'Iniciar novamente é idempotente');
  await rejected(() => set(false, randomUUID()));
  await set(false, first.id);
  await set(false, first.id);
  assert.ok((await rows())[0].ended_at);
  await set(true);
  const history = await rows();
  assert.equal(history.length, 2);
  assert.notEqual(history[1].id, first.id);
  assert.equal(history[1].ended_at, null);
  await rejected(() => set(false, first.id));
  await rejected(() => db.query('update public.campaign_online_sessions set ended_at=now() where campaign_id=$1', [campaign]));
  await db.query('reset role');
  await identity(users[1].id);
  assert.equal((await rows()).length, 0, 'Externo não lê sessões');
  await rejected(() => set(true));
  await rejected(() => set(false, history[1].id));
  await db.query('reset role');
  await db.query("insert into public.campaign_members(campaign_id,user_id,role,status) values($1,$2,'player','active')", [campaign, users[1].id]);
  await identity(users[1].id);
  assert.equal((await rows()).length, 2, 'Jogador lê histórico');
  await rejected(() => set(false, history[1].id));
  console.log('OK: início, encerramento, idempotência, nova sessão, confirmação obsoleta, leitura por jogador, isolamento e bloqueio de escrita direta.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.query('rollback').catch(() => {});
  await db.end();
}
