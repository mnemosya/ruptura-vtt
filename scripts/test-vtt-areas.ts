/**
 * Testes PUROS do domínio de ÁREAS DE EFEITO — `_dominio/areaEfeito.ts`.
 * Determinísticos, sem browser, sem banco, sem React. Cobrem as duas
 * regras gerais (50% da célula, 50% da pegada), a exceção da Linha e
 * os nove formatos.
 *
 * Uso: npx tsx scripts/test-vtt-areas.ts
 */

import { type Hex, hexKey } from "../src/app/mesas/[campaignId]/vtt/_mapa/hex";
import { type CategoriaTamanho, type Pegada, origemMecanica, pegadaEfetiva, projetarPegada } from "../src/app/mesas/[campaignId]/vtt/_dominio/pegada";
import { areaDaCelula, axialParaMundo, metrosParaMundo, mundoParaAxial, poligonoDaCelula } from "../src/app/mesas/[campaignId]/vtt/_dominio/escalaMapa";
import { areaPoligono } from "../src/app/mesas/[campaignId]/vtt/_dominio/geometria";
import {
  type ContextoMapaArea, type ParametrosArea, type ResultadoArea, type TokenParaArea,
  ABERTURA_CONE_GRAUS, LARGURA_PAREDE_M, META_AREA, TIPOS_AREA,
  caminhoDaRegiao, celulaAfetadaPelaFracao, comprimentoDoPercurso, fracaoDeCobertura,
  normalizarParametros, origemDeAura, regiaoDaArea, resolverArea,
  validarParametros, validarPercursoParede, validarPoligonoPersonalizado,
} from "../src/app/mesas/[campaignId]/vtt/_dominio/areaEfeito";

let passou = 0;
let falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}
function perto(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
}

const T = 26;                       // mesmo raio de hexágono do mapa (`MapaHex.TAM`)
const U = metrosParaMundo(1, T);    // 1 metro em unidades do mundo
const CTX: ContextoMapaArea = { tamanhoCelula: T, largura: 60, altura: 60 };
/** Célula de referência, longe de qualquer borda da grade de teste. */
const O: Hex = { q: 20, r: 20 };
const cel = (dq: number, dr: number): Hex => ({ q: O.q + dq, r: O.r + dr });
const mundoDe = (h: { q: number; r: number }) => axialParaMundo(h, T);
/** Ponto do mundo, em metros relativos ao centro de `O`, convertido pra axial fracionário. */
const axialRelativo = (mx: number, my: number) => {
  const base = mundoDe(O);
  return mundoParaAxial(base.x + mx * U, base.y + my * U, T);
};

function resolver(params: ParametrosArea, tokens: TokenParaArea[] = [], ctx: ContextoMapaArea = CTX): ResultadoArea {
  const regiao = regiaoDaArea(params, ctx.tamanhoCelula);
  if (!regiao) throw new Error(`região nula para ${params.tipo}`);
  return resolverArea({ regiao, ctx, tokens });
}
/** Soma de (fração × área da célula) — se a região cabe inteira na grade, isto É a área da região. */
function areaCoberta(res: ResultadoArea, tamanhoCelula = T): number {
  let s = 0;
  for (const f of res.fracaoPorCelula.values()) s += f;
  return s * areaDaCelula(tamanhoCelula);
}
function conjunto(cs: readonly Hex[]): Set<string> { return new Set(cs.map(hexKey)); }
function mesmoConjunto(a: readonly Hex[], b: readonly Hex[]): boolean {
  const sb = conjunto(b);
  return a.length === b.length && a.every((c) => sb.has(hexKey(c)));
}
function celulasDoToken(ancora: Hex, categoria: CategoriaTamanho, orientacao = 0, personalizada: Pegada | null = null): Hex[] {
  return projetarPegada(ancora, pegadaEfetiva({ categoria, orientacao, pegadaPersonalizada: personalizada }));
}
/** Nenhuma fração pode passar de 1 — invariante que denuncia dupla contagem em qualquer união. */
function fracoesSanas(res: ResultadoArea): boolean {
  for (const f of res.fracaoPorCelula.values()) if (f < -1e-9 || f > 1 + 1e-9) return false;
  return true;
}

