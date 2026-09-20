#!/usr/bin/env node
/**
 * TRIAGEM da suíte de verificação (TEST-01) — roda cada check com teto
 * de tempo e diz o que ele é hoje: passa, falha ou trava.
 *
 * ── Por que não dava para fazer com `timeout` ────────────────────────
 *
 * O `timeout` do GNU não existe no macOS, e sem ele a primeira tentativa
 * marcou os 66 scripts como "sem veredito" em silêncio. O teto vive
 * aqui, em Node, e mata o processo INTEIRO (`detached` + `kill(-pid)`)
 * — um `npx tsx` deixa filhos, e matar só o pai deixaria um Chromium
 * segurando conexão.
 *
 * ── Por que o teto é obrigatório ─────────────────────────────────────
 *
 * Os checks defasados TRAVAM em vez de falhar: cada espera do Playwright
 * tem timeout próprio e elas se somam. Um deles ficou mais de meia hora
 * preso num seletor que não existe mais.
 *
 * ── O resíduo ────────────────────────────────────────────────────────
 *
 * Matar um script antes da limpeza dele deixa contas e campanhas no
 * banco. Por isso a triagem IMPRIME o lembrete ao fim, e a varredura
 * mora em `varrer-residuo-de-teste.ts`. Rodar uma sem a outra é o que
 * levou este projeto a ter dezenas de campanhas de teste vivas.
 *
 * Uso:
 *   node scripts/dev/triar-checks.mjs                    # todos
 *   node scripts/dev/triar-checks.mjs --teto 240         # outro teto (s)
 *   node scripts/dev/triar-checks.mjs scripts/dev/check-x.ts ...
 */

import { spawn } from "node:child_process";
import { readdirSync, writeFileSync, appendFileSync } from "node:fs";

const args = process.argv.slice(2);
const idxTeto = args.indexOf("--teto");
const TETO_MS = (idxTeto >= 0 ? Number(args[idxTeto + 1]) : 180) * 1000;
const alvos = args.filter((a) => a.startsWith("scripts/"));
const SAIDA = "/tmp/triagem-checks.txt";

const scripts = alvos.length ? alvos : readdirSync("scripts/dev")
  .filter((n) => n.startsWith("check-") && (n.endsWith(".ts") || n.endsWith(".mjs")))
  .map((n) => `scripts/dev/${n}`)
  .sort();

/** Classifica pela saída: há dois formatos no repositório, e ignorar um deles marcava tudo como desconhecido. */
function classificar(saida, matou, codigo) {
  const contagem = saida.match(/(\d+) ok, (\d+) falha/g);
  if (contagem) {
    const ultima = contagem[contagem.length - 1];
    const [, ok, falha] = ultima.match(/(\d+) ok, (\d+) falha/);
    return Number(falha) === 0 ? `passa (${ok} ok)` : `falha (${ok} ok, ${falha} falha)`;
  }
  if (/TODOS OS CHECKS PASSARAM|Todos os critérios passaram|Repo e banco contam a mesma história/.test(saida)) {
    return "passa (banner)";
  }
  if (matou) {
    const esperando = saida.match(/waiting for (?:locator\()?['"]([^'"]{0,60})/);
    return `TRAVA${esperando ? ` (esperando ${esperando[1]})` : ""}`;
  }
  if (/AssertionError|FALHA -|FALHOU|Error:/.test(saida)) {
    const motivo = saida.match(/Could not find the function ([a-z_]+)|net::([A-Z_]+)|AssertionError[^\n]{0,70}/);
    return `falha${motivo ? ` (${(motivo[1] ?? motivo[2] ?? motivo[0]).slice(0, 60)})` : ""}`;
  }
  return codigo === 0 ? "passa (sem contagem)" : `falha (código ${codigo})`;
}

function rodar(script) {
  return new Promise((resolve) => {
    const filho = spawn("npx", ["tsx", script], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let saida = "";
    let matou = false;
    const t = setTimeout(() => {
      matou = true;
      // Grupo inteiro: `npx tsx` deixa filhos, e matar só o pai deixaria
      // um Chromium vivo segurando conexão com o banco.
      try { process.kill(-filho.pid, "SIGKILL"); } catch { /* já morreu */ }
    }, TETO_MS);
    filho.stdout.on("data", (d) => { saida += d; });
    filho.stderr.on("data", (d) => { saida += d; });
    filho.on("close", (codigo) => {
      clearTimeout(t);
      resolve(classificar(saida.slice(-6000), matou, codigo));
    });
  });
}

writeFileSync(SAIDA, `# triagem — teto de ${TETO_MS / 1000}s por script\n`);
console.log(`${scripts.length} script(s), teto de ${TETO_MS / 1000}s cada. Saída em ${SAIDA}\n`);

const contagem = { passa: 0, falha: 0, trava: 0 };
for (const [i, s] of scripts.entries()) {
  const nome = s.replace("scripts/dev/", "");
  process.stdout.write(`[${i + 1}/${scripts.length}] ${nome} … `);
  const v = await rodar(s);
  console.log(v);
  appendFileSync(SAIDA, `${nome} | ${v}\n`);
  if (v.startsWith("passa")) contagem.passa++;
  else if (v.startsWith("TRAVA")) contagem.trava++;
  else contagem.falha++;
}

console.log(`\npassam ${contagem.passa} · falham ${contagem.falha} · travam ${contagem.trava}`);
console.log("\nOs que travaram morreram antes de limpar. Varra o resíduo:");
console.log("  npx tsx scripts/dev/varrer-residuo-de-teste.ts --apply");
