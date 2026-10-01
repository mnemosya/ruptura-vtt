// Testa no banco remoto, numa transação sempre desfeita, as RPCs de ficha v1.2:
// advance_character_ranking_v2 (avanço de Ranking) e update_character_sheet_payload
// (progressão protegida; Atributos e Perícias corrigíveis dentro dos limites).
// Cria um personagem v1.2 de teste no Ranking F na campanha de desenvolvimento;
// nada persiste. Rodar: npx tsx scripts/dev/v12/testar_rpc_avanco.ts
import pg from "pg";
import fs from "fs";
import {
  advancementPackageV12,
  applyAdvancementV12,
  buildCharacterV2,
  VERTENTES_V12,
  type AdvancementChoicesV12,
  type CharacterV2,
  type RulesetContentBundleV12,
} from "../../../src/lib/rulesetV12";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]));
const c = new pg.Client({ connectionString: env.SUPABASE_DB_URL });
const CAMP = "56397764-5b44-418f-ae06-d4d10081fe3a";
const PLAYER = "cec95ece-f6a7-4737-9eb5-5f5f728c4426";
const NARR = "5776feec-5b85-477a-bcb5-deb422e58f73";
const MIGRATIONS = [
  "supabase/migrations/20261001120000_ruptura_v12_protecao_ranking.sql",
  "supabase/migrations/20261001160000_ruptura_v12_correcao_atributos_pericias.sql",
];

const ancora = JSON.parse(fs.readFileSync("content/v12/db_classe_ancora_v1_2.json", "utf8")) as RulesetContentBundleV12;
const traj = JSON.parse(fs.readFileSync("content/v12/db_trajetoria_v1_2.json", "utf8")) as RulesetContentBundleV12;
const regras = JSON.parse(fs.readFileSync("content/db_regras_personagem_normalizado_v1_4.json", "utf8"));
const pericias: string[] = regras.pericias.map((p: { id: string }) => p.id);
const ctx = { classe: ancora.classes[0], subclasses: ancora.subclasses, pericias };

const criado = buildCharacterV2({
  nome: "Teste RPC", classe_id: "ancora", perfil_atributos: "equilibrada", atributos: { corpo: 1, mente: 2, animo: 1 },
  perfil_pericias: "padrao",
  pericias: { valor_3: ["medicina", "psicologia"], valor_2: ["biologia", "percepcao", "vontade"], valor_1: ["arcanismo", "influencia", "logica", "mobilidade", "reflexos", "sociedade", "vigor"] },
  vertente_primaria: "biotica",
  trajetoria: {
    regiao_id: "vastra", local_origem: "Vosek", idiomas: ["vastrano"],
    antecedente: { antecedente_id: "academico", meio: "m", papel: "p", relacao_atual: "r" },
    transformacao_refratario: { estopim: "e", primeiros_passos: "p", consequencia: "c" },
    rpi_forjado: { nivel: 1, nome_registrado: "n", ocupacao_declarada: "o", origem: "o" },
    qualidades: [{ quality_id: "aliado", pontos: 2, detalhes: {} }, { quality_id: "contato", pontos: 1, detalhes: {} }],
    complicacoes: [{ complication_id: "desertor", pontos: 2, detalhes: {} }],
  },
  compras: [],
}, {
  classe: ancora.classes[0], pericias, vertentes: [...VERTENTES_V12], itens: new Map(),
  trajetoria: {
    antecedentes: new Map(traj.backgrounds.map((b) => [b.slug, b])),
    qualidades: new Map(traj.qualities.map((q) => [q.slug, q])),
    complicacoes: new Map(traj.complications.map((x) => [x.slug, x])),
  },
});
if (!criado.ok) throw new Error(criado.errors.join(" | "));

