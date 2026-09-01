/**
 * Testes DIFERENCIAIS da geometria de áreas — comparam a implementação
 * de produção (`_dominio/geometria.ts`/`areaEfeito.ts`) contra um
 * ORÁCULO INDEPENDENTE, nunca a mesma implementação copiada.
 *
 * O oráculo aqui é amostragem Monte Carlo: sorteia pontos uniformes
 * dentro da caixa envolvente de duas formas e conta a fração que cai
 * dentro de cada uma via um teste ponto-em-polígono/ponto-em-círculo
 * SEPARADO (não o clipping/triangulação/união exata que o código de
 * produção usa pra chegar no mesmo número analiticamente). Se o
 * clipping tivesse um bug sistemático — sinal trocado, aresta a menos,
 * fator de escala errado — o Monte Carlo dispararia um alarme mesmo
 * sem "saber" onde está o bug, porque os dois caminhos são
 * matematicamente independentes.
 *
 * Amostragem grande o bastante (2×10⁵ por caso) pra manter o ruído
 * estatístico dentro de ~0,3% — bem abaixo de qualquer divergência que
 * indicaria um erro real de implementação (que tende a ser de vários
 * pontos percentuais, não frações de 1%).
 *
 * Também cobre as PROPRIEDADES MATEMÁTICAS obrigatórias da auditoria:
 * não-negatividade, limite pela menor área, invariância de orientação,
 * translação, rotação, determinismo, ordem da pegada.
 *
 * Uso: npx tsx scripts/test-vtt-areas-diferencial.ts
 */

import { type Hex, hexParaPixel } from "../src/app/mesas/[campaignId]/vtt/_mapa/hex";
import { poligonoDaCelula, axialParaMundo } from "../src/app/mesas/[campaignId]/vtt/_dominio/escalaMapa";
import {
  type Ponto, type Poligono,
  areaDiscoPoligono, areaPoligono, areaUniaoConvexosEm, pontoDentroDoPoligono, rotacionarPonto,
} from "../src/app/mesas/[campaignId]/vtt/_dominio/geometria";
import {
  type ParametrosArea, ABERTURA_CONE_GRAUS, fracaoDeCobertura, regiaoDaArea,
} from "../src/app/mesas/[campaignId]/vtt/_dominio/areaEfeito";

let passou = 0;
let falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}
function perto(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

const T = 26;
const N_AMOSTRAS = 200_000;

/** Oráculo: fração de `N_AMOSTRAS` pontos uniformes na caixa de `base` que caem dentro de `base` E dentro do círculo (independente de `areaDiscoPoligono`). */
function fracaoPorAmostragemDisco(base: Poligono, centro: Ponto, raio: number, n = N_AMOSTRAS): number {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of base) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  let dentroBase = 0, dentroAmbos = 0;
  for (let i = 0; i < n; i++) {
    const x = minX + Math.random() * (maxX - minX);
    const y = minY + Math.random() * (maxY - minY);
    if (!pontoDentroDoPoligono({ x, y }, base)) continue;
    dentroBase++;
    if ((x - centro.x) ** 2 + (y - centro.y) ** 2 <= raio * raio) dentroAmbos++;
  }
  return dentroBase === 0 ? 0 : dentroAmbos / dentroBase;
}

/** Oráculo: fração de `base` coberta pela união de `pecas` (polígonos convexos), por amostragem — independente de `areaUniaoConvexosEm`. */
function fracaoPorAmostragemUniao(base: Poligono, pecas: readonly Poligono[], n = N_AMOSTRAS): number {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of base) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  let dentroBase = 0, dentroUniao = 0;
  for (let i = 0; i < n; i++) {
    const x = minX + Math.random() * (maxX - minX);
    const y = minY + Math.random() * (maxY - minY);
    const p = { x, y };
    if (!pontoDentroDoPoligono(p, base)) continue;
    dentroBase++;
    if (pecas.some((peca) => pontoDentroDoPoligono(p, peca))) dentroUniao++;
  }
  return dentroBase === 0 ? 0 : dentroUniao / dentroBase;
}

