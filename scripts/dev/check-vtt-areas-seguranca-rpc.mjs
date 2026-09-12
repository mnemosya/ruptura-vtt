#!/usr/bin/env node
/**
 * Auditoria adversarial das RPCs/RLS de `vtt_areas` — testa as
 * funções REAIS do banco (não a interface), impersonando cada papel
 * via `set local role authenticated` + `set local request.jwt.claims`
 * (nunca a service role, que ignora RLS por completo). Toda escrita
 * roda dentro de BEGIN/ROLLBACK — nada persiste no banco de
 * desenvolvimento do usuário — exceto o `setup()`/`limpar()` de
 * fixture, que cria e apaga suas próprias linhas explicitamente.
 *
 * Nasceu da auditoria de segurança pós-0081 (rodada de endurecimento)
 * e cobre, além do desenho original das RPCs, os três problemas que
 * essa auditoria encontrou e a migration 0082 corrigiu:
 *   - Aura sobre token oculto (critério 9/9b/9c);
 *   - coordenada de origem sem limite de magnitude (13/13b/13c);
 *   - ponto de Parede/Personalizada sem limite de magnitude (14/14b/14c);
 *   - `anon` com EXECUTE nas RPCs de área (critério 1).
 *
 * Uso: npx tsx scripts/dev/check-vtt-areas-seguranca-rpc.mjs (ou node,
 * já que é ESM puro sem tipos — funciona com qualquer um dos dois).
 * Requer SUPABASE_DB_URL em .env.local (mesma env de
 * apply-migration-generic.ts).
 */
import { config } from "dotenv";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
config({ path: ".env.local" });

const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

let ok = 0, falha = 0;
function reg(nome, cond, detalhe) {
  if (cond) { ok++; console.log(`ok - ${nome}: ${detalhe}`); }
  else { falha++; console.error(`FALHA - ${nome}: ${detalhe}`); }
}

async function comoUsuario(userId, fn) {
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query(`set local request.jwt.claims = '${JSON.stringify({ sub: userId, role: "authenticated" })}'`);
    return await fn();
  } finally {
    await client.query("rollback");
  }
}

// Setup via service role (fora de transação — dados reais, mas limpos no final).
const narradorA = randomUUID(), narradorB = randomUUID(), jogadorAutorizado = randomUUID(), jogadorSemAutorizacao = randomUUID();
const campanhaA = randomUUID(), campanhaB = randomUUID();
const cenaA = randomUUID(), cenaB = randomUUID();
const tokenVisivelA = randomUUID(), tokenOcultoA = randomUUID(), tokenB = randomUUID();
const areaA = randomUUID();

