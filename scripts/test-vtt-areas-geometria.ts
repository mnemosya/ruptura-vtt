/**
 * Testes PUROS da geometria exata que sustenta a regra dos 50% —
 * `_dominio/geometria.ts` e `_dominio/escalaMapa.ts`. Determinísticos,
 * sem browser, sem banco, sem estado global.
 *
 * Uso: npx tsx scripts/test-vtt-areas-geometria.ts
 */

import {
  type Ponto, type Poligono,
  areaDiscoPoligono, areaInterseccaoConvexos, areaPoligono, areaUniaoConvexosEm,
  caixaDe, caixasSeparadas, clipPorSemiPlano, poligonoSimples, segmentoCruzaInteriorDoConvexo,
  semiPlanosDeConvexo, temPontosDuplicadosConsecutivos, triangular,
} from "../src/app/mesas/[campaignId]/vtt/_dominio/geometria";
import {
  areaDaCelula, axialParaMundo, metrosParaMundo, mundoParaAxial, mundoParaMetros, poligonoDaCelula,
} from "../src/app/mesas/[campaignId]/vtt/_dominio/escalaMapa";

let passou = 0;
let falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}
function perto(a: number, b: number, tol = 1e-7): boolean {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
}

const T = 26; // mesmo raio de hexágono que o mapa usa (`MapaHex.TAM`)
const METRO = T * Math.sqrt(3);

// ── 1. Escala ────────────────────────────────────────────────────────
{
  ok("G1 (1 metro = tamanhoCelula·√3 unidades do mundo)", perto(metrosParaMundo(1, T), METRO), `${metrosParaMundo(1, T)} vs ${METRO}`);
  ok("G1b (ida e volta metros↔mundo)", perto(mundoParaMetros(metrosParaMundo(7.25, T), T), 7.25), "7,25 m");
  // Os 6 vizinhos ficam TODOS a 1 metro — é a definição usada.
  const centro = axialParaMundo({ q: 0, r: 0 }, T);
  const vizinhos = [{ q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }];
  const dists = vizinhos.map((v) => { const p = axialParaMundo(v, T); return Math.hypot(p.x - centro.x, p.y - centro.y); });
  ok("G1c (os 6 vizinhos ficam exatamente a 1 metro)", dists.every((d) => perto(d, METRO)), dists.map((d) => (d / METRO).toFixed(6)).join(", "));
  const volta = mundoParaAxial(axialParaMundo({ q: 3.25, r: -1.5 }, T).x, axialParaMundo({ q: 3.25, r: -1.5 }, T).y, T);
  ok("G1d (axial fracionário sobrevive à ida e volta, sem arredondar)", perto(volta.q, 3.25) && perto(volta.r, -1.5), JSON.stringify(volta));
}

// ── 2. Área do hexágono real da célula ───────────────────────────────
{
  const poli = poligonoDaCelula({ q: 0, r: 0 }, T);
  const esperado = (3 * Math.sqrt(3) / 2) * T * T;
  ok("G2 (área do polígono real da célula = (3√3/2)·T²)", perto(areaPoligono(poli), esperado), `${areaPoligono(poli).toFixed(4)} vs ${esperado.toFixed(4)}`);
  ok("G2b (`areaDaCelula` bate com o polígono)", perto(areaDaCelula(T), areaPoligono(poli)), `${areaDaCelula(T).toFixed(4)}`);
  ok("G2c (a célula tem 6 vértices)", poli.length === 6, `${poli.length}`);
  // Independência de posição: qualquer célula tem a MESMA área.
  const outra = poligonoDaCelula({ q: 7, r: -3 }, T);
  ok("G2d (área da célula não depende da posição na grade)", perto(areaPoligono(outra), esperado), `${areaPoligono(outra).toFixed(4)}`);
}

