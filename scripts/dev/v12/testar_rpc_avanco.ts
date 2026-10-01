// Testa no banco remoto, numa transação sempre desfeita, a proteção do Ranking
// (advance_character_ranking_v2 e update_character_sheet_payload). Usa a Hilda
// Norren da campanha de desenvolvimento. Rodar: npx tsx scripts/dev/v12/testar_rpc_avanco.ts
import pg from "pg"; import fs from "fs";
import { applyAdvancementV12, type CharacterV2, type RulesetContentBundleV12 } from "../../../src/lib/rulesetV12";
const env=Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^"|"$/g,"")]));
const c=new pg.Client({connectionString:env.SUPABASE_DB_URL});
const CH="e434866f-ec73-4c2c-b685-76dad1855f84", CAMP="56397764-5b44-418f-ae06-d4d10081fe3a";
const PLAYER="cec95ece-f6a7-4737-9eb5-5f5f728c4426", NARR="5776feec-5b85-477a-bcb5-deb422e58f73";
const ancora=JSON.parse(fs.readFileSync("content/v12/db_classe_ancora_v1_2.json","utf8")) as RulesetContentBundleV12;
const regras=JSON.parse(fs.readFileSync("content/db_regras_personagem_normalizado_v1_4.json","utf8"));
const ctx={classe:ancora.classes[0],subclasses:ancora.subclasses,pericias:regras.pericias.map((p:{id:string})=>p.id)};
let ok=0, falhas=0;
async function como(uid:string){await c.query("reset role");await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:uid,role:"authenticated"})]);await c.query("set local role authenticated");}
async function caso(nome:string, fn:()=>Promise<void>, esperaErro?:string){
  await c.query("savepoint s");
  try{await fn(); if(esperaErro){falhas++;console.log("FALHOU (esperava erro)",nome);} else {ok++;console.log("ok",nome);}}
  catch(e:any){ if(esperaErro && String(e.message).includes(esperaErro)){ok++;console.log("ok",nome,"→",e.message);} else {falhas++;console.log("FALHOU",nome,e.message);} }
  await c.query("rollback to savepoint s");
}
const ler=async()=>(await c.query("select payload from characters where id=$1",[CH])).rows[0].payload as CharacterV2;
const assert=(v:boolean,m:string)=>{if(!v)throw new Error("assert: "+m);};
await c.connect(); await c.query("begin"); await c.query(fs.readFileSync("supabase/migrations/20261001120000_ruptura_v12_protecao_ranking.sql","utf8"));
await c.query("insert into character_controllers(character_id,campaign_id,user_id,permissao) values($1,$2,$3,'editar') on conflict do nothing",[CH,CAMP,PLAYER]);
const base=await ler(); console.log("Hilda:",base.progressao.ranking,base.atributos);
const avancado=(()=>{const r=applyAdvancementV12(base,{atributo:"corpo"},ctx); if(!r.ok)throw new Error(r.errors.join());return r.character;})();
const rpcAv=(p:unknown)=>c.query("select * from advance_character_ranking_v2($1,$2)",[CH,JSON.stringify(p)]);
const rpcFicha=(p:unknown)=>c.query("select * from update_character_sheet_payload($1,$2)",[CH,JSON.stringify(p)]);

