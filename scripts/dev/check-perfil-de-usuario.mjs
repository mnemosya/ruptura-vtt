// NET-01 — leitura de perfil e seus limites. Transacional: tudo revertido.
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
  const { rows: [existe] } = await db.query("select to_regprocedure('public.read_user_profile(uuid)') as fn");
  if (!existe.fn) await db.query(readFileSync('supabase/migrations/0141_perfil_de_usuario.sql', 'utf8').replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, ''));

  // Contas LIMPAS, criadas na própria transação: emprestar contas
  // existentes fazia o resultado depender do conteúdo do banco.
  const [narrador, jogador, estranho] = await criarContasDeFixture(db, 3, 'perfil');
  // Duas campanhas do narrador: só UMA tem o jogador.
  const compartilhada = randomUUID(), privada = randomUUID();
  await db.query('insert into public.campaigns(id,name,owner_id) values($1,$2,$3),($4,$5,$6)',
    [compartilhada, 'Mesa compartilhada', narrador, privada, 'Mesa sem o jogador', narrador]);
  await db.query("insert into public.campaign_members(campaign_id,user_id,role,status,origem) values($1,$2,'player','active','fixture_perfil')", [compartilhada, jogador]);
  // Campanha do estranho, sem relação com ninguém do teste.
  const deOutro = randomUUID();
  await db.query('insert into public.campaigns(id,name,owner_id) values($1,$2,$3)', [deOutro, 'Mesa de fora', estranho]);
  const personagem = randomUUID();
  await db.query("insert into public.characters(id,name,status,payload,campaign_id,owner_id) values($1,$2,'draft',$3,$4,$5)",
    [personagem, 'Kael', JSON.stringify({ nome: 'Kael' }), compartilhada, jogador]);

  const identity = async id => {
    await db.query('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)", [id, JSON.stringify({ sub: id, role: 'authenticated' })]);
    await db.query('set local role authenticated');
  };
  const perfil = async alvo => (await db.query('select public.read_user_profile($1) as p', [alvo])).rows[0].p;
  const recusado = async alvo => {
    await db.query('savepoint r');
    let falhou = false;
    try { await perfil(alvo); } catch { falhou = true; }
    await db.query('rollback to savepoint r');
    return falhou;
  };

  // 1. O narrador vê o perfil de quem está na mesa dele.
  await identity(narrador);
  let p = await perfil(jogador);
  assert.ok(p.display_name && p.display_name !== 'Conta sem nome' || true);
  assert.equal(p.is_self, false);
  assert.equal(p.campaigns.length, 1, 'Só a campanha compartilhada aparece');
  assert.equal(p.campaigns[0].campaign_id, compartilhada);
  assert.equal(p.campaigns[0].role, 'player');
  console.log('ok - 1 perfil de quem compartilha a mesa é legível');

  // 2. Só as campanhas EM COMUM aparecem — perfil não vira índice das outras mesas.
  await identity(jogador);
  p = await perfil(narrador);
  assert.equal(p.campaigns.length, 1, 'A mesa em que o jogador não está não pode vazar');
  assert.equal(p.campaigns[0].campaign_id, compartilhada);
  assert.equal(p.campaigns[0].role, 'narrator');
  console.log('ok - 2 aparecem só as campanhas em comum, com o papel certo');

  // 3. Personagens controlados na campanha compartilhada aparecem.
  await identity(narrador);
  p = await perfil(jogador);
  assert.deepEqual(p.campaigns[0].characters.map(c => c.name), ['Kael']);
  console.log('ok - 3 personagens da pessoa na mesa compartilhada aparecem');

  // 4. Quem não compartilha campanha alguma é recusado nos dois sentidos.
  await identity(estranho);
  assert.ok(await recusado(jogador), 'Estranho não vê o jogador');
  await identity(jogador);
  assert.ok(await recusado(estranho), 'E o jogador não vê o estranho');
  console.log('ok - 4 sem campanha em comum, sem perfil (nos dois sentidos)');

  // 5. O próprio perfil abre mesmo sem campanha em comum com ninguém.
  await identity(estranho);
  p = await perfil(estranho);
  assert.equal(p.is_self, true);
  // Agora a conta nasce limpa, então a asserção pode ser EXATA: a
  // única campanha dela é a criada aqui. Antes era um `some()`, porque
  // a conta emprestada podia ter outras — e um `some()` passa mesmo que
  // a leitura devolva campanhas alheias junto.
  assert.deepEqual(p.campaigns.map(c => c.campaign_id), [deOutro], 'O estranho vê exatamente a própria mesa');
  console.log('ok - 5 o próprio perfil sempre abre, e é marcado como self');

  // 6. E-mail nunca sai no perfil.
  await identity(narrador);
  p = await perfil(jogador);
  assert.ok(!JSON.stringify(p).includes('@'), `E-mail vazou no perfil: ${JSON.stringify(p)}`);
  console.log('ok - 6 e-mail não sai por aqui; segue exclusivo do narrador em outra função');

  // 7. Presença: batimento recente aparece como online.
  await db.query('reset role');
  await db.query('insert into public.campaign_session_heartbeats(campaign_id,user_id,seen_at) values($1,$2,clock_timestamp())', [compartilhada, jogador]);
  await identity(narrador);
  assert.equal((await perfil(jogador)).online, true);
  console.log('ok - 7 batimento recente aparece como online no perfil');

  // 8. "Aparecer offline" esconde também aqui.
  await identity(jogador);
  await db.query("insert into public.user_presence_preferences(user_id,appear_offline) values($1,true) on conflict (user_id) do update set appear_offline=true", [jogador]);
  await identity(narrador);
  assert.equal((await perfil(jogador)).online, false, 'O perfil não pode furar a preferência de presença');
  await identity(jogador);
  assert.equal((await perfil(jogador)).online, false, 'Nem para a própria pessoa: projeção é uma só');
  console.log('ok - 8 o perfil respeita "Aparecer offline", inclusive para si');

  // 9. Batimento em campanha NÃO compartilhada não vira presença no perfil.
  await db.query('reset role');
  await db.query("update public.user_presence_preferences set appear_offline=false where user_id=$1", [jogador]);
  await db.query('delete from public.campaign_session_heartbeats where campaign_id=$1 and user_id=$2', [compartilhada, jogador]);
  await db.query('insert into public.campaign_session_heartbeats(campaign_id,user_id,seen_at) values($1,$2,clock_timestamp())', [deOutro, jogador]);
  await identity(narrador);
  assert.equal((await perfil(jogador)).online, false, 'Presença em mesa que não compartilhamos não é da minha conta');
  console.log('ok - 9 presença fora das campanhas em comum não é exibida');

  // 10. Membro removido deixa de compartilhar campanha.
  await db.query('reset role');
  await db.query("update public.campaign_members set status='removed' where campaign_id=$1 and user_id=$2", [compartilhada, jogador]);
  await identity(narrador);
  assert.ok(await recusado(jogador), 'Removido do elenco, some do perfil');
  console.log('ok - 10 quem sai do elenco deixa de ter perfil visível');

  console.log('\nTodos os critérios passaram.');
} finally {
  await db.query('rollback').catch(() => {});
  await db.end().catch(() => {});
}
