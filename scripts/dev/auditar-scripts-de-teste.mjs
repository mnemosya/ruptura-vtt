#!/usr/bin/env node
/**
 * Quais scripts de `test:` / `check:` / `validate:` conseguem SEQUER
 * começar — e por quê não, quando não conseguem.
 *
 * ── Por que estático ─────────────────────────────────────────────────
 *
 * A forma óbvia de descobrir isso seria rodar os 45 e ver quais
 * quebram. Mas quase todos escrevem no Supabase REAL: criam conta,
 * campanha, personagem, documento. Rodá-los para depois matá-los por
 * tempo deixaria resíduo em produção — o preço da auditoria seria pior
 * que o problema auditado.
 *
 * Então esta auditoria LÊ. Percorre o grafo de imports de cada script e
 * procura módulos que explodem só por serem importados. Não executa
 * nada, não conecta em lugar nenhum, e por isso pode rodar sempre.
 *
 * ── O que ela procura ────────────────────────────────────────────────
 *
 *   `server-only`  — IMPEDE A PARTIDA. O pacote exporta `empty.js` sob
 *                    a condição `react-server` e `index.js` — que faz
 *                    `throw` na primeira linha — em qualquer outra. O
 *                    Node não liga a condição `react-server`, então
 *                    todo script cujo grafo toque esse pacote morre no
 *                    import, antes da primeira linha de teste.
 *
 *   `next/headers` — NÃO impede a partida, mas `cookies()` lança fora
 *                    de uma request. Um script que dependa de sessão
 *                    cai silenciosamente no caminho anônimo e falha
 *                    depois, parecendo bug de policy (foi o que
 *                    aconteceu com `test:character-storage`).
 *
 * Uso: node scripts/dev/auditar-scripts-de-teste.mjs
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const RAIZ = process.cwd();
const pkg = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));

/** Módulos que quebram um script, e como. */
const PERIGOS = {
  "server-only": { gravidade: "impede a partida", nota: "throw no import fora da condição react-server" },
  "next/headers": { gravidade: "quebra em uso", nota: "cookies() lança fora de uma request" },
  "next/navigation": { gravidade: "quebra em uso", nota: "redirect/notFound só valem numa request" },
};

const EXTENSOES = [".ts", ".tsx", ".mts", ".js", ".mjs"];

/** Resolve um import relativo para um arquivo em disco, ou null. */
function resolverRelativo(deQual, especificador) {
  const base = resolve(dirname(deQual), especificador);
  const candidatos = [
    base,
    ...EXTENSOES.map((e) => base + e),
    ...EXTENSOES.map((e) => join(base, "index" + e)),
  ];
  for (const c of candidatos) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

/**
 * Todos os especificadores importados por um arquivo.
 *
 * Regex e não parser: estes scripts são TypeScript direto, sem macro
 * nem import gerado, e um parser completo traria uma dependência nova
 * para ganhar precisão que aqui não muda resposta nenhuma.
 */
function importesDe(arquivo) {
  const src = readFileSync(arquivo, "utf8");
  const achados = new Set();
  const padroes = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const p of padroes) {
    let m;
    while ((m = p.exec(src)) !== null) achados.add(m[1]);
  }
  return [...achados];
}

/** Percorre o grafo a partir de um arquivo; devolve os perigos e por onde entraram. */
function auditar(entrada) {
  const vistos = new Set();
  const perigos = new Map(); // módulo → caminho de import até ele
  const fila = [[entrada, [entrada]]];

  while (fila.length > 0) {
    const [arquivo, caminho] = fila.shift();
    if (vistos.has(arquivo)) continue;
    vistos.add(arquivo);

    for (const esp of importesDe(arquivo)) {
      if (PERIGOS[esp]) {
        if (!perigos.has(esp)) perigos.set(esp, [...caminho]);
        continue;
      }
      if (!esp.startsWith(".")) continue; // pacote externo: não entra no grafo
      const alvo = resolverRelativo(arquivo, esp);
      if (alvo && !vistos.has(alvo)) fila.push([alvo, [...caminho, alvo]]);
    }
  }
  return { perigos, arquivos: vistos.size };
}

const rel = (p) => p.replace(RAIZ + "/", "");

const scripts = Object.entries(pkg.scripts)
  .filter(([nome]) => /^(test|check|validate):/.test(nome))
  .map(([nome, cmd]) => {
    const arquivo = (cmd.match(/(\S+\.(?:ts|mjs|js))\s*$/) ?? [])[1] ?? null;
    return { nome, cmd, arquivo: arquivo ? resolve(RAIZ, arquivo) : null };
  });

const impedidos = [];
const arriscados = [];
const ok = [];

for (const s of scripts) {
  if (!s.arquivo || !existsSync(s.arquivo)) {
    impedidos.push({ ...s, motivo: "arquivo de entrada não encontrado", caminho: [] });
    continue;
  }
  const { perigos } = auditar(s.arquivo);
  const bloqueia = [...perigos.keys()].filter((m) => PERIGOS[m].gravidade === "impede a partida");
  const avisa = [...perigos.keys()].filter((m) => PERIGOS[m].gravidade !== "impede a partida");

  // Cada perigo tem sua neutralização, e elas são diferentes:
  //
  //   `server-only`  → `--conditions=react-server`, que é o mecanismo
  //                    que o próprio pacote define nas exportações;
  //   `next/headers` → o stub em `--import`, porque não existe
  //                    mecanismo oficial para isso fora de uma request.
  const temCondicaoServidor = /--conditions=react-server/.test(s.cmd);
  const temStubDeCookies = /--import\s+\S*stub/.test(s.cmd);

  const bloqueiaAinda = temCondicaoServidor ? [] : bloqueia;
  const avisaAinda = temStubDeCookies ? [] : avisa;

  if (bloqueiaAinda.length > 0) {
    impedidos.push({ ...s, motivo: bloqueiaAinda.join(", "), caminho: perigos.get(bloqueiaAinda[0]) });
  } else if (avisaAinda.length > 0) {
    arriscados.push({ ...s, motivo: avisaAinda.join(", "), caminho: perigos.get(avisaAinda[0]) });
  } else {
    ok.push(s);
  }
}

console.log(`Auditados ${scripts.length} scripts de test:/check:/validate:\n`);

console.log(`── NÃO CONSEGUEM COMEÇAR (${impedidos.length}) ──`);
for (const s of impedidos) {
  console.log(`  ${s.nome}`);
  console.log(`    motivo: ${s.motivo}`);
  if (s.caminho?.length > 1) {
    console.log(`    entra por: ${s.caminho.slice(1).map(rel).join(" → ")}`);
  }
}
if (impedidos.length === 0) console.log("  (nenhum)");

console.log(`\n── COMEÇAM, MAS DEPENDEM DE REQUEST (${arriscados.length}) ──`);
for (const s of arriscados) {
  console.log(`  ${s.nome}`);
  console.log(`    ${s.motivo} — ${PERIGOS[s.motivo.split(", ")[0]]?.nota ?? ""}`);
  if (s.caminho?.length > 1) {
    console.log(`    entra por: ${s.caminho.slice(1).map(rel).join(" → ")}`);
  }
}
if (arriscados.length === 0) console.log("  (nenhum)");

console.log(`\n── SEM OBSTÁCULO DE IMPORT (${ok.length}) ──`);
console.log("  " + ok.map((s) => s.nome).join("\n  "));

process.exit(impedidos.length > 0 ? 1 : 0);