async function setup() {
  await client.query("begin");
  await client.query(`insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role)
    values
      ($1::uuid, $1::text||'@x.dev', 'x', now(), '{}', '{}', 'authenticated', 'authenticated'),
      ($2::uuid, $2::text||'@x.dev', 'x', now(), '{}', '{}', 'authenticated', 'authenticated'),
      ($3::uuid, $3::text||'@x.dev', 'x', now(), '{}', '{}', 'authenticated', 'authenticated'),
      ($4::uuid, $4::text||'@x.dev', 'x', now(), '{}', '{}', 'authenticated', 'authenticated')
    on conflict do nothing`, [narradorA, narradorB, jogadorAutorizado, jogadorSemAutorizacao]);
  await client.query(`insert into campaigns (id, name, owner_id) values ($1,'A',$2),($3,'B',$4)`, [campanhaA, narradorA, campanhaB, narradorB]);
  await client.query(`insert into campaign_members (campaign_id, user_id, role, status) values ($1,$2,'player','active'),($1,$3,'player','active')`, [campanhaA, jogadorAutorizado, jogadorSemAutorizacao]);
  await client.query(`insert into vtt_scenes (id, campaign_id, nome, largura, altura) values ($1,$2,'S',10,10),($3,$4,'S',10,10)`, [cenaA, campanhaA, cenaB, campanhaB]);
  // Palco (migration 0111): desde a 0112, autorização de cena passa por
  // `vtt_campaign_stage`. Uma cena sem palco não é a cena de ninguém, e
  // a fixture inteira seria recusada — não por bug, por estar
  // descrevendo uma campanha que não existe mais.
  await client.query(`insert into vtt_campaign_stage (campaign_id, presented_scene_id) values ($1,$2),($3,$4)`, [campanhaA, cenaA, campanhaB, cenaB]);
  await client.query(`insert into vtt_tokens (id, scene_id, campaign_id, nome, sigla, q, r, visivel) values
      ($1,$2,$3,'Vis','VI',1,1,true),
      ($4,$2,$3,'Oculto','OC',2,2,false),
      ($5,$6,$7,'B','B',1,1,true)`,
    [tokenVisivelA, cenaA, campanhaA, tokenOcultoA, tokenB, cenaB, campanhaB]);
  await client.query(`insert into vtt_area_permissoes (campaign_id, user_id) values ($1,$2)`, [campanhaA, jogadorAutorizado]);
  await client.query(`insert into vtt_areas (id, scene_id, campaign_id, tipo, origem_q, origem_r, raio_m, criador_id) values ($1,$2,$3,'esfera',0,0,3,$4)`, [areaA, cenaA, campanhaA, narradorA]);
  await client.query("commit");
}

async function limpar() {
  await client.query("begin");
  await client.query("delete from vtt_areas where campaign_id in ($1,$2)", [campanhaA, campanhaB]);
  await client.query("delete from vtt_area_permissoes where campaign_id in ($1,$2)", [campanhaA, campanhaB]);
  await client.query("delete from vtt_tokens where campaign_id in ($1,$2)", [campanhaA, campanhaB]);
  await client.query("delete from vtt_campaign_stage where campaign_id in ($1,$2)", [campanhaA, campanhaB]);
  await client.query("delete from vtt_scenes where campaign_id in ($1,$2)", [campanhaA, campanhaB]);
  await client.query("delete from campaign_members where campaign_id in ($1,$2)", [campanhaA, campanhaB]);
  await client.query("delete from campaigns where id in ($1,$2)", [campanhaA, campanhaB]);
  await client.query("delete from auth.users where id in ($1,$2,$3,$4)", [narradorA, narradorB, jogadorAutorizado, jogadorSemAutorizacao]);
  await client.query("commit");
}

