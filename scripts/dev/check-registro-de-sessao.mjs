// CONT-04 — registro automático de sessão. Transacional: tudo revertido.
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
  const { rows: [existe] } = await db.query("select to_regclass('public.campaign_session_participants') as t");
  if (!existe.t) await db.query(readFileSync('supabase/migrations/0146_registro_automatico_de_sessao.sql', 'utf8').replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, ''));

  const { rows: users } = await db.query('select id from auth.users limit 4');
  assert.ok(users.length >= 4, 'Necessárias quatro contas');
  const [narrador, jogadorA, jogadorB, estranho] = users.map(u => u.id);
  const campanha = randomUUID();
  await db.query('insert into public.campaigns(id,name,owner_id) values($1,$2,$3)', [campanha, 'Mesa do registro', narrador]);
  for (const uid of [jogadorA, jogadorB]) {
    await db.query("insert into public.campaign_members(campaign_id,user_id,role,status,origem) values($1,$2,'player','active','fixture_registro')", [campanha, uid]);
  }
  const identity = async id => {
    await db.query('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)", [id, JSON.stringify({ sub: id, role: 'authenticated' })]);
    await db.query('set local role authenticated');
  };
  const recusado = async op => {
    await db.query('savepoint r'); let f = false;
    try { await op(); } catch { f = true; }
    await db.query('rollback to savepoint r'); return f;
  };
  const sessaoAtiva = async () => (await db.query(
    'select id from public.campaign_online_sessions where campaign_id=$1 and ended_at is null', [campanha])).rows[0]?.id;
  // Inspeção de fixture: lê FORA da RLS de propósito. A visibilidade da
  // lista é verificada explicitamente nos critérios 13 e 14 — aqui o
  // que se mede é o conteúdo, e ler sob a identidade corrente daria
  // zero linhas por motivo certo, escondendo o que se quer conferir.
  const participantes = async sid => {
    const anterior = (await db.query('select current_user as u')).rows[0].u;
    await db.query('reset role');
    const { rows } = await db.query(
      'select user_id, origem, incluido, primeiro_visto, ultimo_visto from public.campaign_session_participants where session_id=$1 order by primeiro_visto', [sid]);
    if (anterior === 'authenticated') await db.query('set local role authenticated');
    return rows;
  };
  const esconder = async (uid, v) => {
    await identity(uid);
    await db.query(`insert into public.user_presence_preferences(user_id,appear_offline) values($1,$2)
      on conflict (user_id) do update set appear_offline=excluded.appear_offline`, [uid, v]);
  };

  // 1. Iniciar cria UMA entrada de sessão, em rascunho, vinculada.
  await identity(narrador);
  await db.query('select public.set_campaign_online_session($1,true,null)', [campanha]);
  const sid = await sessaoAtiva();
  const { rows: entradas } = await db.query(
    'select id, tipo, estado, acontecida_em, online_session_id, titulo from public.campaign_narrative_entries where campaign_id=$1', [campanha]);
  assert.equal(entradas.length, 1);
  assert.equal(entradas[0].tipo, 'sessao');
  assert.equal(entradas[0].estado, 'rascunho', 'O registro nasce só do narrador');
  assert.equal(entradas[0].online_session_id, sid, 'Vinculada à sessão canônica');
  assert.ok(entradas[0].acontecida_em, 'A data vem do início da sessão');
  console.log(`ok - 1 iniciar cria uma entrada de sessão em rascunho, vinculada ("${entradas[0].titulo}")`);

  // 2. O narrador entra como autor já no primeiro instante.
  assert.deepEqual((await participantes(sid)).map(p => p.user_id), [narrador]);
  console.log('ok - 2 o narrador entra na lista desde o início, como autor');

  // 3. Batimento de jogador acumula participação, com os dois horários.
  await identity(jogadorA);
  await db.query('select public.heartbeat_campaign_session($1)', [campanha]);
  const depoisDeA = await participantes(sid);
  assert.equal(depoisDeA.length, 2);
  const linhaA = depoisDeA.find(p => p.user_id === jogadorA);
  assert.ok(linhaA && linhaA.primeiro_visto && linhaA.ultimo_visto);
  assert.equal(linhaA.origem, 'automatico');
  console.log('ok - 3 batimento registra o jogador com primeiro e último visto');

  // 4. Batimento repetido NÃO duplica, e move só o último visto.
  const antes = linhaA.primeiro_visto;
  await db.query('select public.heartbeat_campaign_session($1)', [campanha]);
  const dePois = (await participantes(sid)).find(p => p.user_id === jogadorA);
  assert.equal((await participantes(sid)).length, 2, 'Reconexão não duplica linha');
  assert.deepEqual(dePois.primeiro_visto, antes, 'O primeiro visto não se move');
  assert.ok(dePois.ultimo_visto >= antes);
  console.log('ok - 4 reconexão não duplica; o primeiro visto fica onde estava');

  // 5. Quem está com "Aparecer offline" NÃO entra no registro.
  await esconder(jogadorB, true);
  await identity(jogadorB);
  await db.query('select public.heartbeat_campaign_session($1)', [campanha]);
  assert.ok(!(await participantes(sid)).some(p => p.user_id === jogadorB),
    'Invisível não pode ser registrado — senão esconder-se só adiaria a revelação');
  console.log('ok - 5 quem está invisível não entra no registro da sessão');

  // 6. Desligando a preferência, passa a entrar.
  await esconder(jogadorB, false);
  await identity(jogadorB);
  await db.query('select public.heartbeat_campaign_session($1)', [campanha]);
  assert.ok((await participantes(sid)).some(p => p.user_id === jogadorB));
  console.log('ok - 6 ao voltar a aparecer, o jogador passa a ser registrado');

  // 7. Sem depender do snapshot final: quem saiu antes do fim continua na lista.
  await db.query('reset role');
  await db.query('delete from public.campaign_session_heartbeats where campaign_id=$1 and user_id=$2', [campanha, jogadorA]);
  await identity(narrador);
  await db.query('select public.set_campaign_online_session($1,false,$2)', [campanha, sid]);
  assert.ok((await participantes(sid)).some(p => p.user_id === jogadorA),
    'Quem saiu antes do fim tem de continuar registrado');
  console.log('ok - 7 o registro não é uma foto do fim: quem saiu antes permanece');

  // 8. Nova sessão gera OUTRA entrada, sem tocar a anterior.
  await identity(narrador);
  await db.query('select public.set_campaign_online_session($1,true,null)', [campanha]);
  const sid2 = await sessaoAtiva();
  const { rows: todas } = await db.query('select online_session_id from public.campaign_narrative_entries where campaign_id=$1', [campanha]);
  assert.equal(todas.length, 2);
  assert.notEqual(sid, sid2);
  console.log('ok - 8 nova sessão gera nova entrada, preservando a anterior');

  // 9. Idempotência dura: a entrada não duplica nem forçando.
  await db.query('reset role');
  assert.ok(await recusado(() => db.query(
    `insert into public.campaign_narrative_entries(campaign_id,tipo,titulo,online_session_id)
     values($1,'sessao','Duplicata',$2)`, [campanha, sid2])),
    'O índice único tem de impedir duas entradas para a mesma sessão');
  console.log('ok - 9 duas entradas para a mesma sessão são impossíveis, pelo índice');

  // 10. Correção manual do narrador, auditada.
  await identity(narrador);
  await db.query('select public.set_session_participant($1,$2,false)', [sid2, narrador]);
  const corrigido = (await participantes(sid2)).find(p => p.user_id === narrador);
  assert.equal(corrigido.incluido, false);
  assert.equal(corrigido.origem, 'manual', 'A origem distingue o que o sistema viu do que alguém afirmou');
  const { rows: log } = await db.query(
    'select user_id, incluido, alterado_por from public.campaign_session_participants_log where session_id=$1', [sid2]);
  assert.equal(log.length, 1);
  assert.equal(log[0].alterado_por, narrador);
  console.log('ok - 10 correção manual marca a origem e fica no histórico');

  // 11. Jogador não corrige a lista.
  await identity(jogadorA);
  assert.ok(await recusado(() => db.query('select public.set_session_participant($1,$2,true)', [sid2, jogadorA])),
    'Jogador não se inclui no registro');
  console.log('ok - 11 só o narrador corrige a lista');

  // 12. Não se inclui quem nem é da campanha.
  await identity(narrador);
  assert.ok(await recusado(() => db.query('select public.set_session_participant($1,$2,true)', [sid2, estranho])),
    'Quem não é da campanha não entra no registro dela');
  console.log('ok - 12 conta de fora não pode ser incluída no registro');

  // 13. Enquanto o registro é rascunho, o jogador não vê a lista.
  await identity(jogadorA);
  assert.equal((await db.query('select count(*)::int as n from public.campaign_session_participants')).rows[0].n, 0,
    'A lista segue a visibilidade da entrada: rascunho é só do narrador');
  console.log('ok - 13 lista de participantes é invisível enquanto o registro é rascunho');

  // 14. Revelada a entrada, o jogador passa a ver a lista.
  await identity(narrador);
  await db.query("update public.campaign_narrative_entries set estado='publicado' where online_session_id=$1", [sid]);
  await identity(jogadorA);
  const vistos = (await db.query('select session_id from public.campaign_session_participants')).rows;
  assert.ok(vistos.length > 0 && vistos.every(v => v.session_id === sid),
    'Vê a lista da sessão revelada, e só dela');
  console.log('ok - 14 revelado o registro, a lista acompanha — e só a da entrada revelada');

  // 15. O histórico de correções é só do narrador.
  assert.equal((await db.query('select count(*)::int as n from public.campaign_session_participants_log')).rows[0].n, 0);
  await identity(narrador);
  assert.ok((await db.query('select count(*)::int as n from public.campaign_session_participants_log')).rows[0].n > 0);
  console.log('ok - 15 histórico de correções é exclusivo do narrador');

  console.log('\nTodos os critérios passaram.');
} finally {
  await db.query('rollback').catch(() => {});
  await db.end().catch(() => {});
}
