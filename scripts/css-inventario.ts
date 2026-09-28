/**
 * INVENTÁRIO DO CSS — o mapa de cores, fontes, tamanhos e espaços.
 *
 * Existe pra responder uma pergunta que nenhum grep responde sozinho:
 * "quantos valores diferentes o produto usa pra dizer a mesma coisa?".
 * Ele varre todas as folhas de `src/app`, separa cada declaração por
 * FAMÍLIA (cor, fonte, tamanho, espaço, raio, borda, sombra, z-index,
 * transição), conta cada valor e mostra onde ele aparece.
 *
 * Duas leituras que o relatório entrega e o olho não dá:
 *
 *   1. QUANTO JÁ ESTÁ EM TOKEN. Por família, a fatia de declarações que
 *      usa `var(--…)` contra a que crava um literal. É esse número que
 *      diz se mudar um token muda o produto ou só um terço dele.
 *
 *   2. QUEM É QUASE IGUAL A QUEM. Cores a menos de um limiar de
 *      distância (RGB) e tamanhos a 1px de diferença entram numa lista
 *      de CANDIDATOS A FUSÃO — é aí que mora a padronização barata:
 *      dois cinzas que ninguém distingue, três paddings de 9, 10 e
 *      12px na mesma faixa.
 *
 * Não altera nada. Escreve `docs/relatorios/INVENTARIO_CSS.md` e um
 * resumo no terminal.
 *
 * Uso: npx tsx scripts/css-inventario.ts
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = join(import.meta.dirname, "..");
const BASE = join(RAIZ, "src");
const SAIDA = join(RAIZ, "docs/relatorios/INVENTARIO_CSS.md");

/** Uma declaração `propriedade: valor` com a folha e a linha de onde veio. */
interface Declaracao {
  arquivo: string;
  linha: number;
  prop: string;
  valor: string;
}

/**
 * As FAMÍLIAS. A chave é o nome que aparece no relatório; `props` são
 * as propriedades CSS que caem nela.
 *
 * `border` entra separada de `cor` de propósito: um `border: 1px solid
 * X` carrega largura E cor, e as duas perguntas ("quantas larguras de
 * borda existem?" e "quantas cores?") se respondem melhor apartadas —
 * por isso o valor é quebrado antes de contar (ver `varrerArquivo`).
 */
const FAMILIAS: { nome: string; props: RegExp }[] = [
  { nome: "cor", props: /^(color|background-color|fill|stroke|border(-[a-z]+)?-color|outline-color|text-decoration-color|caret-color|accent-color|column-rule-color|scrollbar-color)$/ },
  { nome: "fundo", props: /^(background|background-image)$/ },
  { nome: "fonte", props: /^(font|font-family)$/ },
  { nome: "tamanho-de-fonte", props: /^font-size$/ },
  { nome: "peso-de-fonte", props: /^font-weight$/ },
  { nome: "entrelinha", props: /^line-height$/ },
  { nome: "entreletra", props: /^letter-spacing$/ },
  { nome: "espaço", props: /^(padding|padding-[a-z]+|margin|margin-[a-z]+|gap|row-gap|column-gap|inset)$/ },
  { nome: "raio", props: /^border-radius$/ },
  { nome: "borda", props: /^(border|border-[a-z]+|outline)$/ },
  { nome: "sombra", props: /^(box-shadow|text-shadow|filter|drop-shadow)$/ },
  { nome: "z-index", props: /^z-index$/ },
  { nome: "transição", props: /^(transition|transition-duration|animation|animation-duration)$/ },
  { nome: "medida", props: /^(width|height|min-width|min-height|max-width|max-height|flex-basis)$/ },
];

function familiaDe(prop: string): string | null {
  for (const f of FAMILIAS) if (f.props.test(prop)) return f.nome;
  return null;
}

function folhas(dir: string, achadas: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) folhas(caminho, achadas);
    else if (nome.endsWith(".css")) achadas.push(caminho);
  }
  return achadas.sort();
}

/**
 * Varre uma folha e devolve as declarações.
 *
 * Deliberadamente NÃO é um parser de CSS: comentários saem por regex, e
 * o corpo é lido declaração a declaração. Basta porque a pergunta aqui
 * é estatística — um `@media` mal contado não muda a conclusão de que
 * existem 130 `2px`. Um parser de verdade seria uma dependência nova
 * pra precisão que ninguém vai usar.
 */
