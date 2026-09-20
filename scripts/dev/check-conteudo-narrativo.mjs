// CONT-02 — armazenamento e AUTORIZAÇÃO do conteúdo narrativo, contra a
// taxonomia de CONT-01. Transacional: tudo revertido, inclusive em falha.
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
  const sem = async alvo => !(await db.query(`select to_regclass('${alvo}') as t`)).rows[0].t;
  if (await sem('public.campaign_narrative_entries')) await db.query(readFileSync('supabase/migrations/0142_conteudo_narrativo.sql', 'utf8').replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, ''));
  if (await sem('public.campaign_narrative_visibility_log')) await db.query(readFileSync('supabase/migrations/0143_narrativa_visibilidade_atomica.sql', 'utf8').replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, ''));
  const { rows: [temValores] } = await db.query("select to_regprocedure('public.narrativa_pode_ver_valores(uuid,narrativa_estado,uuid)') as fn");
  if (!temValores.fn) await db.query(readFileSync('supabase/migrations/0145_narrativa_ver_por_valores.sql', 'utf8').replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, ''));

  const { rows: users } = await db.query('select id from auth.users limit 4');
  assert.ok(users.length >= 4, 'Necessárias quatro contas');
  const [narrador, jogadorA, jogadorB, estranho] = users.map(u => u.id);
  const campanha = randomUUID(), outraCampanha = randomUUID();
  await db.query('insert into public.campaigns(id,name,owner_id) values($1,$2,$3),($4,$5,$6)',
    [campanha, 'Mesa narrativa', narrador, outraCampanha, 'Outra mesa', estranho]);
  for (const uid of [jogadorA, jogadorB]) {
    await db.query("insert into public.campaign_members(campaign_id,user_id,role,status,origem) values($1,$2,'player','active','fixture_narrativa')", [campanha, uid]);
  }
  const identity = async id => {
    await db.query('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)", [id, JSON.stringify({ sub: id, role: 'authenticated' })]);
    await db.query('set local role authenticated');
  };
  const recusado = async operacao => {
    await db.query('savepoint r');
    let falhou = false;
    try { const r = await operacao(); if (r && r.rowCount === 0) falhou = true; } catch { falhou = true; }
    await db.query('rollback to savepoint r');
    return falhou;
  };
  const criar = async (tipo, extra = {}) => {
    const id = randomUUID();
    const cols = ['id', 'campaign_id', 'tipo', 'titulo', 'criado_por', ...Object.keys(extra)];
    const vals = [id, campanha, tipo, extra.titulo ?? `${tipo} de teste`, narrador, ...Object.values(extra)];
    const usados = cols.filter((c, i) => !(c === 'titulo' && cols.indexOf('titulo') !== i));
    await db.query(`insert into public.campaign_narrative_entries(${usados.join(',')})
      values(${usados.map((_, i) => `$${i + 1}`).join(',')})`,
      usados.map(c => c === 'id' ? id : c === 'campaign_id' ? campanha : c === 'tipo' ? tipo
        : c === 'criado_por' ? narrador : c === 'titulo' ? (extra.titulo ?? `${tipo} de teste`) : extra[c]));
    return id;
  };
  const visiveisPara = async uid => {
    await identity(uid);
    return (await db.query('select id from public.campaign_narrative_entries')).rows.map(r => r.id);
  };

  // 1. Os cinco tipos existem; um sexto é recusado pelo enum.
  await identity(narrador);
  const ids = {};
  for (const tipo of ['sessao', 'anotacao', 'handout', 'npc', 'lugar']) ids[tipo] = await criar(tipo);
  assert.ok(await recusado(() => criar('loja')), 'Loja saiu da taxonomia e o enum tem de recusá-la');
  console.log('ok - 1 os cinco tipos aprovados existem e "loja" é recusada pelo banco');

  // 2. Título obrigatório em todo tipo menos handout.
  await identity(narrador);
  assert.ok(await recusado(() => db.query(
    'insert into public.campaign_narrative_entries(campaign_id,tipo,titulo) values($1,$2,null)', [campanha, 'lugar'])),
    'Lugar sem título tinha de ser recusado');
  const soImagem = randomUUID();
  await db.query('insert into public.campaign_narrative_entries(id,campaign_id,tipo,titulo) values($1,$2,$3,null)', [soImagem, campanha, 'handout']);
  console.log('ok - 2 título é obrigatório, exceto em handout, que pode ser só a imagem');

  // 3. Campo de um tipo não vaza para outro.
  assert.ok(await recusado(() => db.query(
    "insert into public.campaign_narrative_entries(campaign_id,tipo,titulo,acontecida_em) values($1,'lugar','X',clock_timestamp())", [campanha])),
    'Lugar não pode ter data de sessão');
  // E o vínculo de ficha é só de npc. Precisa de um personagem REAL:
  // com null o check passaria e o critério não provaria nada.
  const pn = randomUUID();
  await db.query('reset role');
  await db.query("insert into public.characters(id,name,status,payload,campaign_id,owner_id) values($1,'PN de teste','draft',$2,$3,$4)",
    [pn, JSON.stringify({ nome: 'PN de teste' }), campanha, narrador]);
  await identity(narrador);
  assert.ok(await recusado(() => db.query(
    "insert into public.campaign_narrative_entries(campaign_id,tipo,titulo,character_id) values($1,'lugar','X',$2)", [campanha, pn])),
    'Só npc pode apontar para uma ficha');
  const comFicha = randomUUID();
  await db.query("insert into public.campaign_narrative_entries(id,campaign_id,tipo,titulo,character_id) values($1,$2,'npc','Com ficha',$3)", [comFicha, campanha, pn]);
  console.log('ok - 3 campos específicos não vazam entre tipos; npc aceita o vínculo de ficha');

  // 4. Rascunho é só do narrador — o jogador não vê NADA ainda.
  assert.deepEqual(await visiveisPara(jogadorA), [], 'Rascunho não pode aparecer para jogador');
  await identity(narrador);
  assert.equal((await db.query('select count(*)::int as n from public.campaign_narrative_entries')).rows[0].n, 7);
  console.log('ok - 4 rascunho é exclusivo do narrador, sempre');

  // 5. Publicado sem exceção é da mesa toda.
  await identity(narrador);
  await db.query("update public.campaign_narrative_entries set estado='publicado' where id=$1", [ids.lugar]);
  assert.deepEqual(await visiveisPara(jogadorA), [ids.lugar]);
  assert.deepEqual(await visiveisPara(jogadorB), [ids.lugar]);
  console.log('ok - 5 publicado sem exceção é visto por todos os jogadores');

  // 6. Exceção por jogador: o segredo de um só.
  await identity(narrador);
  await db.query("update public.campaign_narrative_entries set estado='publicado' where id=$1", [ids.handout]);
  await db.query('insert into public.campaign_narrative_visibility(entry_id,campaign_id,user_id) values($1,$2,$3)', [ids.handout, campanha, jogadorA]);
  assert.deepEqual((await visiveisPara(jogadorA)).sort(), [ids.handout, ids.lugar].sort());
  assert.deepEqual(await visiveisPara(jogadorB), [ids.lugar], 'B não estava na lista');
  console.log('ok - 6 exceção por jogador revela para um e esconde do outro');

  // 7. O jogador não lê a lista de exceções — quem mais recebeu é parte do segredo.
  await identity(jogadorA);
  assert.equal((await db.query('select count(*)::int as n from public.campaign_narrative_visibility')).rows[0].n, 0,
    'Nem quem recebeu o segredo vê a lista de quem mais recebeu');
  console.log('ok - 7 a lista de exceções não é legível por jogador');

  // 8. Jogador não escreve item narrativo, nem edita, nem apaga.
  await identity(jogadorA);
  assert.ok(await recusado(() => db.query(
    "insert into public.campaign_narrative_entries(campaign_id,tipo,titulo) values($1,'anotacao','Minha')", [campanha])), 'Jogador não cria');
  assert.ok(await recusado(() => db.query(
    "update public.campaign_narrative_entries set titulo='Mudei' where id=$1", [ids.lugar])), 'Jogador não edita');
  assert.ok(await recusado(() => db.query('delete from public.campaign_narrative_entries where id=$1', [ids.lugar])), 'Jogador não apaga');
  console.log('ok - 8 escrita de itens é exclusiva do narrador');

  // 9. Comentários: quem vê comenta; quem não vê, não.
  await identity(jogadorA);
  const comentario = randomUUID();
  await db.query('insert into public.campaign_narrative_comments(id,entry_id,campaign_id,autor_id,corpo) values($1,$2,$3,$4,$5)',
    [comentario, ids.handout, campanha, jogadorA, 'Reconheço este brasão.']);
  await identity(jogadorB);
  assert.ok(await recusado(() => db.query(
    'insert into public.campaign_narrative_comments(entry_id,campaign_id,autor_id,corpo) values($1,$2,$3,$4)',
    [ids.handout, campanha, jogadorB, 'Não deveria'])), 'Quem não vê o item não comenta nele');
  assert.equal((await db.query('select count(*)::int as n from public.campaign_narrative_comments')).rows[0].n, 0,
    'Nem lê os comentários de um item que não vê');
  console.log('ok - 9 comenta e lê comentário só quem enxerga o item');

  // 10. Autoria: ninguém assina no lugar de outro, nem edita fala alheia.
  await identity(jogadorB);
  await db.query("update public.campaign_narrative_entries set estado='publicado' where id=$1", [ids.lugar]).catch(() => {});
  await identity(jogadorA);
  assert.ok(await recusado(() => db.query(
    'insert into public.campaign_narrative_comments(entry_id,campaign_id,autor_id,corpo) values($1,$2,$3,$4)',
    [ids.lugar, campanha, jogadorB, 'Assinando como outro'])), 'Não se comenta em nome de terceiro');
  await identity(narrador);
  assert.ok(await recusado(() => db.query(
    "update public.campaign_narrative_comments set corpo='Editado pelo narrador' where id=$1", [comentario])),
    'Nem o narrador edita a fala de alguém');
  console.log('ok - 10 não se assina nem se edita comentário de outra pessoa');

  // 11. O narrador APAGA qualquer comentário — a mesa é dele.
  await identity(narrador);
  const r = await db.query('delete from public.campaign_narrative_comments where id=$1', [comentario]);
  assert.equal(r.rowCount, 1, 'O narrador precisa poder remover comentário');
  console.log('ok - 11 o narrador remove comentário de qualquer um, mas não o reescreve');

  // 12. Relação é simétrica: (a,b) e (b,a) são a mesma linha.
  await identity(narrador);
  const [x, y] = [ids.npc, ids.lugar].sort();
  await db.query('insert into public.campaign_narrative_links(campaign_id,entry_a,entry_b) values($1,$2,$3)', [campanha, x, y]);
  assert.ok(await recusado(() => db.query(
    'insert into public.campaign_narrative_links(campaign_id,entry_a,entry_b) values($1,$2,$3)', [campanha, y, x])),
    'O par invertido é a mesma relação e tem de ser recusado');
  console.log('ok - 12 relação é simétrica; o par invertido não duplica');

  // 13. Relação só aparece quando os DOIS lados são visíveis.
  await identity(jogadorB);
  assert.equal((await db.query('select count(*)::int as n from public.campaign_narrative_links')).rows[0].n, 0,
    'O NPC ainda é rascunho — a relação não pode denunciar sua existência');
  console.log('ok - 13 relação com item invisível não vaza pela ponta visível');

  // 14. Isolamento entre campanhas.
  await identity(estranho);
  assert.deepEqual(await visiveisPara(estranho), [], 'Dono de outra campanha não vê nada daqui');
  await identity(narrador);
  assert.ok(await recusado(() => db.query(
    "insert into public.campaign_narrative_entries(campaign_id,tipo,titulo) values($1,'anotacao','Invadindo')", [outraCampanha])),
    'Narrador de uma campanha não escreve na outra');
  console.log('ok - 14 isolamento entre campanhas nos dois sentidos');

  // 15. Arquivar não apaga, e o estado exige a data.
  await identity(narrador);
  assert.ok(await recusado(() => db.query(
    "update public.campaign_narrative_entries set estado='arquivado' where id=$1", [ids.lugar])),
    'Arquivar sem data tinha de ser recusado');
  await db.query("update public.campaign_narrative_entries set estado='arquivado', arquivado_em=clock_timestamp() where id=$1", [ids.lugar]);
  const { rows: [vivo] } = await db.query('select estado from public.campaign_narrative_entries where id=$1', [ids.lugar]);
  assert.equal(vivo.estado, 'arquivado', 'Arquivado continua existindo');
  assert.deepEqual(await visiveisPara(jogadorA), [ids.handout], 'Arquivado sai da vista do jogador');
  console.log('ok - 15 arquivar tira da vista sem apagar, e exige a data');

  // 16. Trocar visibilidade é UMA operação — e o caminho de falha
  //     esconde, em vez de revelar.
  await identity(narrador);
  await db.query("update public.campaign_narrative_entries set estado='publicado' where id=$1", [ids.npc]);
  await db.query('select public.set_narrative_visibility($1,$2)', [ids.npc, [jogadorA]]);
  assert.ok((await visiveisPara(jogadorA)).includes(ids.npc));
  assert.ok(!(await visiveisPara(jogadorB)).includes(ids.npc));
  await identity(narrador);
  // Revelar para alguém de FORA da campanha é recusado, e a recusa não
  // pode deixar a lista vazia pelo caminho — que revelaria para todos.
  assert.ok(await recusado(() => db.query('select public.set_narrative_visibility($1,$2)', [ids.npc, [estranho]])),
    'Revelar para quem não é da campanha tinha de ser recusado');
  assert.ok((await visiveisPara(jogadorA)).includes(ids.npc), 'A exceção anterior sobreviveu à recusa');
  await identity(narrador);
  assert.ok(!(await visiveisPara(jogadorB)).includes(ids.npc), 'E a recusa não revelou para a mesa toda');
  console.log('ok - 16 troca de visibilidade é atômica; a recusa esconde em vez de revelar');

  // 17. Revelar para todos é apagar as exceções, não listar cada um.
  await identity(narrador);
  await db.query('select public.set_narrative_visibility($1,null)', [ids.npc]);
  await db.query('reset role');
  assert.equal((await db.query('select count(*)::int as n from public.campaign_narrative_visibility where entry_id=$1', [ids.npc])).rows[0].n, 0,
    'Revelar para todos deixa a tabela de exceções vazia');
  assert.ok((await visiveisPara(jogadorB)).includes(ids.npc), 'E agora B também vê');
  console.log('ok - 17 revelar para a mesa toda limpa as exceções, sem listar jogador por jogador');

  // 18. O histórico registra quem, quando e de quê para quê — e é só do narrador.
  await identity(narrador);
  const { rows: log } = await db.query(
    'select antes, depois, alterado_por from public.campaign_narrative_visibility_log where entry_id=$1 order by alterado_em', [ids.npc]);
  assert.equal(log.length, 2, 'As duas trocas bem-sucedidas foram registradas');
  assert.equal(log[0].antes, null);
  assert.deepEqual(log[0].depois, [jogadorA]);
  assert.deepEqual(log[1].antes, [jogadorA]);
  assert.equal(log[1].depois, null, '"Todos" é registrado como null, igual ao significado da lista vazia');
  assert.equal(log[0].alterado_por, narrador);
  await identity(jogadorA);
  assert.equal((await db.query('select count(*)::int as n from public.campaign_narrative_visibility_log')).rows[0].n, 0,
    'O histórico contém quem viu o quê — é do narrador');
  console.log('ok - 18 histórico de revelação é completo, legível e exclusivo do narrador');

  // 19. Jogador não altera visibilidade pela RPC.
  await identity(jogadorA);
  assert.ok(await recusado(() => db.query('select public.set_narrative_visibility($1,$2)', [ids.npc, [jogadorA]])),
    'Jogador não revela nada para si mesmo');
  console.log('ok - 19 só o narrador altera visibilidade, também pela RPC');

  // 20. INSERT ... RETURNING — o caminho que o cliente usa de verdade.
  //     A política de leitura não pode depender de reler a própria
  //     tabela: durante o insert, a linha nova ainda não está visível
  //     para uma subconsulta do mesmo comando, e o narrador acabava
  //     barrado da própria criação.
  await identity(narrador);
  const { rows: devolvida } = await db.query(
    "insert into public.campaign_narrative_entries(campaign_id,tipo,titulo) values($1,'anotacao','Com RETURNING') returning id, titulo",
    [campanha]);
  assert.equal(devolvida.length, 1, 'O insert precisa devolver a linha criada');
  assert.equal(devolvida[0].titulo, 'Com RETURNING');
  console.log('ok - 20 criar devolvendo a linha (INSERT ... RETURNING) funciona para o narrador');

  // 21. E o jogador continua sem conseguir criar por esse caminho.
  await identity(jogadorA);
  assert.ok(await recusado(() => db.query(
    "insert into public.campaign_narrative_entries(campaign_id,tipo,titulo) values($1,'anotacao','Não') returning id", [campanha])),
    'RETURNING não pode virar brecha de escrita');
  console.log('ok - 21 RETURNING não abriu brecha: jogador segue sem criar');

  console.log('\nTodos os critérios passaram.');
} finally {
  await db.query('rollback').catch(() => {});
  await db.end().catch(() => {});
}
