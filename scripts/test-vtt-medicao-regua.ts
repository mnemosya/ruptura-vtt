/**
 * Testes PUROS da régua multi-segmento (ferramenta "Medir") —
 * `_dominio/medicaoRegua.ts`.
 *
 * Cobre o contrato que a interface promete: `Q` fixa dobra e a medição
 * continua a partir dela, `Backspace` remove só a última dobra, `Enter`
 * conclui, soltar o botão preserva o gesto clássico quando não há
 * dobra, e clique simples nunca vira régua nem dobra.
 *
 * Uso: npx tsx scripts/test-vtt-medicao-regua.ts
 */

import { type Hex } from "../src/app/mesas/[campaignId]/vtt/_mapa/hex";
import {
  type EstadoMedicao,
  comecarAMedir,
  concluir,
  cruzouLimiar,
  fixarDobra,
  moverPonta,
  pontosDaMedicao,
  removerUltimaDobra,
  soltarBotao,
  totalDobras,
} from "../src/app/mesas/[campaignId]/vtt/_dominio/medicaoRegua";
import { medir } from "../src/app/mesas/[campaignId]/vtt/_dominio/movimento";

let passou = 0, falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

const h = (q: number, r: number): Hex => ({ q, r });
const LIMIAR = 4;

/** Estado `medindo` pronto, com origem em (0,0) e ponta onde se pedir. */
function medindo(atual: Hex, pontos: Hex[] = [h(0, 0)], livre = false): EstadoMedicao {
  return { fase: "medindo", pontos, atual, livre };
}

// ── 1: clique simples (sem cruzar limiar) nunca vira medição ───────
{
  const e: EstadoMedicao = { fase: "pressionada", origem: h(0, 0), inicioPx: { x: 100, y: 100 } };
  const cruzou = cruzouLimiar(e, h(0, 0), { x: 101, y: 101 }, LIMIAR);
  ok("1 (clique parado na mesma célula não cruza o limiar)", cruzou === false, `cruzou=${cruzou}`);
  const depois = soltarBotao(e);
  ok("1b (soltar em `pressionada` volta pra ociosa, sem desenhar nada)", depois.fase === "ociosa", depois.fase);
}

// ── 2: cruzar o limiar por DISTÂNCIA em tela, sem mudar de hex ─────
{
  const e: EstadoMedicao = { fase: "pressionada", origem: h(0, 0), inicioPx: { x: 100, y: 100 } };
  ok("2 (andar >= limiar em tela cruza mesmo na mesma célula)", cruzouLimiar(e, h(0, 0), { x: 110, y: 100 }, LIMIAR), "10px >= 4px");
}

// ── 3: cruzar o limiar por MUDANÇA de hexágono, sem andar o limiar ─
{
  const e: EstadoMedicao = { fase: "pressionada", origem: h(0, 0), inicioPx: { x: 100, y: 100 } };
  ok("3 (mudar de hexágono cruza mesmo andando pouco)", cruzouLimiar(e, h(1, 0), { x: 101, y: 100 }, LIMIAR), "hex mudou");
}

// ── 4: `comecarAMedir` põe a origem como primeiro ponto ────────────
{
  const e: EstadoMedicao = { fase: "pressionada", origem: h(0, 0), inicioPx: { x: 0, y: 0 } };
  const m = comecarAMedir(e, h(3, 0));
  ok("4 (medindo nasce com a origem como ponto 0 e zero dobras)",
    m.fase === "medindo" && m.pontos.length === 1 && m.pontos[0].q === 0 && totalDobras(m) === 0,
    JSON.stringify(pontosDaMedicao(m)));
}

// ── 5: Q fixa a dobra e a medição continua a partir dela ───────────
{
  const m = fixarDobra(medindo(h(3, 0)));
  ok("5 (Q vira dobra: origem + dobra, ponta segue viva)",
    totalDobras(m) === 1 && pontosDaMedicao(m).length === 3,
    `dobras=${totalDobras(m)} pontos=${JSON.stringify(pontosDaMedicao(m))}`);

  // Depois de fixar, mover a ponta muda SÓ a ponta — a dobra fica.
  const m2 = moverPonta(m, h(3, 4));
  ok("5b (mover depois da dobra não mexe na dobra)",
    totalDobras(m2) === 1 && m2.fase === "medindo" && m2.pontos[1].q === 3 && m2.pontos[1].r === 0 && m2.atual.r === 4,
    JSON.stringify(pontosDaMedicao(m2)));
}

// ── 6: Q parado na própria dobra é recusa silenciosa (mesma ref) ───
{
  const m = fixarDobra(medindo(h(3, 0)));
  const repetido = fixarDobra(m);
  ok("6 (Q na mesma célula da última dobra é no-op, mesma referência)", repetido === m, "mesma ref");
}

// ── 7: vários segmentos encadeados ─────────────────────────────────
{
  let m = medindo(h(3, 0));
  m = fixarDobra(m);            // dobra em (3,0)
  m = moverPonta(m, h(3, 3));
  m = fixarDobra(m);            // dobra em (3,3)
  m = moverPonta(m, h(6, 3));
  ok("7 (três trechos: origem → dobra → dobra → ponta)",
    totalDobras(m) === 2 && pontosDaMedicao(m).length === 4,
    JSON.stringify(pontosDaMedicao(m)));
}