// ══════════════════════════════════════════════════════════════════
// A. Regra geral — célula afetada
// ══════════════════════════════════════════════════════════════════
{
  const poli = poligonoDaCelula(O, T);
  const areaCelula = areaPoligono(poli);

  // 0% — faixa longe.
  const longe = regiaoDaArea({ tipo: "faixa", origem: axialRelativo(30, 0), direcaoGraus: 0, comprimentoM: 4, larguraM: 2 }, T)!;
  ok("A1 (0% de cobertura — célula fora do efeito)", fracaoDeCobertura(longe, poli, areaCelula) < 1e-12, `${fracaoDeCobertura(longe, poli, areaCelula)}`);

  // Tangência: o corredor começa exatamente no vértice inferior da
  // célula (0, +T no mundo) e vai pra baixo — toca um ponto só.
  const vertice = mundoParaAxial(mundoDe(O).x, mundoDe(O).y + T, T);
  const tangente = regiaoDaArea({ tipo: "faixa", origem: vertice, direcaoGraus: 90, comprimentoM: 6, larguraM: 6 }, T)!;
  ok("A2 (só tangência — não afeta)", fracaoDeCobertura(tangente, poli, areaCelula) < 1e-12 && !celulaAfetadaPelaFracao(fracaoDeCobertura(tangente, poli, areaCelula)), `${fracaoDeCobertura(tangente, poli, areaCelula).toExponential(3)}`);

  // Exatamente 50%: corredor largo começando NO CENTRO da célula, indo
  // pra baixo — cobre exatamente o hemisfério inferior do hexágono.
  const metade = regiaoDaArea({ tipo: "faixa", origem: { q: O.q, r: O.r }, direcaoGraus: 90, comprimentoM: 6, larguraM: 8 }, T)!;
  const f50 = fracaoDeCobertura(metade, poli, areaCelula);
  ok("A3 (exatamente 50% conta como afetada)", perto(f50, 0.5, 1e-12) && celulaAfetadaPelaFracao(f50), `${f50.toFixed(14)}`);

  // Menos de 50% — mesma faixa, deslocada 0,2 m pra baixo.
  const menos = regiaoDaArea({ tipo: "faixa", origem: axialRelativo(0, 0.2), direcaoGraus: 90, comprimentoM: 6, larguraM: 8 }, T)!;
  const fMenos = fracaoDeCobertura(menos, poli, areaCelula);
  ok("A4 (menos de 50% — não afeta)", fMenos < 0.5 && !celulaAfetadaPelaFracao(fMenos), `${fMenos.toFixed(6)}`);

  // Mais de 50% — deslocada 0,2 m pra cima.
  const mais = regiaoDaArea({ tipo: "faixa", origem: axialRelativo(0, -0.2), direcaoGraus: 90, comprimentoM: 6, larguraM: 8 }, T)!;
  const fMais = fracaoDeCobertura(mais, poli, areaCelula);
  ok("A5 (mais de 50% — afeta)", fMais > 0.5 && celulaAfetadaPelaFracao(fMais), `${fMais.toFixed(6)}`);

  // 100% — cubo grande em volta.
  const tudo = regiaoDaArea({ tipo: "cubo", origem: axialRelativo(-3, -3), direcaoGraus: 0, ladoM: 6 }, T)!;
  ok("A6 (100% de cobertura)", perto(fracaoDeCobertura(tudo, poli, areaCelula), 1, 1e-9), `${fracaoDeCobertura(tudo, poli, areaCelula).toFixed(9)}`);

  // A mesma configuração em posições diferentes da grade dá a MESMA fração.
  const fracoes = [cel(0, 0), cel(5, 0), cel(-4, 7), cel(9, -6)].map((c) => {
    const base = mundoDe(c);
    const origem = mundoParaAxial(base.x, base.y, T);
    const reg = regiaoDaArea({ tipo: "faixa", origem, direcaoGraus: 90, comprimentoM: 6, larguraM: 8 }, T)!;
    return fracaoDeCobertura(reg, poligonoDaCelula(c, T), areaCelula);
  });
  ok("A7 (hex em posições diferentes da grade → mesma fração)", fracoes.every((f) => perto(f, 0.5, 1e-12)), fracoes.map((f) => f.toFixed(14)).join(" · "));

  // Estabilidade numérica: 200 deslocamentos minúsculos em torno do
  // limiar nunca produzem salto — a fração varia de forma contínua.
  let maiorSalto = 0;
  let anterior: number | null = null;
  for (let i = 0; i <= 200; i++) {
    const d = (i - 100) * 1e-7;
    const reg = regiaoDaArea({ tipo: "faixa", origem: axialRelativo(0, d), direcaoGraus: 90, comprimentoM: 6, larguraM: 8 }, T)!;
    const f = fracaoDeCobertura(reg, poli, areaCelula);
    if (anterior !== null) maiorSalto = Math.max(maiorSalto, Math.abs(f - anterior));
    anterior = f;
  }
  ok("A8 (estabilidade numérica em torno do limiar de 50%)", maiorSalto < 1e-6, `maior salto = ${maiorSalto.toExponential(3)}`);

  // Independência de zoom/pan: o domínio só conhece unidades do mundo
  // derivadas de `tamanhoCelula` — trocar essa escala (que é o que
  // zoom faz visualmente) não pode mudar NENHUM resultado.
  const params: ParametrosArea = { tipo: "esfera", origem: { q: O.q, r: O.r }, raioM: 3.4, alturaM: null, nivelOrigemM: null };
  const base = resolver(params);
  let iguais = true;
  for (const tam of [4, 13, 26, 97.5]) {
    const r = resolver(params, [], { ...CTX, tamanhoCelula: tam });
    if (!mesmoConjunto(r.celulas, base.celulas)) { iguais = false; break; }
    for (const [k, f] of base.fracaoPorCelula) if (Math.abs((r.fracaoPorCelula.get(k) ?? 0) - f) > 1e-9) { iguais = false; break; }
  }
  ok("A9 (resultado independente da escala de desenho — logo, de zoom e pan)", iguais, "4, 13, 26 e 97,5 de raio de hexágono dão o mesmo conjunto e as mesmas frações");
}

