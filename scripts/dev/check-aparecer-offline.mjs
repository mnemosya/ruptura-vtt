// PRES-02 — "Aparecer offline" contra a matriz aprovada em PRES-01.
// Transacional: tudo revertido, inclusive em falha.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { Client } from 'pg';
config({ path: '.env.local', quiet: true });
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
try {
  assert.ok(process.env.SUPABASE_DB_URL, 'SUPABASE_DB_URL ausente');
  await db.connect();
  await db.query('begin');
  const { rows: [existe] } = await db.query("select to_regclass('public.user_presence_preferences') as t");
  if (!existe.t) await db.query(readFileSync('supabase/migrations/0140_aparecer_offline.sql', 'utf8').replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, ''));

  const { rows: users } = await db.query('select id from auth.users limit 3');
  assert.ok(users.length >= 3, 'Necessárias três contas para narrador e dois jogadores');
  const [narrador, jogadorA, jogadorB] = users.map(u => u.id);
  const campaign = randomUUID();
  await db.query('insert into public.campaigns(id,name,owner_id) values($1,$2,$3)', [campaign, 'Fixture aparecer offline', narrador]);
  for (const uid of [jogadorA, jogadorB]) {
    await db.query("insert into public.campaign_members(campaign_id,user_id,role,status,origem) values($1,$2,'player','active','fixture_offline')", [campaign, uid]);
  }
  const identity = async id => {
    await db.query('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)", [id, JSON.stringify({ sub: id, role: 'authenticated' })]);
    await db.query('set local role authenticated');
  };
  const ler = async () => (await db.query('select public.read_campaign_session_presence($1) as p', [campaign])).rows[0].p;
  const bater = (uid, atrasoMin = 0) => db.query(
    `insert into public.campaign_session_heartbeats(campaign_id,user_id,seen_at) values($1,$2, clock_timestamp() - ($3||' minutes')::interval)
     on conflict (campaign_id,user_id) do update set seen_at = excluded.seen_at`, [campaign, uid, String(atrasoMin)]);
  const esconder = async (uid, valor) => {
    await identity(uid);
    await db.query(`insert into public.user_presence_preferences(user_id,appear_offline) values($1,$2)
      on conflict (user_id) do update set appear_offline = excluded.appear_offline, updated_at = clock_timestamp()`, [uid, valor]);
  };

  // 1. A conta grava e lê só a própria preferência.
  await esconder(jogadorA, true);
  await identity(jogadorA);
  assert.equal((await db.query('select appear_offline from public.user_presence_preferences')).rows.length, 1, 'Deve enxergar exatamente a própria linha');
  await identity(jogadorB);
  assert.equal((await db.query('select appear_offline from public.user_presence_preferences')).rows.length, 0, 'Não pode enxergar a preferência alheia');
  console.log('ok - 1 preferência é por conta e ninguém lê a do outro');

  // 2. Escrever na linha de outra conta é recusado.
  await identity(jogadorB);
  await db.query('savepoint forjar');
  let recusou = false;
  try { await db.query('insert into public.user_presence_preferences(user_id,appear_offline) values($1,true)', [jogadorA]); }
  catch { recusou = true; }
  await db.query('rollback to savepoint forjar');
  assert.ok(recusou, 'Não se altera a preferência de outra conta');
  console.log('ok - 2 ninguém escreve a preferência de outra conta');

  // 3. O batimento continua sendo gravado — privacidade é projeção, não conexão.
  await db.query('reset role');
  await bater(narrador, 0); await bater(jogadorA, 0); await bater(jogadorB, 0);
  const { rows: [bat] } = await db.query('select count(*)::int as n from public.campaign_session_heartbeats where campaign_id=$1', [campaign]);
  assert.equal(bat.n, 3, 'Quem está invisível continua batendo');
  console.log('ok - 3 invisível continua com batimento gravado');

  // 4. Some da contagem pública, inclusive para si mesma.
  await identity(narrador);
  assert.equal((await ler()).player_count, 1, 'Jogador invisível não conta para o narrador');
  await identity(jogadorA);
  const proprio = await ler();
  assert.equal(proprio.player_count, 1, 'Existe uma contagem só: a pública, sem a própria pessoa invisível');
  console.log('ok - 4 invisível sai do contador, inclusive do que ele mesmo vê');

  // 5. Narrador invisível some para os jogadores.
  await esconder(narrador, true);
  await identity(jogadorB);
  assert.equal((await ler()).narrator_online, false, 'Narrador invisível não aparece');
  await identity(narrador);
  assert.equal((await ler()).narrator_online, false, 'Nem para ele mesmo, pela mesma projeção única');
  await esconder(narrador, false);
  console.log('ok - 5 narrador invisível some da projeção, como qualquer um');

  // 6. Desligar devolve a presença na hora.
  await esconder(jogadorA, false);
  await identity(narrador);
  assert.equal((await ler()).player_count, 2, 'Desligar volta a contar imediatamente');
  console.log('ok - 6 desligar a preferência restaura a presença na hora');

  // 7. Jogador invisível NÃO segura o prazo de encerramento.
  await esconder(jogadorA, true); await esconder(jogadorB, true);
  await db.query('reset role');
  await identity(narrador);
  await db.query('select public.set_campaign_online_session($1,true,null)', [campaign]);
  await db.query('reset role');
  // Sessão aberta há muito tempo e vazia desde então, com os dois jogadores presentes mas invisíveis.
  await db.query(`update public.campaign_online_sessions set started_at = clock_timestamp() - interval '90 minutes',
    empty_since = clock_timestamp() - interval '90 minutes' where campaign_id=$1 and ended_at is null`, [campaign]);
  await bater(narrador, 30); // narrador ausente: encerra direto, sem modal
  await db.query('select public.evaluate_campaign_session_timeout($1)', [campaign]);
  const { rows: [depois] } = await db.query('select ended_at from public.campaign_online_sessions where campaign_id=$1 order by started_at desc limit 1', [campaign]);
  assert.ok(depois.ended_at, 'Só havia gente invisível: a sessão tinha de encerrar');
  console.log('ok - 7 presença invisível não segura o encerramento automático');

  // 8. O mesmo cenário com um jogador VISÍVEL mantém a sessão aberta.
  await esconder(jogadorB, false);
  await identity(narrador);
  await db.query('select public.set_campaign_online_session($1,true,null)', [campaign]);
  await db.query('reset role');
  await db.query(`update public.campaign_online_sessions set started_at = clock_timestamp() - interval '90 minutes',
    empty_since = clock_timestamp() - interval '90 minutes' where campaign_id=$1 and ended_at is null`, [campaign]);
  await bater(jogadorB, 0); await bater(narrador, 30);
  await db.query('select public.evaluate_campaign_session_timeout($1)', [campaign]);
  const { rows: [aberta] } = await db.query('select ended_at, empty_since from public.campaign_online_sessions where campaign_id=$1 order by started_at desc limit 1', [campaign]);
  assert.equal(aberta.ended_at, null, 'Um jogador visível segura a sessão');
  assert.equal(aberta.empty_since, null, 'E zera a contagem de vazio');
  console.log('ok - 8 jogador visível continua segurando a sessão (sem regressão)');

  // 9. Narrador invisível NÃO perde o próprio aviso de confirmação.
  await esconder(narrador, true); await esconder(jogadorB, true);
  await db.query('reset role');
  await db.query(`update public.campaign_online_sessions set empty_since = clock_timestamp() - interval '40 minutes',
    confirmation_deadline = null where campaign_id=$1 and ended_at is null`, [campaign]);
  await bater(narrador, 0); // presente de verdade, ainda que escondido
  await db.query('select public.evaluate_campaign_session_timeout($1)', [campaign]);
  const { rows: [avisada] } = await db.query('select ended_at, confirmation_deadline from public.campaign_online_sessions where campaign_id=$1 order by started_at desc limit 1', [campaign]);
  assert.equal(avisada.ended_at, null, 'Não podia encerrar sem perguntar');
  assert.ok(avisada.confirmation_deadline, 'O narrador invisível continua sendo perguntado');
  console.log('ok - 9 narrador invisível ainda recebe o aviso de confirmação');

  // 10. A preferência não mexe em autorização nem em vínculo.
  await identity(jogadorA);
  const { rows: [membro] } = await db.query('select public.is_campaign_member($1) as m', [campaign]);
  assert.equal(membro.m, true, 'Invisível continua sendo membro com acesso');
  // O elenco se confere fora da visão do jogador: a RLS de
  // campaign_members já restringe cada jogador à própria linha, e não é
  // isso que este critério está medindo.
  await db.query('reset role');
  const { rows: membros } = await db.query('select user_id, status from public.campaign_members where campaign_id=$1', [campaign]);
  assert.equal(membros.length, 2, 'Ninguém sai do elenco por estar invisível');
  assert.ok(membros.every(m => m.status === 'active'));
  console.log('ok - 10 privacidade visual não toca autorização nem elenco');

  console.log('\nTodos os critérios passaram.');
} finally {
  await db.query('rollback').catch(() => {});
  await db.end().catch(() => {});
}