let ok = 0, falhas = 0;
let CH = "";
async function como(uid: string) { await c.query("reset role"); await c.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: uid, role: "authenticated" })]); await c.query("set local role authenticated"); }
async function caso(nome: string, fn: () => Promise<void>, esperaErro?: string) {
  await c.query("savepoint s");
  try { await fn(); if (esperaErro) { falhas++; console.log("FALHOU (esperava erro)", nome); } else { ok++; console.log("ok", nome); } }
  catch (e) { const m = e instanceof Error ? e.message : String(e); if (esperaErro && m.includes(esperaErro)) { ok++; console.log("ok", nome, "→", m); } else { falhas++; console.log("FALHOU", nome, m); } }
  await c.query("rollback to savepoint s");
}
const ler = async () => (await c.query("select payload from characters where id=$1", [CH])).rows[0].payload as CharacterV2;
const assert = (v: boolean, m: string) => { if (!v) throw new Error("assert: " + m); };
const gravar = async (p: unknown) => { await c.query("reset role"); await c.query("update characters set payload=$2 where id=$1", [CH, JSON.stringify(p)]); };
const rpcAv = (p: unknown) => c.query("select * from advance_character_ranking_v2($1,$2)", [CH, JSON.stringify(p)]);
const rpcFicha = (p: unknown) => c.query("select * from update_character_sheet_payload($1,$2)", [CH, JSON.stringify(p)]);

/** Escolhas válidas para o próximo Ranking, derivadas do pacote da Classe. */
function escolhas(ch: CharacterV2): AdvancementChoicesV12 {
  const pacote = advancementPackageV12(ch, ctx)!;
  const a = pacote.avanco;
  const e: AdvancementChoicesV12 = {};
  if (a.escolhe_subclasse) e.subclasse_id = "vitalista";
  if (a.pontos_pericia > 0) {
    const livres = pericias.filter((p) => (ch.pericias[p] ?? 0) + 1 <= a.limite_pericia);
    e.pericias = Object.fromEntries(livres.slice(0, a.pontos_pericia).map((p) => [p, 1]));
  }
  if (a.pontos_atributo > 0) e.atributo = (["corpo", "mente", "animo"] as const).find((x) => ch.atributos[x] < 5);
  if (a.pontos_vertente > 0) e.vertente = "cinetica";
  return e;
}
const avancar = (ch: CharacterV2) => { const r = applyAdvancementV12(ch, escolhas(ch), ctx); if (!r.ok) throw new Error(r.errors.join()); return r.character; };

await c.connect();
await c.query("begin");
for (const m of MIGRATIONS) await c.query(fs.readFileSync(m, "utf8"));
CH = (await c.query("insert into characters(name,status,payload,campaign_id,owner_id) values('Teste RPC','active',$1,$2,$3) returning id", [JSON.stringify(criado.character), CAMP, NARR])).rows[0].id;
await c.query("insert into character_controllers(character_id,campaign_id,user_id,permissao) values($1,$2,$3,'editar')", [CH, CAMP, PLAYER]);
const base = criado.character;

// ── Ficha: progressão protegida, Atributos/Perícias corrigíveis ─────
await caso("jogador: ficha não muda Ranking/Trajetória/Vertentes, mas grava o resto", async () => {
  await como(PLAYER);
  const p = structuredClone(base) as any;
  p.progressao.ranking = "S+"; p.magia.niveis_vertente.biotica = 5; p.niveis_vertente = { biotica: 5 }; p.trajetoria.local_origem = "X"; p.schema_version = 1; p.recursos_atuais = { ...p.recursos_atuais, pv: 1 }; p.nome = "Teste 2";
  await rpcFicha(p); await c.query("reset role"); const d = await ler() as any;
  assert(d.progressao.ranking === "F", "ranking"); assert(JSON.stringify(d.magia.niveis_vertente) === JSON.stringify(base.magia.niveis_vertente), "vertente");
  assert(JSON.stringify(d.niveis_vertente) === JSON.stringify(base.niveis_vertente), "topo"); assert(d.trajetoria.local_origem === "Vosek", "traj");
  assert(d.schema_version === 2, "schema"); assert(d.recursos_atuais.pv === 1, "pv gravado"); assert(d.nome === "Teste 2", "nome gravado");
});
await caso("jogador: corrige Atributos e Perícias dentro dos limites (Modo Evolução)", async () => {
  await como(PLAYER);
  const p = structuredClone(base) as any; p.atributos = { corpo: 2, mente: 1, animo: 1 }; p.pericias = { ...p.pericias, medicina: 2, luta: 3 };
  await rpcFicha(p); await c.query("reset role"); const d = await ler();
  assert(d.atributos.corpo === 2 && d.atributos.mente === 1, "atributos corrigidos"); assert(d.pericias.luta === 3 && d.pericias.medicina === 2, "perícias corrigidas");
});
await caso("jogador: Perícia acima do limite do Ranking (F: 3) falha", async () => {
  await como(PLAYER); const p = structuredClone(base) as any; p.pericias.luta = 4; await rpcFicha(p);
}, "entre 0 e 3");
await caso("jogador: Atributo acima de 5 falha", async () => {
  await como(PLAYER); const p = structuredClone(base) as any; p.atributos.corpo = 6; await rpcFicha(p);
}, "entre 1 e 5");
await caso("jogador: Atributo 0 falha", async () => {
  await como(PLAYER); const p = structuredClone(base) as any; p.atributos.animo = 0; await rpcFicha(p);
}, "entre 1 e 5");
await caso("jogador: Perícia desconhecida falha", async () => {
  await como(PLAYER); const p = structuredClone(base) as any; p.pericias.voar = 1; await rpcFicha(p);
}, "desconhecida");
await caso("narrador: corrige Ranking pela ficha, mas também respeita os limites", async () => {
  await como(NARR); const p = structuredClone(base) as any; p.atributos.corpo = 4; await rpcFicha(p); await c.query("reset role");
  assert((await ler()).atributos.corpo === 4, "narrador corrige");
});