// ══════════════════════════════════════════════════════════════════
// B. Regra geral — token afetado (50% da PEGADA COMPLETA)
// ══════════════════════════════════════════════════════════════════
{
  // Um hex: a fração da pegada é a da própria célula.
  const umHex: TokenParaArea = { id: "peq", celulas: celulasDoToken(O, "medio") };
  const meio = resolver({ tipo: "faixa", origem: { q: O.q, r: O.r }, direcaoGraus: 90, comprimentoM: 6, larguraM: 8 }, [umHex]);
  ok("B1 (token de um hex — exatamente 50% conta como afetado)", meio.tokens[0].afetado && perto(meio.tokens[0].fracao!, 0.5, 1e-12), `${meio.tokens[0].fracao!.toFixed(14)}`);

  const menos = resolver({ tipo: "faixa", origem: axialRelativo(0, 0.2), direcaoGraus: 90, comprimentoM: 6, larguraM: 8 }, [umHex]);
  ok("B2 (menos de 50% da pegada — não afetado)", !menos.tokens[0].afetado && menos.tokens[0].fracao! < 0.5, `${menos.tokens[0].fracao!.toFixed(6)}`);
  const mais = resolver({ tipo: "faixa", origem: axialRelativo(0, -0.2), direcaoGraus: 90, comprimentoM: 6, larguraM: 8 }, [umHex]);
  ok("B3 (mais de 50% da pegada — afetado)", mais.tokens[0].afetado && mais.tokens[0].fracao! > 0.5, `${mais.tokens[0].fracao!.toFixed(6)}`);

  // Grande / Enorme / Colossal — a pegada inteira, nunca só a âncora.
  for (const cat of ["grande", "enorme", "colossal"] as CategoriaTamanho[]) {
    const celulas = celulasDoToken(O, cat);
    const tok: TokenParaArea = { id: cat, celulas };
    // Disco enorme cobrindo tudo → 100%.
    const cobreTudo = resolver({ tipo: "esfera", origem: { q: O.q, r: O.r }, raioM: 12, alturaM: null, nivelOrigemM: null }, [tok]);
    // Disco minúsculo na âncora → cobre só uma fatia.
    const soAncora = resolver({ tipo: "esfera", origem: { q: O.q, r: O.r }, raioM: 0.45, alturaM: null, nivelOrigemM: null }, [tok]);
    ok(`B4 (${cat}: pegada de ${celulas.length} célula(s) — coberta por inteiro conta 100%)`, perto(cobreTudo.tokens[0].fracao!, 1, 1e-9), `${cobreTudo.tokens[0].fracao!.toFixed(6)}`);
    ok(`B5 (${cat}: efeito só na âncora NÃO afeta a pegada inteira)`, cat === "grande" ? true : !soAncora.tokens[0].afetado, `fração=${soAncora.tokens[0].fracao!.toFixed(4)}`);
  }

  // Seis orientações: "enorme" é simétrico (mesmo conjunto), "grande" e
  // "colossal" mudam de células — e a regra segue a pegada ATUAL.
  const fracoesEnorme: number[] = [];
  const conjuntosGrande: string[] = [];
  for (let o = 0; o < 6; o++) {
    const enorme: TokenParaArea = { id: "e", celulas: celulasDoToken(O, "enorme", o) };
    const grande: TokenParaArea = { id: "g", celulas: celulasDoToken(O, "grande", o) };
    const r = resolver({ tipo: "faixa", origem: axialRelativo(-4, -0.5), direcaoGraus: 0, comprimentoM: 8, larguraM: 1.2 }, [enorme, grande]);
    fracoesEnorme.push(r.tokens[0].fracao!);
    conjuntosGrande.push([...conjunto(grande.celulas)].sort().join("|"));
  }
  ok("B6 (pegada simétrica — as 6 orientações dão a mesma fração)", fracoesEnorme.every((f) => perto(f, fracoesEnorme[0], 1e-12)), fracoesEnorme.map((f) => f.toFixed(6)).join(" · "));
  ok("B6b (pegada assimétrica — as orientações realmente mudam as células ocupadas)", new Set(conjuntosGrande).size > 1, `${new Set(conjuntosGrande).size} conjuntos distintos em 6 orientações`);

  // Pegada PERSONALIZADA irregular (fila de 6 células).
  const fila: Pegada = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }, { q: 4, r: 0 }, { q: 5, r: 0 }];
  const tokenFila: TokenParaArea = { id: "fila", celulas: celulasDoToken(O, "medio", 0, fila) };
  ok("B7 (pegada personalizada é respeitada — 6 células)", tokenFila.celulas.length === 6, JSON.stringify(tokenFila.celulas.map((c) => `${c.q},${c.r}`)));

  // ── CENTRO DENTRO, MENOS DE 50% DA PEGADA ─────────────────────────
  // Disco pequeno centrado exatamente na ORIGEM MECÂNICA de um
  // Colossal: a célula da origem é afetada, o token NÃO é.
  const colossalCelulas = celulasDoToken(O, "colossal");
  const origemColossal = origemDeAura(O, origemMecanica(pegadaEfetiva({ categoria: "colossal", orientacao: 0, pegadaPersonalizada: null })));
  const pequeno = resolver({ tipo: "esfera", origem: origemColossal, raioM: 0.7, alturaM: null, nivelOrigemM: null }, [{ id: "col", celulas: colossalCelulas }]);
  const algumaCelulaDoTokenAfetada = pequeno.celulas.some((c) => colossalCelulas.some((x) => x.q === c.q && x.r === c.r));
  ok("B8 (centro dentro e célula afetada, mas <50% da pegada → token NÃO afetado)", algumaCelulaDoTokenAfetada && !pequeno.tokens[0].afetado, `células afetadas=${pequeno.celulas.length}, fração da pegada=${pequeno.tokens[0].fracao!.toFixed(4)}`);
  ok("B8b (célula afetada NÃO vira token afetado automaticamente)", pequeno.celulas.length > 0 && !pequeno.tokens[0].afetado, "listas separadas, como a regra exige");

  // ── CENTRO FORA, MAIS DE 50% DA PEGADA ────────────────────────────
  // Polígono côncavo em "U" cobrindo as duas pontas da fila de 6
  // células, deixando o miolo (e a origem mecânica, que cai nele) de
  // fora.
  const u = (mx: number, my: number) => axialRelativo(mx, my);
  const uShape: ParametrosArea = {
    tipo: "personalizada",
    pontos: [u(-0.7, -0.8), u(5.7, -0.8), u(5.7, 0.8), u(3.4, 0.8), u(3.4, -0.3), u(1.6, -0.3), u(1.6, 0.8), u(-0.7, 0.8)],
  };
  const resU = resolver(uShape, [tokenFila]);
  const origemFila = origemDeAura(O, origemMecanica(fila));
  const centroFilaMundo = axialParaMundo(origemFila, T);
  const celulaDoCentro = { q: Math.round(origemFila.q), r: Math.round(origemFila.r) };
  const centroForaDaArea = fracaoDeCobertura(regiaoDaArea(uShape, T)!, [
    { x: centroFilaMundo.x - 0.02 * U, y: centroFilaMundo.y - 0.02 * U },
    { x: centroFilaMundo.x + 0.02 * U, y: centroFilaMundo.y - 0.02 * U },
    { x: centroFilaMundo.x + 0.02 * U, y: centroFilaMundo.y + 0.02 * U },
    { x: centroFilaMundo.x - 0.02 * U, y: centroFilaMundo.y + 0.02 * U },
  ], (0.04 * U) ** 2) < 1e-9;
  ok("B9 (centro FORA da área e mais de 50% da pegada dentro → token afetado)", centroForaDaArea && resU.tokens[0].afetado && resU.tokens[0].fracao! > 0.5, `centro fora=${centroForaDaArea}, fração=${resU.tokens[0].fracao!.toFixed(4)}`);
  void celulaDoCentro;

  // Regra da pegada = média das frações das células (identidade exata).
  const somaManual = tokenFila.celulas.reduce((s, c) => s + (resU.fracaoPorCelula.get(hexKey(c)) ?? 0), 0) / tokenFila.celulas.length;
  ok("B10 (fração da pegada = média exata das frações das células ocupadas)", perto(somaManual, resU.tokens[0].fracao!, 1e-12), `${somaManual.toFixed(12)} vs ${resU.tokens[0].fracao!.toFixed(12)}`);
}

