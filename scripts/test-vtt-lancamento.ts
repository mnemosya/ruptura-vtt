/**
 * Testes PUROS de `parametrosDeLancamento` — a conversão de FORÇA
 * (0–1, "quanto tempo o botão foi segurado") em parâmetros físicos do
 * lançamento de dados na mesa. Sem `three`, sem `cannon-es`, sem DOM.
 *
 * Uso: npx tsx scripts/test-vtt-lancamento.ts
 */

import { CARGA_MAX_MS, FORCA_MINIMA, parametrosDeLancamento } from "../src/app/mesas/[campaignId]/vtt/_dados3d/lancamento";

let passou = 0;
let falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

const p0 = parametrosDeLancamento(0);
const pMin = parametrosDeLancamento(FORCA_MINIMA);
const p1 = parametrosDeLancamento(1);

ok("1 (força 0 ainda produz o piso — nunca uma rolagem sem movimento)",
  p0.velocidadeHorizontal === pMin.velocidadeHorizontal && p0.velocidadeVertical === pMin.velocidadeVertical
    && p0.velocidadeAngularMax === pMin.velocidadeAngularMax,
  `p0=${JSON.stringify(p0)}`);

ok("2 (força 1 dá mais impulso que o piso, em toda dimensão)",
  p1.velocidadeHorizontal > pMin.velocidadeHorizontal && p1.velocidadeVertical > pMin.velocidadeVertical
    && p1.velocidadeAngularMax > pMin.velocidadeAngularMax && p1.jitterPosicao > pMin.jitterPosicao,
  `pMin=${JSON.stringify(pMin)} p1=${JSON.stringify(p1)}`);

ok("3 (monotônico — força maior nunca produz impulso menor)",
  [0, 0.1, 0.25, 0.4, 0.6, 0.8, 1].every((f, i, arr) => {
    if (i === 0) return true;
    const a = parametrosDeLancamento(arr[i - 1]);
    const b = parametrosDeLancamento(f);
    return b.velocidadeHorizontal >= a.velocidadeHorizontal && b.velocidadeVertical >= a.velocidadeVertical
      && b.velocidadeAngularMax >= a.velocidadeAngularMax;
  }),
  "sequência 0→1 sem regressão");

ok("4 (clamp: valores fora de 0–1 não vazam pra física — >1 trava em 1, negativo trava no piso)",
  JSON.stringify(parametrosDeLancamento(50)) === JSON.stringify(p1) &&
  JSON.stringify(parametrosDeLancamento(-3)) === JSON.stringify(pMin),
  `f(50)=${JSON.stringify(parametrosDeLancamento(50))} f(-3)=${JSON.stringify(parametrosDeLancamento(-3))}`);

ok("5 (entrada não-finita (NaN/±Infinity) cai no piso, nunca em NaN — sem número real, sem força)",
  JSON.stringify(parametrosDeLancamento(Number.NaN)) === JSON.stringify(pMin) &&
  JSON.stringify(parametrosDeLancamento(Number.POSITIVE_INFINITY)) === JSON.stringify(pMin) &&
  JSON.stringify(parametrosDeLancamento(Number.NEGATIVE_INFINITY)) === JSON.stringify(pMin),
  `NaN=${JSON.stringify(parametrosDeLancamento(Number.NaN))}`);

ok("6 (todos os parâmetros são números finitos e positivos, em toda a faixa)",
  [0, 0.25, 0.5, 0.75, 1].every((f) => {
    const p = parametrosDeLancamento(f);
    return Object.values(p).every((v) => Number.isFinite(v) && v > 0);
  }),
  "sem NaN/Infinity/negativo em nenhum ponto amostrado");

ok("7 (CARGA_MAX_MS é um teto de UI plausível — nem instantâneo, nem eterno)",
  CARGA_MAX_MS >= 400 && CARGA_MAX_MS <= 5000,
  `CARGA_MAX_MS=${CARGA_MAX_MS}`);

console.log(`\n${passou} ok, ${falhou} falha(s).`);
if (falhou > 0) process.exit(1);
