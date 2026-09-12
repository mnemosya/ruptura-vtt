#!/usr/bin/env node
/**
 * Auditoria adversarial do catálogo de cenas (migrations 0111/0112).
 *
 * Mesmo método de `check-vtt-areas-seguranca-rpc.mjs`: fala com o banco
 * REAL impersonando cada papel via `set local role authenticated` +
 * `set local request.jwt.claims`, nunca pela service role — que ignora
 * RLS e por isso não prova nada sobre autorização.
 *
 * A pergunta que este arquivo existe para responder é uma só, e é a
 * razão de o catálogo ter valor: o narrador consegue montar uma cena
 * SEM que a mesa veja? Se qualquer critério da seção "cena fora do
 * palco" falhar, a resposta é não, e o recurso está mentindo.
 *
 * Uso: npx tsx scripts/dev/check-vtt-cenas-seguranca.mjs
 * Requer SUPABASE_DB_URL em .env.local.
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

/**
 * Executa e devolve `{ erro }` em vez de lançar — o teste quer a recusa
 * como dado, não como exceção.
 *
 * O savepoint não é zelo: no Postgres, UM erro aborta a transação
 * inteira, e todo comando seguinte falha com "current transaction is
 * aborted". Sem isolar cada tentativa, o primeiro critério que recusa
 * (que é o comportamento CERTO) faria todos os seguintes "passarem"
 * exibindo a mensagem de transação abortada — um teste que vira
 * carimbo depois da primeira recusa.
 */
let nSavepoint = 0;
async function tentar(sql, params) {
  const sp = `sp_${++nSavepoint}`;
  await client.query(`savepoint ${sp}`);
  try {
    const linhas = (await client.query(sql, params)).rows;
    await client.query(`release savepoint ${sp}`);
    return { linhas };
  } catch (e) {
    await client.query(`rollback to savepoint ${sp}`);
    return { erro: e.message };
  }
}

const narrador = randomUUID(), jogador = randomUUID(), estranho = randomUUID();
const campanha = randomUUID(), campanhaOutra = randomUUID();
const cenaPalco = randomUUID(), cenaPreparo = randomUUID(), cenaArquivada = randomUUID(), cenaOutra = randomUUID();
const tokenPalco = randomUUID(), tokenPreparo = randomUUID();
const imagemPreparo = randomUUID();
// Marcações/medições que o JOGADOR escreveu quando aquelas cenas eram
// dele — o cenário do id guardado no navegador depois da troca de cena.
const marcaPreparo = randomUUID(), marcaArquivada = randomUUID(), medicaoPreparo = randomUUID();