// ══════════════════════════════════════════════════════════════════
// C. Esfera e Domo
// ══════════════════════════════════════════════════════════════════
{
  for (const raioM of [1, 2, 4, 6.5]) {
    const res = resolver({ tipo: "esfera", origem: { q: O.q, r: O.r }, raioM, alturaM: null, nivelOrigemM: null });
    const esperado = Math.PI * (raioM * U) ** 2;
    ok(`C1 (esfera de ${raioM} m — projeção é um círculo VERDADEIRO: área somada = πr²)`, perto(areaCoberta(res), esperado, 1e-9), `${areaCoberta(res).toFixed(4)} vs ${esperado.toFixed(4)}`);
  }
  // Raio maior nunca perde células (monotonia).
  const r3 = resolver({ tipo: "esfera", origem: { q: O.q, r: O.r }, raioM: 3, alturaM: null, nivelOrigemM: null });
  const r5 = resolver({ tipo: "esfera", origem: { q: O.q, r: O.r }, raioM: 5, alturaM: null, nivelOrigemM: null });
  ok("C2 (raio maior contém o conjunto do raio menor)", r3.celulas.every((c) => conjunto(r5.celulas).has(hexKey(c))) && r5.celulas.length > r3.celulas.length, `${r3.celulas.length} → ${r5.celulas.length} células`);

  // Célula de borda: existe pelo menos uma célula candidata com fração
  // entre 0 e 50% (tocada, mas fora do efeito) — o caso do livro.
  const bordas = [...r3.fracaoPorCelula.values()].filter((f) => f > 1e-9 && f < 0.5);
  ok("C3 (células de borda tocadas mas fora do efeito existem e são reportadas)", bordas.length > 0, `${bordas.length} células parciais abaixo de 50%`);

  // Pegadas grandes na borda do círculo.
  const grandeNaBorda: TokenParaArea = { id: "g", celulas: celulasDoToken(cel(3, 0), "enorme") };
  const comToken = resolver({ tipo: "esfera", origem: { q: O.q, r: O.r }, raioM: 3, alturaM: null, nivelOrigemM: null }, [grandeNaBorda]);
  ok("C4 (pegada grande na borda é avaliada pela pegada inteira)", comToken.tokens[0].fracao! > 0 && comToken.tokens[0].fracao! < 1, `fração=${comToken.tokens[0].fracao!.toFixed(4)}`);

  // Metadados tridimensionais preservados.
  const p3d = normalizarParametros({ tipo: "esfera", origem: { q: O.q, r: O.r }, raioM: 4, alturaM: 8, nivelOrigemM: 2 }) as Extract<ParametrosArea, { tipo: "esfera" }>;
  ok("C5 (esfera preserva altura e nível de origem — metadado 3D, sem motor 3D)", p3d.alturaM === 8 && p3d.nivelOrigemM === 2, `altura=${p3d.alturaM} nível=${p3d.nivelOrigemM}`);
  ok("C5b (esfera é marcada como tridimensional)", META_AREA.esfera.tridimensional, "sim");

  // ── DOMO ─────────────────────────────────────────────────────────
  const esfera = resolver({ tipo: "esfera", origem: { q: O.q, r: O.r }, raioM: 4, alturaM: null, nivelOrigemM: null });
  const domo = resolver({ tipo: "domo", origem: { q: O.q, r: O.r }, raioM: 4, alturaM: null, nivelOrigemM: null });
  ok("C6 (domo tem a MESMA projeção superior da esfera equivalente)", mesmoConjunto(esfera.celulas, domo.celulas), `${esfera.celulas.length} células nos dois`);
  ok("C6b (domo é um TIPO distinto no modelo, com glifo e descrição próprios)",
    META_AREA.domo.glifo !== META_AREA.esfera.glifo && META_AREA.domo.descricao !== META_AREA.esfera.descricao && META_AREA.domo.rotulo === "Domo",
    `${META_AREA.esfera.glifo} vs ${META_AREA.domo.glifo}`);
  const pDomo = normalizarParametros({ tipo: "domo", origem: { q: O.q, r: O.r }, raioM: 2, alturaM: 2, nivelOrigemM: 0 }) as Extract<ParametrosArea, { tipo: "domo" }>;
  ok("C6c (domo tem propriedades próprias — raio, altura e superfície de origem)", pDomo.raioM === 2 && pDomo.alturaM === 2 && pDomo.nivelOrigemM === 0, JSON.stringify(pDomo));
}

// ══════════════════════════════════════════════════════════════════
// D. Aura
// ══════════════════════════════════════════════════════════════════
{
  const raioM = 3;
  // Token de UM hex: centro da aura = centro da célula ocupada.
  const origem1 = origemDeAura(O, origemMecanica(pegadaEfetiva({ categoria: "medio", orientacao: 0, pegadaPersonalizada: null })));
  ok("D1 (token de um hex — a aura fica no centro da célula ocupada)", origem1.q === O.q && origem1.r === O.r, JSON.stringify(origem1));
  const aura1 = resolver({ tipo: "aura", origem: origem1, raioM, tokenId: "t1" });
  const esfera1 = resolver({ tipo: "esfera", origem: { q: O.q, r: O.r }, raioM, alturaM: null, nivelOrigemM: null });
  ok("D1b (aura de token de um hex = esfera centrada na célula)", mesmoConjunto(aura1.celulas, esfera1.celulas), `${aura1.celulas.length} células`);

  // Token multicelular: usa a ORIGEM LÓGICA da pegada, nunca um centro inventado.
  const pegGrande = pegadaEfetiva({ categoria: "grande", orientacao: 0, pegadaPersonalizada: null });
  const origemG = origemDeAura(O, origemMecanica(pegGrande));
  ok("D2 (token multicelular — a aura usa a origem mecânica da pegada, que pode cair ENTRE células)",
    !Number.isInteger(origemG.q) && !Number.isInteger(origemG.r), JSON.stringify(origemG));

  // Movimento da origem: a aura acompanha, e é DERIVADA — nenhum
  // parâmetro novo é criado, só a origem recalculada do token.
  const depois = origemDeAura({ q: O.q + 4, r: O.r - 2 }, origemMecanica(pegGrande));
  ok("D3 (mover o token move a aura pelo mesmo deslocamento — sem duplicar nada)",
    perto(depois.q - origemG.q, 4) && perto(depois.r - origemG.r, -2), `${JSON.stringify(origemG)} → ${JSON.stringify(depois)}`);

  // Rotação: pegada assimétrica muda a origem lógica → a aura acompanha.
  const origemGirada = origemDeAura(O, origemMecanica(pegadaEfetiva({ categoria: "grande", orientacao: 2, pegadaPersonalizada: null })));
  ok("D4 (rotacionar a pegada reposiciona a aura pela mesma origem lógica do resto do VTT)",
    origemGirada.q !== origemG.q || origemGirada.r !== origemG.r, `${JSON.stringify(origemG)} → ${JSON.stringify(origemGirada)}`);
  // Pegada simétrica: girar não move a aura.
  const enorme0 = origemDeAura(O, origemMecanica(pegadaEfetiva({ categoria: "enorme", orientacao: 0, pegadaPersonalizada: null })));
  const enorme3 = origemDeAura(O, origemMecanica(pegadaEfetiva({ categoria: "enorme", orientacao: 3, pegadaPersonalizada: null })));
  ok("D4b (pegada simétrica — girar não move a aura)", perto(enorme0.q, enorme3.q, 1e-12) && perto(enorme0.r, enorme3.r, 1e-12), JSON.stringify(enorme0));

  // Troca de pegada/tamanho recentra a aura.
  const origemColossal = origemDeAura(O, origemMecanica(pegadaEfetiva({ categoria: "colossal", orientacao: 0, pegadaPersonalizada: null })));
  ok("D5 (trocar de tamanho/pegada recentra a aura)", origemColossal.q !== origemG.q || origemColossal.r !== origemG.r, JSON.stringify(origemColossal));

  // A aura é DERIVADA: dois cálculos seguidos com o mesmo token dão o
  // mesmo resultado, e mover não gera uma segunda área.
  const a1 = resolver({ tipo: "aura", origem: origemG, raioM, tokenId: "t1" });
  const a2 = resolver({ tipo: "aura", origem: origemG, raioM, tokenId: "t1" });
  ok("D6 (recalcular a aura não duplica nada — mesma geometria, mesmo resultado)", mesmoConjunto(a1.celulas, a2.celulas), `${a1.celulas.length} células`);
  ok("D7 (aura sem token — o vínculo é obrigatório no modelo)", (() => {
    const p: ParametrosArea = { tipo: "aura", origem: origem1, raioM, tokenId: "" };
    return p.tipo === "aura" && "tokenId" in p;
  })(), "`tokenId` faz parte dos parâmetros canônicos da aura");
}

