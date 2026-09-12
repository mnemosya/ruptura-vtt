/**
 * Testes PUROS da rolagem base de Ruptura (`lib/dice/rollRuptura.ts`).
 *
 * Existem por causa da mesa: o VTT rola d8 FÍSICOS (corpos rígidos no
 * palco) e lê a face que ficou pra cima, então precisa aplicar a regra
 * a dados que já existem — `resolverPericia`. Este arquivo trava que
 * essa porta nova resolve EXATAMENTE como `rollPericia` sempre
 * resolveu, e que as seis faixas de margem seguem nos limites certos.
 *
 * Uso: npx tsx scripts/test-dice-ruptura.ts
 */

import { resolverPericia, rollPericia } from "../src/lib/dice";

let passou = 0;
let falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

const base = { atributoId: "corpo", atributoNome: "Corpo", atributoValor: 3, modificador: 0 };

// ── A regra: maior dado + perícia + modificador ────────────────────
{
  const r = resolverPericia({ ...base, periciaId: "balistica", periciaNome: "Balística", periciaValor: 3, modificador: 2 }, [4, 7, 2]);
  ok("1 (usa o MAIOR dado do pool, não a soma)", r.maiorDado === 7, `dados=[4,7,2] maior=${r.maiorDado}`);
  ok("2 (total = maior + perícia + modificador)", r.total === 12, `7+3+2=${r.total}`);
}

{
  const r = resolverPericia({ ...base, modificador: -1 }, [5, 5, 5]);
  ok("3 (sem perícia o bônus é 0, não `undefined`)", r.periciaValor === 0 && r.total === 4, `total=${r.total} periciaValor=${r.periciaValor}`);
}

// ── Sem CD não existe sucesso nem margem ───────────────────────────
{
  const r = resolverPericia({ ...base }, [8, 1, 1]);
  ok(
    "4 (teste aberto: sem CD, nada de sucesso/margem/faixa)",
    r.cd === undefined && r.sucesso === undefined && r.margem === undefined && r.classificacaoMargem === undefined,
    `cd=${r.cd} sucesso=${r.sucesso} margem=${r.margem}`,
  );
}

// ── As SEIS faixas, nos limites exatos documentados ────────────────
{
  // total é sempre maiorDado (perícia 0, mod 0); a CD move a margem.
  const faixaDe = (margem: number) => {
    const maior = 8;
    return resolverPericia({ ...base, cd: maior - margem }, [maior, 1, 1]).classificacaoMargem;
  };
  const casos: [number, string][] = [
    [-6, "falha_critica"],
    [-5, "falha_critica"],
    [-4, "falha"],
    [-2, "falha"],
    [-1, "falha_limitada"],
    [0, "sucesso_limitado"],
    [1, "sucesso_limitado"],
    [2, "sucesso_padrao"],
    [4, "sucesso_padrao"],
    [5, "sucesso_critico"],
    [9, "sucesso_critico"],
  ];
  const erros = casos.filter(([margem, esperado]) => faixaDe(margem) !== esperado);
  ok(
    "5 (as seis faixas de margem batem nos limites: -5 / -4..-2 / -1 / 0..1 / 2..4 / >=5)",
    erros.length === 0,
    erros.length === 0 ? `${casos.length} pontos conferidos` : JSON.stringify(erros),
  );
}

{
  const r = resolverPericia({ ...base, cd: 7 }, [7, 3, 1]);
  ok("6 (sucesso é total >= CD, e margem é total − CD)", r.sucesso === true && r.margem === 0, `total=${r.total} cd=7 margem=${r.margem} sucesso=${r.sucesso}`);
  const f = resolverPericia({ ...base, cd: 8 }, [7, 3, 1]);
  ok("6b (abaixo da CD é falha, com margem negativa)", f.sucesso === false && f.margem === -1, `total=${f.total} margem=${f.margem}`);
}

// ── `rollPericia` continua sendo "sortear + resolver" ──────────────
{
  const amostras = Array.from({ length: 200 }, () => rollPericia({ ...base, atributoValor: 4, cd: 10 }));
  const quantidadeOk = amostras.every((r) => r.dados.length === 4);
  const faixaOk = amostras.every((r) => r.dados.every((d) => Number.isInteger(d) && d >= 1 && d <= 8));
  ok("7 (rollPericia rola exatamente `atributoValor` d8, todos entre 1 e 8)", quantidadeOk && faixaOk, `${amostras.length} amostras`);

  // A porta nova tem que concordar com a antiga sobre os MESMOS dados.
  const divergentes = amostras.filter((r) => {
    const eq = resolverPericia({ ...base, atributoValor: 4, cd: 10 }, r.dados);
    return eq.total !== r.total || eq.maiorDado !== r.maiorDado || eq.classificacaoMargem !== r.classificacaoMargem || eq.sucesso !== r.sucesso;
  });
  ok(
    "8 (resolverPericia e rollPericia resolvem IDÊNTICO sobre os mesmos dados)",
    divergentes.length === 0,
    divergentes.length === 0 ? "200/200 iguais" : `${divergentes.length} divergência(s)`,
  );
}

{
  const r = rollPericia({ ...base, atributoValor: 0 });
  ok("9 (atributo 0 não quebra: pool vazio, maior 0)", r.dados.length === 0 && r.maiorDado === 0, `dados=${JSON.stringify(r.dados)} maior=${r.maiorDado}`);
}

console.log(`\n${passou} ok, ${falhou} falha(s).`);
if (falhou > 0) process.exit(1);