async function setup() {
  await client.query("begin");
  await client.query(
    `insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role)
     values ($1::uuid,$1::text||'@x.dev','x',now(),'{}','{}','authenticated','authenticated'),
            ($2::uuid,$2::text||'@x.dev','x',now(),'{}','{}','authenticated','authenticated'),
            ($3::uuid,$3::text||'@x.dev','x',now(),'{}','{}','authenticated','authenticated')
     on conflict do nothing`, [narrador, jogador, estranho]);
  await client.query(`insert into campaigns (id, name, owner_id) values ($1,'Catálogo',$2),($3,'Outra',$4)`,
    [campanha, narrador, campanhaOutra, estranho]);
  await client.query(`insert into campaign_members (campaign_id, user_id, role, status) values ($1,$2,'player','active')`,
    [campanha, jogador]);
  await client.query(
    `insert into vtt_scenes (id, campaign_id, nome, largura, altura, ordem, archived_at, ativa) values
       ($1,$2,'No palco',10,10,0,null,true),
       ($3,$2,'Em preparo',10,10,1,null,false),
       ($4,$2,'Arquivada',10,10,2,now(),false),
       ($5,$6,'De outra campanha',10,10,0,null,true)`,
    [cenaPalco, campanha, cenaPreparo, cenaArquivada, cenaOutra, campanhaOutra]);
  await client.query(`insert into vtt_campaign_stage (campaign_id, presented_scene_id) values ($1,$2),($3,$4)`,
    [campanha, cenaPalco, campanhaOutra, cenaOutra]);
  await client.query(
    `insert into vtt_tokens (id, scene_id, campaign_id, nome, sigla, q, r, visivel) values
       ($1,$2,$3,'No palco','PA',1,1,true),
       ($4,$5,$3,'Em preparo','PR',1,1,true)`,
    [tokenPalco, cenaPalco, campanha, tokenPreparo, cenaPreparo]);
  await client.query(`insert into vtt_terrain (scene_id, campaign_id, q, r, tipo) values ($1,$2,3,3,'dificil'),($3,$2,3,3,'bloqueado')`,
    [cenaPalco, campanha, cenaPreparo]);
  await client.query(
    `insert into vtt_image_assets (id, campaign_id, storage_path, sha256, mime, estado, width_px, height_px, bytes)
     values ($1,$2,$3,repeat('a',64),'image/webp','ready',100,100,1000)`,
    [imagemPreparo, campanha, `campanhas/${campanha}/preparo.webp`]);
  await client.query(
    `insert into vtt_scene_images (scene_id, campaign_id, image_id, papel, centro_q, centro_r, largura_m, visivel)
     values ($1,$2,$3,'fundo',0,0,10,true)`,
    [cenaPreparo, campanha, imagemPreparo]);
  await client.query(
    `insert into vtt_marks (id, scene_id, campaign_id, autor_id, tipo, pontos, cor, espessura, opacidade, privada) values
       ($1,$2,$3,$4,'linha','[{"q":0,"r":0},{"q":1,"r":1}]','ciano',2,1,false),
       ($5,$6,$3,$4,'linha','[{"q":0,"r":0},{"q":1,"r":1}]','ciano',2,1,false)`,
    [marcaPreparo, cenaPreparo, campanha, jogador, marcaArquivada, cenaArquivada]);
  await client.query(
    `insert into vtt_measurements (id, scene_id, campaign_id, autor_id, pontos, cor) values
       ($1,$2,$3,$4,'[{"q":0,"r":0},{"q":2,"r":0}]','ciano')`,
    [medicaoPreparo, cenaPreparo, campanha, jogador]);
  await client.query("commit");
}

async function limpar() {
  await client.query("begin");
  await client.query(`delete from vtt_marks where campaign_id = any($1)`, [[campanha, campanhaOutra]]);
  await client.query(`delete from vtt_measurements where campaign_id = any($1)`, [[campanha, campanhaOutra]]);
  await client.query(`delete from vtt_scene_images where campaign_id = any($1)`, [[campanha, campanhaOutra]]);
  await client.query(`delete from vtt_image_assets where campaign_id = any($1)`, [[campanha, campanhaOutra]]);
  await client.query(`delete from vtt_campaign_stage where campaign_id = any($1)`, [[campanha, campanhaOutra]]);
  await client.query(`delete from campaigns where id = any($1)`, [[campanha, campanhaOutra]]);
  await client.query(`delete from auth.users where id = any($1)`, [[narrador, jogador, estranho]]);
  await client.query("commit");
}

/**
 * `create_vtt_area` tem 19 parâmetros posicionais e nenhum default —
 * uma chamada curta não "falha porque foi recusada", falha porque a
 * assinatura não existe, e isso passaria como se fosse recusa.
 */
const SQL_CRIAR_AREA = `select * from create_vtt_area($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`;
const argsArea = (sceneId) => [
  sceneId, campanha, "esfera", 0, 0, null, 3, null, null, null, null,
  null, null, null, null, "ciano", 0.35, null, true,
];