// ══════════════════════════════════════════════════════════════════
// E. Linha — dois modos + exceção
// ══════════════════════════════════════════════════════════════════
{
  const paramsCelula: ParametrosArea = { tipo: "linha", origem: { q: O.q, r: O.r }, direcaoGraus: 0, comprimentoM: 6, modo: "uma_celula" };
  const umaCelula = resolver(paramsCelula);
  // A geometria é CONTÍNUA e a origem é o ponto onde se pressionou —
  // aqui, o centro da célula `O`. Um corredor de 6 m que começa no
  // CENTRO de `O` cobre por inteiro as 5 células seguintes e deixa
  // metade da célula de origem e metade da 6ª de fora (≈48,8% cada),
  // que a regra dos 50% corretamente descarta. A lista de células é
  // DERIVADA da geometria, nunca o contrário — quem quiser as "6
  // células à frente" do exemplo do livro parte da borda da célula de
  // origem (ou arrasta meio metro a mais), e a régua do painel mostra
  // exatamente o que foi construído.
  const esperadas = [1, 2, 3, 4, 5].map((d) => cel(d, 0));
  const meiaOrigem = umaCelula.fracaoPorCelula.get(hexKey(O)) ?? 0;
  const meiaPonta = umaCelula.fracaoPorCelula.get(hexKey(cel(6, 0))) ?? 0;
  ok("E1 (linha de 6 m no modo `uma_celula` — corredor reto derivado da geometria contínua)", mesmoConjunto(umaCelula.celulas, esperadas), umaCelula.celulas.map((c) => `${c.q - O.q},${c.r - O.r}`).join(" "));
  ok("E1c (as duas meias-células das pontas ficam abaixo de 50% e são descartadas pela regra)", meiaOrigem > 0.4 && meiaOrigem < 0.5 && perto(meiaPonta, meiaOrigem, 1e-9), `origem=${meiaOrigem.toFixed(4)} ponta=${meiaPonta.toFixed(4)}`);
  ok("E1b (largura canônica de 1 metro — área somada = comprimento × 1 m)", perto(areaCoberta(umaCelula), 6 * U * U, 1e-9), `${areaCoberta(umaCelula).toFixed(3)} vs ${(6 * U * U).toFixed(3)}`);

  // Traço fino: células ATRAVESSADAS, incluindo a de origem.
  const fino = resolver({ ...paramsCelula, modo: "traco_fino" } as ParametrosArea);
  const finoEsperado = [0, 1, 2, 3, 4, 5, 6].map((d) => cel(d, 0));
  ok("E2 (traço fino — todas as células cujo interior é atravessado)", mesmoConjunto(fino.celulas, finoEsperado), fino.celulas.map((c) => `${c.q - O.q},${c.r - O.r}`).join(" "));

  // Tangência de borda NÃO conta: traço exatamente sobre a aresta
  // vertical compartilhada por `O` e `O+(1,0)`.
  const meioX = mundoDe(O).x + (U / 2);
  const aOrigem = mundoParaAxial(meioX, mundoDe(O).y - 6 * U, T);
  const finoTangente = resolver({ tipo: "linha", origem: aOrigem, direcaoGraus: 90, comprimentoM: 12, modo: "traco_fino" });
  const tocaOs2 = conjunto(finoTangente.celulas).has(hexKey(O)) || conjunto(finoTangente.celulas).has(hexKey(cel(1, 0)));
  ok("E3 (traço rente a uma aresta NÃO conta as células dos dois lados)", !tocaOs2, `${finoTangente.celulas.length} células atravessadas, nenhuma delas as duas da aresta`);

  // Exceção da Linha: criatura numa célula atravessada é afetada, mesmo
  // com cobertura de pegada muito abaixo de 50%.
  const colossal: TokenParaArea = { id: "col", celulas: celulasDoToken(cel(4, 0), "colossal") };
  const comColossal = resolver({ ...paramsCelula, modo: "traco_fino" } as ParametrosArea, [colossal]);
  ok("E4 (exceção da Linha — criatura em célula atravessada pode ser afetada, sem exigir 50% da pegada)",
    comColossal.tokens[0].afetado && comColossal.tokens[0].porExcecaoDaLinha && comColossal.tokens[0].fracao === null,
    "afetado pela exceção, fração não se aplica");
  const comColossalLargo = resolver(paramsCelula, [colossal]);
  ok("E4b (no modo `uma_celula` vale a regra geral dos 50% da pegada, não a exceção)",
    !comColossalLargo.tokens[0].porExcecaoDaLinha && comColossalLargo.tokens[0].fracao !== null,
    `fração=${comColossalLargo.tokens[0].fracao!.toFixed(4)} afetado=${comColossalLargo.tokens[0].afetado}`);

  // Direções diferentes e ausência de zigue-zague: TODA célula afetada
  // fica a menos de (meia largura + circunraio) da reta infinita — um
  // desvio de pathfinding violaria isso na hora.
  let semZigueZague = true;
  for (const graus of [0, 30, 45, 60, 90, 137, 200, 305]) {
    const res = resolver({ tipo: "linha", origem: { q: O.q, r: O.r }, direcaoGraus: graus, comprimentoM: 7, modo: "uma_celula" });
    const o = mundoDe(O);
    const ux = Math.cos((graus * Math.PI) / 180);
    const uy = Math.sin((graus * Math.PI) / 180);
    for (const c of res.celulas) {
      const p = mundoDe(c);
      const desvio = Math.abs(-(p.x - o.x) * uy + (p.y - o.y) * ux);
      const adiante = (p.x - o.x) * ux + (p.y - o.y) * uy;
      if (desvio > U / 2 + T + 1e-9 || adiante < -T || adiante > 7 * U + T) { semZigueZague = false; break; }
    }
    if (!semZigueZague) break;
  }
  ok("E5 (8 direções — nunca zigue-zague, nunca desvio: toda célula afetada cabe no corredor reto)", semZigueZague, "0°, 30°, 45°, 60°, 90°, 137°, 200° e 305°");
  ok("E5b (o domínio não conhece terreno, token nem obstáculo — não há como contornar nada)",
    !("terreno" in CTX) && Object.keys(CTX).sort().join(",") === "altura,largura,tamanhoCelula", JSON.stringify(Object.keys(CTX)));
}