await caso("jogador: ficha não muda Ranking/atributos/perícias/vertentes, mas grava o resto", async()=>{
  await como(PLAYER);
  const p=structuredClone(base) as any; p.progressao.ranking="S+"; p.atributos.corpo=5; p.pericias.luta=5; p.magia.niveis_vertente.biotica=5; p.niveis_vertente={biotica:5}; p.trajetoria.local_origem="X"; p.schema_version=1; p.recursos_atuais={...p.recursos_atuais,pv:1}; p.nome="Hilda Teste";
  await rpcFicha(p); await c.query("reset role"); const d=await ler() as any;
  assert(d.progressao.ranking===base.progressao.ranking,"ranking"); assert(d.atributos.corpo===base.atributos.corpo,"corpo");
  assert(d.pericias.luta===base.pericias.luta,"luta"); assert(JSON.stringify(d.magia.niveis_vertente)===JSON.stringify(base.magia.niveis_vertente),"vertente");
  assert(JSON.stringify(d.niveis_vertente)===JSON.stringify(base.niveis_vertente),"topo"); assert(d.trajetoria.local_origem===base.trajetoria.local_origem,"traj");
  assert(d.schema_version===2,"schema"); assert(d.recursos_atuais.pv===1,"pv gravado"); assert(d.nome==="Hilda Teste","nome gravado");
});
await caso("jogador: ficha sem os campos protegidos não os apaga", async()=>{
  await como(PLAYER); const p=structuredClone(base) as any; delete p.progressao; delete p.magia; await rpcFicha(p); await c.query("reset role");
  const d=await ler() as any; assert(d.progressao.ranking===base.progressao.ranking,"ranking"); assert(!!d.magia.niveis_vertente,"magia");
});
await caso("narrador: ficha continua editando tudo", async()=>{
  await como(NARR); const p=structuredClone(base) as any; p.atributos.corpo=4; await rpcFicha(p); await c.query("reset role");
  assert((await ler()).atributos.corpo===4,"narrador corrige");
});
await caso("jogador: avanço válido E→D", async()=>{
  await como(PLAYER); await rpcAv(avancado); await c.query("reset role"); const d=await ler();
  assert(d.progressao.ranking==="D","D"); assert(d.atributos.corpo===base.atributos.corpo+1,"corpo+1");
  assert((d.magia.escolhas_pendentes??[]).length===(base.magia.escolhas_pendentes??[]).length+1,"pendente");
  assert(JSON.stringify(d.trajetoria)===JSON.stringify(base.trajetoria),"resto intacto");
});
await caso("avanço repetido falha", async()=>{ await como(PLAYER); await rpcAv(avancado); await rpcAv(avancado); }, "deve levá-lo ao C");
await caso("pular Ranking falha", async()=>{ await como(PLAYER); const p=structuredClone(avancado) as any; p.progressao.ranking="C"; await rpcAv(p); }, "deve levá-lo ao D");
await caso("Atributo a mais falha", async()=>{ await como(PLAYER); const p=structuredClone(avancado) as any; p.atributos.mente+=1; await rpcAv(p); }, "ponto(s) de Atributo");
await caso("Perícia extra falha", async()=>{ await como(PLAYER); const p=structuredClone(avancado) as any; p.pericias.luta+=1; await rpcAv(p); }, "ponto(s) de Perícia");
await caso("Vertente extra falha", async()=>{ await como(PLAYER); const p=structuredClone(avancado) as any; p.magia.niveis_vertente.material=1; await rpcAv(p); }, "ponto(s) de Vertente");
await caso("PA errado falha", async()=>{ await como(PLAYER); const p=structuredClone(avancado) as any; p.progressao.formulas_derivados.pa_max={const:5}; await rpcAv(p); }, "PA do Ranking");
await caso("trocar Subclasse fora do E falha", async()=>{ await como(PLAYER); const p=structuredClone(avancado) as any; p.progressao.subclasse_id="terapeuta"; await rpcAv(p); }, "Subclasse só");
await caso("mexer em fórmula da Classe falha", async()=>{ await como(PLAYER); const p=structuredClone(avancado) as any; p.progressao.formulas_derivados.pv_max={const:99}; await rpcAv(p); }, "fórmulas de recurso");
await caso("apagar magia pendente falha", async()=>{ await como(PLAYER); const p=structuredClone(avancado) as any; p.magia.escolhas_pendentes=p.magia.escolhas_pendentes.slice(1).concat([{tipo:"magia_adicional",origem:"x"}]); await rpcAv(p); }, "Magias pendentes");
await caso("estranho não avança", async()=>{ await como("00000000-0000-0000-0000-000000000001"); await rpcAv(avancado); }, "insufficient_privilege");
await caso("F→E com Subclasse válida e inválida", async()=>{
  const f=structuredClone(base) as any; f.progressao.ranking="F"; delete f.progressao.subclasse_id; delete f.progressao.escolhas_por_ranking.E;
  f.pericias.luta-=1; f.pericias.vigor-=1; if(f.pericias.luta===0)delete f.pericias.luta; if(f.pericias.vigor===0)delete f.pericias.vigor;
  delete f.magia.niveis_vertente.cinetica; f.niveis_vertente={...f.magia.niveis_vertente}; f.magia.escolhas_pendentes=f.magia.escolhas_pendentes.slice(0,-1);
  f.progressao.formulas_derivados.pa_max={const:3}; f.progressao.formulas_derivados_texto.pa_max="3 (Ranking F)";
  await c.query("update characters set payload=$2 where id=$1",[CH,JSON.stringify(f)]);
  const r=applyAdvancementV12(f,{subclasse_id:"terapeuta",pericias:{luta:2},vertente:"material"},ctx); if(!r.ok)throw new Error(r.errors.join());
  await como(PLAYER);
  await c.query("savepoint t"); let erro="";
  try{const p=structuredClone(r.character) as any; p.progressao.subclasse_id="berserker"; await rpcAv(p);}catch(e:any){erro=e.message;} await c.query("rollback to savepoint t");
  assert(erro.includes("exige uma Subclasse"),"berserker rejeitado: "+erro);
  await rpcAv(r.character); await c.query("reset role"); const d=await ler();
  assert(d.progressao.ranking==="E"&&d.progressao.subclasse_id==="terapeuta","terapeuta");
});
await c.query("rollback"); await c.end();
console.log(`${ok} ok, ${falhas} falha(s)`); if(falhas) process.exit(1);
