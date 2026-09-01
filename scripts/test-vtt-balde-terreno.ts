/**
 * Testes PUROS do balde de tinta (preenchimento de região contígua) do
 * pincel de Terreno — `regiaoContiguaDeTerreno`.
 *
 * A regra: preencher até topar com uma borda de valor DIFERENTE do da
 * célula inicial (inclusive `null` = normal, que também conta como um
 * valor) ou com o limite do mapa. Nunca vaza pra fora da grade, nunca
 * atravessa pra um valor diferente.
 *
 * Uso: npx tsx scripts/test-vtt-balde-terreno.ts
 */

import { type Hex, hexKey } from "../src/app/mesas/[campaignId]/vtt/_mapa/hex";
import { type MapaTerreno, regiaoContiguaDeTerreno } from "../src/app/mesas/[campaignId]/vtt/_dominio/movimento";

let passou = 0, falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

function mapa(entradas: [Hex, "dificil" | "bloqueado"][]): MapaTerreno {
  return new Map(entradas.map(([h, t]) => [hexKey(h), t]));
}
function chaves(hs: Hex[]): Set<string> {
  return new Set(hs.map(hexKey));
}

// ── 1: região vazia (tudo "normal") num mapa pequeno preenche o mapa inteiro ──
{
  const largura = 3, altura = 3; // linhas r=0,1,2 — larguras deslocadas por causa do offset axial
  const r = regiaoContiguaDeTerreno({ q: 0, r: 0 }, mapa([]), largura, altura);
  // Conta total de células válidas no mapa 3×3 (usa a mesma fórmula de dentroDoMapa)
  let totalEsperado = 0;
  for (let rr = 0; rr < altura; rr++) totalEsperado += largura;
  ok("1 (mapa todo normal preenche o mapa inteiro)", r.length === totalEsperado, `${r.length}/${totalEsperado}`);
}

// ── 2: uma borda de tipo diferente contém o preenchimento ──────────
{
  // Linha vertical de "bloqueado" em q=2 separa duas metades do mapa 5×1.
  const bloqueio: [Hex, "bloqueado"][] = [[{ q: 2, r: 0 }, "bloqueado"]];
  const m = mapa(bloqueio);
  const esquerda = regiaoContiguaDeTerreno({ q: 0, r: 0 }, m, 5, 1);
  ok("2 (borda bloqueada contém o preenchimento à esquerda)",
    chaves(esquerda).has("0,0") && chaves(esquerda).has("1,0") && !chaves(esquerda).has("2,0") && !chaves(esquerda).has("3,0"),
    JSON.stringify(esquerda));
}

// ── 3: preencher a célula BLOQUEADA em si só pega bloqueados vizinhos ──
{
  const m = mapa([[{ q: 0, r: 0 }, "bloqueado"], [{ q: 1, r: 0 }, "bloqueado"], [{ q: 2, r: 0 }, "dificil"]]);
  const r = regiaoContiguaDeTerreno({ q: 0, r: 0 }, m, 5, 1);
  ok("3 (preencher célula bloqueada só pega a mancha de bloqueados)",
    chaves(r).has("0,0") && chaves(r).has("1,0") && !chaves(r).has("2,0"), JSON.stringify(r));
}

// ── 4: nunca sai dos limites do mapa ────────────────────────────────
{
  const r = regiaoContiguaDeTerreno({ q: 0, r: 0 }, mapa([]), 2, 2);
  const foraDoMapa = r.some((h) => h.q < -1 || h.q > 1 || h.r < 0 || h.r > 1);
  ok("4 (preenchimento nunca sai dos limites declarados do mapa)", !foraDoMapa, JSON.stringify(r));
}

// ── 5: célula inicial sempre entra no resultado, mesmo isolada ──────
{
  const m = mapa([[{ q: 1, r: 1 }, "dificil"]]);
  const r = regiaoContiguaDeTerreno({ q: 1, r: 1 }, m, 3, 3);
  ok("5 (célula isolada por vizinhos de outro valor preenche só ela mesma)",
    r.length === 1 && hexKey(r[0]) === "1,1", JSON.stringify(r));
}

// ── 6: duas manchas do MESMO tipo mas SEPARADAS não se misturam ────
{
  const m = mapa([
    [{ q: 0, r: 0 }, "dificil"],
    [{ q: 4, r: 0 }, "dificil"],
  ]);
  const r = regiaoContiguaDeTerreno({ q: 0, r: 0 }, m, 5, 1);
  ok("6 (duas manchas do mesmo tipo mas não-adjacentes não se fundem)",
    !chaves(r).has("4,0"), JSON.stringify(r));
}

console.log(`\n${passou} ok, ${falhou} falha(s).`);
if (falhou > 0) process.exit(1);
