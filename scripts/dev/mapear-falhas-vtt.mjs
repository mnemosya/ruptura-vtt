/**
 * Coleta a ASSINATURA de falha de cada check, para agrupar por causa
 * antes de consertar qualquer um.
 *
 * A triagem (`triar-checks.mjs`) responde "passa/falha/trava". Isso
 * bastava para medir o tamanho do problema e não basta para atacá-lo:
 * 25 dos 26 checks do bloco VTT morrem por EXCEÇÃO, sem chegar ao
 * resumo, e "falha (código 1)" não distingue um seletor renomeado de
 * um estado herdado de um passo anterior.
 *
 * Para cada script: o último critério que passou (onde ele chegou) e a
 * primeira linha útil do erro (por que parou).
 */
import { spawn } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";

const TETO_MS = 150_000;
const SAIDA = "/tmp/mapa-falhas-vtt.txt";
// Alvos explícitos por argumento (nomes de arquivo) — usado para a
// segunda passada, que refaz só os inconclusivos em vez de repetir a
// coleta inteira.
const alvos = process.argv.slice(2).filter((a) => a.startsWith("check-"));
const scripts = alvos.length ? alvos : readdirSync("scripts/dev").filter((n) => n.startsWith("check-vtt-") && n.endsWith(".ts")).sort();
const SAIDA_FINAL = alvos.length ? "/tmp/mapa-falhas-vtt-2.txt" : SAIDA;

function assinatura(saida) {
  // Captura o ARGUMENTO INTEIRO do locator, até a aspa que o fecha de
  // verdade. A primeira versão parava na primeira aspa encontrada — que
  // costuma ser a interna de `[data-testid="..."]` — e devolvia
  // "ESPERANDO [data-testid=", que não identifica nada.
  const esperando = saida.match(/waiting for (?:locator\()?(['"`])((?:(?!\1).){0,120})\1/);
  if (esperando) return `ESPERANDO ${esperando[2]}`;
  const assertion = saida.match(/AssertionError[^\n]*: ([^\n]{0,90})/);
  if (assertion) return `ASSERT ${assertion[1]}`;
  const erro = saida.match(/^(?:Error|TypeError|.*Error): ([^\n]{0,90})/m);
  if (erro) return `ERRO ${erro[1]}`;
  const falha = saida.match(/^FALHA - ([^\n]{0,80})/m);
  if (falha) return `CRITERIO ${falha[1]}`;
  return "(sem assinatura)";
}

const linhas = [];
for (const nome of scripts) {
  const saida = await new Promise((res) => {
    const p = spawn("npx", ["tsx", `scripts/dev/${nome}`], { encoding: "utf8" });
    let buf = "";
    const t = setTimeout(() => { p.kill("SIGKILL"); res(buf + "\n[MORTO POR TEMPO]"); }, TETO_MS);
    p.stdout.on("data", (d) => (buf += d));
    p.stderr.on("data", (d) => (buf += d));
    p.on("close", () => { clearTimeout(t); res(buf); });
  });
  // Ignora o critério de limpeza: ele roda no `finally`, DEPOIS da
  // falha, e como "último critério que passou" mentia sobre onde o
  // script chegou — dizia "limpeza de fixtures" para todo mundo.
  // DOIS formatos de saída no repositório, e ignorar um deles fazia o
  // coletor reportar "0 ok, sem assinatura" para checks que estavam
  // apenas escrevendo diferente: `ok - nome` e `  ok   nome`. O
  // instrumento mentia, e a mentira tinha a cara exata de um check que
  // morre no setup.
  const oks = (saida.match(/^(?:ok - |\s+ok\s{2,})([^\n:]{0,60})/gm) ?? []).filter((l) => !/ok\s+-?\s*L \(/.test(l));
  const ultimo = oks.length ? oks[oks.length - 1].replace(/^(?:ok - |\s+ok\s+)/, "").trim() : "(nenhum)";
  const passou = /TODOS OS CHECKS PASSARAM|0 falha\(s\)|, 0 falha|0 falhas\b/.test(saida);
  const linha = passou
    ? `${nome} | PASSA`
    : `${nome} | ${assinatura(saida)} | chegou até: ${ultimo} (${oks.length} ok)`;
  linhas.push(linha);
  console.log(linha);
  writeFileSync(SAIDA_FINAL, linhas.join("\n") + "\n");
}
console.log(`\nmapa em ${SAIDA_FINAL}`);