// ══════════════════════════════════════════════════════════════════
// A. Diferencial — disco × hexágono, configurações ALEATÓRIAS
// ══════════════════════════════════════════════════════════════════
{
  const celula = poligonoDaCelula({ q: 0, r: 0 }, T);
  const areaCelula = areaPoligono(celula);
  const TOL = 0.006; // ~0,6% — bem acima do ruído estatístico esperado (~0,2-0,3% a 2×10⁵ amostras)

  let piorDivergencia = 0;
  for (let i = 0; i < 12; i++) {
    // Centro em qualquer lugar dentro de 1,5 raio de hexágono do centro da célula, raio entre 0,3 e 2,5 raios de hexágono — cobre desde "quase não toca" até "cobre bem mais que a célula".
    const centro = { x: (Math.random() - 0.5) * 3 * T, y: (Math.random() - 0.5) * 3 * T };
    const raio = (0.3 + Math.random() * 2.2) * T;
    const fracaoProducao = fracaoDeCobertura({ forma: "disco", centro, raio }, celula, areaCelula);
    const fracaoOraculo = fracaoPorAmostragemDisco(celula, centro, raio);
    const divergencia = Math.abs(fracaoProducao - fracaoOraculo);
    piorDivergencia = Math.max(piorDivergencia, divergencia);
    ok(`D1.${i} (disco×hexágono aleatório — produção vs. Monte Carlo independente)`, divergencia <= TOL,
      `centro=(${centro.x.toFixed(1)},${centro.y.toFixed(1)}) raio=${raio.toFixed(1)} produção=${fracaoProducao.toFixed(4)} oráculo=${fracaoOraculo.toFixed(4)} Δ=${divergencia.toFixed(4)}`);
  }
  ok("D1 (pior divergência entre produção e oráculo Monte Carlo, 12 configurações aleatórias)", piorDivergencia <= TOL, `pior Δ=${piorDivergencia.toFixed(4)} (tolerância ${TOL})`);
}

// ══════════════════════════════════════════════════════════════════
// B. Diferencial — união de Parede (segmentos + bisel) × Monte Carlo
// ══════════════════════════════════════════════════════════════════
{
  const params: ParametrosArea = {
    tipo: "parede",
    pontos: [{ q: 0, r: 0 }, { q: 3, r: 0 }, { q: 3, r: 3 }, { q: 0.5, r: 4 }],
    alturaM: 2,
  };
  const regiao = regiaoDaArea(params, T)!;
  if (regiao.forma !== "corredor") throw new Error("esperava corredor");
  // Base generosa cobrindo toda a parede.
  const pontosMundo = params.pontos.map((p) => axialParaMundo(p, T));
  const xs = pontosMundo.map((p) => p.x), ys = pontosMundo.map((p) => p.y);
  const margem = regiao.largura * 3;
  const base: Poligono = [
    { x: Math.min(...xs) - margem, y: Math.min(...ys) - margem },
    { x: Math.max(...xs) + margem, y: Math.min(...ys) - margem },
    { x: Math.max(...xs) + margem, y: Math.max(...ys) + margem },
    { x: Math.min(...xs) - margem, y: Math.max(...ys) + margem },
  ];
  const areaBase = areaPoligono(base);
  const producaoFracao = areaUniaoConvexosEm(base, regiao.pecas) / areaBase;
  const oraculoFracao = fracaoPorAmostragemUniao(base, regiao.pecas);
  ok("D2 (união de parede com 3 segmentos e bisel — produção vs. Monte Carlo independente)",
    perto(producaoFracao, oraculoFracao, 0.01), `produção=${producaoFracao.toFixed(4)} oráculo=${oraculoFracao.toFixed(4)}`);
}