// ── 3. Recorte por semiplano — metade exata ─────────────────────────
{
  const poli = poligonoDaCelula({ q: 0, r: 0 }, T);
  const total = areaPoligono(poli);
  // Semiplano x <= 0 passando pelo centro do hexágono (que está em x=0).
  const metade = clipPorSemiPlano(poli, { nx: 1, ny: 0, c: 0 });
  ok("G3 (semiplano pelo centro corta exatamente 50% da célula)", perto(areaPoligono(metade) / total, 0.5), `${(areaPoligono(metade) / total).toFixed(12)}`);
  // Semiplano y <= 0 (o outro eixo — hexágono pointy-top não é simétrico igual nos dois, mas pelo centro continua metade).
  const metade2 = clipPorSemiPlano(poli, { nx: 0, ny: 1, c: 0 });
  ok("G3b (semiplano horizontal pelo centro também corta 50%)", perto(areaPoligono(metade2) / total, 0.5), `${(areaPoligono(metade2) / total).toFixed(12)}`);
  const nada = clipPorSemiPlano(poli, { nx: 1, ny: 0, c: -T * 2 });
  ok("G3c (semiplano longe recorta nada)", areaPoligono(nada) === 0, `${areaPoligono(nada)}`);
  const tudo = clipPorSemiPlano(poli, { nx: 1, ny: 0, c: T * 2 });
  ok("G3d (semiplano que contém tudo preserva a área)", perto(areaPoligono(tudo), total), `${areaPoligono(tudo).toFixed(4)}`);
}

// ── 4. Disco × polígono, analítico ──────────────────────────────────
{
  const poli = poligonoDaCelula({ q: 0, r: 0 }, T);
  const total = areaPoligono(poli);
  const centro: Ponto = { x: 0, y: 0 };

  ok("G4 (disco gigante cobre a célula inteira)", perto(areaDiscoPoligono(centro, T * 10, poli), total), `${areaDiscoPoligono(centro, T * 10, poli).toFixed(4)}`);
  // Disco pequeno inteiramente dentro do hexágono: área = πr². O raio
  // inscrito do hexágono é T·√3/2 ≈ 22,5 — um disco de raio 10 cabe.
  const r = 10;
  ok("G4b (disco inteiramente dentro da célula tem área πr²)", perto(areaDiscoPoligono(centro, r, poli), Math.PI * r * r), `${areaDiscoPoligono(centro, r, poli).toFixed(6)} vs ${(Math.PI * r * r).toFixed(6)}`);
  // Disco longe: o somatório dos setores assinados se cancela; o
  // resíduo é ruído de ponto flutuante, não área — daí a comparação
  // com a tolerância, não com zero literal.
  const distante = areaDiscoPoligono({ x: 500, y: 0 }, 10, poli);
  ok("G4c (disco distante não intersecta)", distante < 1e-9, `${distante.toExponential(3)}`);
  // Disco de raio exatamente igual ao apótema toca as 6 arestas por
  // dentro: continua sendo πr², sem estourar.
  const apotema = T * Math.sqrt(3) / 2;
  ok("G4d (disco tangente às arestas por dentro continua πr²)", perto(areaDiscoPoligono(centro, apotema, poli), Math.PI * apotema * apotema, 1e-6), `${areaDiscoPoligono(centro, apotema, poli).toFixed(4)}`);
  // Disco centrado num vértice do hexágono e grande o bastante pra
  // cobrir a célula toda? Não — mas o resultado nunca pode passar da
  // área do hexágono.
  const vert = poli[0];
  for (const raio of [3, 9, 17, 26, 40, 60]) {
    const a = areaDiscoPoligono(vert, raio, poli);
    if (!(a >= -1e-9 && a <= total + 1e-9)) { ok("G4e (área de interseção nunca sai de [0, área da célula])", false, `raio=${raio} área=${a}`); break; }
    if (raio === 60) ok("G4e (área de interseção nunca sai de [0, área da célula])", true, "6 raios conferidos a partir de um vértice");
  }
  // Um disco centrado no centro do hexágono cobre metade da célula
  // para ALGUM raio entre 0 e o circunraio — checagem de monotonia e
  // de cruzamento único (bisseção).
  let lo = 0, hi = T;
  for (let i = 0; i < 80; i++) {
    const meio = (lo + hi) / 2;
    if (areaDiscoPoligono(centro, meio, poli) / total < 0.5) lo = meio; else hi = meio;
  }
  ok("G4f (existe raio que cobre exatamente 50% da célula, achado por bisseção)", perto(areaDiscoPoligono(centro, (lo + hi) / 2, poli) / total, 0.5, 1e-9), `raio=${((lo + hi) / 2).toFixed(6)} fração=${(areaDiscoPoligono(centro, (lo + hi) / 2, poli) / total).toFixed(12)}`);
}

