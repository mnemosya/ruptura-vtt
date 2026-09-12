#!/usr/bin/env node
/**
 * O repositório e o banco remoto contam a mesma história?
 *
 * Este projeto aplica migrations por conexão direta
 * (`apply-migration-generic.ts`), que não registra nada em
 * `supabase_migrations.schema_migrations`. O ledger do remoto, então,
 * não é fonte de verdade — e nada garantia, até agora, que um banco
 * limpo replayando 0001..N chegasse onde o remoto está.
 *
 * A checagem: para cada função que as migrations definem, comparar o
 * corpo da ÚLTIMA definição no repo (que é o que um replay produziria)
 * com o corpo vivo. Diferença é drift: ou alguém aplicou correção fora
 * do Git, ou uma migration não foi aplicada.
 *
 * Não substitui um replay de verdade em banco descartável — não vê
 * tabelas, colunas, policies nem grants. Vê funções, que é onde mora a
 * maior parte da lógica de autorização deste projeto.
 *
 * Uso: npx tsx scripts/dev/check-migrations-vs-banco.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { Client } from "pg";
config({ path: ".env.local" });

const DIR = "supabase/migrations";

/**
 * Espaços e comentários não são semântica: o dump reindenta, e um
 * comentário de fim de linha perdido numa reaplicação antiga produz
 * divergência textual sem nenhuma diferença de comportamento.
 * Comparar só o que EXECUTA mantém o relatório legível.
 */
const normalizar = (s) =>
  s.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim();

/**
 * Extrai `nome -> corpo` de um arquivo SQL. O corpo é o que está entre
 * os delimitadores de dólar — exatamente o que o Postgres guarda em
 * `pg_proc.prosrc`, o que torna a comparação possível sem reimplementar
 * um parser de SQL.
 */
function funcoesDe(sql) {
  const achadas = [];
  const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?(\w+)"?\s*\(/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const nome = m[1];
    const abre = /\bas\s+\$(\w*)\$/i.exec(sql.slice(m.index));
    if (!abre) continue;
    const tag = `$${abre[1]}$`;
    const inicio = m.index + abre.index + abre[0].length;
    const fim = sql.indexOf(tag, inicio);
    if (fim === -1) continue;
    achadas.push([nome, sql.slice(inicio, fim), m.index]);
  }
  return achadas;
}

const arquivos = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
/** nome -> { corpo, arquivo } da ÚLTIMA definição, que é a que vence no replay. */
const noRepo = new Map();
/** Todo nome que o repo cria em ALGUM momento, mesmo que derrube depois. */
const jamaisNoRepo = new Set();
for (const f of arquivos) {
  const sql = readFileSync(join(DIR, f), "utf8");

  // Eventos em ORDEM DE POSIÇÃO, não em duas passadas. `drop function`
  // seguido de `create function` no mesmo arquivo é o padrão normal
  // para trocar assinatura (a 0096 faz isso com `move_vtt_token`);
  // processar todos os drops depois de todos os creates apagaria a
  // definição que o arquivo acabou de instalar.
  const eventos = [
    ...funcoesDe(sql).map(([nome, corpo, pos]) => ({ pos, tipo: "cria", nome, corpo })),
    ...[...sql.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi)]
      .map((m) => ({ pos: m.index, tipo: "derruba", nome: m[1] })),
  ].sort((x, y) => x.pos - y.pos);

  // Um arquivo que CRIA a função e também a derruba está trocando
  // assinatura (`drop function f(uuid)` + `create function f(uuid,
  // numeric)` — o que a 0096 faz com `move_vtt_token`). O saldo é que a
  // função existe. Só vale como remoção o drop de quem o arquivo não
  // recria — a 0058 derrubando os perfis de campanha, por exemplo.
  const criadasAqui = new Set(eventos.filter((e) => e.tipo === "cria").map((e) => e.nome));
  for (const n of criadasAqui) jamaisNoRepo.add(n);
  for (const e of eventos) {
    if (e.tipo === "cria") { noRepo.set(e.nome, { corpo: e.corpo, arquivo: f }); }
    else if (!criadasAqui.has(e.nome)) noRepo.delete(e.nome);
  }
}