// ══════════════════════════════════════════════════════════════════
// C. Diferencial — polígono CÔNCAVO (personalizada) × Monte Carlo
// ══════════════════════════════════════════════════════════════════
{
  const params: ParametrosArea = {
    tipo: "personalizada",
    pontos: [{ q: 0, r: 0 }, { q: 5, r: 0 }, { q: 5, r: 1 }, { q: 1.5, r: 1 }, { q: 1.5, r: 4 }, { q: 0, r: 4 }],
  };
  const regiao = regiaoDaArea(params, T)!;
  if (regiao.forma !== "poligono") throw new Error("esperava polígono");
  const margem = T * 2;
  const xs = regiao.contorno.map((p) => p.x), ys = regiao.contorno.map((p) => p.y);
  const base: Poligono = [
    { x: Math.min(...xs) - margem, y: Math.min(...ys) - margem },
    { x: Math.max(...xs) + margem, y: Math.min(...ys) - margem },
    { x: Math.max(...xs) + margem, y: Math.max(...ys) + margem },
    { x: Math.min(...xs) - margem, y: Math.max(...ys) + margem },
  ];
  const areaBase = areaPoligono(base);
  const producaoFracao = areaUniaoConvexosEm(base, regiao.pecas) / areaBase;
  const oraculoFracao = fracaoPorAmostragemUniao(base, [regiao.contorno]); // contorno inteiro — o "L" côncavo original, checado via ponto-em-polígono, não via triangulação
  ok("D3 (polígono côncavo — triangulação da produção vs. ponto-em-polígono independente do contorno original)",
    perto(producaoFracao, oraculoFracao, 0.008), `produção(triangulado)=${producaoFracao.toFixed(4)} oráculo(contorno bruto)=${oraculoFracao.toFixed(4)}`);
}