// ── 5. União de convexos — sem dupla contagem ───────────────────────
{
  const base: Poligono = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const a: Poligono = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 10 }, { x: 0, y: 10 }];   // 60
  const b: Poligono = [{ x: 4, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 4, y: 10 }]; // 60, sobrepõe 20
  ok("G5 (união de dois retângulos sobrepostos não conta a sobreposição duas vezes)", perto(areaUniaoConvexosEm(base, [a, b]), 100), `${areaUniaoConvexosEm(base, [a, b])}`);
  const c: Poligono = [{ x: 3, y: 3 }, { x: 7, y: 3 }, { x: 7, y: 7 }, { x: 3, y: 7 }];
  ok("G5b (peça totalmente contida não muda a união)", perto(areaUniaoConvexosEm(base, [a, b, c]), 100), `${areaUniaoConvexosEm(base, [a, b, c])}`);
  ok("G5c (três peças sobrepostas — inclusão-exclusão ingênua erraria)", perto(areaUniaoConvexosEm(base, [a, c, b]), 100), `${areaUniaoConvexosEm(base, [a, c, b])}`);
  ok("G5d (peça única = interseção simples)", perto(areaUniaoConvexosEm(base, [c]), 16), `${areaUniaoConvexosEm(base, [c])}`);
  ok("G5e (nenhuma peça = 0)", areaUniaoConvexosEm(base, []) === 0, "0");
  const fora: Poligono = [{ x: 50, y: 50 }, { x: 60, y: 50 }, { x: 60, y: 60 }, { x: 50, y: 60 }];
  ok("G5f (peça fora da base não soma nada)", areaUniaoConvexosEm(base, [fora]) === 0, "0");
  ok("G5g (interseção convexo×convexo direta bate com a união de uma peça só)", perto(areaInterseccaoConvexos(base, c), 16), `${areaInterseccaoConvexos(base, c)}`);
}

// ── 6. Triangulação de polígono côncavo ─────────────────────────────
{
  // "L" côncavo, área 3·1 + 1·1 = ... calculado pela fórmula do laço.
  const l: Poligono = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 3 }, { x: 0, y: 3 }];
  const area = areaPoligono(l);
  const tris = triangular(l);
  const somaTris = tris.reduce((s, t) => s + areaPoligono(t), 0);
  ok("G6 (triangulação de polígono côncavo devolve n-2 triângulos)", tris.length === l.length - 2, `${tris.length} triângulos`);
  ok("G6b (a soma dos triângulos é a área do polígono côncavo)", perto(somaTris, area), `${somaTris.toFixed(6)} vs ${area.toFixed(6)}`);
  // Triângulos disjuntos: a união deles dentro de uma base grande = área do polígono.
  const base: Poligono = [{ x: -1, y: -1 }, { x: 5, y: -1 }, { x: 5, y: 5 }, { x: -1, y: 5 }];
  ok("G6c (união dos triângulos = área do polígono, sem sobreposição)", perto(areaUniaoConvexosEm(base, tris), area), `${areaUniaoConvexosEm(base, tris).toFixed(6)}`);
}

// ── 7. Validação de polígono ────────────────────────────────────────
{
  const triangulo: Poligono = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 4 }];
  const gravata: Poligono = [{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 4, y: 0 }, { x: 0, y: 4 }];
  const concavo: Poligono = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 3 }, { x: 0, y: 3 }];
  ok("G7 (triângulo é simples)", poligonoSimples(triangulo), "sim");
  ok("G7b (côncavo simples é aceito)", poligonoSimples(concavo), "sim");
  ok("G7c (gravata-borboleta é recusada por autointerseção)", !poligonoSimples(gravata), "recusado");
  ok("G7d (menos de 3 pontos é recusado)", !poligonoSimples([{ x: 0, y: 0 }, { x: 1, y: 1 }]), "recusado");
  ok("G7e (pontos duplicados consecutivos são detectados)", temPontosDuplicadosConsecutivos([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 2 }]), "detectado");
  ok("G7f (sem duplicados, não acusa)", !temPontosDuplicadosConsecutivos(triangulo), "ok");
  ok("G7g (área zero — três pontos colineares)", areaPoligono([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]) === 0, "0");
}

