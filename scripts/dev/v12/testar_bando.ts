// Testa no banco remoto, numa transação sempre desfeita, a tabela
// campaign_crews e a RPC save_campaign_crew (Bando v1.2, Fase 8).
// Rodar: npx tsx scripts/dev/v12/testar_bando.ts
import pg from "pg";
import fs from "fs";
import { newCrewStateV12 } from "../../../src/lib/rulesetV12";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]));
const c = new pg.Client({ connectionString: env.SUPABASE_DB_URL });
const CAMP = "56397764-5b44-418f-ae06-d4d10081fe3a";
const PLAYER = "cec95ece-f6a7-4737-9eb5-5f5f728c4426";
const NARR = "5776feec-5b85-477a-bcb5-deb422e58f73";
let ok = 0, falhas = 0;
async function como(uid: string) { await c.query("reset role"); await c.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: uid, role: "authenticated" })]); await c.query("set local role authenticated"); }
async function caso(nome: string, fn: () => Promise<void>, esperaErro?: string) {
  await c.query("savepoint s");
  try { await fn(); if (esperaErro) { falhas++; console.log("FALHOU (esperava erro)", nome); } else { ok++; console.log("ok", nome); } }
  catch (e) { const m = e instanceof Error ? e.message : String(e); if (esperaErro && m.includes(esperaErro)) { ok++; console.log("ok", nome, "→", m); } else { falhas++; console.log("FALHOU", nome, m); } }
  await c.query("rollback to savepoint s");
}
const assert = (v: boolean, m: string) => { if (!v) throw new Error("assert: " + m); };
const salvar = (s: unknown, rev: number) => c.query("select * from save_campaign_crew($1,$2,$3)", [CAMP, JSON.stringify(s), rev]);
const base = newCrewStateV12({ nome: "Vórtex", simbolo: "espiral", principio: "Ninguém fica para trás.", contato_inicial: "Malik", inimigo_ou_divida: "Corvo" });

await c.connect();
await c.query("begin");
await c.query(fs.readFileSync("supabase/migrations/20261001180000_ruptura_v12_bando.sql", "utf8"));
await c.query("delete from campaign_crews where campaign_id=$1", [CAMP]);

await caso("narrador cria o bando (revisão 0 → 1)", async () => { await como(NARR); const r = (await salvar(base, 0)).rows[0]; assert(r.revision === 1, "rev 1"); });
await caso("jogador lê o bando da campanha", async () => {
  await como(NARR); await salvar(base, 0); await como(PLAYER);
  const r = await c.query("select state->>'nome' n from campaign_crews where campaign_id=$1", [CAMP]); assert(r.rows[0]?.n === "Vórtex", "lê");
});
await caso("jogador não altera o bando", async () => { await como(NARR); await salvar(base, 0); await como(PLAYER); await salvar({ ...base, cobalto: 99 }, 1); }, "Só o narrador");
await caso("jogador não escreve direto na tabela", async () => { await como(PLAYER); await c.query("insert into campaign_crews(campaign_id,state) values($1,$2)", [CAMP, JSON.stringify(base)]); }, "permission denied");
await caso("narrador atualiza com revisão certa", async () => { await como(NARR); await salvar(base, 0); const r = (await salvar({ ...base, cobalto: 3 }, 1)).rows[0]; assert(r.revision === 2 && r.state.cobalto === 3, "rev 2"); });
await caso("revisão velha é conflito (sem 40001)", async () => { await como(NARR); await salvar(base, 0); await salvar(base, 1); await salvar(base, 1); }, "revision_conflict");
await caso("criar de novo é conflito", async () => { await como(NARR); await salvar(base, 0); await salvar(base, 0); }, "revision_conflict");
await caso("Cobalto negativo falha", async () => { await como(NARR); await salvar({ ...base, cobalto: -1 }, 0); }, "campaign_crews_cobalto");
await caso("Alerta 6 falha", async () => { await como(NARR); await salvar({ ...base, alerta: 6 }, 0); }, "campaign_crews_alerta");
await caso("7 pistas de Exposição falham", async () => { await como(NARR); await salvar({ ...base, exposicao_pistas: Array.from({ length: 7 }, (_, i) => ({ origem: `p${i}`, registrada_em: "t" })) }, 0); }, "campaign_crews_exposicao");
await caso("caixa negativo falha", async () => { await como(NARR); await salvar({ ...base, caixa: -10 }, 0); }, "campaign_crews_caixa");
await caso("sem nome falha", async () => { await como(NARR); await salvar({ ...base, nome: " " }, 0); }, "campaign_crews_nome");
await caso("estranho não lê", async () => {
  await como(NARR); await salvar(base, 0); await como("00000000-0000-0000-0000-000000000001");
  const r = await c.query("select count(*)::int n from campaign_crews where campaign_id=$1", [CAMP]); assert(r.rows[0].n === 0, "não vê");
});
await caso("tabela publicada no realtime", async () => {
  await c.query("reset role"); const r = await c.query("select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='campaign_crews'"); assert(r.rowCount === 1, "publicada");
});

await c.query("rollback");
await c.end();
console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