try {
  await setup();

  // ── O predicado, isolado ───────────────────────────────────────────
  await comoUsuario(jogador, async () => {
    const { rows } = await client.query(
      `select public.vtt_pode_ver_cena($1) as palco,
              public.vtt_pode_ver_cena($2) as preparo,
              public.vtt_pode_interagir_cena($2) as escreve_preparo`,
      [cenaPalco, cenaPreparo]);
    reg("P1 (jogador vê a cena apresentada)", rows[0].palco === true, `${rows[0].palco}`);
    reg("P2 (jogador NÃO vê a cena em preparo)", rows[0].preparo === false, `${rows[0].preparo}`);
    reg("P3 (jogador NÃO escreve na cena em preparo)", rows[0].escreve_preparo === false, `${rows[0].escreve_preparo}`);
  });

  await comoUsuario(narrador, async () => {
    const { rows } = await client.query(
      `select public.vtt_pode_ver_cena($1) as preparo,
              public.vtt_pode_ver_cena($2) as arquivada,
              public.vtt_pode_interagir_cena($1) as escreve_preparo,
              public.vtt_pode_interagir_cena($2) as escreve_arquivada`,
      [cenaPreparo, cenaArquivada]);
    reg("P4 (narrador vê a cena em preparo)", rows[0].preparo === true, `${rows[0].preparo}`);
    reg("P5 (narrador vê a cena arquivada — precisa, pra restaurar)", rows[0].arquivada === true, `${rows[0].arquivada}`);
    reg("P6 (narrador escreve na cena em preparo)", rows[0].escreve_preparo === true, `${rows[0].escreve_preparo}`);
    reg("P7 (ninguém escreve em cena ARQUIVADA, nem o narrador)", rows[0].escreve_arquivada === false, `${rows[0].escreve_arquivada}`);
  });

  // O estranho é dono de OUTRA campanha — não é anônimo, é alguém com
  // sessão válida e nenhum vínculo com esta mesa. É o papel que separa
  // "a RLS filtra por campanha" de "a RLS filtra por cena": para ele as
  // duas respostas coincidem, e é bom que coincidam.
  await comoUsuario(estranho, async () => {
    const { rows } = await client.query(`select public.vtt_pode_ver_cena($1) as palco`, [cenaPalco]);
    reg("P8 (estranho não vê nem a cena apresentada)", rows[0].palco === false, `${rows[0].palco}`);

    const cenas = await client.query(`select id from vtt_scenes where campaign_id = $1`, [campanha]);
    reg("E1 (estranho não lê cena nenhuma desta campanha)", cenas.rows.length === 0, `${cenas.rows.length} linha(s)`);

    const tokens = await client.query(`select id from vtt_tokens where campaign_id = $1`, [campanha]);
    reg("E2 (estranho não lê tokens)", tokens.rows.length === 0, `${tokens.rows.length} linha(s)`);

    const terreno = await client.query(`select q from vtt_terrain where campaign_id = $1`, [campanha]);
    reg("E3 (estranho não lê terreno)", terreno.rows.length === 0, `${terreno.rows.length} linha(s)`);

    const palco = await client.query(`select campaign_id from vtt_campaign_stage where campaign_id = $1`, [campanha]);
    reg("E4 (estranho não lê nem o palco)", palco.rows.length === 0, `${palco.rows.length} linha(s)`);

    const cat = await tentar(`select public.list_vtt_scenes($1) as c`, [campanha]);
    reg("E5 (catálogo recusa quem não é da campanha)", Boolean(cat.erro), cat.erro ?? "DEVOLVEU");

    const rpc = await tentar(`select public.read_vtt_scene_tokens($1) as t`, [cenaPalco]);
    reg("E6 (RPC de tokens recusa o estranho)", Boolean(rpc.erro), rpc.erro ?? "DEVOLVEU");
  });

  // ── Cena fora do palco: o coração do recurso ───────────────────────
  await comoUsuario(jogador, async () => {
    const cenas = await client.query(`select nome from vtt_scenes where campaign_id = $1 order by ordem`, [campanha]);
    reg("C1 (jogador enxerga UMA cena, a apresentada)",
      cenas.rows.length === 1 && cenas.rows[0].nome === "No palco",
      `${cenas.rows.length} cena(s): ${cenas.rows.map((r) => r.nome).join(", ") || "—"}`);

    const tokens = await client.query(`select nome from vtt_tokens where campaign_id = $1`, [campanha]);
    reg("C2 (jogador não lê tokens da cena em preparo)",
      !tokens.rows.some((t) => t.nome === "Em preparo"),
      `tokens visíveis: ${tokens.rows.map((t) => t.nome).join(", ") || "—"}`);

    const terreno = await client.query(`select scene_id from vtt_terrain where campaign_id = $1`, [campanha]);
    reg("C3 (jogador não lê terreno da cena em preparo)",
      terreno.rows.every((t) => t.scene_id === cenaPalco),
      `${terreno.rows.length} célula(s)`);

    const rpcTokens = await tentar(`select public.read_vtt_scene_tokens($1) as t`, [cenaPreparo]);
    reg("C4 (RPC SECURITY DEFINER de tokens recusa a cena em preparo — era a porta aberta)",
      Boolean(rpcTokens.erro), rpcTokens.erro ?? `DEVOLVEU DADOS: ${JSON.stringify(rpcTokens.linhas)}`);

    const rpcImgs = await tentar(`select public.read_vtt_scene_images($1) as t`, [cenaPreparo]);
    reg("C5 (RPC de imagens recusa a cena em preparo)",
      Boolean(rpcImgs.erro), rpcImgs.erro ?? "DEVOLVEU DADOS");

    const rpcObjs = await tentar(`select public.read_vtt_scene_objects($1) as t`, [cenaPreparo]);
    reg("C6 (RPC de objetos recusa a cena em preparo)",
      Boolean(rpcObjs.erro), rpcObjs.erro ?? "DEVOLVEU DADOS");

    const cat = await client.query(`select public.list_vtt_scenes($1) as c`, [campanha]);
    reg("C7 (catálogo devolve só a cena apresentada pro jogador)",
      cat.rows[0].c.length === 1 && cat.rows[0].c[0].apresentada === true,
      `${cat.rows[0].c.length} cartão(ões)`);

    const hud = await tentar(`select public.read_vtt_token_hud($1) as h`, [tokenPreparo]);
    reg("C8 (HUD de token da cena em preparo não abre)",
      Boolean(hud.erro) || hud.linhas?.[0]?.h === null,
      hud.erro ?? `h=${JSON.stringify(hud.linhas?.[0]?.h)}`);

    const move = await client.query(`select public.can_move_vtt_token($1) as m`, [tokenPreparo]);
    reg("C9 (jogador não move token da cena em preparo)", move.rows[0].m === false, `${move.rows[0].m}`);

    const marca = await tentar(
      `insert into vtt_marks (scene_id, campaign_id, autor_id, tipo, pontos, cor, espessura, opacidade, privada)
       values ($1,$2,$3,'linha','[{"q":0,"r":0},{"q":1,"r":1}]','ciano',2,1,false) returning id`,
      [cenaPreparo, campanha, jogador]);
    reg("C10 (jogador não escreve marcação na cena em preparo)",
      Boolean(marca.erro), marca.erro ?? "INSERIU");

    // A criação de área não passa por `pode_criar_vtt_area` (função
    // órfã) e sim por `vtt_validar_area` — foi o furo que a 0112
    // deixou aberto e a 0113 fechou. Os dois lados do critério, porque
    // "recusa tudo" também seria um jeito de passar.
    const areaPreparo = await tentar(SQL_CRIAR_AREA, argsArea(cenaPreparo));
    reg("C14 (jogador não cria área na cena em preparo)",
      Boolean(areaPreparo.erro), areaPreparo.erro ?? "CRIOU");

    const areaPalco = await tentar(SQL_CRIAR_AREA, argsArea(cenaPalco));
    reg("C15 (jogador continua criando área na cena em que está)",
      !areaPalco.erro, areaPalco.erro ?? "criou");

    // ── DELETE atravessando cena (0115) ──────────────────────────────
    // O jogador escreveu estas linhas quando a cena era dele. O narrador
    // seguiu em frente; o id continua no navegador. Apagar agora seria
    // mexer numa cena em que ele não está.
    const delMarca = await tentar(`delete from vtt_marks where id = $1 returning id`, [marcaPreparo]);
    reg("D1 (jogador não apaga marcação DELE numa cena que deixou de ser a dele)",
      delMarca.erro || delMarca.linhas?.length === 0,
      delMarca.erro ?? `apagou ${delMarca.linhas?.length} linha(s)`);

    const delMedicao = await tentar(`delete from vtt_measurements where id = $1 returning id`, [medicaoPreparo]);
    reg("D2 (idem para medição)",
      delMedicao.erro || delMedicao.linhas?.length === 0,
      delMedicao.erro ?? `apagou ${delMedicao.linhas?.length} linha(s)`);

    const delArquivada = await tentar(`delete from vtt_marks where id = $1 returning id`, [marcaArquivada]);
    reg("D3 (jogador não apaga marcação dele em cena ARQUIVADA)",
      delArquivada.erro || delArquivada.linhas?.length === 0,
      delArquivada.erro ?? `apagou ${delArquivada.linhas?.length} linha(s)`);
  });

  // 0114: a imagem de fundo da cena em preparo existe e está visível
  // NAQUELA cena — o que antes bastava pra liberar uma URL assinada.
  //
  // Fora do `comoUsuario` de propósito: `vtt_asset_assinavel_para` não
  // tem grant pra `authenticated` (é helper interno do servidor de
  // imagens) e recebe o usuário como PARÂMETRO. Quem pergunta é o
  // serviço; a resposta é sobre o jogador.
  {
    const jog = await client.query(`select public.vtt_asset_assinavel_para($1,$2) as pode`, [imagemPreparo, jogador]);
    reg("C16 (jogador não assina a imagem da cena em preparo)", jog.rows[0].pode === false, `${jog.rows[0].pode}`);
    const nar = await client.query(`select public.vtt_asset_assinavel_para($1,$2) as pode`, [imagemPreparo, narrador]);
    reg("C17 (narrador continua assinando a imagem da cena que prepara)", nar.rows[0].pode === true, `${nar.rows[0].pode}`);
  }

  await comoUsuario(narrador, async () => {
    const cenas = await client.query(`select nome from vtt_scenes where campaign_id = $1 order by ordem`, [campanha]);
    reg("C11 (narrador enxerga o catálogo inteiro, arquivada inclusive)",
      cenas.rows.length === 3, `${cenas.rows.length}: ${cenas.rows.map((r) => r.nome).join(", ")}`);

    const rpc = await tentar(`select public.read_vtt_scene_tokens($1) as t`, [cenaPreparo]);
    reg("C12 (narrador lê os tokens da cena que está preparando)",
      !rpc.erro && Array.isArray(rpc.linhas?.[0]?.t), rpc.erro ?? `${rpc.linhas[0].t.length} token(s)`);

    const cat = await client.query(`select public.list_vtt_scenes($1, true) as c`, [campanha]);
    reg("C13 (catálogo do narrador marca qual está no palco)",
      cat.rows[0].c.filter((s) => s.apresentada).length === 1,
      `${cat.rows[0].c.length} cartões, ${cat.rows[0].c.filter((s) => s.apresentada).length} no palco`);
  });

  // ── Cena arquivada é congelada, inclusive para o narrador (0115) ───
  await comoUsuario(narrador, async () => {
    const cfg = await tentar(
      `select public.set_vtt_scene_config($1,'Renomeada',null,null,10,10,$2) as s`,
      [cenaArquivada, 1]);
    reg("F1 (narrador não renomeia cena arquivada)", Boolean(cfg.erro), cfg.erro ?? "RENOMEOU");

    const cam = await tentar(
      `select public.set_vtt_scene_camadas($1,'{\"terreno\":false}'::jsonb,$2) as s`, [cenaArquivada, 1]);
    reg("F2 (narrador não muda camadas de cena arquivada)", Boolean(cam.erro), cam.erro ?? "MUDOU");

    const tok = await tentar(
      `select public.create_vtt_token($1,$2,'Novo','NV','pn','nenhuma','medio',0,null,1,1,null,true,false,null,null,null,null) as t`,
      [cenaArquivada, campanha]);
    reg("F3 (narrador não cria token em cena arquivada)", Boolean(tok.erro), tok.erro ?? "CRIOU");

    const terr = await tentar(
      `insert into vtt_terrain (scene_id, campaign_id, q, r, tipo) values ($1,$2,5,5,'dificil') returning scene_id`,
      [cenaArquivada, campanha]);
    reg("F4 (narrador não pinta terreno em cena arquivada)", Boolean(terr.erro), terr.erro ?? "PINTOU");

    // A exceção que faz o arquivo ser utilizável: a cena arquivada
    // continua entrando na reordenação e podendo ser restaurada.
    const reord = await tentar(`select public.reorder_vtt_scenes($1,$2::uuid[]) as s`,
      [campanha, [cenaArquivada, cenaPalco, cenaPreparo]]);
    reg("F5 (reordenar continua incluindo a cena arquivada)", !reord.erro, reord.erro ?? "reordenou");
  });

  // ── Administração ──────────────────────────────────────────────────
  await comoUsuario(jogador, async () => {
    const cria = await tentar(`select public.create_vtt_scene($1,'Minha') as s`, [campanha]);
    reg("A1 (jogador não cria cena)", Boolean(cria.erro), cria.erro ?? "CRIOU");
    const apre = await tentar(`select public.present_vtt_scene($1,$2) as s`, [campanha, cenaPreparo]);
    reg("A2 (jogador não apresenta cena)", Boolean(apre.erro), apre.erro ?? "APRESENTOU");
    const reord = await tentar(`select public.reorder_vtt_scenes($1, $2::uuid[]) as s`, [campanha, [cenaPreparo, cenaPalco]]);
    reg("A3 (jogador não reordena)", Boolean(reord.erro), reord.erro ?? "REORDENOU");
  });

  await comoUsuario(narrador, async () => {
    const nova = await tentar(`select (public.create_vtt_scene($1,'Nova')).id as id`, [campanha]);
    reg("A4 (narrador cria cena)", !nova.erro, nova.erro ?? nova.linhas[0].id);

    const palco = await client.query(`select presented_scene_id from vtt_campaign_stage where campaign_id = $1`, [campanha]);
    reg("A5 (criar cena NÃO move a mesa)", palco.rows[0].presented_scene_id === cenaPalco, `palco segue em ${palco.rows[0].presented_scene_id === cenaPalco ? "No palco" : "OUTRA"}`);

    const arq = await tentar(`select public.present_vtt_scene($1,$2) as s`, [campanha, cenaArquivada]);
    reg("A6 (apresentar cena arquivada é recusado)", Boolean(arq.erro), arq.erro ?? "APRESENTOU");

    const alheia = await tentar(`select public.present_vtt_scene($1,$2) as s`, [campanha, cenaOutra]);
    reg("A7 (apresentar cena de outra campanha é recusado)", Boolean(alheia.erro), alheia.erro ?? "APRESENTOU");

    const velha = await tentar(`select public.present_vtt_scene($1,$2,$3) as s`, [campanha, cenaPreparo, 99]);
    reg("A8 (revisão de palco desatualizada é recusada)", Boolean(velha.erro), velha.erro ?? "APRESENTOU");

    const fora = await tentar(`select public.reorder_vtt_scenes($1,$2::uuid[]) as s`, [campanha, [cenaPalco, cenaOutra]]);
    reg("A9 (reordenar com cena de outra campanha é recusado)", Boolean(fora.erro), fora.erro ?? "REORDENOU");

    await client.query(`select public.present_vtt_scene($1,$2)`, [campanha, cenaPreparo]);
    const dep = await client.query(
      `select st.presented_scene_id, (select ativa from vtt_scenes where id = $2) as ativa_nova,
              (select ativa from vtt_scenes where id = $3) as ativa_velha
         from vtt_campaign_stage st where st.campaign_id = $1`, [campanha, cenaPreparo, cenaPalco]);
    reg("A10 (apresentar move o palco)", dep.rows[0].presented_scene_id === cenaPreparo, "palco = Em preparo");
    reg("A11 (o `ativa` legado acompanha o palco)",
      dep.rows[0].ativa_nova === true && dep.rows[0].ativa_velha === false,
      `nova=${dep.rows[0].ativa_nova}, velha=${dep.rows[0].ativa_velha}`);
  });

  // Depois de apresentar, o jogador tem que TER SEGUIDO — e perdido a antiga.
  await comoUsuario(narrador, async () => {
    await client.query(`select public.present_vtt_scene($1,$2)`, [campanha, cenaPreparo]);
    await client.query("set local role authenticated");
    await client.query(`set local request.jwt.claims = '${JSON.stringify({ sub: jogador, role: "authenticated" })}'`);
    const tokens = await client.query(`select nome from vtt_tokens where campaign_id = $1`, [campanha]);
    reg("A12 (jogador segue o palco: passa a ver a cena nova e some da antiga)",
      tokens.rows.length === 1 && tokens.rows[0].nome === "Em preparo",
      `tokens: ${tokens.rows.map((t) => t.nome).join(", ") || "—"}`);
  });
} finally {
  await limpar();
  await client.end();
}

console.log(`\n${ok} ok, ${falha} falha(s).`);
process.exit(falha > 0 ? 1 : 0);