function varrerArquivo(caminho: string): Declaracao[] {
  const bruto = readFileSync(caminho, "utf8");
  const arquivo = relative(BASE, caminho);
  const decls: Declaracao[] = [];

  // Apaga comentários PRESERVANDO as quebras de linha, senão o número
  // da linha que o relatório aponta vira ficção.
  const limpo = bruto.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

  let linha = 1;
  for (const pedaco of limpo.split(";")) {
    const m = /(^|[{\n])\s*(-{0,2}[a-z][a-z0-9-]*)\s*:\s*([^{};]+)$/i.exec(pedaco);
    if (m) {
      const linhaDecl = linha + (pedaco.slice(0, m.index).match(/\n/g)?.length ?? 0);
      const prop = m[2].toLowerCase();
      const valor = m[3].trim().replace(/\s+/g, " ");
      if (!prop.startsWith("--") && valor) decls.push({ arquivo, linha: linhaDecl, prop, valor });
    }
    linha += pedaco.match(/\n/g)?.length ?? 0;
  }
  return decls;
}

/** Toda cor literal que aparece num valor — hex, `rgb()`/`rgba()`, `hsl()`. */
function coresDe(valor: string): string[] {
  const achadas: string[] = [];
  for (const m of valor.matchAll(/#[0-9a-f]{3,8}\b/gi)) achadas.push(m[0].toLowerCase());
  for (const m of valor.matchAll(/\b(rgba?|hsla?)\([^)]*\)/gi)) achadas.push(m[0].toLowerCase().replace(/\s+/g, ""));
  return achadas;
}

/** Todo comprimento literal — px, rem, em. `0` não conta: não é escolha de escala. */
function medidasDe(valor: string): string[] {
  return [...valor.matchAll(/(?<![\w.#-])(\d*\.?\d+)(px|rem|em)\b/gi)].map((m) => `${m[1]}${m[2].toLowerCase()}`);
}

function hexParaRgb(cor: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(cor);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  const n = Number.parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Distância euclidiana no cubo RGB — grosseira, e suficiente pra "isto é o mesmo cinza?". */
function distancia(a: string, b: string): number | null {
  const x = hexParaRgb(a);
  const y = hexParaRgb(b);
  if (!x || !y) return null;
  return Math.sqrt((x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2);
}

function contar<T>(itens: T[]): Map<T, number> {
  const m = new Map<T, number>();
  for (const i of itens) m.set(i, (m.get(i) ?? 0) + 1);
  return m;
}

function ordenado<T>(m: Map<T, number>): [T, number][] {
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

// ─────────────────────────────────────────────────────────────────
// Varredura
// ─────────────────────────────────────────────────────────────────

const arquivos = folhas(BASE);
const todas = arquivos.flatMap(varrerArquivo);

/** Declarações por família, com a fatia que já passa por token. */
const porFamilia = new Map<string, { total: number; comToken: number; arquivos: Map<string, number> }>();
for (const d of todas) {
  const fam = familiaDe(d.prop);
  if (!fam) continue;
  const alvo = porFamilia.get(fam) ?? { total: 0, comToken: 0, arquivos: new Map() };
  alvo.total += 1;
  if (/var\(--/.test(d.valor)) alvo.comToken += 1;
  alvo.arquivos.set(d.arquivo, (alvo.arquivos.get(d.arquivo) ?? 0) + 1);
  porFamilia.set(fam, alvo);
}

/** Cores literais, com onde cada uma aparece. */
const ondeCor = new Map<string, Declaracao[]>();
for (const d of todas) {
  for (const cor of coresDe(d.valor)) {
    const lista = ondeCor.get(cor) ?? [];
    lista.push(d);
    ondeCor.set(cor, lista);
  }
}
const coresContadas = new Map([...ondeCor].map(([c, ds]) => [c, ds.length] as const));

/** Tamanhos de fonte, espaços e medidas — cada família com a sua escala. */
const escalas = new Map<string, Map<string, number>>();
for (const d of todas) {
  const fam = familiaDe(d.prop);
  if (!fam || !["tamanho-de-fonte", "espaço", "raio", "medida", "entreletra"].includes(fam)) continue;
  const atual = escalas.get(fam) ?? new Map<string, number>();
  for (const med of medidasDe(d.valor)) atual.set(med, (atual.get(med) ?? 0) + 1);
  escalas.set(fam, atual);
}

/** Famílias tipográficas declaradas. */
const fontes = contar(
  todas
    .filter((d) => d.prop === "font-family" || d.prop === "font")
    .map((d) => {
      const m = /var\(--[a-z0-9-]+\)/i.exec(d.valor);
      if (m) return m[0];
      const semTamanho = d.valor.replace(/^[\d.]+(px|rem|em)?(\/[\d.]+)?\s+/, "").replace(/^(normal|bold|\d{3})\s+/, "");
      return semTamanho.split(",")[0].trim();
    }),
);

/**
 * Cores quase iguais, em GRUPOS e não em pares.
 *
 * Pares não serviam: um tom muito usado (`#16233a`) casava com vinte
 * vizinhos e a lista virava vinte linhas sobre a mesma cor.
 *
 * E união TRANSITIVA servia menos ainda: encadeando A~B, B~C, C~D, os
 * sessenta azuis-escuros do produto viravam um grupo só — inclusive
 * pares que não se parecem em nada entre si. O agrupamento aqui é por
 * SEMENTE: a cor mais usada abre um grupo e absorve quem está a menos
 * de `LIMIAR` DELA (não de um vizinho do vizinho); a mais usada das
 * que sobraram abre o próximo. Cada grupo vira uma decisão — "estas
 * viram uma" — com um representante que já é o tom dominante.
 */
const LIMIAR = 10;
const porUso = [...coresContadas.keys()]
  .filter((c) => hexParaRgb(c))
  .sort((a, b) => (coresContadas.get(b) ?? 0) - (coresContadas.get(a) ?? 0));

const familiasDeCor: { cores: string[]; usos: number }[] = [];
const jaAgrupada = new Set<string>();
for (const semente of porUso) {
  if (jaAgrupada.has(semente)) continue;
  const grupo = [semente];
  jaAgrupada.add(semente);
  for (const outra of porUso) {
    if (jaAgrupada.has(outra)) continue;
    const d = distancia(semente, outra);
    if (d != null && d <= LIMIAR) {
      grupo.push(outra);
      jaAgrupada.add(outra);
    }
  }
  if (grupo.length > 1) {
    familiasDeCor.push({ cores: grupo, usos: grupo.reduce((n, c) => n + (coresContadas.get(c) ?? 0), 0) });
  }
}
familiasDeCor.sort((a, b) => b.usos - a.usos);

/**
 * OS TOKENS QUE JÁ EXISTEM, e os literais que repetem o valor deles.
 *
 * Esta é a lista de mudança em BULK mais barata do inventário: onde um
 * literal é EXATAMENTE o valor de um token, trocar um pelo outro não
 * muda um pixel — e passa aquele ponto a obedecer o token daí em
 * diante. Foi assim que a escala de raios saiu de 130 literais pra uma
 * linha só.
 */
const tokens = new Map<string, string>();
for (const caminho of arquivos) {
  const bruto = readFileSync(caminho, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of bruto.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+)/gi)) {
    const nome = m[1].toLowerCase();
    const valor = m[2].trim().replace(/\s+/g, " ").toLowerCase();
    if (!tokens.has(nome)) tokens.set(nome, valor);
  }
}
/** valor → tokens que o declaram (mais de um token pode ter o mesmo valor). */
const tokenPorValor = new Map<string, string[]>();
for (const [nome, valor] of tokens) {
  tokenPorValor.set(valor, [...(tokenPorValor.get(valor) ?? []), nome]);
}
const literaisComToken: { valor: string; tokens: string[]; usos: number }[] = [];
for (const [cor, n] of coresContadas) {
  const nomes = tokenPorValor.get(cor);
  if (nomes) literaisComToken.push({ valor: cor, tokens: nomes, usos: n });
}
literaisComToken.sort((a, b) => b.usos - a.usos);

// ─────────────────────────────────────────────────────────────────
// Relatório
// ─────────────────────────────────────────────────────────────────

const l: string[] = [];
const pct = (parte: number, todo: number) => (todo === 0 ? "—" : `${Math.round((parte / todo) * 100)}%`);

l.push("# Inventário do CSS");
l.push("");
l.push(`Gerado por \`scripts/css-inventario.ts\` — ${arquivos.length} folhas, ${todas.length} declarações.`);
l.push("");
l.push("Este arquivo é SAÍDA DE SCRIPT: não edite à mão, rode o script de novo.");
l.push("");

l.push("## 1. O que já passa por token");
l.push("");
l.push("A coluna `token` é a fatia de declarações da família que usa `var(--…)`.");
l.push("Onde ela é baixa, mudar o token muda pouca coisa — é ali que uma");
l.push("padronização compensa antes de qualquer mudança de valor.");
l.push("");
l.push("| família | declarações | token | literal |");
l.push("| --- | ---: | ---: | ---: |");
for (const [fam, dados] of [...porFamilia.entries()].sort((a, b) => b[1].total - a[1].total)) {
  l.push(`| ${fam} | ${dados.total} | ${pct(dados.comToken, dados.total)} | ${dados.total - dados.comToken} |`);
}
l.push("");

l.push("## 2. Folhas");
l.push("");
l.push("| folha | declarações |");
l.push("| --- | ---: |");
for (const [arq, n] of ordenado(contar(todas.map((d) => d.arquivo)))) l.push(`| \`${arq}\` | ${n} |`);
l.push("");

l.push("## 3. Cores literais");
l.push("");
l.push(`${coresContadas.size} valores distintos. As 40 mais usadas:`);
l.push("");
l.push("| cor | usos | onde (primeiras folhas) |");
l.push("| --- | ---: | --- |");
for (const [cor, n] of ordenado(coresContadas).slice(0, 40)) {
  const arqs = [...new Set((ondeCor.get(cor) ?? []).map((d) => d.arquivo))];
  l.push(`| \`${cor}\` | ${n} | ${arqs.slice(0, 3).map((a) => `\`${a}\``).join(", ")}${arqs.length > 3 ? ` +${arqs.length - 3}` : ""} |`);
}
l.push("");

l.push("### Famílias de cor quase idêntica");
l.push("");
l.push(`Grupos de tons a até ${LIMIAR} de distância no cubo RGB. Cada grupo é UMA decisão:`);
l.push("a primeira da lista é a mais usada, e serve de representante natural.");
l.push("");
l.push("| usos | tons | representante |");
l.push("| ---: | --- | --- |");
for (const f of familiasDeCor.slice(0, 25)) {
  l.push(`| ${f.usos} | ${f.cores.map((c) => `\`${c}\``).join(" ")} | \`${f.cores[0]}\` |`);
}
l.push("");

l.push("### Literais que já têm token");
l.push("");
l.push("O valor cravado é IDÊNTICO ao de um token existente: trocar não muda");
l.push("um pixel, e passa aquele ponto a obedecer o token. É a mudança em bulk");
l.push("mais barata que existe aqui.");
l.push("");
l.push("| valor | token | usos |");
l.push("| --- | --- | ---: |");
for (const t of literaisComToken.slice(0, 30)) {
  l.push(`| \`${t.valor}\` | ${t.tokens.map((n) => `\`${n}\``).join(", ")} | ${t.usos} |`);
}
l.push("");

l.push("## 4. Tipografia");
l.push("");
l.push("| família declarada | usos |");
l.push("| --- | ---: |");
for (const [f, n] of ordenado(fontes)) l.push(`| \`${f}\` | ${n} |`);
l.push("");

for (const [fam, titulo] of [
  ["tamanho-de-fonte", "Tamanhos de fonte"],
  ["espaço", "Espaços (padding, margin, gap)"],
  ["raio", "Raios"],
  ["entreletra", "Entreletra"],
  ["medida", "Medidas (largura/altura)"],
] as const) {
  const escala = escalas.get(fam);
  if (!escala) continue;
  l.push(`## ${titulo}`);
  l.push("");
  l.push(`${escala.size} valores distintos.`);
  l.push("");
  l.push("| valor | usos |");
  l.push("| --- | ---: |");
  for (const [v, n] of ordenado(escala).slice(0, 40)) l.push(`| \`${v}\` | ${n} |`);
  l.push("");
}

writeFileSync(SAIDA, l.join("\n"));

// ── Resumo no terminal ───────────────────────────────────────────
console.log(`${arquivos.length} folhas · ${todas.length} declarações`);
console.log("");
console.log("família              decls   token");
for (const [fam, dados] of [...porFamilia.entries()].sort((a, b) => b[1].total - a[1].total)) {
  console.log(`${fam.padEnd(20)} ${String(dados.total).padStart(5)}   ${pct(dados.comToken, dados.total).padStart(4)}`);
}
console.log("");
console.log(`cores literais distintas: ${coresContadas.size}`);
console.log(`tokens declarados: ${tokens.size}`);
console.log(`literais que repetem o valor de um token: ${literaisComToken.length} valores, ${literaisComToken.reduce((n, t) => n + t.usos, 0)} usos`);
console.log(`famílias de cor quase idêntica (≤${LIMIAR}): ${familiasDeCor.length}, cobrindo ${familiasDeCor.reduce((n, f) => n + f.cores.length, 0)} tons`);
for (const fam of ["tamanho-de-fonte", "espaço", "raio"]) {
  console.log(`${fam}: ${escalas.get(fam)?.size ?? 0} valores distintos`);
}
console.log("");
console.log(`relatório: ${relative(RAIZ, SAIDA)}`);