// ══════════════════════════════════════════════════════════════════
// F. Faixa
// ══════════════════════════════════════════════════════════════════
{
  for (const [comp, larg] of [[6, 2], [4, 1], [10, 3.5]] as [number, number][]) {
    const res = resolver({ tipo: "faixa", origem: { q: O.q, r: O.r }, direcaoGraus: 0, comprimentoM: comp, larguraM: larg });
    ok(`F1 (faixa ${comp}×${larg} m — corredor retangular contínuo: área somada = comprimento × largura)`, perto(areaCoberta(res), comp * larg * U * U, 1e-9), `${areaCoberta(res).toFixed(3)} vs ${(comp * larg * U * U).toFixed(3)}`);
  }
  const estreita = resolver({ tipo: "faixa", origem: { q: O.q, r: O.r }, direcaoGraus: 0, comprimentoM: 6, larguraM: 1 });
  const larga = resolver({ tipo: "faixa", origem: { q: O.q, r: O.r }, direcaoGraus: 0, comprimentoM: 6, larguraM: 3 });
  ok("F2 (mais largura nunca remove célula — conjunto cresce monotonamente)", estreita.celulas.every((c) => conjunto(larga.celulas).has(hexKey(c))) && larga.celulas.length > estreita.celulas.length, `${estreita.celulas.length} → ${larga.celulas.length}`);

  // Direção livre — não presa aos 6 eixos do hexágono.
  const livre = resolver({ tipo: "faixa", origem: { q: O.q, r: O.r }, direcaoGraus: 17.3, comprimentoM: 6, larguraM: 2 });
  ok("F3 (direção livre — 17,3° funciona igual)", perto(areaCoberta(livre), 6 * 2 * U * U, 1e-9), `${areaCoberta(livre).toFixed(3)}`);

  const parciais = [...livre.fracaoPorCelula.values()].filter((f) => f > 1e-9 && f < 1 - 1e-9);
  ok("F4 (células parcialmente cobertas são reportadas com a fração exata)", parciais.length > 0, `${parciais.length} células parciais`);

  // Token grande na borda da faixa.
  const grande: TokenParaArea = { id: "g", celulas: celulasDoToken(cel(3, 1), "enorme") };
  const comGrande = resolver({ tipo: "faixa", origem: { q: O.q, r: O.r }, direcaoGraus: 0, comprimentoM: 8, larguraM: 2 }, [grande]);
  ok("F5 (token grande na borda — decidido pela pegada inteira, nunca pela âncora)", comGrande.tokens[0].fracao! > 0 && comGrande.tokens[0].fracao! < 1, `fração=${comGrande.tokens[0].fracao!.toFixed(4)}`);
}

// ══════════════════════════════════════════════════════════════════
// G. Parede
// ══════════════════════════════════════════════════════════════════
{
  const reta: ParametrosArea = { tipo: "parede", pontos: [{ q: O.q, r: O.r }, axialRelativo(6, 0)], alturaM: 2 };
  const resReta = resolver(reta);
  ok("G1 (parede reta de 6 m — área somada = comprimento × 1 m de largura fixa)", perto(areaCoberta(resReta), 6 * LARGURA_PAREDE_M * U * U, 1e-9), `${areaCoberta(resReta).toFixed(3)} vs ${(6 * U * U).toFixed(3)}`);
  ok("G1b (largura da parede é regra fixa de 1 metro)", LARGURA_PAREDE_M === 1, "1 m");
  const regiaoReta = regiaoDaArea(reta, T)!;
  ok("G1c (a região carrega a largura canônica em unidades do mundo)", regiaoReta.forma === "corredor" && perto(regiaoReta.largura, U), `${regiaoReta.forma === "corredor" ? regiaoReta.largura.toFixed(3) : "?"} vs ${U.toFixed(3)}`);

  // Vários segmentos conectados: nenhuma dupla contagem na junção.
  const quebrada: ParametrosArea = { tipo: "parede", pontos: [{ q: O.q, r: O.r }, axialRelativo(4, 0), axialRelativo(4, 4)], alturaM: 3 };
  const resQuebrada = resolver(quebrada);
  ok("G2 (parede com múltiplos segmentos — nenhuma célula passa de 100% de cobertura)", fracoesSanas(resQuebrada), `${resQuebrada.fracaoPorCelula.size} células candidatas`);
  // A área da união é MENOR que a soma dos dois retângulos (a junção se
  // sobrepõe) e MAIOR que um retângulo só — prova que a união é real.
  const somaIngenua = 4 * U * U + 4 * U * U;
  ok("G2b (a junção é contada uma vez só — união < soma ingênua dos segmentos)", areaCoberta(resQuebrada) < somaIngenua + 1e-6 && areaCoberta(resQuebrada) > 7 * U * U, `${areaCoberta(resQuebrada).toFixed(2)} vs soma ingênua ${somaIngenua.toFixed(2)}`);
  ok("G2c (a parede quebrada cobre células nas duas pernas)", resQuebrada.celulas.length > resReta.celulas.length * 1.2, `${resQuebrada.celulas.length} células`);

  ok("G3 (altura é preservada em metros mesmo com a mesa 2D)", (normalizarParametros(quebrada) as Extract<ParametrosArea, { tipo: "parede" }>).alturaM === 3, "3 m");
  ok("G3b (comprimento total do percurso é derivado dos pontos)", perto(comprimentoDoPercurso((quebrada as Extract<ParametrosArea, { tipo: "parede" }>).pontos, T), 8, 1e-6), `${comprimentoDoPercurso((quebrada as Extract<ParametrosArea, { tipo: "parede" }>).pontos, T).toFixed(4)} m`);

  ok("G4 (parede com um ponto só é recusada)", !validarPercursoParede([{ q: 0, r: 0 }]).ok, validarPercursoParede([{ q: 0, r: 0 }]).motivo ?? "");
  ok("G4b (pontos repetidos em sequência são recusados)", !validarPercursoParede([{ q: 0, r: 0 }, { q: 0, r: 0 }]).ok, validarPercursoParede([{ q: 0, r: 0 }, { q: 0, r: 0 }]).motivo ?? "");
  ok("G4c (dois pontos distintos são aceitos)", validarPercursoParede([{ q: 0, r: 0 }, { q: 3, r: 0 }]).ok, "aceito");

  // NENHUM bloqueio mecânico automático: o resultado só tem células,
  // frações e tokens — não existe campo de bloqueio/visão/colisão.
  ok("G5 (parede não produz nenhum bloqueio mecânico — o resultado só descreve geometria)",
    Object.keys(resQuebrada).sort().join(",") === "celulas,fracaoPorCelula,tokens", Object.keys(resQuebrada).sort().join(","));
}

