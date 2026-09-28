/**
 * CHAT-01 — inventário EXECUTÁVEL de `table_logs.type`.
 *
 * O entregável desta tarefa é uma tabela tipo→card. Uma tabela escrita à
 * mão num documento envelhece na primeira vez que alguém acrescenta um
 * tipo e não a atualiza — e ninguém descobre, porque `formatGenericLog`
 * engole o desconhecido com elegância. Então o inventário é gerado do
 * código e este check falha quando um tipo passa a ser ESCRITO sem
 * ganhar renderizador.
 *
 * Varre:
 *   - tipos escritos no TypeScript (`type: "..."` perto de table_logs)
 *   - tipos escritos nas migrations (`insert into table_logs`)
 *   - tipos tratados em `logPresentation.ts` (`entry.type === "..."`)
 *
 * Uso: node scripts/dev/check-chat-catalogo.mjs [--tabela]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function arquivos(dir, ext, saida = []) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    const st = statSync(p);
    if (st.isDirectory()) { if (nome !== 'node_modules' && nome !== '.next') arquivos(p, ext, saida); }
    else if (ext.some(e => nome.endsWith(e))) saida.push(p);
  }
  return saida;
}

// ── 1. Tipos TRATADOS pelo formatador ──────────────────────────────
const apres = readFileSync('src/lib/table/logPresentation.ts', 'utf8');
const tratados = new Set([...apres.matchAll(/entry\.type === "([a-z0-9_]+)"/g)].map(m => m[1]));

// ── 2. Tipos ESCRITOS ──────────────────────────────────────────────
const escritos = new Map(); // tipo -> [onde]
function registrar(tipo, onde) {
  if (!escritos.has(tipo)) escritos.set(tipo, []);
  if (!escritos.get(tipo).includes(onde)) escritos.get(tipo).push(onde);
}

// 2a. TypeScript. Não basta `type: "..."` no arquivo: quase todo objeto
// tem um campo `type`. A forma de uma ESCRITA DE LOG é `type` junto de
// `payload` ou `visibility` no mesmo literal — é isso que se procura.
// `app/dev/` fica de fora: é harness, não produto.
for (const f of arquivos('src', ['.ts', '.tsx'])) {
  if (f.endsWith('logPresentation.ts') || f.includes('/app/dev/')) continue;
  const texto = readFileSync(f, 'utf8');
  if (!/table_logs|appendTableLog|registrarLog|insertTableLog/.test(texto)) continue;
  for (const m of texto.matchAll(/\btype:\s*"([a-z0-9_]+)"/g)) {
    const janela = texto.slice(Math.max(0, m.index - 260), m.index + 260);
    if (!/\bpayload\b|\bvisibility\b/.test(janela)) continue;
    registrar(m[1], f.replace('src/', ''));
  }
}
// 2b. Migrations. Casa COLUNA com VALOR de verdade: pega a lista do
// VALUES, separa por vírgulas de topo (respeitando parênteses e aspas)
// e lê o elemento no índice de `type`. A heurística anterior olhava
// qualquer literal do trecho e colhia valores de payload — "source":
// "end_own_turn" virava um tipo que nunca existiu.
function separarTopo(txt) {
  const partes = [];
  let nivel = 0, atual = '', aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (c === "'" ) { aspas = !aspas; atual += c; continue; }
    if (!aspas && (c === '(' || c === '[')) nivel++;
    if (!aspas && (c === ')' || c === ']')) { if (nivel === 0) break; nivel--; }
    if (!aspas && c === ',' && nivel === 0) { partes.push(atual.trim()); atual = ''; continue; }
    atual += c;
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes;
}
for (const f of arquivos('supabase/migrations', ['.sql'])) {
  const texto = readFileSync(f, 'utf8');
  const re = /insert\s+into\s+(?:public\.)?table_logs\s*\(([^)]*)\)\s*values\s*\(/gi;
  for (const m of texto.matchAll(re)) {
    const colunas = m[1].split(',').map(c => c.trim().toLowerCase());
    const i = colunas.indexOf('type');
    if (i < 0) continue;
    const valores = separarTopo(texto.slice(m.index + m[0].length));
    const bruto = valores[i];
    const lit = bruto && bruto.match(/^'([a-z0-9_]+)'$/i);
    // Valor dinâmico (variável/expressão) não dá para inventariar
    // estaticamente; o silêncio aqui é honesto.
    if (lit) registrar(lit[1], f.replace('supabase/migrations/', ''));
  }
}

// ── 3. Diferenças ──────────────────────────────────────────────────
const semRenderizador = [...escritos.keys()].filter(t => !tratados.has(t)).sort();
const orfaos = [...tratados].filter(t => !escritos.has(t)).sort();

if (process.argv.includes('--tabela')) {
  console.log('| tipo | escrito em | tem card próprio |');
  console.log('|---|---|---|');
  const todos = [...new Set([...escritos.keys(), ...tratados])].sort();
  for (const t of todos) {
    const onde = (escritos.get(t) ?? []).slice(0, 2).join(', ') || '—';
    console.log(`| \`${t}\` | ${onde} | ${tratados.has(t) ? 'sim' : '**não — cai no genérico**'} |`);
  }
  process.exit(0);
}

console.log(`tipos com card próprio: ${tratados.size}`);
console.log(`tipos escritos encontrados: ${escritos.size}`);

let falhou = false;
if (semRenderizador.length) {
  falhou = true;
  console.error(`\nFALHA — escritos SEM card próprio (caem em formatGenericLog):`);
  for (const t of semRenderizador) console.error(`  ${t}  (${escritos.get(t).join(', ')})`);
  console.error(`\nOu acrescente o renderizador em logPresentation.ts, ou registre a exceção em CONHECIDOS_SEM_CARD.`);
}
if (orfaos.length) {
  console.log(`\nAviso — têm card e não foram vistos sendo escritos (pode ser escrita via RPC dinâmica): ${orfaos.length}`);
  for (const t of orfaos) console.log(`  ${t}`);
}
if (!falhou) console.log('\nTodo tipo escrito tem card próprio.');
process.exit(falhou ? 1 : 0);