// ── 8. Travessia de interior (base da exceção da Linha) ─────────────
{
  const poli = poligonoDaCelula({ q: 0, r: 0 }, T);
  const centro = { x: 0, y: 0 };
  ok("G8 (segmento pelo centro atravessa o interior)", segmentoCruzaInteriorDoConvexo({ x: -100, y: 0 }, { x: 100, y: 0 }, poli, T), "sim");
  // Segmento colinear com uma aresta: só tangencia, não atravessa.
  const a0 = poli[0], a1 = poli[1];
  const dir = { x: a1.x - a0.x, y: a1.y - a0.y };
  const antes = { x: a0.x - dir.x * 3, y: a0.y - dir.y * 3 };
  const depois = { x: a1.x + dir.x * 3, y: a1.y + dir.y * 3 };
  ok("G8b (segmento rente a uma aresta NÃO atravessa)", !segmentoCruzaInteriorDoConvexo(antes, depois, poli, T), "recusado");
  // Segmento tocando só um vértice (vindo de fora, tangente ao vértice do topo).
  const topo = poli[0];
  ok("G8c (segmento que toca só um vértice NÃO atravessa)", !segmentoCruzaInteriorDoConvexo({ x: topo.x - 40, y: topo.y }, { x: topo.x + 40, y: topo.y }, poli, T), "recusado");
  ok("G8d (segmento inteiramente fora não atravessa)", !segmentoCruzaInteriorDoConvexo({ x: 300, y: 0 }, { x: 400, y: 0 }, poli, T), "recusado");
  // Segmento curto totalmente dentro conta como travessia de interior.
  ok("G8e (segmento curto dentro da célula atravessa o interior)", segmentoCruzaInteriorDoConvexo({ x: -3, y: 0 }, { x: 3, y: 0 }, poli, T), "sim");
  void centro;
}

// ── 9. Caixas envolventes ───────────────────────────────────────────
{
  const c1 = caixaDe([{ x: 0, y: 0 }, { x: 4, y: 6 }]);
  const c2 = caixaDe([{ x: 10, y: 10 }, { x: 12, y: 12 }]);
  ok("G9 (caixa correta)", c1.minX === 0 && c1.maxX === 4 && c1.minY === 0 && c1.maxY === 6, JSON.stringify(c1));
  ok("G9b (caixas separadas detectadas)", caixasSeparadas(c1, c2), "separadas");
  ok("G9c (caixas encostadas não são separadas)", !caixasSeparadas(c1, caixaDe([{ x: 3, y: 3 }, { x: 9, y: 9 }])), "sobrepostas");
}

// ── 10. Semiplanos de convexo ───────────────────────────────────────
{
  const quadrado: Poligono = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
  const sp = semiPlanosDeConvexo(quadrado);
  ok("G10 (quadrado gera 4 semiplanos)", sp.length === 4, `${sp.length}`);
  const dentro = (p: Ponto) => sp.every((s) => s.nx * p.x + s.ny * p.y - s.c <= 1e-12);
  ok("G10b (o centro do quadrado satisfaz todos os semiplanos)", dentro({ x: 1, y: 1 }), "sim");
  ok("G10c (ponto fora não satisfaz)", !dentro({ x: 3, y: 1 }), "sim");
  // Ordem invertida dos vértices produz os MESMOS semiplanos (normalização de orientação).
  const invertido = [...quadrado].reverse();
  const sp2 = semiPlanosDeConvexo(invertido);
  const dentro2 = (p: Ponto) => sp2.every((s) => s.nx * p.x + s.ny * p.y - s.c <= 1e-12);
  ok("G10d (orientação dos vértices não inverte o interior)", dentro2({ x: 1, y: 1 }) && !dentro2({ x: 3, y: 1 }), "sim");
}

console.log(`\n${passou} ok, ${falhou} falha(s).`);
process.exit(falhou > 0 ? 1 : 0);
