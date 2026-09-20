// DASH-01 — contagem real de participantes (0139). Transacional: tudo revertido.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { Client } from 'pg';
import { criarContasDeFixture } from './contasDeFixture.mjs';
config({ path: '.env.local', quiet: true });
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
try {
  assert.ok(process.env.SUPABASE_DB_URL, 'SUPABASE_DB_URL ausente');
  await db.connect();
  await db.query('begin');
  const { rows: [existing] } = await db.query("select to_regprocedure('public.read_campaign_session_presence(uuid)') as fn");
  if (!existing.fn) await db.query(readFileSync('supabase/migrations/0139_campaign_session_presence.sql', 'utf8').replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, ''));

  // Contas LIMPAS, criadas na própria transação: emprestar contas
  // existentes fazia o resultado depender do conteúdo do banco.
  const [narrador, jogadorA, jogadorB, estranho] = await criarContasDeFixture(db, 4, 'presenca');
  const campaign = randomUUID();
  await db.query('insert into public.campaigns(id,name,owner_id) values($1,$2,$3)', [campaign, 'Fixture presença', narrador]);
  for (const [uid, status] of [[jogadorA, 'active'], [jogadorB, 'active']]) {
    await db.query('insert into public.campaign_members(campaign_id,user_id,role,status,origem) values($1,$2,$3,$4,$5)',
      [campaign, uid, 'player', status, 'fixture_presenca']);
  }
  const identity = async id => {
    await db.query('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)", [id, JSON.stringify({ sub: id, role: 'authenticated' })]);
    await db.query('set local role authenticated');
  };
  const ler = async () => (await db.query('select public.read_campaign_session_presence($1) as p', [campaign])).rows[0].p;
  const bater = (uid, atrasoMin = 0) => db.query(
    `insert into public.campaign_session_heartbeats(campaign_id,user_id,seen_at) values($1,$2, clock_timestamp() - ($3 || ' minutes')::interval)
     on conflict (campaign_id,user_id) do update set seen_at = excluded.seen_at`, [campaign, uid, String(atrasoMin)]);

  // 1. Sem batimento algum: ninguém conectado, sem sessão.
  await identity(narrador);
  let p = await ler();
  assert.equal(p.session, null, 'Sem sessão iniciada, session deve ser null');
  assert.equal(p.narrator_online, false);
  assert.equal(p.player_count, 0);
  console.log('ok - 1 sem batimentos: nenhum conectado e sem sessão');

  // 2. Narrador e um jogador recentes contam; o narrador não entra em player_count.
  await db.query('reset role');
  await bater(narrador, 0); await bater(jogadorA, 0);
  await identity(narrador);
  p = await ler();
  assert.equal(p.narrator_online, true);
  assert.equal(p.player_count, 1, 'O narrador não pode ser contado como jogador');
  console.log('ok - 2 narrador presente e um jogador: player_count=1, sem contar o narrador');

  // 3. Batimento velho (além da tolerância de 2 min) deixa de contar.
  await db.query('reset role');
  await bater(jogadorB, 5);
  await identity(narrador);
  p = await ler();
  assert.equal(p.player_count, 1, 'Batimento de 5 minutos atrás não é presença');
  await db.query('reset role');
  await bater(jogadorB, 0);
  await identity(narrador);
  assert.equal((await ler()).player_count, 2);
  console.log('ok - 3 tolerância de 2 minutos aplicada; retorno recente volta a contar');

  // 4. Narrador ausente com jogadores presentes — o caso que o tooltip precisa distinguir.
  await db.query('reset role');
  await bater(narrador, 5);
  await identity(narrador);
  p = await ler();
  assert.equal(p.narrator_online, false);
  assert.equal(p.player_count, 2, 'Jogadores continuam contando com o narrador ausente');
  console.log('ok - 4 narrador ausente é distinguível de jogadores ausentes');

  // 5. Membro que deixou de ser ativo sai da contagem.
  await db.query('reset role');
  await db.query("update public.campaign_members set status='removed' where campaign_id=$1 and user_id=$2", [campaign, jogadorB]);
  await identity(narrador);
  assert.equal((await ler()).player_count, 1, 'Só membro ativo conta');
  await db.query('reset role');
  await db.query("update public.campaign_members set status='active' where campaign_id=$1 and user_id=$2", [campaign, jogadorB]);
  console.log('ok - 5 membro inativo não conta como participante');

  // 6. Sessão ativa aparece na mesma leitura.
  await db.query('reset role');
  await identity(narrador);
  await db.query('select public.set_campaign_online_session($1,$2,$3)', [campaign, true, null]);
  p = await ler();
  assert.ok(p.session && p.session.ended_at === null, 'A sessão ativa deve vir na mesma resposta');
  console.log('ok - 6 sessão ativa chega junto da presença, numa consulta só');

  // 7. Jogador da campanha lê; estranho é recusado (isolamento).
  await identity(jogadorA);
  const doJogador = await ler();
  assert.equal(doJogador.player_count, 2);
  assert.equal(doJogador.narrator_online, false);
  await identity(estranho);
  let recusou = false;
  await db.query('savepoint estranho');
  try { await ler(); } catch { recusou = true; }
  await db.query('rollback to savepoint estranho');
  assert.ok(recusou, 'Quem não é da campanha não pode ler a presença');
  console.log('ok - 7 jogador lê a mesma contagem; conta de fora é recusada');

  // 8. A leitura não grava nada — não pode virar batimento disfarçado.
  await db.query('reset role');
  const antes = (await db.query('select count(*)::int as n, max(seen_at) as t from public.campaign_session_heartbeats where campaign_id=$1', [campaign])).rows[0];
  await identity(jogadorA);
  await ler();
  await db.query('reset role');
  const depois = (await db.query('select count(*)::int as n, max(seen_at) as t from public.campaign_session_heartbeats where campaign_id=$1', [campaign])).rows[0];
  assert.equal(depois.n, antes.n);
  assert.deepEqual(depois.t, antes.t, 'Ler a presença não pode registrar presença');
  console.log('ok - 8 leitura é somente leitura; não registra batimento');

  console.log('\nTodos os critérios passaram.');
} finally {
  await db.query('rollback').catch(() => {});
  await db.end().catch(() => {});
}