// ══════════════════════════════════════════════════════════════════
// D. Propriedades matemáticas obrigatórias
// ══════════════════════════════════════════════════════════════════
{
  const celula = poligonoDaCelula({ q: 3, r: -2 }, T);
  const areaCelula = areaPoligono(celula);
  const disco = { forma: "disco" as const, centro: { x: 20, y: 10 }, raio: 30 };

  // D4: área nunca negativa.
  const f = fracaoDeCobertura(disco, celula, areaCelula);
  ok("D4 (fração de cobertura nunca negativa)", f >= 0, `${f}`);

  // D5: interseção nunca maior que a MENOR das duas áreas (aqui: nunca > 1 como fração da célula, e a área absoluta do disco∩célula nunca > área do disco nem > área da célula).
  const areaInterseccao = areaDiscoPoligono(disco.centro, disco.raio, celula);
  const areaDisco = Math.PI * disco.raio * disco.raio;
  ok("D5 (interseção nunca maior que a menor das duas áreas)", areaInterseccao <= areaCelula + 1e-6 && areaInterseccao <= areaDisco + 1e-6,
    `interseção=${areaInterseccao.toFixed(2)} célula=${areaCelula.toFixed(2)} disco=${areaDisco.toFixed(2)}`);

  // D6: inverter orientação dos vértices não muda o resultado.
  const celulaInvertida = [...celula].reverse();
  const areaInvertida = areaDiscoPoligono(disco.centro, disco.raio, celulaInvertida);
  ok("D6 (inverter orientação dos vértices da célula não muda a área de interseção)", perto(areaInterseccao, areaInvertida, 1e-9), `${areaInterseccao} vs ${areaInvertida}`);

  // D7: transladar AMBAS as formas pelo mesmo vetor produz o mesmo resultado.
  const desloc = { x: 137.5, y: -84.2 };
  const celulaDeslocada = celula.map((p) => ({ x: p.x + desloc.x, y: p.y + desloc.y }));
  const discoDeslocado = { x: disco.centro.x + desloc.x, y: disco.centro.y + desloc.y };
  const areaDeslocada = areaDiscoPoligono(discoDeslocado, disco.raio, celulaDeslocada);
  ok("D7 (transladar ambas as formas pelo mesmo vetor preserva a interseção)", perto(areaInterseccao, areaDeslocada, 1e-6), `${areaInterseccao.toFixed(6)} vs ${areaDeslocada.toFixed(6)}`);

  // D8: rotacionar AMBAS as formas pelo mesmo ângulo em torno do mesmo ponto preserva a proporção.
  const angulo = 0.73;
  const pivo = { x: 0, y: 0 };
  const celulaRotacionada = celula.map((p) => rotacionarPonto(p, pivo, angulo));
  const discoRotacionado = rotacionarPonto(disco.centro, pivo, angulo);
  const areaRotacionada = areaDiscoPoligono(discoRotacionado, disco.raio, celulaRotacionada);
  ok("D8 (rotacionar ambas as formas pelo mesmo ângulo preserva a área de interseção)", perto(areaInterseccao, areaRotacionada, 1e-6), `${areaInterseccao.toFixed(6)} vs ${areaRotacionada.toFixed(6)}`);

  // D9: repetir o mesmo cálculo produz resultado IDÊNTICO (determinismo — sem estado global, sem Math.random no caminho de produção).
  const repetido = [...Array(5)].map(() => areaDiscoPoligono(disco.centro, disco.raio, celula));
  ok("D9 (repetir o mesmo cálculo produz resultado bit-a-bit idêntico)", repetido.every((v) => v === repetido[0]), `${repetido.join(", ")}`);

  // D10z: REGRESSÃO — tangência exatamente num VÉRTICE (não numa
  // aresta). Achado real desta auditoria: um disco cujo raio faz sua
  // borda passar exatamente por um vértice do hexágono devolvia área
  // MAIOR que o disco inteiro (bug em `areaDiscoTriangulo`, corrigido
  // nesta rodada — ver o comentário da função). Testado em vários
  // raios, tangente ao MESMO vértice em cada um.
  {
    const centroDaCelulaZ = { x: celula.reduce((s, p) => s + p.x, 0) / celula.length, y: celula.reduce((s, p) => s + p.y, 0) / celula.length };
    const verticeZ = celula[0];
    const dirZ = { x: verticeZ.x - centroDaCelulaZ.x, y: verticeZ.y - centroDaCelulaZ.y };
    const normaZ = Math.hypot(dirZ.x, dirZ.y) || 1;
    let piorRaio = 0;
    for (const raioZ of [0.5, 1, 2, 3, 5, 8, 13, 20, 26, 35]) {
      const centroZ = { x: verticeZ.x + (dirZ.x / normaZ) * raioZ, y: verticeZ.y + (dirZ.y / normaZ) * raioZ };
      const areaZ = areaDiscoPoligono(centroZ, raioZ, celula);
      const areaDiscoTotalZ = Math.PI * raioZ * raioZ;
      if (areaZ > areaDiscoTotalZ + 1e-6 || areaZ > 1e-3) piorRaio = raioZ;
      ok(`D10z (raio=${raioZ} tangente a um vértice — interseção ~zero, nunca maior que o disco)`, areaZ < 1e-3 && areaZ <= areaDiscoTotalZ + 1e-6, `área=${areaZ.toExponential(3)} disco=${areaDiscoTotalZ.toFixed(3)}`);
    }
    void piorRaio;
  }

  // D10: tangência produz área zero — um disco PEQUENO (raio bem menor
  // que o apótema do hexágono, ~22,5 pra T=26) centrado exatamente a
  // `raio` de distância de um vértice, na direção RADIAL PRA FORA do
  // centro do hexágono, toca só aquele vértice, sem seu volume tocar
  // mais nada da forma (diferente de um raio grande, que mesmo
  // "tangente" em um ponto pode ter o resto do disco encavalando o
  // polígono por outro lado — esse era o defeito do teste original).
  const centroHex = { x: 0, y: 0 }; // `poligonoDaCelula({q:3,r:-2},T)` não está centrado na origem — recalculado abaixo com o vértice de verdade
  const verticeReal = celula[0];
  const centroDaCelula = { x: celula.reduce((s, p) => s + p.x, 0) / celula.length, y: celula.reduce((s, p) => s + p.y, 0) / celula.length };
  const dirForaX = verticeReal.x - centroDaCelula.x, dirForaY = verticeReal.y - centroDaCelula.y;
  const normaFora = Math.hypot(dirForaX, dirForaY) || 1;
  const raioPequeno = 3;
  const centroDisco = { x: verticeReal.x + (dirForaX / normaFora) * raioPequeno, y: verticeReal.y + (dirForaY / normaFora) * raioPequeno };
  const areaTangente = areaDiscoPoligono(centroDisco, raioPequeno, celula);
  ok("D10 (disco pequeno tangente a um vértice, pra fora do hexágono, produz área ~zero)", areaTangente < 1e-2, `${areaTangente.toExponential(3)}`);
  void centroHex;
}