async function rpcCreate(params) {
  const p = {
    p_scene_id: cenaA, p_campaign_id: campanhaA, p_tipo: "esfera",
    p_origem_q: 0, p_origem_r: 0, p_direcao_graus: null, p_raio_m: 3,
    p_comprimento_m: null, p_largura_m: null, p_altura_m: null, p_lado_m: null,
    p_nivel_origem_m: null, p_modo_linha: null, p_pontos: null, p_token_id: null,
    p_cor: "ciano", p_opacidade: 0.35, p_rotulo: null, p_visivel: true,
    ...params,
  };
  return client.query(
    `select * from create_vtt_area($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
    [p.p_scene_id, p.p_campaign_id, p.p_tipo, p.p_origem_q, p.p_origem_r, p.p_direcao_graus, p.p_raio_m, p.p_comprimento_m, p.p_largura_m, p.p_altura_m, p.p_lado_m, p.p_nivel_origem_m, p.p_modo_linha, p.p_pontos, p.p_token_id, p.p_cor, p.p_opacidade, p.p_rotulo, p.p_visivel],
  );
}

async function main() {
  await setup();

  // ── 1. Usuário ANÔNIMO de verdade (role `anon`, sem `authenticated`) ──
  await client.query("begin");
  try {
    await client.query("set local role anon");
    try { await rpcCreate({}); reg("1 (role anon não executa a RPC — sem grant)", false, "deveria ter falhado"); }
    catch (e) { reg("1 (role anon não executa a RPC — sem grant)", /permission denied/i.test(e.message), e.message.slice(0, 90)); }
  } finally { await client.query("rollback"); }

  // ── 9b. Aura sobre token oculto — agora deve ser recusada ──
  await comoUsuario(jogadorAutorizado, async () => {
    try {
      const r = await rpcCreate({ p_tipo: "aura", p_origem_q: null, p_origem_r: null, p_raio_m: 3, p_token_id: tokenOcultoA });
      reg("9b (aura sobre token oculto agora é recusada — pós-fix)", false, `CRIOU MESMO ASSIM: ${JSON.stringify(r.rows[0])}`);
    } catch (e) { reg("9b (aura sobre token oculto agora é recusada — pós-fix)", /não consegue ver/.test(e.message), e.message); }
  });
  // Narrador PODE (ele vê todos os tokens da própria campanha).
  await comoUsuario(narradorA, async () => {
    const r = await rpcCreate({ p_tipo: "aura", p_origem_q: null, p_origem_r: null, p_raio_m: 3, p_token_id: tokenOcultoA });
    reg("9c (narrador ainda pode criar aura sobre token oculto — ele vê todos)", r.rows.length === 1, JSON.stringify(r.rows[0]?.tipo));
  });

  // ── 13b. Coordenada de origem absurda — agora deve ser recusada ──
  await comoUsuario(narradorA, async () => {
    try { await rpcCreate({ p_origem_q: 1e15, p_origem_r: -1e15 }); reg("13b (coordenada de origem absurda agora é recusada — pós-fix)", false, "deveria ter falhado"); }
    catch (e) { reg("13b (coordenada de origem absurda agora é recusada — pós-fix)", /magnitude|check constraint/i.test(e.message), e.message.slice(0, 90)); }
  });
  // Coordenada dentro do limite (999) continua aceita.
  await comoUsuario(narradorA, async () => {
    const r = await rpcCreate({ p_origem_q: 999, p_origem_r: -999 });
    reg("13c (coordenada de origem dentro do limite continua aceita)", Number(r.rows[0].origem_q) === 999, `origem_q=${r.rows[0].origem_q}`);
  });

  // ── 14b. Ponto de parede com coordenada absurda — agora deve ser recusado ──
  await comoUsuario(narradorA, async () => {
    try {
      await rpcCreate({ p_tipo: "parede", p_origem_q: null, p_origem_r: null, p_raio_m: null, p_altura_m: 2, p_pontos: JSON.stringify([{ q: 0, r: 0 }, { q: 1e9, r: 0 }]) });
      reg("14b (ponto de parede com coordenada absurda agora é recusado — pós-fix)", false, "deveria ter falhado");
    } catch (e) { reg("14b (ponto de parede com coordenada absurda agora é recusado — pós-fix)", /inválido/.test(e.message), e.message); }
  });
  // Ponto dentro do limite continua aceito.
  await comoUsuario(narradorA, async () => {
    const r = await rpcCreate({ p_tipo: "parede", p_origem_q: null, p_origem_r: null, p_raio_m: null, p_altura_m: 2, p_pontos: JSON.stringify([{ q: 0, r: 0 }, { q: 1000, r: 0 }]) });
    reg("14c (ponto de parede exatamente no limite de 1000 continua aceito)", r.rows.length === 1, JSON.stringify(r.rows[0]?.pontos));
  });

  // ── 2. Narrador de OUTRA campanha (B) tentando criar em A — ainda
  // recusado, mas agora por NÃO SER MEMBRO da campanha (0083), não por
  // falta de autorização explícita. ──
  await comoUsuario(narradorB, async () => {
    try { await rpcCreate({}); reg("2 (narrador de outra campanha não cria área em A)", false, "deveria ter falhado"); }
    catch (e) { reg("2 (narrador de outra campanha não cria área em A)", /participante/.test(e.message), e.message); }
  });

  // ── 3. Jogador da campanha SEM a autorização explícita ANTIGA —
  // migration 0083: criação é aberta a qualquer participante VÁLIDO,
  // não existe mais concessão explícita. Este jogador nunca recebeu
  // `vtt_area_permissoes` e mesmo assim consegue criar agora. ──
  await comoUsuario(jogadorSemAutorizacao, async () => {
    const r = await rpcCreate({});
    reg("3 (jogador SEM a autorização explícita antiga consegue criar — 0083 abriu a criação)", r.rows.length === 1, JSON.stringify(r.rows[0]?.tipo));
  });

  // ── 4. Jogador AUTORIZADO cria normalmente ──
  await comoUsuario(jogadorAutorizado, async () => {
    const r = await rpcCreate({});
    reg("4 (jogador autorizado cria área)", r.rows.length === 1, JSON.stringify(r.rows[0]?.tipo));
  });

  // ── 5. Narrador cria normalmente ──
  await comoUsuario(narradorA, async () => {
    const r = await rpcCreate({});
    reg("5 (narrador cria área)", r.rows.length === 1, JSON.stringify(r.rows[0]?.tipo));
  });

  // ── 6. Área em cena de OUTRA campanha, mesmo passando p_campaign_id correto ──
  await comoUsuario(narradorA, async () => {
    try { await rpcCreate({ p_scene_id: cenaB }); reg("6 (cena de outra campanha é recusada mesmo com campaign_id correto)", false, "deveria ter falhado"); }
    catch (e) { reg("6 (cena de outra campanha é recusada mesmo com campaign_id correto)", /Cena não encontrada/.test(e.message), e.message); }
  });

  // ── 7. Aura com token de OUTRA cena da MESMA campanha ──
  // (crio uma 2ª cena dentro da campanha A pra isso)
  const cenaA2 = randomUUID();
  await client.query("begin");
  await client.query(`insert into vtt_scenes (id, campaign_id, nome, largura, altura) values ($1,$2,'S2',10,10)`, [cenaA2, campanhaA]);
  await client.query("commit");
  await comoUsuario(narradorA, async () => {
    try {
      await rpcCreate({ p_scene_id: cenaA2, p_tipo: "aura", p_origem_q: null, p_origem_r: null, p_raio_m: 3, p_token_id: tokenVisivelA });
      reg("7 (aura não pode apontar pra token de OUTRA cena da mesma campanha)", false, "deveria ter falhado");
    } catch (e) { reg("7 (aura não pode apontar pra token de OUTRA cena da mesma campanha)", /não está nesta cena/.test(e.message), e.message); }
  });
  await client.query("begin"); await client.query("delete from vtt_scenes where id=$1", [cenaA2]); await client.query("commit");

  // ── 8. Aura com token de OUTRA CAMPANHA ──
  await comoUsuario(narradorA, async () => {
    try {
      await rpcCreate({ p_tipo: "aura", p_origem_q: null, p_origem_r: null, p_raio_m: 3, p_token_id: tokenB });
      reg("8 (aura não pode apontar pra token de OUTRA campanha)", false, "deveria ter falhado");
    } catch (e) { reg("8 (aura não pode apontar pra token de OUTRA campanha)", /não está nesta cena/.test(e.message), e.message); }
  });

  // ── 9. Aura sobre token OCULTO — a pergunta central ──
  await comoUsuario(jogadorAutorizado, async () => {
    try {
      const r = await rpcCreate({ p_tipo: "aura", p_origem_q: null, p_origem_r: null, p_raio_m: 3, p_token_id: tokenOcultoA });
      reg("9 (jogador NÃO deveria conseguir criar aura sobre token oculto que não pode ver)", false, `CRIOU MESMO ASSIM: ${JSON.stringify(r.rows[0])}`);
    } catch (e) { reg("9 (jogador NÃO deveria conseguir criar aura sobre token oculto que não pode ver)", true, `recusado: ${e.message}`); }
  });

  // ── 10. Revisão forjada (muito à frente) ──
  await comoUsuario(narradorA, async () => {
    try {
      await client.query(
        `select * from update_vtt_area($1,0,0,null,5,null,null,null,null,null,null,null,null,'ciano',0.4,null,true,$2)`,
        [areaA, 9999],
      );
      reg("10 (revisão forjada — muito à frente — é recusada)", false, "deveria ter falhado");
    } catch (e) { reg("10 (revisão forjada — muito à frente — é recusada)", /mudou em outra sessão/.test(e.message), e.message); }
  });

  // ── 11. Criador forjado — jogador tentando editar área que não criou ──
  // `jogadorAutorizado` TEM a concessão explícita ANTIGA em
  // `vtt_area_permissoes` (ver `setup()`) e mesmo assim é recusado —
  // prova direta de que a 0083 não deixou essa tabela conceder edição
  // nenhuma: só narrador-ou-criador (`pode_editar_vtt_area`) decide.
  await comoUsuario(jogadorAutorizado, async () => {
    try {
      await client.query(
        `select * from update_vtt_area($1,0,0,null,5,null,null,null,null,null,null,null,null,'ciano',0.4,null,true,$2)`,
        [areaA, 1],
      );
      reg("11 (jogador autorizado não edita área de OUTRO criador — só narrador)", false, "deveria ter falhado");
    } catch (e) { reg("11 (jogador autorizado não edita área de OUTRO criador — só narrador)", /só pode alterar/.test(e.message), e.message); }
  });

  // ── 11b. Mesmo jogador não duplica nem exclui a área de outro criador ──
  await comoUsuario(jogadorAutorizado, async () => {
    try { await client.query(`select * from duplicate_vtt_area($1)`, [areaA]); reg("11b (jogador não duplica área de outro criador)", false, "deveria ter falhado"); }
    catch (e) { reg("11b (jogador não duplica área de outro criador)", /autorização/.test(e.message), e.message); }
  });
  await comoUsuario(jogadorAutorizado, async () => {
    try { await client.query(`select delete_vtt_area($1)`, [areaA]); reg("11c (jogador não exclui área de outro criador)", false, "deveria ter falhado"); }
    catch (e) { reg("11c (jogador não exclui área de outro criador)", /só pode remover/.test(e.message), e.message); }
  });
  // Narrador PODE duplicar a área de outra pessoa — a cópia passa a
  // ser DELE (auth.uid() no INSERT), nunca do criador original.
  await comoUsuario(narradorA, async () => {
    const r = await client.query(`select * from duplicate_vtt_area($1)`, [areaA]);
    reg("11d (narrador duplica área alheia — a cópia pertence a ele)", r.rows.length === 1 && r.rows[0].criador_id === narradorA, JSON.stringify({ criador: r.rows[0]?.criador_id }));
  });

  // ── 11e. RPC antiga de conceder permissão não é mais alcançável —
  // nem pelo NARRADOR, que era o único papel que a usava antes: o
  // grant de EXECUTE foi revogado de `authenticated` inteiro (0083).
  await comoUsuario(narradorA, async () => {
    try {
      await client.query(`select set_vtt_area_permissao($1,$2,true)`, [campanhaA, jogadorSemAutorizacao]);
      reg("11e (set_vtt_area_permissao — RPC antiga sem grant, nem narrador alcança)", false, "deveria ter falhado");
    } catch (e) { reg("11e (set_vtt_area_permissao — RPC antiga sem grant, nem narrador alcança)", /permission denied/i.test(e.message), e.message.slice(0, 90)); }
  });

  // ── 12. Dimensões negativas/zero/enormes ──
  for (const [nome, raio] of [["negativo", -5], ["zero", 0], ["enorme", 999999]]) {
    await comoUsuario(narradorA, async () => {
      try { await rpcCreate({ p_raio_m: raio }); reg(`12 (raio ${nome} é recusado)`, false, "deveria ter falhado"); }
      catch (e) { reg(`12 (raio ${nome} é recusado)`, true, e.message.slice(0, 80)); }
    });
  }

  // ── 13. Coordenadas de origem enormes — SEM LIMITE HOJE? ──
  await comoUsuario(narradorA, async () => {
    try {
      const r = await rpcCreate({ p_origem_q: 1e15, p_origem_r: -1e15 });
      reg("13 (coordenada de origem absurda — deveria ser recusada ou limitada)", false, `ACEITA SEM LIMITE: origem_q=${r.rows[0].origem_q}`);
    } catch (e) { reg("13 (coordenada de origem absurda — deveria ser recusada ou limitada)", true, e.message.slice(0, 80)); }
  });

  // ── 14. Pontos de parede com coordenada absurda ──
  await comoUsuario(narradorA, async () => {
    try {
      const r = await rpcCreate({ p_tipo: "parede", p_origem_q: null, p_origem_r: null, p_raio_m: null, p_altura_m: 2, p_pontos: JSON.stringify([{ q: 0, r: 0 }, { q: 1e9, r: 0 }]) });
      reg("14 (ponto de parede com coordenada absurda — deveria ser recusado ou limitado)", false, `ACEITO SEM LIMITE: ${JSON.stringify(r.rows[0].pontos)}`);
    } catch (e) { reg("14 (ponto de parede com coordenada absurda — deveria ser recusado ou limitado)", true, e.message.slice(0, 80)); }
  });

  // ── 15. Número excessivo de pontos (>64) ──
  await comoUsuario(narradorA, async () => {
    const muitos = Array.from({ length: 100 }, (_, i) => ({ q: i, r: 0 }));
    try { await rpcCreate({ p_tipo: "personalizada", p_origem_q: null, p_origem_r: null, p_raio_m: null, p_pontos: JSON.stringify(muitos) }); reg("15 (>64 pontos é recusado)", false, "deveria ter falhado"); }
    catch (e) { reg("15 (>64 pontos é recusado)", /inválido/.test(e.message), e.message); }
  });

  // ── 16. Tipo desconhecido ──
  await comoUsuario(narradorA, async () => {
    try { await rpcCreate({ p_tipo: "explosao_nuclear" }); reg("16 (tipo desconhecido é recusado)", false, "deveria ter falhado"); }
    catch (e) { reg("16 (tipo desconhecido é recusado)", true, e.message.slice(0, 100)); }
  });

  // ── 17. Parâmetros de um tipo enviados como outro (cone sem os campos de cone) ──
  await comoUsuario(narradorA, async () => {
    try { await rpcCreate({ p_tipo: "cone", p_origem_q: 0, p_origem_r: 0, p_raio_m: null, p_direcao_graus: null, p_comprimento_m: null }); reg("17 (cone sem direção/alcance é recusado)", false, "deveria ter falhado"); }
    catch (e) { reg("17 (cone sem direção/alcance é recusado)", true, e.message.slice(0, 100)); }
  });

  // ── 18. Cone com abertura != 45 forjada ──
  await comoUsuario(narradorA, async () => {
    const r = await rpcCreate({ p_tipo: "cone", p_origem_q: 0, p_origem_r: 0, p_raio_m: null, p_direcao_graus: 0, p_comprimento_m: 6 });
    // A RPC nem aceita p_abertura_graus como parâmetro — ela FORÇA 45 sempre.
    reg("18 (cone sempre grava abertura=45, não aceita outro valor do cliente)", Number(r.rows[0].abertura_graus) === 45, `abertura=${r.rows[0].abertura_graus}`);
  });

  // ── 19. Parede com largura != 1 forjada ──
  await comoUsuario(narradorA, async () => {
    const r = await rpcCreate({ p_tipo: "parede", p_origem_q: null, p_origem_r: null, p_raio_m: null, p_altura_m: 2, p_largura_m: 999, p_pontos: JSON.stringify([{ q: 0, r: 0 }, { q: 3, r: 0 }]) });
    reg("19 (parede sempre grava largura=1, ignora valor forjado do cliente)", Number(r.rows[0].largura_m) === 1, `largura=${r.rows[0].largura_m}`);
  });

  // ── 20. Cubo com altura != lado forjada ──
  await comoUsuario(narradorA, async () => {
    const r = await rpcCreate({ p_tipo: "cubo", p_origem_q: 0, p_origem_r: 0, p_raio_m: null, p_direcao_graus: 0, p_lado_m: 4, p_altura_m: 999 });
    reg("20 (cubo sempre grava altura=lado, ignora valor forjado do cliente)", Number(r.rows[0].altura_m) === Number(r.rows[0].lado_m), `altura=${r.rows[0].altura_m}, lado=${r.rows[0].lado_m}`);
  });

  // ── 21. Escrita DIRETA na tabela (bypass de RPC) ──
  await comoUsuario(narradorA, async () => {
    try {
      await client.query(`insert into vtt_areas (scene_id, campaign_id, tipo, origem_q, origem_r, raio_m, criador_id) values ($1,$2,'esfera',0,0,3,$3)`, [cenaA, campanhaA, narradorA]);
      reg("21 (insert DIRETO na tabela, bypassando a RPC, é recusado)", false, "INSERT DIRETO FUNCIONOU — falha grave");
    } catch (e) { reg("21 (insert DIRETO na tabela, bypassando a RPC, é recusado)", /permission denied|policy/i.test(e.message), e.message.slice(0, 100)); }
  });

  // ── 22. Área oculta não vaza pro jogador sem permissão de ver ──
  // TUDO em UMA transação (rollback no final, nunca persiste): a troca
  // de `role`/`jwt.claims` é local à transação, então a UPDATE (ainda
  // não commitada) já é visível pra qualquer SELECT dentro da MESMA
  // transação, mesmo depois de trocar de "sessão" simulada.
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query(`set local request.jwt.claims = '${JSON.stringify({ sub: narradorA, role: "authenticated" })}'`);
    await client.query(
      `select * from update_vtt_area($1,0,0,null,3,null,null,null,null,null,null,null,null,'ciano',0.35,null,false,1)`,
      [areaA],
    );
    await client.query(`set local request.jwt.claims = '${JSON.stringify({ sub: jogadorSemAutorizacao, role: "authenticated" })}'`);
    const rJog = await client.query(`select * from vtt_areas where id=$1`, [areaA]);
    reg("22 (área oculta não aparece pro jogador comum)", rJog.rows.length === 0, `linhas=${rJog.rows.length}`);

    await client.query(`set local request.jwt.claims = '${JSON.stringify({ sub: narradorA, role: "authenticated" })}'`);
    const rNarr = await client.query(`select * from vtt_areas where id=$1`, [areaA]);
    reg("22b (área oculta continua visível pro narrador)", rNarr.rows.length === 1, `linhas=${rNarr.rows.length}`);
  } finally { await client.query("rollback"); }

  // ── 23. ID forjado em delete/update (área inexistente) ──
  await comoUsuario(narradorA, async () => {
    const r = await client.query(`select delete_vtt_area($1)`, [randomUUID()]);
    reg("23 (excluir ID inexistente não lança erro — idempotente)", true, "ok, sem erro");
  });

  await limpar();
  console.log(`\n${ok} ok, ${falha} falha(s).`);
  await client.end();
  process.exit(falha > 0 ? 1 : 0);
}

main().catch(async (e) => { console.error("ERRO FATAL:", e); await limpar().catch(() => {}); await client.end(); process.exit(1); });
