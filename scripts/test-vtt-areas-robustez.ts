/**
 * Testes de ROBUSTEZ contra entrada abusiva — nascidos da rodada de
 * auditoria pós-0081. Confirmam os dois fixes de `celulasCandidatas`/
 * `normalizarParametros` (`_dominio/areaEfeito.ts`):
 *
 *  - uma origem ou ponto de magnitude absurda NUNCA trava o cálculo
 *    (o laço de candidatos é recortado contra o tamanho REAL da cena,
 *    não contra a caixa da região);
 *  - `normalizarParametros` clampa a magnitude em `MAGNITUDE_MAXIMA_
 *    COORDENADA`, o mesmo limite que a migration 0082 aplica no banco.
 *
 * Mede tempo de execução como evidência objetiva de "não trava" — não
 * é um benchmark de precisão (esse é `scripts/dev/check-vtt-areas-
 * desempenho.mjs`), só a garantia de que uma entrada adversarial
 * termina rápido.
 *
 * Uso: npx tsx scripts/test-vtt-areas-robustez.ts
 */

import {
  type ContextoMapaArea, type ParametrosArea,
  MAGNITUDE_MAXIMA_COORDENADA, normalizarParametros, regiaoDaArea, resolverArea,
} from "../src/app/mesas/[campaignId]/vtt/_dominio/areaEfeito";

let passou = 0;
let falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

const T = 26;
const CTX: ContextoMapaArea = { tamanhoCelula: T, largura: 26, altura: 18 }; // mesmo tamanho da cena de demonstração

function medir(fn: () => void): number {
  const antes = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - antes) / 1e6; // ms
}

// ── 1. Origem absurda — não trava, resolve rápido ───────────────────
{
  const params: ParametrosArea = { tipo: "esfera", origem: { q: 1e15, r: -1e15 }, raioM: 4, alturaM: null, nivelOrigemM: null };
  let celulas = -1;
  const ms = medir(() => {
    const regiao = regiaoDaArea(params, T)!;
    const r = resolverArea({ regiao, ctx: CTX, tokens: [] });
    celulas = r.celulas.length;
  });
  ok("R1 (origem absurda — esfera longe do mapa não trava)", ms < 200, `${ms.toFixed(2)} ms, ${celulas} células`);
  ok("R1b (origem absurda — nenhuma célula é afetada, coerente: está fora do mapa)", celulas === 0, `${celulas} células`);
}

// ── 2. Parede com um ponto de magnitude absurda ─────────────────────
{
  const params: ParametrosArea = { tipo: "parede", pontos: [{ q: 5, r: 5 }, { q: 1e9, r: 0 }], alturaM: 2 };
  let celulas = -1;
  const ms = medir(() => {
    const regiao = regiaoDaArea(params, T)!;
    const r = resolverArea({ regiao, ctx: CTX, tokens: [] });
    celulas = r.celulas.length;
  });
  ok("R2 (parede com ponto de magnitude absurda não trava — era o vetor de travamento confirmado na auditoria)", ms < 500, `${ms.toFixed(2)} ms, ${celulas} células`);
}

// ── 3. Personalizada com vértices espalhados por magnitude absurda ──
{
  const params: ParametrosArea = { tipo: "personalizada", pontos: [{ q: 0, r: 0 }, { q: 1e8, r: 0 }, { q: 1e8, r: 1e8 }, { q: 0, r: 1e8 }] };
  let celulas = -1;
  const ms = medir(() => {
    const regiao = regiaoDaArea(params, T)!;
    if (!regiao) { celulas = 0; return; }
    const r = resolverArea({ regiao, ctx: CTX, tokens: [] });
    celulas = r.celulas.length;
  });
  ok("R3 (personalizada com vértices na casa de 1e8 não trava)", ms < 500, `${ms.toFixed(2)} ms, ${celulas} células`);
}

// ── 4. NaN/Infinity na origem não travam nem propagam ───────────────
{
  const params: ParametrosArea = { tipo: "esfera", origem: { q: NaN, r: Infinity }, raioM: 4, alturaM: null, nivelOrigemM: null };
  const ms = medir(() => {
    const regiao = regiaoDaArea(params, T);
    if (regiao) resolverArea({ regiao, ctx: CTX, tokens: [] });
  });
  ok("R4 (NaN/Infinity na origem não trava)", ms < 200, `${ms.toFixed(2)} ms`);
}

// ── 5. `normalizarParametros` clampa a magnitude — mesma constante do banco ──
{
  const gigante = normalizarParametros({ tipo: "esfera", origem: { q: 1e15, r: -1e15 }, raioM: 4, alturaM: null, nivelOrigemM: null }) as Extract<ParametrosArea, { tipo: "esfera" }>;
  ok("R5 (origem gigante é clampada em ±MAGNITUDE_MAXIMA_COORDENADA)", gigante.origem.q === MAGNITUDE_MAXIMA_COORDENADA && gigante.origem.r === -MAGNITUDE_MAXIMA_COORDENADA, JSON.stringify(gigante.origem));

  const paredeGigante = normalizarParametros({ tipo: "parede", pontos: [{ q: 0, r: 0 }, { q: 1e9, r: -1e9 }], alturaM: 2 }) as Extract<ParametrosArea, { tipo: "parede" }>;
  ok("R5b (ponto de parede gigante é clampado)", paredeGigante.pontos[1].q === MAGNITUDE_MAXIMA_COORDENADA && paredeGigante.pontos[1].r === -MAGNITUDE_MAXIMA_COORDENADA, JSON.stringify(paredeGigante.pontos[1]));

  const naoAfetaDentroDoLimite = normalizarParametros({ tipo: "esfera", origem: { q: 500, r: -500 }, raioM: 4, alturaM: null, nivelOrigemM: null }) as Extract<ParametrosArea, { tipo: "esfera" }>;
  ok("R5c (coordenada dentro do limite não é alterada)", naoAfetaDentroDoLimite.origem.q === 500 && naoAfetaDentroDoLimite.origem.r === -500, JSON.stringify(naoAfetaDentroDoLimite.origem));
}

// ── 6. Cena minúscula (1×1) com região grande — ainda não trava ────
{
  const ctxMinusculo: ContextoMapaArea = { tamanhoCelula: T, largura: 1, altura: 1 };
  const params: ParametrosArea = { tipo: "esfera", origem: { q: 0, r: 0 }, raioM: 60, alturaM: null, nivelOrigemM: null };
  const ms = medir(() => {
    const regiao = regiaoDaArea(params, T)!;
    resolverArea({ regiao, ctx: ctxMinusculo, tokens: [] });
  });
  ok("R6 (raio máximo de 60 m numa cena 1×1 resolve rápido — o corte usa o tamanho da CENA, não da região)", ms < 100, `${ms.toFixed(2)} ms`);
}

console.log(`\n${passou} ok, ${falhou} falha(s).`);
process.exit(falhou > 0 ? 1 : 0);