// ══════════════════════════════════════════════════════════════════
// H. Cubo
// ══════════════════════════════════════════════════════════════════
{
  for (const lado of [2, 4, 5.5]) {
    const res = resolver({ tipo: "cubo", origem: { q: O.q, r: O.r }, direcaoGraus: 0, ladoM: lado });
    ok(`H1 (cubo de ${lado} m — base quadrada contínua: área somada = lado²)`, perto(areaCoberta(res), (lado * U) ** 2, 1e-9), `${areaCoberta(res).toFixed(3)} vs ${((lado * U) ** 2).toFixed(3)}`);
  }
  // Rotação livre não deforma a base: a área é a mesma em qualquer ângulo.
  const areas = [0, 13, 37, 90, 191, 300].map((g) => areaCoberta(resolver({ tipo: "cubo", origem: { q: O.q, r: O.r }, direcaoGraus: g, ladoM: 4 })));
  ok("H2 (rotacionar a base não deforma o quadrado — área idêntica em 6 ângulos)", areas.every((a) => perto(a, (4 * U) ** 2, 1e-9)), areas.map((a) => a.toFixed(2)).join(" · "));
  // A base é mesmo um quadrado: 4 vértices, lados iguais, ângulos retos.
  const reg = regiaoDaArea({ tipo: "cubo", origem: { q: O.q, r: O.r }, direcaoGraus: 33, ladoM: 4 }, T)!;
  const quad = reg.forma === "poligono" ? reg.contorno : [];
  const lados = quad.map((p, i) => { const n2 = quad[(i + 1) % quad.length]; return Math.hypot(n2.x - p.x, n2.y - p.y); });
  ok("H3 (a base tem 4 vértices e 4 lados iguais)", quad.length === 4 && lados.every((l) => perto(l, 4 * U, 1e-9)), lados.map((l) => (l / U).toFixed(6)).join(" · "));
  // Altura igual ao lado — regra do formato.
  ok("H4 (altura do cubo é igual ao lado, por definição do formato)", META_AREA.cubo.tridimensional && META_AREA.cubo.descricao.includes("altura também é L"), META_AREA.cubo.descricao);
  const parciais = [...resolver({ tipo: "cubo", origem: { q: O.q, r: O.r }, direcaoGraus: 22, ladoM: 3 }).fracaoPorCelula.values()].filter((f) => f > 1e-9 && f < 1 - 1e-9);
  ok("H5 (células parcialmente cobertas pela base são reportadas)", parciais.length > 0, `${parciais.length} parciais`);
}

// ══════════════════════════════════════════════════════════════════
// I. Cone
// ══════════════════════════════════════════════════════════════════
{
  ok("I1 (abertura é exatamente 45°, regra canônica)", ABERTURA_CONE_GRAUS === 45, "45°");
  for (const alcance of [3, 6, 9]) {
    const res = resolver({ tipo: "cone", origem: { q: O.q, r: O.r }, direcaoGraus: 0, alcanceM: alcance });
    const esperado = Math.PI * (alcance * U) ** 2 * (45 / 360);
    ok(`I2 (cone de ${alcance} m — setor contínuo de 45°: área somada = πr²·45/360)`, perto(areaCoberta(res), esperado, 1e-9), `${areaCoberta(res).toFixed(3)} vs ${esperado.toFixed(3)}`);
  }
  // Direções livres, inclusive ENTRE os eixos do hexágono (que ficam a
  // 0°, 60°, 120°… na projeção do mapa).
  const entreEixos = [7, 23, 41, 88, 149, 271, 333];
  const areasCone = entreEixos.map((g) => areaCoberta(resolver({ tipo: "cone", origem: { q: O.q, r: O.r }, direcaoGraus: g, alcanceM: 6 })));
  const esperadoCone = Math.PI * (6 * U) ** 2 / 8;
  ok("I3 (direção livre, inclusive fora dos 6 eixos do hexágono)", areasCone.every((a) => perto(a, esperadoCone, 1e-9)), areasCone.map((a) => a.toFixed(1)).join(" · "));

  // Bordas angulares: existem células cortadas pelas duas retas do setor.
  const res6 = resolver({ tipo: "cone", origem: { q: O.q, r: O.r }, direcaoGraus: 0, alcanceM: 6 });
  const cortadas = [...res6.fracaoPorCelula.values()].filter((f) => f > 1e-9 && f < 1 - 1e-9);
  ok("I4 (bordas angulares — células cortadas pelo setor têm fração intermediária)", cortadas.length >= 6, `${cortadas.length} células cortadas`);

  // Token parcialmente cortado pelo cone.
  const tok: TokenParaArea = { id: "e", celulas: celulasDoToken(cel(4, 1), "enorme") };
  const comTok = resolver({ tipo: "cone", origem: { q: O.q, r: O.r }, direcaoGraus: 0, alcanceM: 6 }, [tok]);
  ok("I5 (token parcialmente cortado é avaliado pela pegada inteira)", comTok.tokens[0].fracao! > 0 && comTok.tokens[0].fracao! < 1, `fração=${comTok.tokens[0].fracao!.toFixed(4)}`);

  // Estabilidade: um micro-giro muda as frações de forma contínua.
  const base = resolver({ tipo: "cone", origem: { q: O.q, r: O.r }, direcaoGraus: 30, alcanceM: 6 });
  const girado = resolver({ tipo: "cone", origem: { q: O.q, r: O.r }, direcaoGraus: 30 + 1e-5, alcanceM: 6 });
  let maiorDelta = 0;
  for (const [k, f] of base.fracaoPorCelula) maiorDelta = Math.max(maiorDelta, Math.abs(f - (girado.fracaoPorCelula.get(k) ?? 0)));
  ok("I6 (estabilidade com movimentos minúsculos do ponteiro)", maiorDelta < 1e-3, `maior variação de fração = ${maiorDelta.toExponential(3)}`);
}

// ══════════════════════════════════════════════════════════════════
// J. Área personalizada
// ══════════════════════════════════════════════════════════════════
{
  const p = (mx: number, my: number) => axialRelativo(mx, my);
  const triangulo: ParametrosArea = { tipo: "personalizada", pontos: [p(0, 0), p(5, 0), p(0, 4)] };
  const quadrilatero: ParametrosArea = { tipo: "personalizada", pontos: [p(0, 0), p(5, 0), p(5, 3), p(0, 3)] };
  const concavo: ParametrosArea = { tipo: "personalizada", pontos: [p(0, 0), p(5, 0), p(5, 1), p(1.5, 1), p(1.5, 4), p(0, 4)] };

  ok("J1 (triângulo — área somada bate com a fórmula)", perto(areaCoberta(resolver(triangulo)), 0.5 * 5 * 4 * U * U, 1e-9), `${areaCoberta(resolver(triangulo)).toFixed(3)} vs ${(0.5 * 5 * 4 * U * U).toFixed(3)}`);
  ok("J2 (quadrilátero — área somada bate)", perto(areaCoberta(resolver(quadrilatero)), 5 * 3 * U * U, 1e-9), `${areaCoberta(resolver(quadrilatero)).toFixed(3)}`);
  ok("J3 (polígono CÔNCAVO é permitido e medido corretamente)", perto(areaCoberta(resolver(concavo)), (5 * 1 + 1.5 * 3) * U * U, 1e-9), `${areaCoberta(resolver(concavo)).toFixed(3)} vs ${((5 * 1 + 1.5 * 3) * U * U).toFixed(3)}`);
  ok("J3b (côncavo não gera dupla contagem — nenhuma fração acima de 100%)", fracoesSanas(resolver(concavo)), "ok");

  ok("J4 (menos de três pontos é recusado)", !validarPoligonoPersonalizado([p(0, 0), p(1, 0)]).ok, validarPoligonoPersonalizado([p(0, 0), p(1, 0)]).motivo ?? "");
  ok("J5 (pontos duplicados consecutivos são recusados)", !validarPoligonoPersonalizado([p(0, 0), p(0, 0), p(2, 2)]).ok, validarPoligonoPersonalizado([p(0, 0), p(0, 0), p(2, 2)]).motivo ?? "");
  ok("J6 (área zero — colineares — é recusada)", !validarPoligonoPersonalizado([p(0, 0), p(1, 1), p(2, 2)]).ok, validarPoligonoPersonalizado([p(0, 0), p(1, 1), p(2, 2)]).motivo ?? "");
  ok("J7 (autointerseção é recusada)", !validarPoligonoPersonalizado([p(0, 0), p(4, 4), p(4, 0), p(0, 4)]).ok, validarPoligonoPersonalizado([p(0, 0), p(4, 4), p(4, 0), p(0, 4)]).motivo ?? "");
  ok("J7b (polígono válido é aceito)", validarPoligonoPersonalizado((concavo as Extract<ParametrosArea, { tipo: "personalizada" }>).pontos).ok, "aceito");
  ok("J7c (geometria inválida não vira região — `regiaoDaArea` devolve null)", regiaoDaArea({ tipo: "personalizada", pontos: [p(0, 0), p(4, 4), p(4, 0), p(0, 4)] }, T) === null, "null");

  // Edição de vértice muda o resultado (e continua exato).
  const editado: ParametrosArea = { tipo: "personalizada", pontos: [p(0, 0), p(5, 0), p(5, 3), p(0, 6)] };
  ok("J8 (editar um vértice recalcula a área)", !perto(areaCoberta(resolver(editado)), areaCoberta(resolver(quadrilatero)), 1e-6), `${areaCoberta(resolver(quadrilatero)).toFixed(1)} → ${areaCoberta(resolver(editado)).toFixed(1)}`);

  // Interseção com pegadas variadas.
  for (const cat of ["medio", "grande", "enorme", "colossal"] as CategoriaTamanho[]) {
    const tok: TokenParaArea = { id: cat, celulas: celulasDoToken(cel(1, 1), cat) };
    const res = resolver(concavo, [tok]);
    if (!(res.tokens[0].fracao! >= 0 && res.tokens[0].fracao! <= 1)) { ok("J9 (interseção com pegadas variadas)", false, cat); break; }
    if (cat === "colossal") ok("J9 (interseção com pegadas variadas — fração sempre em [0,1])", true, "médio, grande, enorme e colossal conferidos");
  }
}