// ── Avanço de Ranking ───────────────────────────────────────────────
const e = avancar(base);
await caso("jogador: F→E com Subclasse válida", async () => {
  await como(PLAYER); await rpcAv(e); await c.query("reset role"); const d = await ler();
  assert(d.progressao.ranking === "E" && d.progressao.subclasse_id === "vitalista", "E vitalista");
  assert(d.trajetoria.local_origem === "Vosek", "resto intacto");
});
await caso("F→E com Subclasse de outra Classe falha", async () => {
  await como(PLAYER); const p = structuredClone(e) as any; p.progressao.subclasse_id = "berserker"; await rpcAv(p);
}, "exige uma Subclasse");
await gravar(e);
const d = avancar(e); // E → D: +1 Atributo, +1 magia adicional.
await caso("jogador: E→D válido", async () => {
  await como(PLAYER); await rpcAv(d); await c.query("reset role"); const x = await ler();
  assert(x.progressao.ranking === "D", "D"); assert((x.magia.escolhas_pendentes ?? []).length === (e.magia.escolhas_pendentes ?? []).length + 1, "pendente");
});
await caso("avanço repetido falha", async () => { await como(PLAYER); await rpcAv(d); await rpcAv(d); }, "deve levá-lo ao C");
await caso("pular Ranking falha", async () => { await como(PLAYER); const p = structuredClone(d) as any; p.progressao.ranking = "C"; await rpcAv(p); }, "deve levá-lo ao D");
await caso("Atributo a mais falha", async () => { await como(PLAYER); const p = structuredClone(d) as any; p.atributos.animo += 1; await rpcAv(p); }, "ponto(s) de Atributo");
await caso("Perícia extra falha", async () => { await como(PLAYER); const p = structuredClone(d) as any; p.pericias.vontade = (p.pericias.vontade ?? 0) + 1; await rpcAv(p); }, "ponto(s) de Perícia");
await caso("Vertente extra falha", async () => { await como(PLAYER); const p = structuredClone(d) as any; p.magia.niveis_vertente.material = 1; await rpcAv(p); }, "ponto(s) de Vertente");
await caso("PA errado falha", async () => { await como(PLAYER); const p = structuredClone(d) as any; p.progressao.formulas_derivados.pa_max = { const: 5 }; await rpcAv(p); }, "PA do Ranking");
await caso("trocar Subclasse fora do E falha", async () => { await como(PLAYER); const p = structuredClone(d) as any; p.progressao.subclasse_id = "terapeuta"; await rpcAv(p); }, "Subclasse só");
await caso("mexer em fórmula da Classe falha", async () => { await como(PLAYER); const p = structuredClone(d) as any; p.progressao.formulas_derivados.pv_max = { const: 99 }; await rpcAv(p); }, "fórmulas de recurso");
await caso("apagar magia pendente falha", async () => { await como(PLAYER); const p = structuredClone(d) as any; p.magia.escolhas_pendentes = p.magia.escolhas_pendentes.slice(1).concat([{ tipo: "magia_adicional", origem: "x" }, { tipo: "magia_adicional", origem: "y" }]); await rpcAv(p); }, "Magias pendentes");
await caso("estranho não avança", async () => { await como("00000000-0000-0000-0000-000000000001"); await rpcAv(d); }, "insufficient_privilege");

await c.query("rollback");
await c.end();
console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
