#!/usr/bin/env node
/**
 * Roda os validadores `scripts/dev/validate-*.mjs`.
 *
 * ── Por que eles precisavam de um wrapper ────────────────────────────
 *
 * Doze validadores viviam no repositório sem entrada no `package.json`,
 * e quem os invocasse direto recebia só "Uso: … <diretorio-compilado>".
 * Não estavam quebrados: exigem uma compilação CommonJS prévia dos
 * módulos que testam, porque injetam dublês no `require.cache` pelo
 * caminho RESOLVIDO — é o que permite exercitar a regra de produção de
 * verdade em vez de reimplementá-la.
 *
 * Três detalhes tornavam isso mais chato do que parece, e é por eles
 * que este arquivo existe:
 *
 *   • RAIZ. Alguns esperam `<dir>/contentSchema/…` e outros
 *     `<dir>/lib/contentSchema/…`. Não há um layout que sirva aos dois,
 *     então são compilados DOIS, e cada validador roda no que resolve.
 *
 *   • `"type": "module"`. O projeto é ESM, então um `.js` CommonJS
 *     emitido dentro dele é carregado como ESM e morre com "exports is
 *     not defined". Um `package.json` com `{"type":"commonjs"}` na
 *     pasta de saída resolve — é o marcador padrão para isso.
 *
 *   • `node_modules`. Compilar para `/tmp` deixava o código sem como
 *     resolver `@supabase/supabase-js`. A saída fica DENTRO do projeto
 *     (`.tmp-validadores/`, gitignorada), onde a resolução sobe até o
 *     `node_modules` normalmente.
 *
 * Uso: node scripts/dev/rodar-validadores.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const RAIZ = process.cwd();
const SAIDA = join(RAIZ, ".tmp-validadores");
const FLAGS = [
  "--strict", "--module", "commonjs", "--target", "es2020",
  "--moduleResolution", "node", "--esModuleInterop", "--skipLibCheck",
  "--resolveJsonModule",
];

function fontes(dir) {
  const achados = [];
  (function varrer(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) varrer(p);
      else if (e.name.endsWith(".ts")) achados.push(p);
    }
  })(dir);
  return achados;
}

function compilar(rootDir, destino) {
  try {
    execFileSync("npx", ["tsc", ...FLAGS, "--rootDir", rootDir, "--outDir", destino, ...fontes("src/lib")], {
      stdio: "pipe",
    });
  } catch {
    // `tsc` sai != 0 por erro de tipo mas EMITE mesmo assim, e é o
    // emitido que importa aqui. Se nada sair, o passo seguinte acusa.
  }
  if (!existsSync(destino)) throw new Error(`compilação não produziu ${destino}`);
}

/**
 * Com `--rootDir src/lib`, um arquivo importado de fora dessa raiz não
 * cabe no `--outDir`, e o `tsc` o emite ao LADO do fonte — `.js`
 * aparecendo dentro de `src/`, no meio do código de verdade. Já
 * aconteceu duas vezes; são arquivos que o Next carregaria.
 *
 * A varredura guarda o que já existia e apaga só o que apareceu. Um
 * `.js` legítimo em `src/` (não há nenhum hoje) sobreviveria.
 */
function jsEmSrc() {
  const achados = new Set();
  const andar = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const caminho = join(d, e.name);
      if (e.isDirectory()) andar(caminho);
      else if (e.name.endsWith(".js")) achados.add(caminho);
    }
  };
  andar("src");
  return achados;
}

console.log("Compilando os módulos que os validadores injetam…");
const jsAntes = jsEmSrc();
rmSync(SAIDA, { recursive: true, force: true });
mkdirSync(SAIDA, { recursive: true });
// O marcador que faz o Node ler os `.js` emitidos como CommonJS mesmo
// dentro de um projeto `"type": "module"`.
writeFileSync(join(SAIDA, "package.json"), '{"type":"commonjs"}\n');
compilar("src", join(SAIDA, "raiz-src"));
compilar("src/lib", join(SAIDA, "raiz-lib"));

for (const caminho of jsEmSrc()) {
  if (jsAntes.has(caminho)) continue;
  rmSync(caminho);
  console.log(`  (removido ${caminho}, emitido fora do outDir)`);
}

