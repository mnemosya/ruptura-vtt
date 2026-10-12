/** Casos negativos LIGHT-02 em PostgreSQL descartável; tudo é rollback. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const url = process.env.LIGHT_TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55432/postgres";
const host = new URL(url).hostname;
if (host !== "127.0.0.1" && host !== "localhost") throw new Error("Teste recusado: use somente PostgreSQL local descartável.");
const db = new pg.Client({ connectionString: url, ssl: false });
let connected = false;
const [owner, player, campaign, scene, controlledCharacter, controlled, nearby, far, hidden, objectNear, objectFar] =
  Array.from({ length: 11 }, () => randomUUID());
const [areaPublica, areaPrivada, assetPublico, assetPrivado, imagemPublica, imagemPrivada] = Array.from({ length: 6 }, () => randomUUID());
const ids = async (sql: string) => (await db.query(sql)).rows.map((r) => r.id);
try {
  await db.connect();
  connected = true;
  await db.query("begin");
  await db.query("insert into auth.users(id,instance_id,aud,role,email) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2),($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$4)",
    [owner, `light-owner-${owner}@example.invalid`, player, `light-player-${player}@example.invalid`]);
  await db.query("insert into public.campaigns(id,name,owner_id) values ($1,'LIGHT teste',$2)", [campaign, owner]);
  await db.query("insert into public.campaign_members(campaign_id,user_id,role,status) values ($1,$2,'player','active')", [campaign, player]);
  await db.query("insert into public.vtt_scenes(id,campaign_id,nome,largura,altura,ativa) values ($1,$2,'Cena',30,30,true)", [scene, campaign]);
  await db.query("insert into public.vtt_campaign_stage(campaign_id,presented_scene_id) values ($1,$2)", [campaign, scene]);
  await db.query("insert into public.characters(id,name,payload,campaign_id) values ($1,'Personagem','{\"schema_version\":2}'::jsonb,$2)", [controlledCharacter, campaign]);
  await db.query("insert into public.character_controllers(character_id,campaign_id,user_id) values ($1,$2,$3)", [controlledCharacter, campaign, player]);
  await db.query("insert into public.vtt_tokens(id,scene_id,campaign_id,character_id,nome,q,r) values ($1,$2,$3,$4,'Controlado',1,1)",
    [controlled, scene, campaign, controlledCharacter]);
  await db.query("insert into public.vtt_tokens(id,scene_id,campaign_id,nome,q,r,visivel) values ($1,$2,$3,'Perto',2,1,true),($4,$2,$3,'Longe',20,20,true),($5,$2,$3,'Oculto',2,2,false)",
    [nearby, scene, campaign, far, hidden]);
  await db.query("insert into public.vtt_objects(id,scene_id,campaign_id,nome,preset) values ($1,$2,$3,'Perto','caixa'),($4,$2,$3,'Longe','caixa')",
    [objectNear, scene, campaign, objectFar]);
  await db.query("insert into public.vtt_object_cells(object_id,scene_id,q,r) values ($1,$2,2,2),($3,$2,20,20)", [objectNear, scene, objectFar]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [owner]);
  await db.query("insert into public.vtt_light_settings(scene_id,campaign_id,modo) values ($1,$2,'penumbra')", [scene, campaign]);
  await db.query("insert into public.vtt_areas(id,scene_id,campaign_id,tipo,origem_q,origem_r,raio_m,criador_id,visivel) values ($1,$3,$4,'esfera',2,2,2,$5,true),($2,$3,$4,'esfera',20,20,2,$5,false)",
    [areaPublica, areaPrivada, scene, campaign, owner]);
  await db.query("insert into public.vtt_image_assets(id,campaign_id,storage_path,sha256,mime,bytes,width_px,height_px,estado) values ($1,$3,$4,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','image/webp',100,10,10,'ready'),($2,$3,$5,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','image/webp',100,10,10,'ready')",
    [assetPublico, assetPrivado, campaign, `light/${assetPublico}`, `light/${assetPrivado}`]);
  await db.query("insert into public.vtt_scene_images(id,scene_id,campaign_id,image_id,papel,centro_q,centro_r,largura_m,visivel) values ($1,$3,$4,$5,'tile',2,2,2,true),($2,$3,$4,$6,'tile',20,20,2,false)",
    [imagemPublica, imagemPrivada, scene, campaign, assetPublico, assetPrivado]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [player]);
  await db.query("set local role authenticated");

  assert.deepEqual(await ids("select id from public.vtt_tokens order by id"), [controlled, nearby].sort());
  assert.deepEqual(await ids("select id from public.vtt_objects order by id"), [objectNear]);
  const tokenProjection = (await db.query("select public.read_vtt_scene_tokens($1) as data", [scene])).rows[0].data;
  assert.deepEqual(tokenProjection.map((t: { id: string }) => t.id).sort(), [controlled, nearby].sort());
  const objectProjection = (await db.query("select public.read_vtt_scene_objects($1) as data", [scene])).rows[0].data;
  assert.deepEqual(objectProjection.map((o: { id: string }) => o.id), [objectNear]);
  assert.equal((await db.query("select public.read_vtt_token_hud($1) as data", [far])).rows[0].data, null);
  assert.equal((await db.query("select public.vtt_token_visivel_para($1) as visible", [far])).rows[0].visible, false);
  assert.equal((await db.query("select public.vtt_light_movement_channel_safe($1) as safe", [`campaign:${campaign}:vtt:movimento`])).rows[0].safe, false);
  await db.query("savepoint rejected_write");
  await assert.rejects(db.query("insert into public.vtt_light_walls(scene_id,campaign_id,a_q,a_r,b_q,b_r) values ($1,$2,1,1,2,2)", [scene, campaign]));
  await db.query("rollback to savepoint rejected_write");

  await db.query("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [owner]);
  await db.query("update public.vtt_light_settings set modo='escuro', revision=2 where scene_id=$1", [scene]);
  await db.query("insert into public.vtt_light_sources(scene_id,campaign_id,origem_q,origem_r,raio_m) values ($1,$2,1,1,4)", [scene, campaign]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [player]);
  await db.query("set local role authenticated");
  assert.deepEqual(await ids("select id from public.vtt_tokens order by id"), [controlled, nearby].sort(), "luz revela token dentro da visão");

  await db.query("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [owner]);
  await db.query("insert into public.vtt_light_walls(scene_id,campaign_id,a_q,a_r,b_q,b_r) values ($1,$2,1.5,0,1.5,3)", [scene, campaign]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [player]);
  await db.query("set local role authenticated");
  assert.deepEqual(await ids("select id from public.vtt_tokens order by id"), [controlled], "parede bloqueia a visão apesar da luz");
  assert.equal((await db.query("select public.read_vtt_token_hud($1) as data", [nearby])).rows[0].data, null);

  await db.query("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [owner]);
  await db.query("update public.vtt_tokens set visao_noturna=true, revision=revision+1 where id=$1", [controlled]);
  await db.query("delete from public.vtt_light_walls where scene_id=$1", [scene]);
  await db.query("delete from public.vtt_light_sources where scene_id=$1", [scene]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [player]);
  await db.query("set local role authenticated");
  assert.deepEqual(await ids("select id from public.vtt_tokens order by id"), [controlled, nearby].sort(), "visão noturna dispensa fonte de luz");
  await db.query("savepoint rejected_night_vision");
  await assert.rejects(db.query("update public.vtt_tokens set visao_noturna=false, revision=revision+1 where id=$1", [controlled]));
  await db.query("rollback to savepoint rejected_night_vision");

  await db.query("savepoint rejected_preview");
  await assert.rejects(db.query("select public.read_vtt_light_preview($1,$2)", [scene, player]));
  await db.query("rollback to savepoint rejected_preview");
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [owner]);
  await db.query("set local role authenticated");
  const preview = (await db.query("select public.read_vtt_light_preview($1,$2) as data", [scene, player])).rows[0].data;
  assert.deepEqual(preview.tokens.map((t: { id: string }) => t.id).sort(), [controlled, nearby].sort());
  assert.deepEqual(preview.objetos.map((o: { id: string }) => o.id), [objectNear]);
  assert.deepEqual(preview.imagens.map((i: { id: string }) => i.id), [imagemPublica]);
  assert.deepEqual(preview.areas.map((a: { id: string }) => a.id), [areaPublica]);
  assert.equal((await db.query("select auth.uid() as id")).rows[0].id, owner, "prévia restaurou a identidade do narrador");
  console.log("LIGHT-02: RLS, projeções, HUD, objetos e Realtime negativos aprovados");
} finally {
  if (connected) { await db.query("rollback"); await db.end(); }
}