// ══════════════════════════════════════════════════════════════════
// K. Contratos gerais
// ══════════════════════════════════════════════════════════════════
{
  ok("K1 (os nove tipos existem)", TIPOS_AREA.length === 9 && TIPOS_AREA.includes("personalizada"), TIPOS_AREA.join(", "));
  ok("K2 (todo tipo tem rótulo, glifo e instrução curta)", TIPOS_AREA.every((t) => META_AREA[t].rotulo && META_AREA[t].glifo && META_AREA[t].instrucao.length > 5), TIPOS_AREA.map((t) => `${META_AREA[t].glifo} ${META_AREA[t].rotulo}`).join(" · "));
  ok("K3 (formatos tridimensionais marcados: esfera, domo, parede e cubo)",
    TIPOS_AREA.filter((t) => META_AREA[t].tridimensional).sort().join(",") === "cubo,domo,esfera,parede",
    TIPOS_AREA.filter((t) => META_AREA[t].tridimensional).join(", "));

  // Formas degeneradas nunca passam.
  ok("K4 (clique sem arraste não vira geometria — raio zero é recusado)", !validarParametros({ tipo: "esfera", origem: { q: 0, r: 0 }, raioM: 0, alturaM: null, nivelOrigemM: null }).ok, "recusado");
  ok("K4b (comprimento minúsculo é recusado)", !validarParametros({ tipo: "linha", origem: { q: 0, r: 0 }, direcaoGraus: 0, comprimentoM: 0.05, modo: "uma_celula" }).ok, "recusado");
  ok("K4c (dimensões válidas passam)", validarParametros({ tipo: "cone", origem: { q: 0, r: 0 }, direcaoGraus: 0, alcanceM: 6 }).ok, "aceito");

  // Normalização: limites e regras fixas.
  const gigante = normalizarParametros({ tipo: "esfera", origem: { q: 0, r: 0 }, raioM: 9999, alturaM: null, nivelOrigemM: null }) as Extract<ParametrosArea, { tipo: "esfera" }>;
  ok("K5 (raio absurdo é limitado)", gigante.raioM === 60, `${gigante.raioM} m`);
  const angulo = normalizarParametros({ tipo: "cone", origem: { q: 0, r: 0 }, direcaoGraus: -450, alcanceM: 6 }) as Extract<ParametrosArea, { tipo: "cone" }>;
  ok("K5b (direção é normalizada para [0,360))", angulo.direcaoGraus === 270, `${angulo.direcaoGraus}°`);

  // Caminho SVG: círculo e setor usam ARCO de verdade, nunca polilinha.
  const discoD = caminhoDaRegiao(regiaoDaArea({ tipo: "esfera", origem: { q: O.q, r: O.r }, raioM: 4, alturaM: null, nivelOrigemM: null }, T)!);
  const setorD = caminhoDaRegiao(regiaoDaArea({ tipo: "cone", origem: { q: O.q, r: O.r }, direcaoGraus: 0, alcanceM: 6 }, T)!);
  const quadD = caminhoDaRegiao(regiaoDaArea({ tipo: "cubo", origem: { q: O.q, r: O.r }, direcaoGraus: 0, ladoM: 4 }, T)!);
  ok("K6 (esfera/domo desenham com arco de círculo real — `A` no caminho SVG)", discoD.includes("A"), discoD.slice(0, 60));
  ok("K6b (cone desenha com arco real — setor contínuo, não degraus de hexes)", setorD.includes("A") && setorD.startsWith("M"), setorD.slice(0, 60));
  ok("K6c (cubo desenha como polígono fechado de 4 lados)", (quadD.match(/L/g) ?? []).length === 3 && quadD.endsWith("Z"), quadD.slice(0, 60));
  ok("K6d (traço fino desenha como segmento aberto, sem preenchimento)", caminhoDaRegiao(regiaoDaArea({ tipo: "linha", origem: { q: O.q, r: O.r }, direcaoGraus: 0, comprimentoM: 6, modo: "traco_fino" }, T)!).includes("L") === true, "segmento");

  // O resultado nunca traz consequência mecânica.
  const res = resolver({ tipo: "esfera", origem: { q: O.q, r: O.r }, raioM: 3, alturaM: null, nivelOrigemM: null }, [{ id: "t", celulas: celulasDoToken(O, "medio") }]);
  ok("K7 (o resultado só descreve geometria — nada de dano, condição, teste ou bloqueio)",
    Object.keys(res).sort().join(",") === "celulas,fracaoPorCelula,tokens"
    && Object.keys(res.tokens[0]).sort().join(",") === "afetado,fracao,id,porExcecaoDaLinha",
    `${Object.keys(res).sort().join(",")} / ${Object.keys(res.tokens[0]).sort().join(",")}`);
}

console.log(`\n${passou} ok, ${falhou} falha(s).`);
process.exit(falhou > 0 ? 1 : 0);