/**
 * Por padrão só rodam os validadores INERTES — os que carregam módulos
 * compilados e conferem lógica pura, sem tocar no banco.
 *
 * Oito dos vinte criam contas e campanhas de verdade, e o único banco
 * configurado aqui é o de PRODUÇÃO. Rodá-los em lote, duas vezes cada
 * (uma por layout compilado), foi o que encheu a produção de campanhas
 * de teste antes. Quem quiser rodá-los assume a conta: `--com-banco`.
 *
 * A lista é de exclusão, não de inclusão: um validador novo entra
 * rodando, e só sai daqui se escrever. Errar para o lado de rodar é o
 * lado seguro para um validador puro e o lado errado para um que
 * escreve — por isso a checagem abaixo confere o código-fonte também.
 */
const ESCREVEM_NO_BANCO = new Set([
  "validate-campaign-invites-fase2.mjs",
  "validate-campaign-roster.mjs",
  "validate-campaign-session-concurrency.mjs",
  "validate-character-controllers-authorization.mjs",
  "validate-companion-model-resolver.mjs",
  "validate-fase6-usabilidade-integridade.mjs",
  "validate-personagens-fase4.mjs",
  "validate-post-destructive-migration.mjs",
]);

const comBanco = process.argv.includes("--com-banco");

const todos = readdirSync("scripts/dev")
  .filter((f) => /^validate-.*\.mjs$/.test(f))
  .sort();

// A lista acima poderia envelhecer; o código-fonte não mente. Um
// validador que ganhou um cliente do Supabase e não entrou na lista é
// tratado como escrita e denunciado.
const naoDeclarados = todos.filter(
  (f) => !ESCREVEM_NO_BANCO.has(f)
    && /SUPABASE_SERVICE_ROLE_KEY|createClient\(/.test(readFileSync(join("scripts/dev", f), "utf8")),
);
for (const f of naoDeclarados) {
  console.log(`  aviso ${f} — toca no banco e não estava na lista; tratado como escrita`);
  ESCREVEM_NO_BANCO.add(f);
}

const validadores = comBanco ? todos : todos.filter((f) => !ESCREVEM_NO_BANCO.has(f));
const pulados = todos.length - validadores.length;

// Cada validador roda no layout que ele resolve — descoberto tentando,
// não fixado numa tabela que envelheceria em silêncio.
const CANDIDATOS = [join(SAIDA, "raiz-lib"), join(SAIDA, "raiz-src")];

let ok = 0;
const problemas = [];
console.log(`\nRodando ${validadores.length} validadores:\n`);

for (const nome of validadores) {
  const caminho = resolve("scripts/dev", nome);
  let saida = null;
  let rodou = false;
  for (const dir of CANDIDATOS) {
    try {
      saida = execFileSync("node", [caminho, dir], { encoding: "utf8", stdio: "pipe" });
      rodou = true;
      break;
    } catch (e) {
      const texto = `${e.stdout ?? ""}${e.stderr ?? ""}`;
      // "Cannot find module" = layout errado; qualquer outra coisa é o
      // validador falando, e aí parar de tentar layouts.
      if (!/Cannot find module/.test(texto)) { saida = texto; rodou = true; break; }
      saida = texto;
    }
  }

  // Alguns validadores relatam falha no texto e ainda saem com 0 —
  // `validate-published-schema` é assim. Ler a saída é o que impede
  // que um "FALHA" passe por sucesso.
  // Case-SENSITIVE de propósito: `/falha/i` casava com "após tentativas
  // falharem", no texto de um teste que passou, e reprovava o validador
  // inteiro. O marcador é a palavra em caixa alta que os validadores
  // imprimem, não qualquer ocorrência da palavra.
  const relatouFalha = /\bFALHA\b|✕|\b[1-9]\d* reprovad/.test(saida ?? "");
  if (rodou && !relatouFalha) {
    ok++;
    console.log(`  ok    ${nome}`);
  } else {
    const motivo = rodou ? "relatou falha" : "não encontrou o layout compilado";
    console.log(`  FALHA ${nome} — ${motivo}`);
    problemas.push({ nome, saida: (saida ?? "").split("\n").filter((l) => /\bFALHA\b|✕|reprovad/.test(l)).slice(0, 4) });
  }
}

console.log(`\n${ok}/${validadores.length} validadores passaram.`);
if (pulados > 0) {
  console.log(`${pulados} pulados porque escrevem no banco — use \`--com-banco\` para incluí-los.`);
}
for (const p of problemas) {
  console.log(`\n— ${p.nome}`);
  for (const l of p.saida) console.log(`    ${l.trim()}`);
}
process.exit(problemas.length > 0 ? 1 : 0);