// ══════════════════════════════════════════════════════════════════
// E. Ordem da pegada não muda o resultado — hexes adjacentes não duplicam
// ══════════════════════════════════════════════════════════════════
{
  const cels: Hex[] = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 1, r: -1 }];
  const poligonos = cels.map((c) => poligonoDaCelula(c, T));
  const base: Poligono = [{ x: -200, y: -200 }, { x: 200, y: -200 }, { x: 200, y: 200 }, { x: -200, y: 200 }];
  const emOrdem = areaUniaoConvexosEm(base, poligonos);
  const embaralhado = areaUniaoConvexosEm(base, [poligonos[2], poligonos[0], poligonos[1]]);
  ok("D11 (ordem dos polígonos da pegada não muda a área da união)", perto(emOrdem, embaralhado, 1e-6), `${emOrdem.toFixed(4)} vs ${embaralhado.toFixed(4)}`);
  const somaIngenua = poligonos.reduce((s, p) => s + areaPoligono(p), 0);
  ok("D12 (hexes adjacentes da pegada não duplicam contagem — união < soma das 3 células, que se tocam nas arestas)", emOrdem <= somaIngenua + 1e-6, `união=${emOrdem.toFixed(2)} soma=${somaIngenua.toFixed(2)}`);
  // Hexes SEPARADOS (não adjacentes) continuam contados corretamente — união = soma exata (sem sobreposição).
  const separados = [poligonoDaCelula({ q: 0, r: 0 }, T), poligonoDaCelula({ q: 3, r: 0 }, T)]; // distância 3 — não-adjacentes, e ainda dentro da caixa `base` de ±200
  const uniaoSeparados = areaUniaoConvexosEm(base, separados);
  const somaSeparados = separados.reduce((s, p) => s + areaPoligono(p), 0);
  ok("D13 (hexes separados — sem sobreposição — são contados exatamente pela soma)", perto(uniaoSeparados, somaSeparados, 1e-6), `${uniaoSeparados.toFixed(4)} vs ${somaSeparados.toFixed(4)}`);
}

// ══════════════════════════════════════════════════════════════════
// F. Regras fixas do sistema — verificadas no valor NUMÉRICO exato
// ══════════════════════════════════════════════════════════════════
{
  ok("D14 (Cone usa exatamente 45°, não um valor aproximado)", ABERTURA_CONE_GRAUS === 45, `${ABERTURA_CONE_GRAUS}`);
  const cone = regiaoDaArea({ tipo: "cone", origem: { q: 0, r: 0 }, direcaoGraus: 0, alcanceM: 6 }, T)!;
  if (cone.forma !== "setor") throw new Error("esperava setor");
  ok("D15 (a meia-abertura do setor é exatamente π/8 radianos — 22,5°)", perto(cone.meiaAberturaRad, Math.PI / 8, 1e-12), `${cone.meiaAberturaRad}`);
}

// ══════════════════════════════════════════════════════════════════
// G. Zoom/pan não participam do cálculo — já coberto em A9 de
// test-vtt-areas.ts; aqui, verificação adicional em coordenadas
// GRANDES (perto das bordas do mapa 200×200).
// ══════════════════════════════════════════════════════════════════
{
  const origemPertoDaBorda = { q: 190, r: 190 };
  const params: ParametrosArea = { tipo: "esfera", origem: origemPertoDaBorda, raioM: 3, alturaM: null, nivelOrigemM: null };
  const fracoes: number[] = [];
  for (const tam of [4, 26, 80]) {
    const regiao = regiaoDaArea(params, tam)!;
    const celula = poligonoDaCelula({ q: 191, r: 190 }, tam);
    fracoes.push(fracaoDeCobertura(regiao, celula, areaPoligono(celula)));
  }
  ok("D16 (coordenadas grandes, perto do limite do mapa 200×200 — resultado idêntico em qualquer escala de desenho)",
    fracoes.every((f) => perto(f, fracoes[0], 1e-9)), fracoes.map((f) => f.toFixed(8)).join(" · "));
}

console.log(`\n${passou} ok, ${falhou} falha(s).`);
process.exit(falhou > 0 ? 1 : 0);
