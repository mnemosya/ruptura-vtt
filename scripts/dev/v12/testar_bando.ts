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
for (const m of ["20261001180000_ruptura_v12_bando.sql", "20261001190000_ruptura_v12_bando_edicao_participantes.sql", "20261001200000_ruptura_v12_bando_transferir_aretz.sql"]) await c.query(fs.readFileSync(`supabase/migrations/${m}`, "utf8"));
await c.query("delete from campaign_crews where campaign_id=$1", [CAMP]);

await caso("narrador cria o bando (revisão 0 → 1)", async () => { await como(NARR); const r = (await salvar(base, 0)).rows[0]; assert(r.revision === 1, "rev 1"); });
await caso("jogador lê o bando da campanha", async () => {
  await como(NARR); await salvar(base, 0); await como(PLAYER);
  const r = await c.query("select state->>'nome' n from campaign_crews where campaign_id=$1", [CAMP]); assert(r.rows[0]?.n === "Vórtex", "lê");
});
await caso("jogador também altera o bando (decisão: todos editam)", async () => {
  await como(NARR); await salvar(base, 0); await como(PLAYER); const r = (await salvar({ ...base, cobalto: 4 }, 1)).rows[0];
  assert(r.revision === 2 && r.state.cobalto === 4, "jogador gravou");
});
await caso("jogador cria o bando", async () => { await como(PLAYER); const r = (await salvar(base, 0)).rows[0]; assert(r.revision === 1, "criou"); });
await caso("estranho não altera", async () => { await como("00000000-0000-0000-0000-000000000001"); await salvar(base, 0); }, "Só participantes");
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

// ── Aretz entre personagem e caixa ─────────────────────────────────
const CH = (await c.query("insert into characters(name,status,payload,campaign_id,owner_id) values('Tesoureira','active',$1,$2,$3) returning id",
  [JSON.stringify({ nome: "Tesoureira", schema_version: 2, carteira: { aretz_informal: 500, cdi: 10, cdi_craqueada: 0 } }), CAMP, NARR])).rows[0].id as string;
const SEM = (await c.query("insert into characters(name,status,payload,campaign_id,owner_id) values('Alheio','active',$1,$2,$3) returning id",
  [JSON.stringify({ nome: "Alheio", carteira: { aretz_informal: 50, cdi: 0, cdi_craqueada: 0 } }), CAMP, NARR])).rows[0].id as string;
await c.query("insert into character_controllers(character_id,campaign_id,user_id,permissao) values($1,$2,$3,'editar')", [CH, CAMP, PLAYER]);
const transferir = (id: string, v: number, paraBando: boolean) => c.query("select transfer_crew_aretz($1,$2,$3,$4) r", [CAMP, id, v, paraBando]);
const carteira = async (id: string) => (await c.query("select payload->'carteira' w from characters where id=$1", [id])).rows[0].w;
const caixa = async () => Number((await c.query("select state->>'caixa' x from campaign_crews where campaign_id=$1", [CAMP])).rows[0].x);

await caso("sem bando fundado falha", async () => { await como(PLAYER); await transferir(CH, 10, true); }, "ainda não fundou");
await caso("jogador deposita e retira da própria personagem", async () => {
  await como(NARR); await salvar(base, 0); await como(PLAYER);
  const r1 = (await transferir(CH, 200, true)).rows[0].r; await c.query("reset role");
  assert(r1.saldo_personagem === 300 && r1.caixa === 200 && r1.revision === 2, "depósito");
  const w = await carteira(CH); assert(w.aretz_informal === 300 && w.cdi === 10, "carteira, CDI intacto");
  await como(PLAYER); await transferir(CH, 50, false); await c.query("reset role");
  assert((await carteira(CH)).aretz_informal === 350 && (await caixa()) === 150, "retirada");
});
await caso("saldo do personagem insuficiente", async () => { await como(NARR); await salvar(base, 0); await como(PLAYER); await transferir(CH, 501, true); }, "Saldo insuficiente");
await caso("caixa insuficiente", async () => { await como(NARR); await salvar(base, 0); await como(PLAYER); await transferir(CH, 1, false); }, "Caixa insuficiente");
await caso("valor zero falha", async () => { await como(NARR); await salvar(base, 0); await como(PLAYER); await transferir(CH, 0, true); }, "valor positivo");
await caso("jogador não mexe na carteira de quem não controla", async () => { await como(NARR); await salvar(base, 0); await como(PLAYER); await transferir(SEM, 10, true); }, "não pode movimentar");
await caso("narrador movimenta qualquer personagem", async () => {
  await como(NARR); await salvar(base, 0); await transferir(SEM, 50, true); await c.query("reset role");
  assert((await carteira(SEM)).aretz_informal === 0 && (await caixa()) === 50, "narrador");
});
await caso("estranho não transfere", async () => { await como(NARR); await salvar(base, 0); await como("00000000-0000-0000-0000-000000000001"); await transferir(CH, 10, true); }, "Só participantes");

await c.query("rollback");
await c.end();
console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