// ── 8: Backspace remove só a ÚLTIMA dobra ──────────────────────────
{
  let m = medindo(h(3, 0));
  m = fixarDobra(m);
  m = moverPonta(m, h(3, 3));
  m = fixarDobra(m);
  const antes = totalDobras(m);
  const depois = removerUltimaDobra(m);
  ok("8 (Backspace tira uma dobra e mantém a medição viva)",
    antes === 2 && totalDobras(depois) === 1 && depois.fase === "medindo",
    `${antes} → ${totalDobras(depois)}`);
}

// ── 9: Backspace nunca remove a origem ─────────────────────────────
{
  const m = medindo(h(3, 0));
  const depois = removerUltimaDobra(m);
  ok("9 (Backspace sem dobra é no-op — nunca apaga a origem)",
    depois === m && totalDobras(depois) === 0, "mesma ref");
}

// ── 10: Enter conclui preservando os pontos ────────────────────────
{
  let m = medindo(h(3, 0));
  m = fixarDobra(m);
  m = moverPonta(m, h(3, 3));
  const c = concluir(m);
  ok("10 (Enter conclui mantendo origem, dobras e ponta)",
    c.fase === "concluida" && pontosDaMedicao(c).length === 3,
    JSON.stringify(pontosDaMedicao(c)));
}

// ── 11: soltar SEM dobra conclui (gesto clássico preservado) ───────
{
  const m = medindo(h(3, 0));
  const depois = soltarBotao(m);
  ok("11 (soltar sem dobra conclui — arrastar-e-soltar de sempre)",
    depois.fase === "concluida", depois.fase);
}

// ── 12: soltar COM dobra mantém viva, em modo livre ────────────────
{
  let m = medindo(h(3, 0));
  m = fixarDobra(m);
  m = moverPonta(m, h(3, 3));
  const depois = soltarBotao(m);
  ok("12 (soltar com dobra segue medindo, agora sem precisar do botão)",
    depois.fase === "medindo" && depois.livre === true,
    `fase=${depois.fase} livre=${depois.fase === "medindo" ? depois.livre : "n/a"}`);
}

// ── 13: em modo livre a ponta continua acompanhando o cursor ───────
{
  const m = medindo(h(3, 3), [h(0, 0), h(3, 0)], true);
  const movido = moverPonta(m, h(6, 3));
  ok("13 (modo livre continua aceitando movimento da ponta)",
    movido.fase === "medindo" && movido.atual.q === 6, JSON.stringify(pontosDaMedicao(movido)));
}

// ── 14: mover pra MESMA célula é no-op (mesma referência) ──────────
{
  const m = medindo(h(3, 0));
  ok("14 (mover dentro da mesma célula não gera estado novo)", moverPonta(m, h(3, 0)) === m, "mesma ref");
}

// ── 15: integração com `medir()` — soma dos trechos bate no total ──
{
  let m = medindo(h(3, 0));
  m = fixarDobra(m);          // (0,0) → (3,0)
  m = moverPonta(m, h(3, 3)); // (3,0) → (3,3)

  const calc = medir(pontosDaMedicao(m), new Map());
  const somaDosTrechos = calc.rota.segmentos.reduce((acc, s) => acc + s.distancia, 0);
  ok("15 (total acumulado = soma dos trechos, e há 2 trechos)",
    calc.rota.segmentos.length === 2 && somaDosTrechos === calc.metros,
    `trechos=${calc.rota.segmentos.length} soma=${somaDosTrechos} total=${calc.metros}`);
}

// ── 16: a dobra muda o caminho — trajeto dobrado >= reto ───────────
{
  const reto = medir([h(0, 0), h(4, 4)], new Map());
  const dobrado = medir([h(0, 0), h(4, 0), h(4, 4)], new Map());
  ok("16 (medir com dobra nunca é mais curto que a reta entre as pontas)",
    dobrado.metros >= reto.metros,
    `reto=${reto.metros} dobrado=${dobrado.metros}`);
}

// ── 17: fases sem régua não expõem pontos ──────────────────────────
{
  const ociosa: EstadoMedicao = { fase: "ociosa" };
  const press: EstadoMedicao = { fase: "pressionada", origem: h(0, 0), inicioPx: { x: 0, y: 0 } };
  ok("17 (ociosa/pressionada não têm pontos nem dobras)",
    pontosDaMedicao(ociosa).length === 0 && pontosDaMedicao(press).length === 0
    && totalDobras(ociosa) === 0 && totalDobras(press) === 0,
    "vazio nas duas");
}

// ── 18: Q/Backspace fora de `medindo` são no-op ────────────────────
{
  const c: EstadoMedicao = { fase: "concluida", pontos: [h(0, 0)], atual: h(3, 0) };
  ok("18 (concluída ignora Q e Backspace — gesto acabou)",
    fixarDobra(c) === c && removerUltimaDobra(c) === c, "mesma ref nos dois");
}

console.log(`\n${passou} ok, ${falhou} falha(s).`);
process.exit(falhou > 0 ? 1 : 0);