/** `--detalhe <nome>`: mostra o corpo dos dois lados, para inspeção. */
const alvoDetalhe = process.argv.includes("--detalhe")
  ? process.argv[process.argv.indexOf("--detalhe") + 1]
  : null;

const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const { rows } = await client.query(`
  select p.proname, p.prosrc
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'`);
await client.end();

/** Sobrecargas: guarda todos os corpos vivos por nome. */
const noBanco = new Map();
for (const r of rows) {
  if (!noBanco.has(r.proname)) noBanco.set(r.proname, []);
  noBanco.get(r.proname).push(r.prosrc);
}

const batem = [], divergem = [], soNoRepo = [], soNoBanco = [], trocaDeAssinatura = [];

for (const [nome, { corpo, arquivo }] of noRepo) {
  const vivos = noBanco.get(nome);
  if (!vivos) { soNoRepo.push({ nome, arquivo }); continue; }
  // Sobrecarga conta como acerto se QUALQUER assinatura bate — o repo
  // não diz qual assinatura aquela definição tinha.
  if (vivos.some((v) => normalizar(v) === normalizar(corpo))) batem.push(nome);
  else divergem.push({ nome, arquivo });
}
for (const nome of noBanco.keys()) {
  if (!noRepo.has(nome)) {
    // Distinção que importa: nunca definida no Git é suspeita de
    // hotfix; definida e depois "derrubada" é quase sempre limite deste
    // verificador, que não modela ASSINATURAS — a 0096 derruba
    // `move_vtt_token(uuid,jsonb,integer)` sem recriar, porque a versão
    // de cinco argumentos veio antes e continua valendo.
    (jamaisNoRepo.has(nome) ? trocaDeAssinatura : soNoBanco).push(nome);
  }
}

if (alvoDetalhe) {
  const r = noRepo.get(alvoDetalhe);
  console.log(`── ${alvoDetalhe} ──\n\nREPO (${r?.arquivo ?? "ausente"}):\n${r?.corpo ?? "—"}`);
  for (const [i, v] of (noBanco.get(alvoDetalhe) ?? []).entries()) {
    console.log(`\nBANCO [assinatura ${i + 1}]:\n${v}`);
  }
  process.exit(0);
}

console.log(`Funções definidas no repo: ${noRepo.size}`);
console.log(`  batem com o banco:  ${batem.length}`);
console.log(`  DIVERGEM:           ${divergem.length}`);
console.log(`  no repo, não no banco: ${soNoRepo.length}`);
console.log(`  no banco, nunca no repo: ${soNoBanco.length}`);
console.log(`  troca de assinatura (limite do verificador): ${trocaDeAssinatura.length}\n`);

if (divergem.length) {
  console.log("DIVERGEM (corpo vivo ≠ última definição do repo):");
  for (const d of divergem) console.log(`  ${d.nome}  — última definição em ${d.arquivo}`);
  console.log();
}
if (soNoRepo.length) {
  console.log("No repo mas AUSENTES do banco (migration não aplicada?):");
  for (const d of soNoRepo) console.log(`  ${d.nome}  — ${d.arquivo}`);
  console.log();
}
if (soNoBanco.length) {
  console.log("No banco mas SEM definição no repo (hotfix fora do Git?):");
  for (const n of soNoBanco.sort()) console.log(`  ${n}`);
  console.log();
}

const sujo = divergem.length + soNoRepo.length + soNoBanco.length;
console.log(sujo === 0 ? "Repo e banco contam a mesma história." : `${sujo} discrepância(s).`);
process.exit(sujo > 0 ? 1 : 0);
